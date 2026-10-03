import { mkdir, rm, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist');
// Explicitly publish only visitor assets, never backend source or configuration.
for (const name of await readdir('.')) {
  if (/\.html$/.test(name) || /^afromkt-.*\.png$/.test(name) ||
      ['robots.txt', 'sitemap.xml', '_headers', 'config.js'].includes(name)) {
    if (/\.html$/.test(name)) {
      const html = await readFile(name, 'utf8');
      const icon = '<link rel="icon" type="image/png" href="/afromkt-favicon.png?v=20261003">';
      const page = /rel\s*=\s*["'](?:shortcut )?icon["']/i.test(html) ? html
        : /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${icon}\n</head>`)
        : html.replace(/(<html\b[^>]*>)/i, `$1\n${icon}`);
      await writeFile(`dist/${name}`, page);
    } else {
      await copyFile(name, `dist/${name}`);
    }
  }
}
console.log('Website built in dist/');
