// GitHub Pages R0.2: fail-closed publication preflight.
// No publish action is performed by this module. Input fields describe
// the proposed workflow run; metadata alone is never proof of human review.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function requireCondition(condition, reason) {
  if (!condition) throw new Error('pages_publish_blocked:' + reason);
}
export function assertPagesPublishGate({
  eventName, ref, sha, expectedSha, classification, acknowledgement,
  releaseReference, manifest
}) {
  requireCondition(eventName === 'workflow_dispatch', 'manual_dispatch_required');
  requireCondition(ref === 'refs/heads/main', 'main_branch_required');
  requireCondition(typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha),
    'invalid_source_commit');
  requireCondition(expectedSha === sha, 'commit_mismatch');
  requireCondition(classification === 'PUBLIC_STATIC_PROTOTYPE',
    'unexpected_release_classification');
  requireCondition(acknowledgement === 'PUBLISH_STATIC_PROTOTYPE_ONLY',
    'prototype_acknowledgement_required');
  requireCondition(typeof releaseReference === 'string' &&
    /^BNR-RELEASE-[A-Z0-9-]{4,80}$/.test(releaseReference),
    'release_reference_required');
  requireCondition(manifest && typeof manifest === 'object' && !Array.isArray(manifest),
    'missing_release_manifest');
  requireCondition(manifest.schema === 'genesis.creators-door.static-preview-release.v1' &&
    manifest.service === 'creators-door', 'wrong_manifest_contract');
  requireCondition(manifest.sourceCommit === sha, 'manifest_source_mismatch');
  requireCondition(manifest.classification === 'PUBLIC_STATIC_PROTOTYPE',
    'manifest_classification_mismatch');
  requireCondition(manifest.authority ===
    'NONE; Warden/RiverOS remain mock integration seams',
    'authority_boundary_mismatch');
  // Important: the current R0.1 manifest sets deployEligible:false.
  // A separate, explicitly reviewed and tested release policy change is
  // required before this publishing workflow can EVER pass.
  requireCondition(manifest.deployEligible === true, 'release_not_eligible');
  requireCondition(Array.isArray(manifest.files) && manifest.files.length >= 6 &&
    manifest.files.every(item => item && typeof item.path === 'string' &&
      Number.isSafeInteger(item.size) && item.size >= 0 &&
      typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/.test(item.sha256)),
    'invalid_manifest_inventory');
  requireCondition(typeof manifest.contentDigest === 'string' &&
    /^sha256:[a-f0-9]{64}$/.test(manifest.contentDigest),
    'invalid_content_digest');
  return Object.freeze({
    state: 'PRECHECK_PASSED',
    classification: manifest.classification,
    sourceCommit: sha,
    releaseReference,
    contentDigest: manifest.contentDigest,
    authorityGranted: false,
    humanReviewProven: false
  });
}

export async function checkPagesPublishFromEnvironment(
  env = process.env,
  manifestPath = resolve('out/release-manifest.json')
) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  return assertPagesPublishGate({
    eventName: env.GITHUB_EVENT_NAME,
    ref: env.GITHUB_REF,
    sha: env.GITHUB_SHA,
    expectedSha: env.RELEASE_EXPECTED_SHA,
    classification: env.RELEASE_CLASSIFICATION,
    acknowledgement: env.RELEASE_ACKNOWLEDGEMENT,
    releaseReference: env.RELEASE_REFERENCE,
    manifest
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkPagesPublishFromEnvironment()
    .then(result => console.log('PAGES_STATIC_PUBLISH_PRECHECK', JSON.stringify(result)))
    .catch(error => {
      console.error(error instanceof Error ? error.message : 'pages_publish_blocked:unknown');
      process.exitCode = 1;
    });
}
