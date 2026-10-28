// R0.6: independently verify Ed25519 RiverOS receipts before ledger commit.
// Synthetic conformance only. Trusted keys are backend-configured, never supplied
// by the creator/influencer or embedded in an untrusted receipt.
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

const DOMAIN = 'GENESIS-RIVER-RECEIPT/GRR-1\n';
const FIELDS = Object.freeze([
  'audience', 'campaignRef', 'contentDigest', 'decisionRef',
  'executionRef', 'intentDigest', 'issuedAt', 'issuer',
  'receiptRef', 'requestRef', 'reservationRef', 'state', 'version',
  'workPackageRef'
].sort());
function plain(v) {
  return v !== null && typeof v === 'object' &&
    (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
}
function canonicalClaims(claims) {
  if (!plain(claims) ||
    JSON.stringify(Object.keys(claims).sort()) !== JSON.stringify(FIELDS) ||
    !FIELDS.every(k => typeof claims[k] === 'string' && claims[k].length > 0 &&
      claims[k].length <= 256)) throw new Error('receipt_claims_invalid');
  return claims;
}
export function riverReceiptSigningInput(claims) {
  canonicalClaims(claims);
  const fields = Object.fromEntries(FIELDS.map(k => [k, claims[k]]));
  return Buffer.from(DOMAIN + JSON.stringify(fields), 'utf8');
}
export function digestIntent(intent) {
  // Intent hash requires an exact known shape; no prototype / unlisted fields.
  const fields = [
    'actingCapacityRef', 'action', 'actorRef', 'campaignRef', 'contentDigest',
    'relationshipRef', 'requestRef', 'submissionRef', 'workPackageRef'
  ].sort();
  if (!plain(intent) ||
    JSON.stringify(Object.keys(intent).sort()) !== JSON.stringify(fields) ||
    !fields.every(k => typeof intent[k] === 'string' && intent[k].length > 0)) {
    throw new Error('intent_shape_invalid');
  }
  const canonical = Object.fromEntries(fields.map(k => [k, intent[k]]));
  return 'sha256:' + createHash('sha256').update(
    'GENESIS-INFLUENCER-INTENT/1\n' + JSON.stringify(canonical), 'utf8'
  ).digest('hex');
}
function parseInstant(value) {
  const v = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(v) ? v : null;
}

export function createVerifiedRiverReceiptRecorder({ledger, trustedKeys, audience}) {
  if (!ledger || typeof ledger.readRequest !== 'function' ||
      typeof ledger.commitVerifiedReceipt !== 'function' ||
      !plain(trustedKeys) || typeof audience !== 'string' || audience.length < 3) {
    throw new Error('river_receipt_verifier_not_configured');
  }
  const roots = new Map();
  for (const [kid, root] of Object.entries(trustedKeys)) {
    if (!/^[A-Za-z0-9._:-]{3,100}$/.test(kid) || !plain(root) ||
        typeof root.issuer !== 'string' || !root.issuer ||
        typeof root.publicKey !== 'string') throw new Error('invalid_river_trust_root');
    const key = createPublicKey(root.publicKey);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('invalid_river_key_type');
    roots.set(kid, {issuer:root.issuer, key});
  }
  if (!roots.size) throw new Error('river_trust_root_required');
  return Object.freeze({
    record({envelope, expected, at}) {
      if (!plain(envelope) || envelope.version !== 'GRR-1' ||
          envelope.algorithm !== 'Ed25519' ||
          typeof envelope.keyId !== 'string' || typeof envelope.signature !== 'string') {
        throw new Error('invalid_signed_receipt');
      }
      const root = roots.get(envelope.keyId);
      if (!root) throw new Error('untrusted_river_issuer');
      const claims = canonicalClaims(envelope.claims);
      if (claims.version !== 'GRR-1' ||
          claims.state !== 'SYNTHETIC_RECEIPT_RECORDED' ||
          claims.audience !== audience || claims.issuer !== root.issuer) {
        throw new Error('river_receipt_scope_invalid');
      }
      const now=parseInstant(at), issued=parseInstant(claims.issuedAt);
      if (issued === null || now === null || issued > now ||
          now - issued > 15*60*1000) throw new Error('river_receipt_time_invalid');
      if (!plain(expected)) throw new Error('river_receipt_expectation_required');
      const expectedFields = [
        'campaignRef','contentDigest','decisionRef','executionRef',
        'intentDigest','requestRef','reservationRef','workPackageRef'
      ];
      for (const field of expectedFields) {
        if (typeof expected[field] !== 'string' ||
            claims[field] !== expected[field]) throw new Error('river_receipt_binding_mismatch');
      }
      if (!/^sha256:[a-f0-9]{64}$/.test(expected.intentDigest) ||
          !/^sha256:[a-f0-9]{64}$/.test(expected.contentDigest)) {
        throw new Error('river_receipt_digest_invalid');
      }
      const signature=Buffer.from(envelope.signature,'base64url');
      if(signature.length!==64 || signature.toString('base64url')!==envelope.signature ||
         !verifySignature(null,riverReceiptSigningInput(claims),root.key,signature)) {
        throw new Error('river_receipt_signature_invalid');
      }
      const request=ledger.readRequest(claims.requestRef);
      if (!request || request.intentDigest !== claims.intentDigest) {
        throw new Error('river_receipt_request_missing_or_mismatched');
      }
      // Persist the canonical verified envelope, not attacker-supplied JSON bytes.
      const canonicalEnvelope = JSON.stringify({
        version:'GRR-1',algorithm:'Ed25519',keyId:envelope.keyId,
        claims:Object.fromEntries(FIELDS.map(k=>[k,claims[k]])),
        signature:envelope.signature
      });
      const envelopeDigest='sha256:'+createHash('sha256')
        .update(canonicalEnvelope,'utf8').digest('hex');
      return ledger.commitVerifiedReceipt({
        requestRef:claims.requestRef,
        intentDigest:claims.intentDigest,
        receiptRef:claims.receiptRef,
        envelope:canonicalEnvelope,
        envelopeDigest,
        at
      });
    }
  });
}
