// R0.5: cryptographically verified Ed25519 Warden envelope for a synthetic
// backend conformance slice. No live identity, Warden, River, publisher or SILK.
import { createPublicKey, verify as verifySignature } from 'node:crypto';

const FIELDS = Object.freeze([
  'action', 'actingCapacityRef', 'actorRef', 'audience', 'campaignRef',
  'contentDigest', 'decision', 'decisionRef', 'issuedAt', 'issuer',
  'nonce', 'relationshipRef', 'requestRef', 'validUntil', 'version',
  'workPackageRef'
].sort());

const INTENT_FIELDS = Object.freeze([
  'action', 'actingCapacityRef', 'actorRef', 'campaignRef', 'contentDigest',
  'relationshipRef', 'requestRef', 'workPackageRef'
]);

const DURATION_MS = 15 * 60 * 1000;
const domain = 'GENESIS-WARDEN-DECISION/GWD-1\n';

function record(input) {
  return input !== null && typeof input === 'object' &&
    Object.getPrototypeOf(input) === Object.prototype;
}

function strictClaims(claims) {
  if (!record(claims)) return false;
  if (JSON.stringify(Object.keys(claims).sort()) !== JSON.stringify(FIELDS)) return false;
  return FIELDS.every(key => typeof claims[key] === 'string' &&
    claims[key].length > 0 && claims[key].length <= 256);
}

// Exported for independent verifier and synthetic test fixture implementation.
// Flat string-only claims make field order unambiguous. No nested JSON allowed.
export function signingInput(claims) {
  if (!strictClaims(claims)) throw new TypeError('malformed_warden_claims');
  const ordered = Object.fromEntries(FIELDS.map(key => [key, claims[key]]));
  return Buffer.from(domain + JSON.stringify(ordered), 'utf8');
}

function parseTimestamp(value) {
  const num = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(num) ? num : null;
}

export function createSignedWardenConformanceAdapter({
  decisionSource, trustedKeys, isRevoked, audience
}) {
  if (!decisionSource || typeof decisionSource.decide !== 'function' ||
      !record(trustedKeys) || typeof isRevoked !== 'function' ||
      typeof audience !== 'string' || audience.length < 3) {
    throw new TypeError('signed_warden_adapter_not_configured');
  }

  // Trust roots originate from backend configuration, never from an envelope.
  const roots = new Map();
  for (const [kid, item] of Object.entries(trustedKeys)) {
    if (!/^[A-Za-z0-9._:-]{3,100}$/.test(kid) ||
        !record(item) || typeof item.issuer !== 'string' ||
        !item.issuer || typeof item.publicKey !== 'string') {
      throw new TypeError('invalid_trust_root');
    }
    const publicKey = createPublicKey(item.publicKey);
    if (publicKey.asymmetricKeyType !== 'ed25519') throw new TypeError('invalid_key_type');
    roots.set(kid, { issuer: item.issuer, key: publicKey });
  }
  if (!roots.size) throw new TypeError('empty_warden_trust_roots');

  return Object.freeze({
    async decide(intent) {
      return decisionSource.decide(intent);
    },
    async verifyDecision({ decision, intent, at }) {
      const deny = Object.freeze({
        synthetic: true, verified: false, issuerAuthenticated: false,
        scopeBound: false, revoked: true
      });
      try {
        if (!record(decision) || decision.synthetic !== true ||
            !record(intent) || !record(decision.authorizationEnvelope)) return deny;
        const env = decision.authorizationEnvelope;
        if (env.version !== 'GWD-1' || env.algorithm !== 'Ed25519' ||
            typeof env.keyId !== 'string' ||
            typeof env.signature !== 'string') return deny;
        const trust = roots.get(env.keyId);
        if (!trust) return deny;
        if (!strictClaims(env.claims)) return deny;
        const claims = env.claims;
        if (claims.version !== 'GWD-1' ||
            claims.audience !== audience ||
            claims.issuer !== trust.issuer ||
            claims.decision !== 'ALLOW') return deny;

        for (const field of INTENT_FIELDS) {
          if (claims[field] !== intent[field] ||
              decision[field] !== intent[field]) return deny;
        }
        for (const field of ['decision', 'decisionRef', 'validUntil']) {
          if (claims[field] !== decision[field]) return deny;
        }
        const issued = parseTimestamp(claims.issuedAt);
        const expiry = parseTimestamp(claims.validUntil);
        const checked = parseTimestamp(at);
        if (issued === null || expiry === null || checked === null ||
            issued > checked || checked >= expiry ||
            expiry <= issued || expiry - issued > DURATION_MS) return deny;

        const signature = Buffer.from(env.signature, 'base64url');
        if (signature.length !== 64 ||
            signature.toString('base64url') !== env.signature) return deny;
        if (!verifySignature(null, signingInput(claims), trust.key, signature)) return deny;

        // Must query an authoritative, fail-closed revocation source at *each*
        // verification, including the second execution-boundary check.
        const revoked = await isRevoked({
          issuer: claims.issuer,
          decisionRef: claims.decisionRef,
          nonce: claims.nonce,
          at
        });
        if (revoked !== false) return deny;

        return Object.freeze({
          synthetic: true, verified: true, issuerAuthenticated: true,
          scopeBound: true, revoked: false
        });
      } catch {
        return deny;
      }
    }
  });
}
