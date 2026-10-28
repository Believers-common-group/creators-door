import test from 'node:test';
import assert from 'node:assert/strict';
import { relationship, campaigns, lifecycle, checkTransition, getCampaign, renderInfluencersDoor } from './influencers.js';

test('two campaigns reuse one brand–creator relationship', () => {
  assert.equal(campaigns.length, 2);
  assert.ok(campaigns.every(c => c.relationshipId === relationship.relationshipId));
  assert.equal(relationship.rightsHolder, 'creator');
});
test('no arbitrary status change is accepted', () => {
  assert.deepEqual(checkTransition('draft', 'reconciled'), { allowed: false, reason: 'invalid_transition' });
  assert.deepEqual(checkTransition('closed', 'draft'), { allowed: false, reason: 'invalid_transition' });
});
test('cannot authorize without consent and approval references', () => {
  assert.equal(checkTransition('briefed', 'authorized').allowed, false);
  const proof = {
    agreementRef: 'A1', creatorConsentRef: 'C1', contentRightsRef: 'R1',
    disclosurePlanRef: 'D1', wardenDecisionRef: 'W1', wardenDecision: 'DENY'
  };
  assert.equal(checkTransition('briefed', 'authorized', proof).reason, 'warden_not_allow');
  assert.equal(checkTransition('briefed', 'authorized', { ...proof, wardenDecision: 'ALLOW' }).reason,
    'references_present_not_verified');
});
test('no reconciliation without independent settlement receipt', () => {
  assert.equal(checkTransition('accepted', 'reconciled', { invoiceRef: 'IN-1' }).reason,
    'missing_independentSettlementReceiptRef');
});
test('read-only demo identifies limitations and switches campaigns', () => {
  const selected = renderInfluencersDoor('DEMO-CMP-002');
  assert.match(selected, /Community feedback programme/);
  assert.match(selected, /synthetic records/);
  assert.match(selected, /No verified DigitalMe login/);
  assert.match(selected, /aria-pressed="true"/);
  assert.equal(getCampaign('unknown').campaignId, campaigns[0].campaignId);
  assert.equal(lifecycle.at(-1), 'closed');
});
