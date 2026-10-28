import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import { verifyDigitalMeSession, authorizeObservation, integrationStatus, GateError } from './integrations.mjs';
import { createGatewayServer } from './server.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = Date.now();
const validUntil = new Date(now + 180000).toISOString();
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'trusted-key', alg: 'RS256', use: 'sig' };
const env = {
  DIGITALME_OIDC_ISSUER: 'https://digitalme.example.test',
  DIGITALME_OIDC_AUDIENCE: 'genesis-influencers-door',
  DIGITALME_JWKS_URL: 'https://digitalme.example.test/jwks',
  BNR_ENTITLEMENT_VERIFY_URL: 'https://bnr.example.test/verify',
  BNR_SERVICE_TOKEN: 'test-private-token',
  WARDEN_RETURN_PATH_URL: 'https://warden.example.test',
  WARDEN_SERVICE_TOKEN: 'test-warden-token',
  GENESIS_NODE_ID: 'ALPHA-NODE-001',
  INFLUENCERS_PROVIDER_ID: 'creators-door',
  GENESIS_PUBLIC_ORIGIN: 'http://127.0.0.1:4174'
};
const context = { campaign_id: 'CMP:001', relationship_id: 'REL:001' };
function jwt(override = {}, key = privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'trusted-key' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: env.DIGITALME_OIDC_ISSUER,
    aud: env.DIGITALME_OIDC_AUDIENCE,
    sub: 'user-001',
    digitalme_actor_id: 'ACTOR:001',
    principal_ref: 'digitalme:ACTOR:001',
    exp: Math.floor((now + 120000) / 1000),
    nbf: Math.floor((now - 10000) / 1000),
    ...override
  })).toString('base64url');
  return header + '.' + claims + '.' + sign('RSA-SHA256',
    Buffer.from(header + '.' + claims), key).toString('base64url');
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
function fixture(overrides = {}) {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, method: options.method, auth: options.headers.authorization, payload: options.body && JSON.parse(options.body) });
    if (url === env.DIGITALME_JWKS_URL) return json({ keys: [jwk] });
    if (url === env.BNR_ENTITLEMENT_VERIFY_URL) {
      return json({
        permitted: true, status: 'active', actor_id: 'ACTOR:001',
        relationship_id: context.relationship_id, campaign_id: context.campaign_id,
        issuer_ref: 'BNR:REGISTRY:001', valid_until: validUntil,
        ...overrides.bnr
      });
    }
    if (url.endsWith('/admissions?enabled_only=true')) {
      return json({
        external_effects: false,
        admissions: [{ enabled: true, provider_id: 'creators-door', capability: 'influencers.campaign.observe' }],
        ...overrides.admissions
      });
    }
    if (url.endsWith('/capabilities/authorize')) {
      return json({ decision_id: 'WARDEN:001', outcome: 'ALLOW', ...overrides.warden });
    }
    if (url.endsWith('/decisions/WARDEN%3A001')) {
      return json({
        decision_id: 'WARDEN:001', outcome: 'ALLOW', river_receipt_id: 'RIVER:001',
        ...overrides.river
      });
    }
    throw new Error('unknown test URL: ' + url);
  };
  return { fakeFetch, calls };
}
const verifies = err => err instanceof GateError;

test('valid signed DigitalMe identity resolves only actor and principal; no authority', async () => {
  const { fakeFetch } = fixture();
  const identity = await verifyDigitalMeSession(jwt(), { env, fetchImpl: fakeFetch });
  assert.deepEqual(identity, { subject: 'user-001', actor_id: 'ACTOR:001', principal_ref: 'digitalme:ACTOR:001' });
});

test('untrusted, expired or wrong-audience sessions are denied', async () => {
  const { privateKey: otherPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { fakeFetch } = fixture();
  for (const token of [
    jwt({}, otherPrivateKey),
    jwt({ exp: Math.floor((now - 1000) / 1000) }),
    jwt({ aud: 'different-audience' }),
    jwt({ digitalme_actor_id: null })
  ]) {
    await assert.rejects(verifyDigitalMeSession(token, { env, fetchImpl: fakeFetch }), verifies);
  }
});

test('full observation chain requires membership, admitted Warden and matching River receipt', async () => {
  const { fakeFetch, calls } = fixture();
  const result = await authorizeObservation({ sessionJwt: jwt(), body: context, env, fetchImpl: fakeFetch });
  assert.equal(result.authorized, true);
  assert.equal(result.external_effects, false);
  assert.equal(result.river_receipt_id, 'RIVER:001');
  assert.equal(result.evidence_source, 'warden_return_path');
  const auth = calls.find(c => c.url.endsWith('/capabilities/authorize')).payload;
  assert.equal(auth.action_class, 'OBSERVE');
  assert.equal(auth.scope.external_effects, false);
  assert.equal(auth.work_ref, context.campaign_id);
  assert.equal(calls.find(c => c.url === env.BNR_ENTITLEMENT_VERIFY_URL).auth, 'Bearer test-private-token');
});

test('unconfigured, synthetic or forged work cannot request authorization', async () => {
  assert.equal(integrationStatus({}).publication_enabled, false);
  assert.equal(integrationStatus({}).silk, 'disabled');
  for (const body of [
    { campaign_id: 'DEMO-CMP-001', relationship_id: 'REL:001' },
    { campaign_id: 'CMP:001', relationship_id: 'DEMO-REL-001' },
    { ...context, warden_decision: 'ALLOW' }
  ]) {
    const { fakeFetch } = fixture();
    await assert.rejects(authorizeObservation({ sessionJwt: jwt(), body, env, fetchImpl: fakeFetch }),
      e => e instanceof GateError && e.status >= 400);
  }
  const { fakeFetch } = fixture();
  await assert.rejects(authorizeObservation({ sessionJwt: jwt(), body: context, env: {}, fetchImpl: fakeFetch }),
    verifies);
});

test('BNR mismatch or Warden admission failure stops before authorization', async () => {
  for (const override of [
    { bnr: { permitted: false } },
    { bnr: { campaign_id: 'CMP:OTHER' } },
    { bnr: { valid_until: '2020-01-01T00:00:00Z' } },
    { admissions: { admissions: [] } },
    { admissions: { external_effects: true } }
  ]) {
    const { fakeFetch, calls } = fixture(override);
    await assert.rejects(authorizeObservation({ sessionJwt: jwt(), body: context, env, fetchImpl: fakeFetch }), verifies);
    assert.equal(calls.filter(c => c.url.endsWith('/capabilities/authorize')).length, 0);
  }
});

test('Warden DENY and missing or mismatched River receipt are denied', async () => {
  for (const override of [
    { warden: { outcome: 'DENY' } },
    { river: { river_receipt_id: null } },
    { river: { decision_id: 'WARDEN:OTHER' } },
    { river: { outcome: 'DENY' } }
  ]) {
    const { fakeFetch } = fixture(override);
    await assert.rejects(authorizeObservation({ sessionJwt: jwt(), body: context, env, fetchImpl: fakeFetch }), verifies);
  }
});

async function withLocalServer(handler) {
  const server = createGatewayServer({ env, fetchImpl: fixture().fakeFetch });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const root = 'http://127.0.0.1:' + server.address().port;
  try { await handler(root); }
  finally { await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}

test('HTTP gateway is same-origin, method-limited and does not expose configuration secrets', async () => {
  await withLocalServer(async root => {
    const status = await fetch(root + '/api/influencers/status');
    const body = await status.json();
    assert.equal(body.mode, 'review_only');
    assert.equal(body.silk, 'disabled');
    assert.doesNotMatch(JSON.stringify(body), /test-private-token/);

    const badOrigin = await fetch(root + '/api/influencers/observe', {
      method: 'POST', headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json' },
      body: JSON.stringify(context)
    });
    assert.equal(badOrigin.status, 403);

    const noSession = await fetch(root + '/api/influencers/observe', {
      method: 'POST', headers: { origin: env.GENESIS_PUBLIC_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(context)
    });
    assert.equal(noSession.status, 401);

    const forbiddenMethod = await fetch(root + '/api/influencers/observe');
    assert.equal(forbiddenMethod.status, 405);

    const notExposed = await fetch(root + '/gateway/integrations.mjs');
    assert.equal(notExposed.status, 404);
  });
});
