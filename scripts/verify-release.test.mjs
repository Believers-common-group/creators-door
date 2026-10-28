import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile, unlink, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyRelease, requiredPublicFiles } from './verify-release.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'creator-release-'));
  const dist = join(root, 'dist');
  await cp(resolve('dist'), dist, { recursive: true });
  return {root, dist, async cleanup() { await rm(root, {recursive:true,force:true}); }};
}

test('static preview manifest includes only allowlisted assets and is deterministic', async () => {
  const f = await fixture();
  try {
    const a = await verifyRelease({dist:f.dist,output:join(f.root,'release.json'),commit:'COMMIT-TEST'});
    const b = await verifyRelease({dist:f.dist,output:join(f.root,'release.json'),commit:'COMMIT-TEST'});
    assert.deepEqual(a,b);
    assert.equal(a.deployEligible,false);
    assert.equal(a.classification,'PUBLIC_STATIC_PROTOTYPE');
    assert.match(a.contentDigest,/^sha256:[a-f0-9]{64}$/);
    assert.ok(a.files.length >= requiredPublicFiles.length);
    const disk=JSON.parse(await readFile(join(f.root,'release.json'),'utf8'));
    assert.deepEqual(disk,a);
  } finally {await f.cleanup();}
});
test('server code and other unknown public files are rejected', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.dist,'exposed-token.txt'),'should never publish');
    await assert.rejects(verifyRelease({dist:f.dist,write:false}),
      /release_public_asset_mismatch/);
  } finally {await f.cleanup();}
});
test('missing critical site assets reject release', async () => {
  const f = await fixture();
  try {
    await unlink(join(f.dist,'sw.js'));
    await assert.rejects(verifyRelease({dist:f.dist,write:false}),
      /release_public_asset_mismatch/);
  } finally {await f.cleanup();}
});
test('symlinked release content is rejected before producing an attestation', async () => {
  const f = await fixture();
  try {
    await symlink(join(f.dist,'index.html'),join(f.dist,'alias.html'));
    await assert.rejects(verifyRelease({dist:f.dist,write:false}),
      /release_symlink_forbidden/);
  } finally {await f.cleanup();}
});
