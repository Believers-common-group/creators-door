// R0.4 — backend-only, synthetic conformance gateway.
// No live connectors, authorizations, publication or settlement.
// Never import this module into the browser application.
export const ACTION = 'campaign.submission.record';
const PERMITTED_KEYS = new Set([
  'requestRef', 'sessionRef', 'relationshipRef', 'campaignRef',
  'workPackageRef', 'submissionRef', 'contentDigest'
]);

export class CampaignGateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CampaignGateError';
    this.code = code;
  }
}

function fail(code) { throw new CampaignGateError(code); }
function ref(value, name) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:._/-]{3,128}$/.test(value)) {
    fail('invalid_' + name);
  }
  return value;
}
function timestamp(value, name) {
  const millis = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(millis)) fail('invalid_' + name);
  return millis;
}
function assert(condition, code) {
  if (!condition) fail(code);
}
function validate(input) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'invalid_request');
  for (const key of Object.keys(input)) {
    assert(PERMITTED_KEYS.has(key), 'unexpected_request_field');
  }
  for (const key of PERMITTED_KEYS) {
    if (key !== 'contentDigest') ref(input[key], key);
  }
  assert(typeof input.contentDigest === 'string' &&
    /^sha256:[a-f0-9]{64}$/.test(input.contentDigest), 'invalid_content_digest');
  return Object.fromEntries([...PERMITTED_KEYS].map(key => [key, input[key]]));
}
function assertIdentity(session, input, now) {
  assert(session && session.synthetic === true, 'identity_source_not_synthetic');
  assert(session.state === 'ACTIVE' && session.sessionRef === input.sessionRef,
    'identity_session_inactive_or_mismatched');
  ref(session.actorRef, 'actor_ref');
  ref(session.actingCapacityRef, 'acting_capacity_ref');
  assert(timestamp(session.validUntil, 'identity_validity') > now, 'identity_expired');
}
function assertEntitlement(grant, session, input, now) {
  assert(grant && grant.synthetic === true, 'entitlement_source_not_synthetic');
  assert(grant.state === 'ACTIVE', 'entitlement_not_active');
  assert(grant.actorRef === session.actorRef &&
    grant.actingCapacityRef === session.actingCapacityRef, 'entitlement_actor_mismatch');
  for (const field of ['relationshipRef', 'campaignRef', 'workPackageRef']) {
    assert(grant[field] === input[field], 'entitlement_' + field + '_mismatch');
  }
  assert(Array.isArray(grant.capabilities) && grant.capabilities.includes(ACTION),
    'entitlement_capability_missing');
  assert(timestamp(grant.validUntil, 'entitlement_validity') > now,
    'entitlement_expired');
}
function assertDecision(decision, verification, context, now) {
  assert(decision && decision.synthetic === true, 'warden_decision_not_synthetic');
  assert(decision.decision === 'ALLOW', 'warden_deny_or_escalate');
  assert(verification && verification.synthetic === true &&
    verification.verified === true && verification.issuerAuthenticated === true &&
    verification.scopeBound === true && verification.revoked === false,
    'warden_verification_failed');
  ref(decision.decisionRef, 'warden_decision_ref');
  assert(decision.action === ACTION && decision.actorRef === context.actorRef &&
    decision.actingCapacityRef === context.actingCapacityRef &&
    decision.relationshipRef === context.relationshipRef &&
    decision.campaignRef === context.campaignRef &&
    decision.workPackageRef === context.workPackageRef &&
    decision.requestRef === context.requestRef &&
    decision.contentDigest === context.contentDigest,
    'warden_scope_mismatch');
  assert(timestamp(decision.validUntil, 'warden_validity') > now, 'warden_expired');
}
function assertReservation(reservation, decision, context) {
  assert(reservation && reservation.synthetic === true &&
    reservation.state === 'RESERVED', 'river_reservation_missing');
  ref(reservation.reservationRef, 'river_reservation_ref');
  assert(reservation.decisionRef === decision.decisionRef &&
    reservation.requestRef === context.requestRef, 'river_reservation_mismatch');
}
function assertExecution(execution, reservation, context) {
  assert(execution && execution.synthetic === true &&
    execution.state === 'EXECUTED_UNVERIFIED', 'synnergyze_execution_not_recorded');
  ref(execution.executionRef, 'execution_ref');
  assert(execution.reservationRef === reservation.reservationRef &&
    execution.requestRef === context.requestRef, 'synnergyze_execution_mismatch');
}
function assertReceipt(receipt, execution, context) {
  assert(receipt && receipt.synthetic === true &&
    receipt.state === 'SYNTHETIC_RECEIPT_RECORDED',
    'river_receipt_not_recorded');
  ref(receipt.receiptRef, 'river_receipt_ref');
  assert(receipt.executionRef === execution.executionRef &&
    receipt.requestRef === context.requestRef, 'river_receipt_mismatch');
}

export function createSyntheticCampaignGateway({
  digitalMe, bnr, warden, river, synnergyze, clock = () => new Date().toISOString()
}) {
  const required = [
    [digitalMe, 'resolveSession'], [bnr, 'resolveEntitlement'],
    [warden, 'decide'], [warden, 'verifyDecision'],
    [river, 'reserve'], [synnergyze, 'execute'], [river, 'recordReceipt']
  ];
  for (const [provider, method] of required) {
    assert(provider && typeof provider[method] === 'function',
      'adapter_not_configured:' + method);
  }

  // Ephemeral demo-only memoization; production requires durable coordination,
  // transaction-outbox semantics and independent idempotency enforcement.
  const requests = new Map();

  async function run(context) {
    let stage = 'BEFORE_EXECUTION';
    try {
      const now = timestamp(clock(), 'server_clock');
      const session = await digitalMe.resolveSession({
        sessionRef: context.sessionRef, requestRef: context.requestRef
      });
      assertIdentity(session, context, now);
      const entitlement = await bnr.resolveEntitlement({
        actorRef: session.actorRef,
        actingCapacityRef: session.actingCapacityRef,
        relationshipRef: context.relationshipRef,
        campaignRef: context.campaignRef,
        workPackageRef: context.workPackageRef
      });
      assertEntitlement(entitlement, session, context, now);
      const intent = Object.freeze({
        ...context,
        actorRef: session.actorRef,
        actingCapacityRef: session.actingCapacityRef,
        action: ACTION,
        requestedAt: new Date(now).toISOString()
      });
      const decision = await warden.decide(intent);
      const verification = await warden.verifyDecision({
        decision, intent, at: intent.requestedAt
      });
      assertDecision(decision, verification, intent, now);
      const reservation = await river.reserve({ intent, decision });
      assertReservation(reservation, decision, context);
      stage = 'EXECUTION_ATTEMPTED';
      const execution = await synnergyze.execute({ intent, decision, reservation });
      assertExecution(execution, reservation, context);
      const receipt = await river.recordReceipt({ intent, decision, reservation, execution });
      assertReceipt(receipt, execution, context);
      return Object.freeze({
        state: 'SYNTHETIC_RECEIPT_RECORDED', synthetic: true,
        requestRef: context.requestRef,
        relationshipRef: context.relationshipRef,
        campaignRef: context.campaignRef,
        workPackageRef: context.workPackageRef,
        decisionRef: decision.decisionRef,
        reservationRef: reservation.reservationRef,
        executionRef: execution.executionRef,
        receiptRef: receipt.receiptRef
      });
    } catch (error) {
      // Do not retry after partial execution. Never leak policy details,
      // private identity data or adapter exception text to the caller.
      return Object.freeze({
        state: stage === 'EXECUTION_ATTEMPTED' ? 'EXCEPTION' : 'DENIED',
        synthetic: true,
        requestRef: context.requestRef,
        reasonCode: error instanceof CampaignGateError ? error.code : 'adapter_failed',
        requiresReconciliation: stage === 'EXECUTION_ATTEMPTED'
      });
    }
  }

  return Object.freeze({
    async submit(input) {
      const context = validate(input);
      const fingerprint = JSON.stringify(context);
      const existing = requests.get(context.requestRef);
      if (existing) {
        assert(existing.fingerprint === fingerprint, 'request_ref_conflict');
        return existing.promise;
      }
      const promise = run(context);
      requests.set(context.requestRef, { fingerprint, promise });
      return promise;
    },
    // Conformance diagnostics, never a durable operational count.
    inMemoryRequestCount() { return requests.size; }
  });
}
