// Source-only release gate: verifies a strictly allowlisted static preview
// artifact. Never issues Warden authority, publishes to GitHub Pages, or deploys.
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const requiredPublicFiles = Object.freeze([
  'index.html', 'manifest.webmanifest', 'sw.js',
  'src/data.js', 'src/main.js', 'src/styles.css'
].sort());
export const optionalPublicFiles = Object.freeze(['src/influencers.js']);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function filesUnder(dir, root = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const all = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    // Reject symlinks, even when they resolve to valid files.
    const metadata = await lstat(path);
    assert(!metadata.isSymbolicLink(), 'release_symlink_forbidden:' + path);
    if (metadata.isDirectory()) all.push(...await filesUnder(path, root));
    else {
      assert(metadata.isFile(), 'release_non_file_forbidden:' + path);
      all.push(relative(root, path).replaceAll('\\', '/'));
    }
  }
  return all.sort();
}

export async function verifyRelease({
  dist = resolve('dist'),
  output = resolve('out/release-manifest.json'),
  commit = process.env.GITHUB_SHA || 'LOCAL_BUILD',
  write = true
} = {}) {
  const found = await filesUnder(dist);
  const expected = [...requiredPublicFiles];
  const optional = await Promise.all(optionalPublicFiles.map(async path => {
    const source = resolve(path);
    try {
      const metadata = await lstat(source);
      assert(metadata.isFile(), 'optional_browser_source_not_regular_file:' + path);
      return path;
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }));
  expected.push(...optional.filter(Boolean));
  expected.sort();
  assert(JSON.stringify(found) === JSON.stringify(expected),
    'release_public_asset_mismatch: expected ' + expected.join(',') +
    ' received ' + found.join(','));
  const html = (await readFile(join(dist, 'index.html'))).toString('utf8');
  assert(html.includes('./src/main.js'), 'release_html_main_entry_missing');
  const sw = (await readFile(join(dist, 'sw.js'))).toString('utf8');
  for (const file of requiredPublicFiles.filter(x => x !== 'sw.js')) {
    assert(found.includes(file), 'release_missing_required:' + file);
  }
  assert(!sw.includes('runtime/') && !sw.includes('.test.js'),
    'release_service_worker_private_asset');
  const entries = [];
  for (const path of found) {
    const buf = await readFile(join(dist, path));
    entries.push({ path, size: buf.length, sha256: sha256(buf) });
  }
  const payload = {
    schema: 'genesis.creators-door.static-preview-release.v1',
    service: 'creators-door',
    classification: 'PUBLIC_STATIC_PROTOTYPE',
    authority: 'NONE; Warden/RiverOS remain mock integration seams',
    deployEligible: false,
    sourceCommit: commit,
    files: entries,
    contentDigest: 'sha256:' + sha256(JSON.stringify(entries))
  };
  if (write) {
    await mkdir(resolve(output, '..'), { recursive: true });
    await writeFile(output, JSON.stringify(payload, null, 2) + '\n', { flag: 'w' });
  }
  return payload;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyRelease()
    .then(result => console.log(
      'STATIC_PREVIEW_VALIDATED ' + result.contentDigest +
      ' deployEligible=false files=' + result.files.length))
    .catch(error => { console.error('RELEASE_VALIDATION_FAILED', error.message); process.exitCode = 1; });
}
