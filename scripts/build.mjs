import { mkdir, rm, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist');
// Explicitly publish only visitor assets, never backend source or configuration.
for (const name of await readdir('.')) {
  if (/\.html$/.test(name) || /^afromkt-.*\.png$/.test(name) ||
      ['robots.txt', 'sitemap.xml', '_headers', 'config.js', 'marketing-consent.js', 'marketplace-search.js',
        'preview-theme.css', 'preview-theme.js', 'preview-home.js', 'preview-dashboard.css', 'preview-dashboard-ui.js', 'sell-page.js'].includes(name)) {
    if (/\.html$/.test(name)) {
      const html = await readFile(name, 'utf8');
      const icon = '<link rel="icon" type="image/png" href="/afromkt-favicon.png?v=20261003">';
      const page = /rel\s*=\s*["'](?:shortcut )?icon["']/i.test(html) ? html
        : /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${icon}\n</head>`)
        : html.replace(/(<html\b[^>]*>)/i, `$1\n${icon}`);
      const consent = '<script src="/marketing-consent.js" defer></script>';
      const published = /<\/body>/i.test(page) && !['dashboard.html', 'success.html', '404.html'].includes(name)
        ? page.replace(/<\/body>/i, `${consent}\n</body>`) : page;
      await writeFile(`dist/${name}`, published);
    } else {
      await copyFile(name, `dist/${name}`);
    }
  }
}
console.log('Website built in dist/');
