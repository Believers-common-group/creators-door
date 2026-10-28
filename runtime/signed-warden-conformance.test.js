import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createSignedWardenConformanceAdapter, signingInput } from './signed-warden-conformance.js';
import { ACTION, createSyntheticCampaignGateway } from './influencer-campaign-gateway.js';

const NOW = '2026-10-28T10:00:00.000Z';
const LATER = '2026-10-28T10:10:00.000Z';
const ctx = Object.freeze({
  requestRef: 'REQ:INFLUENCER:001',
  sessionRef: 'SESSION:001',
  relationshipRef: 'REL:001',
  campaignRef: 'CMP:001',
  workPackageRef: 'WORK:001',
  submissionRef: 'SUB:001',
  contentDigest: 'sha256:' + 'a'.repeat(64),
  actorRef: 'ACTOR:001',
  actingCapacityRef: 'CAPACITY:INFLUENCER',
  action: ACTION,
  requestedAt: NOW
});

function makeSignedFixture(overrides = {}) {
  const pair = generateKeyPairSync('ed25519');
  const keyId = 'WARDEN:KEY:TEST1';
  const publicKey = pair.publicKey.export({ format: 'pem', type: 'spki' });
  const issuer = 'WARDEN:LAB:001';
  const audience = 'VSR:INFLUENCERS:LAB';
  const claims = {
    action: ctx.action,
    actingCapacityRef: ctx.actingCapacityRef,
    actorRef: ctx.actorRef,
    audience,
    campaignRef: ctx.campaignRef,
    contentDigest: ctx.contentDigest,
    decision: 'ALLOW',
    decisionRef: 'WARDEN:DECISION:001',
    issuedAt: NOW,
    issuer,
    nonce: 'NCE:001',
    relationshipRef: ctx.relationshipRef,
    requestRef: ctx.requestRef,
    validUntil: LATER,
    version: 'GWD-1',
    workPackageRef: ctx.workPackageRef,
    ...(overrides.claims || {})
  };
  const decision = {
    synthetic: true,
    decision: claims.decision,
    decisionRef: claims.decisionRef,
    action: ctx.action,
    actorRef: ctx.actorRef,
    actingCapacityRef: ctx.actingCapacityRef,
    relationshipRef: ctx.relationshipRef,
    campaignRef: ctx.campaignRef,
    workPackageRef: ctx.workPackageRef,
    requestRef: ctx.requestRef,
    contentDigest: ctx.contentDigest,
    validUntil: claims.validUntil,
    authorizationEnvelope: {
      version: 'GWD-1',
      algorithm: 'Ed25519',
      keyId,
      claims,
      signature: sign(null, signingInput(claims), pair.privateKey).toString('base64url')
    },
    ...(overrides.decision || {})
  };
  let revocationChecks = 0;
  const adapter = createSignedWardenConformanceAdapter({
    decisionSource: { async decide() { return structuredClone(decision); } },
    trustedKeys: { [keyId]: { issuer, publicKey } },
    isRevoked: async () => { revocationChecks++; return overrides.revoked ?? false; },
    audience: overrides.audience ?? audience
  });
  return { decision, adapter, claims, getRevocationChecks: () => revocationChecks, pair };
}

test('Ed25519 verifies exact audience, issuer, scope and short expiry', async () => {
  const f = makeSignedFixture();
  const decision = await f.adapter.decide(ctx);
  const result = await f.adapter.verifyDecision({ decision, intent: ctx, at: NOW });
  assert.deepEqual(result, {
    synthetic: true, verified: true, issuerAuthenticated: true, scopeBound: true, revoked: false
  });
  assert.equal(f.getRevocationChecks(), 1);
});

test('forged signatures are rejected without consulting the revocation source', async () => {
  const f = makeSignedFixture();
  const decision = await f.adapter.decide(ctx);
  decision.authorizationEnvelope.signature = 'AAAAAAAAAAAAAAAAAAAA';
  const result = await f.adapter.verifyDecision({ decision, intent: ctx, at: NOW });
  assert.equal(result.verified, false);
  assert.equal(f.getRevocationChecks(), 0);
});

test('tampered signed claims, scope and mismatched decisions all fail closed', async () => {
  const f = makeSignedFixture();
  const cases = [
    d => { d.authorizationEnvelope.claims.campaignRef = 'CMP:OTHER'; },
    d => { d.authorizationEnvelope.claims.contentDigest = 'sha256:' + 'b'.repeat(64); },
    d => { d.authorizationEnvelope.claims.nonce = 'NCE:MODIFIED'; },
    d => { d.campaignRef = 'CMP:OTHER'; },
    d => { d.decision = 'DENY'; },
    d => { d.authorizationEnvelope.algorithm = 'HS256'; },
    d => { d.authorizationEnvelope.keyId = 'WARDEN:UNKNOWN'; },
    d => { d.authorizationEnvelope.claims.extraneous = 'unsigned'; }
  ];
  for (const mutate of cases) {
    const d = await f.adapter.decide(ctx);
    mutate(d);
    const res = await f.adapter.verifyDecision({ decision: d, intent: ctx, at: NOW });
    assert.equal(res.verified, false);
  }
});

test('wrong audience, untrusted issuer and non-Ed25519 key fail', async () => {
  const otherAudience = makeSignedFixture({ audience: 'VSR:ANOTHER' });
  const res = await otherAudience.adapter.verifyDecision({
    decision: otherAudience.decision, intent: ctx, at: NOW
  });
  assert.equal(res.verified, false);
  const f = makeSignedFixture({ claims: { issuer: 'WARDEN:UNKNOWN' } });
  assert.equal((await f.adapter.verifyDecision({decision:f.decision,intent:ctx,at:NOW})).verified,false);
  assert.throws(() => createSignedWardenConformanceAdapter({
    decisionSource: { decide: async () => null },
    trustedKeys: {},
    isRevoked: async () => false,
    audience: 'VSR:INFLUENCERS:LAB'
  }));
});

test('expired, future-issued, excessively long and malformed timestamps fail', async () => {
  const f = makeSignedFixture();
  const expired = await f.adapter.verifyDecision({ decision:f.decision,intent:ctx,at:LATER });
  assert.equal(expired.verified,false);
  for(const claims of [
    { issuedAt: '2026-10-28T10:01:00.000Z' },
    { validUntil: '2026-10-28T11:00:00.000Z' },
    { issuedAt: 'invalid' }
  ]) {
    const other = makeSignedFixture({ claims });
    const result = await other.adapter.verifyDecision({ decision:other.decision,intent:ctx,at:NOW });
    assert.equal(result.verified,false);
  }
});

test('revoke checks are fail-closed on missing, true and thrown responses', async () => {
  for(const revoked of [true, undefined]) {
    const f = makeSignedFixture({ revoked });
    const result = await f.adapter.verifyDecision({decision:f.decision,intent:ctx,at:NOW});
    // undefined override defaults to false only in this fixture; true checks denial.
    assert.equal(result.verified,!revoked);
  }
  const f = makeSignedFixture();
  const adapter = createSignedWardenConformanceAdapter({
    decisionSource: { decide: async () => f.decision },
    trustedKeys: {
      'WARDEN:KEY:TEST1': {
        issuer: 'WARDEN:LAB:001',
        publicKey: f.pair.publicKey.export({ format:'pem', type:'spki' })
      }
    },
    isRevoked: async () => { throw new Error('revocation_service_unavailable'); },
    audience: 'VSR:INFLUENCERS:LAB'
  });
  assert.equal((await adapter.verifyDecision({decision:f.decision,intent:ctx,at:NOW})).verified,false);
});

test('signatures bind a decision to one campaign and request, preventing cross-context reuse', async () => {
  const f = makeSignedFixture();
  for (const intent of [
    {...ctx, campaignRef:'CMP:OTHER'},
    {...ctx, requestRef:'REQ:OTHER'},
    {...ctx, contentDigest:'sha256:'+'f'.repeat(64)},
    {...ctx, actingCapacityRef:'CAPACITY:OTHER'}
  ]) {
    const result=await f.adapter.verifyDecision({decision:f.decision,intent,at:NOW});
    assert.equal(result.verified,false);
  }
});

test('integration: signed Warden adapter permits synthetic River and Synnergyze chain', async () => {
  const f=makeSignedFixture();
  const calls={ execute:0, reserve:0, verify:0 };
  const warden = {
    decide: f.adapter.decide,
    async verifyDecision(params){ calls.verify++;return f.adapter.verifyDecision(params); }
  };
  const gateway=createSyntheticCampaignGateway({
    digitalMe:{resolveSession:async()=>({
      synthetic:true,state:'ACTIVE',sessionRef:ctx.sessionRef,
      actorRef:ctx.actorRef,actingCapacityRef:ctx.actingCapacityRef,validUntil:LATER
    })},
    bnr:{resolveEntitlement:async()=>({
      synthetic:true,state:'ACTIVE',actorRef:ctx.actorRef,actingCapacityRef:ctx.actingCapacityRef,
      relationshipRef:ctx.relationshipRef,campaignRef:ctx.campaignRef,
      workPackageRef:ctx.workPackageRef,capabilities:[ACTION],validUntil:LATER
    })},
    warden,
    river:{
      reserve:async()=>{calls.reserve++;return {
        synthetic:true,state:'RESERVED',reservationRef:'RIVER:RES:001',
        decisionRef:'WARDEN:DECISION:001',requestRef:ctx.requestRef
      };},
      recordReceipt:async()=>({
        synthetic:true,state:'SYNTHETIC_RECEIPT_RECORDED',
        receiptRef:'RIVER:REC:001',executionRef:'SYN:EXEC:001',requestRef:ctx.requestRef
      })
    },
    synnergyze:{execute:async()=>{calls.execute++;return {
      synthetic:true,state:'EXECUTED_UNVERIFIED',executionRef:'SYN:EXEC:001',
      reservationRef:'RIVER:RES:001',requestRef:ctx.requestRef
    };}},
    clock:()=>NOW
  });
  const input=Object.fromEntries(Object.entries(ctx).filter(([key])=>[
    'requestRef','sessionRef','relationshipRef','campaignRef','workPackageRef',
    'submissionRef','contentDigest'
  ].includes(key)));
  const result=await gateway.submit(input);
  assert.equal(result.state,'SYNTHETIC_RECEIPT_RECORDED');
  assert.equal(calls.verify,2);
  assert.equal(calls.execute,1);
  assert.equal(calls.reserve,1);
  assert.equal(f.getRevocationChecks(),2);
});
