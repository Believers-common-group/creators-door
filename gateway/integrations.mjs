// Genesis Influencers Door: server-side, read/observe-only authority chain.
// NEVER import this module in the browser or bundle service credentials into static files.
import { createPublicKey, verify as verifySignature, randomUUID } from 'node:crypto';

export class GateError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const requireValue = (v, code) => {
  if (typeof v !== 'string' || !v.trim()) throw new GateError(503, code);
  return v;
};
const validRef = v => typeof v === 'string' && /^[a-zA-Z0-9:._-]{1,128}$/.test(v);
const decode = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
const validTime = value => Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();

function upstreamUrl(value, name) {
  const raw = requireValue(value, name + '_not_configured');
  let u;
  try { u = new URL(raw); } catch { throw new GateError(503, name + '_invalid_url'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.hash) {
    throw new GateError(503, name + '_https_required');
  }
  return u.toString();
}

async function jsonCall(url, { method = 'GET', payload, token, fetchImpl }) {
  const headers = { accept: 'application/json' };
  if (payload !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = 'Bearer ' + token;
  let response;
  try {
    response = await fetchImpl(url, {
      method, headers, cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(4500),
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
  } catch { throw new GateError(503, 'upstream_unavailable'); }
  if (!response.ok) throw new GateError(502, 'upstream_rejected');
  const ct = response.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) throw new GateError(502, 'invalid_upstream_content_type');
  let body;
  try {
    const text = await response.text();
    if (text.length > 65536) throw new Error('response_too_large');
    body = JSON.parse(text);
  } catch { throw new GateError(502, 'invalid_upstream_response'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new GateError(502, 'invalid_upstream_payload');
  return body;
}

export async function verifyDigitalMeSession(sessionJwt, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  if (typeof sessionJwt !== 'string' || sessionJwt.length > 8192 || sessionJwt.split('.').length !== 3) {
    throw new GateError(401, 'session_missing_or_invalid');
  }
  const issuer = requireValue(env.DIGITALME_OIDC_ISSUER, 'digitalme_issuer_not_configured');
  const audience = requireValue(env.DIGITALME_OIDC_AUDIENCE, 'digitalme_audience_not_configured');
  const jwksUrl = upstreamUrl(env.DIGITALME_JWKS_URL, 'digitalme_jwks');
  let h, claims;
  const [head, body, sig] = sessionJwt.split('.');
  try { h = decode(head); claims = decode(body); }
  catch { throw new GateError(401, 'invalid_session_encoding'); }
  if (h.alg !== 'RS256' || typeof h.kid !== 'string' || !h.kid || h.typ && h.typ !== 'JWT') {
    throw new GateError(401, 'unsupported_session_signature');
  }
  const jwks = await jsonCall(jwksUrl, { fetchImpl });
  const key = Array.isArray(jwks.keys) && jwks.keys.find(k =>
    k.kid === h.kid && k.kty === 'RSA' && k.use !== 'enc' && (!k.alg || k.alg === 'RS256'));
  if (!key) throw new GateError(401, 'untrusted_session_signer');
  let signatureValid = false;
  try {
    const publicKey = createPublicKey({ key, format: 'jwk' });
    signatureValid = verifySignature('RSA-SHA256', Buffer.from(head + '.' + body), publicKey, Buffer.from(sig, 'base64url'));
  } catch { /* fail closed */ }
  if (!signatureValid) throw new GateError(401, 'invalid_session_signature');
  const audOK = Array.isArray(claims.aud) ? claims.aud.includes(audience) : claims.aud === audience;
  if (claims.iss !== issuer || !audOK || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now ||
      !Number.isFinite(claims.nbf || 0) || (claims.nbf || 0) * 1000 > now ||
      !validRef(claims.sub) || !validRef(claims.digitalme_actor_id) ||
      !validRef(claims.principal_ref)) {
    throw new GateError(401, 'session_identity_or_lifetime_invalid');
  }
  // A signed session is identity only. It DOES NOT confer BNR entitlement or Warden authority.
  return { subject: claims.sub, actor_id: claims.digitalme_actor_id, principal_ref: claims.principal_ref };
}

export function sessionFromRequest(req) {
  const cookies = String(req.headers.cookie || '').split(';').map(c => c.trim());
  const match = cookies.find(c => c.startsWith('__Host-vsr_session='));
  if (!match) throw new GateError(401, 'session_missing_or_invalid');
  try { return decodeURIComponent(match.slice('__Host-vsr_session='.length)); }
  catch { throw new GateError(401, 'session_missing_or_invalid'); }
}

export function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['campaign_id', 'relationship_id'].includes(key))) {
    throw new GateError(400, 'unexpected_request_field');
  }
  const campaign_id = body.campaign_id;
  const relationship_id = body.relationship_id;
  if (!validRef(campaign_id) || !validRef(relationship_id)) throw new GateError(400, 'invalid_work_references');
  if (campaign_id.startsWith('DEMO-') || relationship_id.startsWith('DEMO-')) {
    throw new GateError(403, 'synthetic_work_cannot_authorize');
  }
  return { campaign_id, relationship_id };
}

export async function authorizeObservation({ sessionJwt, body, env = process.env, fetchImpl = fetch, now = Date.now() }) {
  const { campaign_id, relationship_id } = validateRequest(body);
  const actor = await verifyDigitalMeSession(sessionJwt, { env, fetchImpl, now });
  const bnrUrl = upstreamUrl(env.BNR_ENTITLEMENT_VERIFY_URL, 'bnr');
  const wardenUrl = upstreamUrl(env.WARDEN_RETURN_PATH_URL, 'warden').replace(/\/$/, '');
  const bnrToken = requireValue(env.BNR_SERVICE_TOKEN, 'bnr_token_not_configured');
  const wardenToken = requireValue(env.WARDEN_SERVICE_TOKEN, 'warden_token_not_configured');
  const provider = requireValue(env.INFLUENCERS_PROVIDER_ID, 'provider_id_not_configured');
  const node = requireValue(env.GENESIS_NODE_ID, 'genesis_node_id_not_configured');
  const capability = 'influencers.campaign.observe';

  const membership = await jsonCall(bnrUrl, {
    method: 'POST', fetchImpl, token: bnrToken,
    payload: { actor_id: actor.actor_id, principal_ref: actor.principal_ref,
      campaign_id, relationship_id, capability }
  });
  if (membership.permitted !== true || membership.status !== 'active' ||
      membership.actor_id !== actor.actor_id || membership.relationship_id !== relationship_id ||
      membership.campaign_id !== campaign_id || !validRef(membership.issuer_ref) ||
      !validTime(membership.valid_until)) {
    throw new GateError(403, 'bnr_membership_not_verified');
  }

  const admissions = await jsonCall(wardenUrl + '/api/v1/warden/capabilities/admissions?enabled_only=true',
    { fetchImpl, token: wardenToken });
  if (admissions.external_effects !== false || !Array.isArray(admissions.admissions) ||
      !admissions.admissions.some(a => a.provider_id === provider &&
        a.capability === capability && a.enabled === true)) {
    throw new GateError(403, 'warden_capability_not_admitted');
  }
  const request = {
    principal_ref: actor.principal_ref,
    work_ref: campaign_id,
    provider_id: provider,
    capability, action_class: 'OBSERVE',
    scope: { execution_plane: 'ALPHA_LOCAL', external_effects: false,
      node_id: node, actor_id: actor.actor_id, relationship_id, campaign_id },
    purpose: 'View governed influencer campaign context',
    idempotency_key: 'influencers-observe:' + randomUUID()
  };
  const decision = await jsonCall(wardenUrl + '/api/v1/warden/capabilities/authorize',
    { method: 'POST', payload: request, fetchImpl, token: wardenToken });
  if (decision.outcome !== 'ALLOW' || !validRef(decision.decision_id)) {
    throw new GateError(403, 'warden_not_allow');
  }
  const latest = await jsonCall(wardenUrl + '/api/v1/warden/capabilities/decisions/' +
    encodeURIComponent(decision.decision_id), { fetchImpl, token: wardenToken });
  if (latest.decision_id !== decision.decision_id || latest.outcome !== 'ALLOW' ||
      !validRef(latest.river_receipt_id)) {
    throw new GateError(409, 'river_receipt_pending_or_invalid');
  }
  // This verifies the RETURN-PATH Warden-publisher linkage, not direct independent River attestation.
  return { authorized: true, capability, campaign_id, relationship_id,
    actor_id: actor.actor_id, warden_decision_id: latest.decision_id,
    river_receipt_id: latest.river_receipt_id, evidence_source: 'warden_return_path',
    external_effects: false };
}

export function integrationStatus(env = process.env) {
  return {
    mode: 'review_only',
    actor_identity: env.DIGITALME_OIDC_ISSUER && env.DIGITALME_JWKS_URL ? 'configured_not_verified' : 'not_configured',
    bnr_entitlement: env.BNR_ENTITLEMENT_VERIFY_URL && env.BNR_SERVICE_TOKEN ? 'configured_not_verified' : 'not_configured',
    warden: env.WARDEN_RETURN_PATH_URL && env.WARDEN_SERVICE_TOKEN ? 'configured_not_verified' : 'not_configured',
    river: 'receipt_dependency_via_warden',
    synnergyze: 'contract_required',
    presstech: 'disabled',
    silk: 'disabled',
    publication_enabled: false, settlement_enabled: false
  };
}
