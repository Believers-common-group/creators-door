// Influencers Door R0.3: demonstration only. No live grants, payments or publication.
export const relationship = Object.freeze({
  relationshipId: 'DEMO-REL-001',
  creatorActorId: 'DEMO-CREATOR-001',
  brandActorId: 'DEMO-BRAND-001',
  creatorName: 'Demo Creator',
  brandName: 'Demo Brand',
  status: 'proposed',
  rightsHolder: 'creator',
  commercialScope: 'No licensed content use until agreement and approvals exist'
});

export const campaigns = Object.freeze([
  Object.freeze({
    campaignId: 'DEMO-CMP-001',
    relationshipId: relationship.relationshipId,
    title: 'Product education series',
    purpose: 'Explain product features using supported factual claims',
    channels: ['Short video', 'Article'],
    status: 'briefed',
    deliverables: ['2 educational clips', '1 disclosure review'],
    attribution: 'Proposed tracking link (not issued)'
  }),
  Object.freeze({
    campaignId: 'DEMO-CMP-002',
    relationshipId: relationship.relationshipId,
    title: 'Community feedback programme',
    purpose: 'Collect opt-in product feedback',
    channels: ['Community forum'],
    status: 'draft',
    deliverables: ['1 discussion guide', '1 aggregate feedback summary'],
    attribution: 'Not configured'
  })
]);

export const lifecycle = Object.freeze([
  'draft', 'briefed', 'authorized', 'delivered', 'accepted', 'reconciled', 'closed'
]);

// This checks presence of required references only. A production service must
// independently authenticate issuers, signatures, scope, expiry and revocation.
export function checkTransition(current, next, proof = {}) {
  const position = lifecycle.indexOf(current);
  if (position < 0 || lifecycle[position + 1] !== next) {
    return { allowed: false, reason: 'invalid_transition' };
  }
  const required = {
    briefed: ['briefRef'],
    authorized: ['agreementRef', 'creatorConsentRef', 'contentRightsRef', 'disclosurePlanRef', 'wardenDecisionRef'],
    delivered: ['workPackageRef', 'submissionReceiptRef'],
    accepted: ['reviewerAcceptanceRef'],
    reconciled: ['invoiceRef', 'independentSettlementReceiptRef'],
    closed: ['closeoutEvidenceRef']
  };
  for (const key of required[next] || []) {
    if (typeof proof[key] !== 'string' || !proof[key].trim()) {
      return { allowed: false, reason: 'missing_' + key };
    }
  }
  if (next === 'authorized' && proof.wardenDecision !== 'ALLOW') {
    return { allowed: false, reason: 'warden_not_allow' };
  }
  return { allowed: true, reason: 'references_present_not_verified' };
}

export function getCampaign(id) {
  return campaigns.find(c => c.campaignId === id) || campaigns[0];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}
function e(value) { return escapeHtml(value); }

export function renderInfluencersDoor(selectedId = campaigns[0].campaignId, options = {}) {
  const c = getCampaign(selectedId);
  const buttons = campaigns.map(item =>
    '<button type="button" class="role glass ' + (item.campaignId === c.campaignId ? 'selected' : '') +
    '" data-influencer-campaign="' + e(item.campaignId) + '" aria-pressed="' +
    (item.campaignId === c.campaignId) + '">' +
    '<span>◎</span><div><strong>' + e(item.title) + '</strong><small>' +
    e(item.campaignId) + ' · ' + e(item.status) + '</small></div></button>'
  ).join('');
  const detail = [
    ['Purpose', c.purpose], ['Deliverables', c.deliverables.join(' · ')],
    ['Channels', c.channels.join(' · ')], ['Attribution', c.attribution],
    ['Status', c.status + ' — demonstration data']
  ].map((pair, index) =>
    '<article><span>' + String(index + 1).padStart(2, '0') + '</span>' +
    '<div><strong>' + e(pair[0]) + '</strong><p>' + e(pair[1]) +
    '</p></div></article>'
  ).join('');
  return [
    '<section class="hero compact"><p class="kicker">VSR · CREATORS COMMON · DEMONSTRATION</p>',
    '<h1>Influencers <em>Door.</em></h1>',
    '<p>Keep creator rights, relationships, campaigns, approvals and attribution connected across individual engagements.</p></section>',
    '<section class="consent glass"><div><span>◇</span><div><strong>Prototype — synthetic records</strong>',
    '<p>No verified DigitalMe login, Warden grant, live RiverOS receipt, publication or SILK payment occurs here.</p></div></div></section>',
    '<div class="section-title"><div><small>CONTINUOUS ACCOUNT</small><h2>Brand–creator relationship</h2></div></div>',
    '<section class="feed glass"><article><span>◎</span><div><strong>' + e(relationship.creatorName) +
    ' ↔ ' + e(relationship.brandName) + '</strong><p>' + e(relationship.relationshipId) +
    ' · ' + e(relationship.status) + '</p></div></article>',
    '<article><span>◎</span><div><strong>Rights and permissions</strong><p>Creator retains original work. ' +
    e(relationship.commercialScope) + '.</p></div></article></section>',
    '<div class="section-title"><div><small>ONE RELATIONSHIP · MULTIPLE ENGAGEMENTS</small><h2>Campaigns</h2></div></div>',
    '<section class="role-list" aria-label="Select a synthetic campaign">' + buttons + '</section>',
    '<div class="section-title"><div><small>SELECTED WORK PACKAGE</small><h2>' + e(c.title) + '</h2></div></div>',
    '<section class="feed glass">' + detail + '</section>',
    '<section class="consent glass"><div><span>◇</span><div><strong>Governed workflow</strong>',
    '<p>Agreement → consent → Warden authorization → submissions → independent acceptance → evidence → reconciliation. No real action is triggered by this preview.</p>',
    '</div></div></section>',
    '<div class="section-title"><div><small>GENESIS INTEGRATION R0.4</small><h2>Governed access check</h2></div></div>',
    '<section class="consent glass"><div><span>◇</span><div><strong>Server-side verification only</strong>',
    '<p>Requires a trusted DigitalMe session, active BNR membership, admitted Warden observation capability and a corresponding River receipt. Does not publish or pay.</p></div></div>',
    '<label class="connector-field">Registered relationship ID<input data-live-relationship type="text" autocomplete="off" maxlength="128" placeholder="Registered relationship ID" value="' + e(options.relationshipId || '') + '"></label>',
    '<label class="connector-field">Registered campaign ID<input data-live-campaign type="text" autocomplete="off" maxlength="128" placeholder="Registered campaign ID" value="' + e(options.campaignId || '') + '"></label>',
    '<button type="button" class="participate" data-connector-status>Check service configuration</button>',
    '<button type="button" class="participate" data-connector-observe>Verify read-only observation</button>',
    '<p class="connector-feedback" role="status" aria-live="polite">' + e(options.feedback || 'Not connected — local preview only') + '</p>',
    '</section>'
  ].join('');
}
