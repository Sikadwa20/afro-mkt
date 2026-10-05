import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

test('Cloudflare output includes runtime configuration and crawler assets, excluding backend source', () => {
  execFileSync(process.execPath, ['scripts/build.mjs']);
  const files = readdirSync('dist');
  for (const expected of ['index.html', 'sell.html', 'shop.html', 'dashboard.html', 'success.html',
    'config.js', 'marketplace-search.js', '404.html', 'robots.txt', 'sitemap.xml', '_headers', 'afromkt-facebook-cover.png']) {
    assert.ok(files.includes(expected), `${expected} must be published`);
  }
  for (const forbidden of ['supabase', 'supabase-schema.sql', 'tests', 'docs', '.git', '.env', 'package.json']) {
    assert.ok(!files.includes(forbidden), `${forbidden} must not be published`);
  }
  assert.doesNotMatch(readFileSync('dist/config.js', 'utf8'), /sk_live_|sk_test_|service_role/);
  assert.match(readFileSync('dist/robots.txt', 'utf8'), /Sitemap: https:\/\/afro-mkt.com\/sitemap.xml/);
});
