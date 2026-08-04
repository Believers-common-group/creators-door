import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const path of ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'docs', 'README.md']) {
  await cp(path, `dist/${path}`, { recursive: true });
}
console.log('Built static application in dist/.');
