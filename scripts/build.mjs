import { cp, mkdir, rm, stat } from 'node:fs/promises';

const PUBLIC_FILES = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'src/main.js',
  'src/data.js',
  'src/styles.css',
];
const OPTIONAL_PUBLIC_FILES = [
  'src/influencers.js', // Present only after the R0.3 feature is reviewed and merged.
];

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

for (const path of PUBLIC_FILES) {
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`not_a_public_file:${path}`);
  await mkdir(`dist/${path.split('/').slice(0, -1).join('/')}`, { recursive: true });
  await cp(path, `dist/${path}`);
}
for (const path of OPTIONAL_PUBLIC_FILES) {
  const metadata = await stat(path).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (metadata) {
    if (!metadata.isFile()) throw new Error(`not_a_public_file:${path}`);
    await mkdir(`dist/${path.split('/').slice(0, -1).join('/')}`, { recursive: true });
    await cp(path, `dist/${path}`);
  }
}
console.log('Built allowlisted static application in dist/. No tests, docs, or server runtime.');
