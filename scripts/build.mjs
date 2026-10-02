import { mkdir, rm, copyFile, readdir } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist');
// Explicitly publish only visitor assets, never backend source or configuration.
for (const name of await readdir('.')) {
  if (/\.html$/.test(name) || /^afromkt-.*\.png$/.test(name) ||
      ['robots.txt', 'sitemap.xml', '_headers', 'config.js'].includes(name)) {
    await copyFile(name, `dist/${name}`);
  }
}
console.log('Website built in dist/');
