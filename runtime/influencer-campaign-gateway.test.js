import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION, CampaignGateError, createSyntheticCampaignGateway
} from './influencer-campaign-gateway.js';

const now = '2026-10-28T10:00:00.000Z';
const later = '2026-10-28T10:10:00.000Z';
const context = Object.freeze({
  requestRef: 'REQ:001',
  sessionRef: 'SESSION:001',
  relationshipRef: 'REL:001',
  campaignRef: 'CMP:001',
  workPackageRef: 'WORK:001',
  submissionRef: 'SUB:001',
  contentDigest: 'sha256:' + 'a'.repeat(64)
});

function fixture(options = {}) {
  const calls = { identity: 0, bnr: 0, decision: 0, verification: 0,
    reservation: 0, execution: 0, receipt: 0 };
  const digitalMe = {
    async resolveSession() {
      calls.identity++;
      return {
        synthetic: true, state: 'ACTIVE',
        sessionRef: context.sessionRef,
        actorRef: 'ACTOR:001',
        actingCapacityRef: 'CAPACITY:INFLUENCER',
        validUntil: later,
        ...options.session
      };
    }
  };
  const bnr = {
    async resolveEntitlement() {
      calls.bnr++;
      return {
        synthetic: true, state: 'ACTIVE',
        actorRef: 'ACTOR:001',
        actingCapacityRef: 'CAPACITY:INFLUENCER',
        relationshipRef: context.relationshipRef,
        campaignRef: context.campaignRef,
        workPackageRef: context.workPackageRef,
        capabilities: [ACTION],
        validUntil: later,
        ...options.entitlement
      };
    }
  };
  const warden = {
    async decide() {
      calls.decision++;
      return {
        synthetic: true, decision: 'ALLOW',
        decisionRef: 'WARDEN:DECISION:001',
        action: ACTION, requestRef: context.requestRef,
        actorRef: 'ACTOR:001',
        actingCapacityRef: 'CAPACITY:INFLUENCER',
        relationshipRef: context.relationshipRef,
        campaignRef: context.campaignRef,
        workPackageRef: context.workPackageRef,
        contentDigest: context.contentDigest,
        validUntil: later,
        ...options.decision
      };
    },
    async verifyDecision() {
      calls.verification++;
      return {
        synthetic: true, verified: true,
        issuerAuthenticated: true, scopeBound: true, revoked: false,
        ...options.verification,
        ...(calls.verification === 2 ? options.executionVerification : {})
      };
    }
  };
  const river = {
    async reserve() {
      calls.reservation++;
      if (options.reservationError) throw new Error('private database secret');
      return {
        synthetic: true, state: 'RESERVED',
        reservationRef: 'RIVER:RES:001',
        requestRef: context.requestRef,
        decisionRef: 'WARDEN:DECISION:001',
        ...options.reservation
      };
    },
    async recordReceipt() {
      calls.receipt++;
      if (options.receiptError) throw new Error('private storage secret');
      return {
        synthetic: true, state: 'SYNTHETIC_RECEIPT_RECORDED',
        receiptRef: 'RIVER:RECEIPT:001',
        executionRef: 'SYN:EXEC:001',
        requestRef: context.requestRef,
        ...options.receipt
      };
    }
  };
  const synnergyze = {
    async execute() {
      calls.execution++;
      if (options.executionError) throw new Error('private connector secret');
      return {
        synthetic: true, state: 'EXECUTED_UNVERIFIED',
        executionRef: 'SYN:EXEC:001',
        reservationRef: 'RIVER:RES:001',
        requestRef: context.requestRef,
        ...options.execution
      };
    }
  };
  const clock = options.clock || (() => now);
  return {
    gateway: createSyntheticCampaignGateway({
      digitalMe, bnr, warden, river, synnergyze, clock
    }), calls
  };
}

test('happy path links identity, entitlement, Warden checks, River and execution', async () => {
  const { gateway, calls } = fixture();
  const result = await gateway.submit(context);
  assert.equal(result.synthetic, true);
  assert.equal(result.state, 'SYNTHETIC_RECEIPT_RECORDED');
  assert.equal(result.receiptRef, 'RIVER:RECEIPT:001');
  assert.equal(result.campaignRef, context.campaignRef);
  assert.deepEqual(calls, {
    identity: 1, bnr: 1, decision: 1, verification: 2,
    reservation: 1, execution: 1, receipt: 1
  });
});
test('refuses unconfigured gateway providers and browser-supplied authority fields', async () => {
  assert.throws(() => createSyntheticCampaignGateway({}), CampaignGateError);
  const { gateway } = fixture();
  await assert.rejects(gateway.submit({ ...context, wardenDecision: 'ALLOW' }),
    e => e.code === 'unexpected_request_field');
  await assert.rejects(gateway.submit({ ...context, contentDigest: 'weak' }),
    e => e.code === 'invalid_content_digest');
});
test('inactive identity denies before reservation or execution', async () => {
  const { gateway, calls } = fixture({ session: { state: 'REVOKED' } });
  const result = await gateway.submit(context);
  assert.equal(result.state, 'DENIED');
  assert.equal(result.reasonCode, 'identity_session_inactive_or_mismatched');
  assert.equal(calls.reservation, 0);
  assert.equal(calls.execution, 0);
});
test('wrong campaign entitlement denies before Warden', async () => {
  const { gateway, calls } = fixture({ entitlement: { campaignRef: 'CMP:OTHER' } });
  const result = await gateway.submit(context);
  assert.equal(result.state, 'DENIED');
  assert.equal(result.reasonCode, 'entitlement_campaignRef_mismatch');
  assert.equal(calls.decision, 0);
});
test('denied, revoked or expired Warden decisions have zero external effects', async () => {
  for (const extra of [
    { decision: { decision: 'DENY' } },
    { verification: { revoked: true } },
    { decision: { validUntil: '2026-10-27T10:00:00.000Z' } },
    { decision: { contentDigest: 'sha256:' + 'b'.repeat(64) } }
  ]) {
    const { gateway, calls } = fixture(extra);
    const result = await gateway.submit(context);
    assert.equal(result.state, 'DENIED');
    assert.equal(calls.reservation, 0);
    assert.equal(calls.execution, 0);
  }
});
test('mismatched River reservation refuses execution and requires reconciliation', async () => {
  const { gateway, calls } = fixture({ reservation: { decisionRef: 'WARDEN:OTHER' } });
  const result = await gateway.submit(context);
  assert.equal(result.state, 'EXCEPTION');
  assert.equal(result.reasonCode, 'river_reservation_mismatch');
  assert.equal(result.requiresReconciliation, true);
  assert.equal(calls.execution, 0);
});
test('revocation between reservation and execution is rejected', async () => {
  const { gateway, calls } = fixture({ executionVerification: { revoked: true } });
  const result = await gateway.submit(context);
  assert.equal(result.state, 'EXCEPTION');
  assert.equal(result.reasonCode, 'warden_verification_failed');
  assert.equal(result.requiresReconciliation, true);
  assert.equal(calls.execution, 0);
  assert.equal(calls.verification, 2);
});
test('partial execution and missing receipt fail without disclosing adapter errors', async () => {
  for (const key of ['executionError', 'receiptError']) {
    const { gateway, calls } = fixture({ [key]: true });
    const first = await gateway.submit(context);
    const replay = await gateway.submit(context);
    assert.equal(first.state, 'EXCEPTION');
    assert.equal(first.reasonCode, 'adapter_failed');
    assert.equal(first.requiresReconciliation, true);
    assert.deepEqual(first, replay);
    assert.equal(calls.execution, 1);
    assert.doesNotMatch(JSON.stringify(first), /private/);
  }
});
test('concurrent identical submissions share one result and avoid duplicate effects', async () => {
  const { gateway, calls } = fixture();
  const [a,b,c] = await Promise.all([gateway.submit(context),gateway.submit(context),gateway.submit(context)]);
  assert.deepEqual(a,b);
  assert.deepEqual(b,c);
  assert.equal(calls.execution, 1);
  assert.equal(gateway.inMemoryRequestCount(),1);
});
test('same request ID with another digest is rejected', async () => {
  const { gateway, calls } = fixture();
  await gateway.submit(context);
  await assert.rejects(
    gateway.submit({ ...context, contentDigest: 'sha256:' + 'c'.repeat(64) }),
    e => e.code === 'request_ref_conflict'
  );
  assert.equal(calls.execution, 1);
});
test('mismatched execution and receipt lineage cannot be accepted', async () => {
  for (const extra of [
    { execution: { requestRef: 'REQ:ANOTHER' } },
    { receipt: { executionRef: 'SYN:OTHER' } }
  ]) {
    const { gateway } = fixture(extra);
    const result = await gateway.submit(context);
    assert.equal(result.state, 'EXCEPTION');
    assert.equal(result.requiresReconciliation, true);
  }
});
test('synthetic gateways cannot accept non-synthetic evidence as proven', async () => {
  for (const extra of [
    { decision: { synthetic: false } },
    { reservation: { synthetic: false } },
    { execution: { synthetic: false } },
    { receipt: { synthetic: false } }
  ]) {
    const { gateway } = fixture(extra);
    const result = await gateway.submit(context);
    assert.notEqual(result.state, 'SYNTHETIC_RECEIPT_RECORDED');
  }
});
