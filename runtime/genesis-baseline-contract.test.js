// Cross-repository *test-only* conformance. This is NOT a live entitlement adapter.
// Genesis R0.2 fixtures are checked out at a reviewed immutable commit by CI.
// Nothing in this file is imported by the static site or server runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSyntheticCampaignGateway, ACTION } from './influencer-campaign-gateway.js';

const baseline = resolve(process.cwd(), '_synthetic_reference/synthetic-baseline');
const read = name => readFileSync(resolve(baseline, name));
const fixtureBytes = read('fixtures.json');
const scenariosBytes = read('scenarios.json');
const manifest = JSON.parse(fixtureBytes);
const scenarios = JSON.parse(scenariosBytes);
const lock = JSON.parse(read('fixture-lock.json'));
const now = '2026-10-28T10:00:00.000Z';
const later = '2026-11-28T10:00:00.000Z';
const INPUT = Object.freeze({
  requestRef: 'REQ:SYN:CREATORS:01',
  sessionRef: 'SESSION:SYN:CREATORS:01',
  relationshipRef: 'REL:SYN:CREATORS:01',
  campaignRef: 'CMP:SYN:CREATORS:01',
  workPackageRef: 'WORK:SYN:CREATORS:01',
  submissionRef: 'SUB:SYN:CREATORS:01',
  contentDigest: 'sha256:' + 'a'.repeat(64),
});

function sourceActor(id) {
  return manifest.actors.find(actor => actor.id === id);
}
function sourceMembership(id) {
  return manifest.memberships.find(member => member.actor_id === id);
}
function effectiveLicences(id) {
  return manifest.licences.filter(lic => lic.actor_id === id &&
    lic.synthetic === true && lic.state === 'ACTIVE' &&
    Date.parse(lic.valid_until) > Date.parse(now));
}
function harness(actorId) {
  const counters = { identity: 0, bnr: 0, decision: 0, reservation: 0,
    execution: 0, receipt: 0 };
  const actor = sourceActor(actorId);
  const cap = 'CAPACITY:SYNTHETIC:' + (actor?.role || 'unknown');
  const digitalMe = {
    async resolveSession() {
      counters.identity++;
      return {
        synthetic: true, state: actor?.state || 'DISABLED',
        sessionRef: INPUT.sessionRef, actorRef: actorId,
        actingCapacityRef: cap, validUntil: later
      };
    },
  };
  const bnr = {
    async resolveEntitlement() {
      counters.bnr++;
      const member = sourceMembership(actorId);
      return {
        synthetic: true,
        state: member?.state === 'ACTIVE' ? 'ACTIVE' : 'REVOKED',
        actorRef: actorId, actingCapacityRef: cap,
        relationshipRef: INPUT.relationshipRef,
        campaignRef: INPUT.campaignRef,
        workPackageRef: INPUT.workPackageRef,
        // Crucial: only existing, non-expired synthetic fixture licences.
        // Never create a campaign.submission.record permission by inference.
        capabilities: effectiveLicences(actorId).flatMap(lic => lic.actions),
        validUntil: later
      };
    },
  };
  const forbidEffects = method => async () => {
    counters[method]++;
    throw new Error('UNEXPECTED_SYNTHETIC_EFFECT');
  };
  const warden = {
    decide: forbidEffects('decision'),
    verifyDecision: forbidEffects('decision'),
  };
  const river = {
    reserve: forbidEffects('reservation'),
    recordReceipt: forbidEffects('receipt'),
  };
  const synnergyze = { execute: forbidEffects('execution') };
  return {
    gateway: createSyntheticCampaignGateway({
      digitalMe, bnr, warden, river, synnergyze, clock: () => now
    }),
    counters
  };
}

test('uses locked canonical Genesis synthetic R0.2 fixture bytes', () => {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(manifest.fixture_id, 'GENESIS-SYNTHETIC-BASELINE-R01');
  assert.equal(manifest.environment, 'synthetic-ci');
  assert.equal(manifest.synthetic, true);
  assert.equal(lock.sha256['fixtures.json'], digest(fixtureBytes));
  assert.equal(lock.sha256['scenarios.json'], digest(scenariosBytes));
  assert.equal(manifest.actors.length, 10);
  assert.equal(scenarios.length, 17);
  assert.ok(manifest.actors.every(actor => actor.id.startsWith('SYN-')));
  assert.ok(manifest.licences.every(lic => lic.synthetic === true &&
    lic.id.startsWith('SYN-LIC-')));
});

test('Genesis synthetic creator licence cannot grant campaign submission', async () => {
  const actorId = 'SYN-ACTOR-CREATOR-01';
  const actor = sourceActor(actorId);
  assert.equal(actor.role, 'creator');
  assert.equal(sourceMembership(actorId).state, 'ACTIVE');
  assert.ok(effectiveLicences(actorId).some(lic =>
    lic.actions.includes('creator.draft.synthetic')));
  assert.equal(manifest.action_policies.some(p => p.action === ACTION), false);
  assert.equal(effectiveLicences(actorId).some(lic =>
    lic.actions.includes(ACTION)), false);
  const { gateway, counters } = harness(actorId);
  const result = await gateway.submit(INPUT);
  assert.equal(result.state, 'DENIED');
  assert.equal(result.reasonCode, 'entitlement_capability_missing');
  assert.equal(result.synthetic, true);
  assert.equal(result.requiresReconciliation, false);
  assert.deepEqual(counters, {
    identity: 1, bnr: 1, decision: 0, reservation: 0, execution: 0, receipt: 0
  });
});

test('revoked membership denies before Warden or River effects', async () => {
  const actorId = 'SYN-ACTOR-REVOKED-01';
  assert.equal(sourceMembership(actorId).state, 'REVOKED');
  const { gateway, counters } = harness(actorId);
  const result = await gateway.submit(INPUT);
  assert.equal(result.state, 'DENIED');
  assert.equal(result.reasonCode, 'entitlement_not_active');
  assert.equal(counters.decision, 0);
  assert.equal(counters.reservation, 0);
  assert.equal(counters.execution, 0);
  assert.equal(counters.receipt, 0);
});

test('disabled synthetic identity denies before even requesting entitlement', async () => {
  const actorId = 'SYN-ACTOR-DISABLED-01';
  assert.equal(sourceActor(actorId).state, 'DISABLED');
  const { gateway, counters } = harness(actorId);
  const result = await gateway.submit(INPUT);
  assert.equal(result.state, 'DENIED');
  assert.equal(result.reasonCode, 'identity_session_inactive_or_mismatched');
  assert.equal(counters.identity, 1);
  assert.equal(counters.bnr, 0);
  assert.equal(counters.reservation, 0);
});

test('review-required synthetic node promotion never broadens into campaign grant', () => {
  const policy = manifest.action_policies.find(p =>
    p.action === 'node.service.promote.synthetic');
  assert.equal(policy.review_required, true);
  assert.equal(policy.role, 'operator');
  assert.equal(ACTION, 'campaign.submission.record');
  assert.ok(manifest.licences.every(lic => !lic.actions.includes(ACTION)));
});
