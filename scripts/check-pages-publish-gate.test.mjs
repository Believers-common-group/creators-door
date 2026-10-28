import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertPagesPublishGate } from './check-pages-publish-gate.mjs';

const SHA = 'a'.repeat(40);
const manifest = Object.freeze({
  schema: 'genesis.creators-door.static-preview-release.v1',
  service: 'creators-door',
  classification: 'PUBLIC_STATIC_PROTOTYPE',
  authority: 'NONE; Warden/RiverOS remain mock integration seams',
  deployEligible: false,
  sourceCommit: SHA,
  contentDigest: 'sha256:' + 'b'.repeat(64),
  files: Array.from({length: 6}, (_, i) => ({
    path: 'asset-' + i + '.js', size: 12, sha256: 'c'.repeat(64)
  }))
});
const request = Object.freeze({
  eventName: 'workflow_dispatch',
  ref: 'refs/heads/main',
  sha: SHA,
  expectedSha: SHA,
  classification: 'PUBLIC_STATIC_PROTOTYPE',
  acknowledgement: 'PUBLISH_STATIC_PROTOTYPE_ONLY',
  releaseReference: 'BNR-RELEASE-TEST-0001',
  manifest
});
const blocked = (override, reason) => assert.throws(
  () => assertPagesPublishGate({...request, ...override}), 
  error => error instanceof Error && error.message === 'pages_publish_blocked:' + reason
);

test('existing R0.1 manifest always blocks production publishing', () => {
  blocked({}, 'release_not_eligible');
});
test('manual dispatch, exact main ref and commit pin are mandatory', () => {
  blocked({eventName:'push'}, 'manual_dispatch_required');
  blocked({eventName:'pull_request'}, 'manual_dispatch_required');
  blocked({ref:'refs/heads/genesis'}, 'main_branch_required');
  blocked({ref:'refs/heads/feat/other'}, 'main_branch_required');
  blocked({sha:'abc'}, 'invalid_source_commit');
  blocked({expectedSha:'d'.repeat(40)}, 'commit_mismatch');
});
test('release reference, scope and prototype acknowledgement must be explicit', () => {
  blocked({classification:'PRODUCTION_SERVICE'}, 'unexpected_release_classification');
  blocked({acknowledgement:'PUBLISH_ANYTHING'}, 'prototype_acknowledgement_required');
  blocked({releaseReference:'SIGNED_BY_MYSELF'}, 'release_reference_required');
  blocked({manifest:{...manifest,authority:'Warden ALLOW'}}, 'authority_boundary_mismatch');
  blocked({manifest:{...manifest,sourceCommit:'d'.repeat(40)}}, 'manifest_source_mismatch');
  blocked({manifest:{...manifest,classification:'LIVE_BACKEND'}}, 'manifest_classification_mismatch');
});
test('even future eligible metadata cannot omit manifest inventory', () => {
  const eligible={...manifest,deployEligible:true};
  blocked({manifest:{...eligible,files:[]}}, 'invalid_manifest_inventory');
  blocked({manifest:{...eligible,files:[{path:'x',size:3,sha256:'not-digest'}]}}, 'invalid_manifest_inventory');
  blocked({manifest:{...eligible,contentDigest:'bad'}}, 'invalid_content_digest');
  // Positive output only means the precheck accepts metadata; it explicitly
  // does NOT prove an approved GitHub Environment or human authorization.
  const result = assertPagesPublishGate({...request,manifest:eligible});
  assert.equal(result.state,'PRECHECK_PASSED');
  assert.equal(result.humanReviewProven,false);
  assert.equal(result.authorityGranted,false);
});
test('proposed workflow has no automatic push publishing and separates deploy permissions', async () => {
  const workflow=await readFile('.github/workflows/pages.yml','utf8');
  assert.match(workflow,/^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/^\s+push:\s*$/m);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/run: npm run check:publish/);
  assert.match(workflow,/name: github-pages/);
  assert.match(workflow,/pages: write/);
  assert.match(workflow,/deploy-pages@v4/);
});
