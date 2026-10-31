import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { makeFeed, MAX_AGE_MS } from '../feed.mjs';
import { exportStatic, renderStatus } from '../export-static.mjs';

const NOW = Date.parse('2026-11-01T02:00:00+09:00');
const feed = makeFeed([{ href:'https://qvc.jp/content/programguide.qvc.202611011900.html', title:'公式番組 <script> & 特集' }], NOW);

test('static export writes only validated fresh data and an escaped status page', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qvc-export-'));
  try {
    const result = await exportStatic({ outputDir: dir, scrape: async () => feed, clock: () => NOW });
    assert.equal(result.programmeCount, 1);
    assert.deepEqual((await readdir(dir)).sort(), ['.nojekyll', 'index.html', 'qvc-fukushima.json']);
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'qvc-fukushima.json'), 'utf8')), feed);
    const html = await readFile(join(dir, 'index.html'), 'utf8');
    assert.match(html, /data-expiry="2026-10-31T19:00:00.000Z"/);
    assert.match(html, /公式番組 &amp; 特集/);
    assert.match(html, /情報期限切れ/);
    const before = await readFile(join(dir, 'qvc-fukushima.json'), 'utf8');
    await assert.rejects(() => exportStatic({ outputDir: dir, scrape: async () => feed, clock: () => NOW + MAX_AGE_MS }));
    assert.equal(await readFile(join(dir, 'qvc-fukushima.json'), 'utf8'), before);
    await assert.rejects(() => exportStatic({ outputDir: dir, scrape: async () => { throw new Error('Official page unavailable'); }, clock: () => NOW }));
    assert.equal(await readFile(join(dir, 'qvc-fukushima.json'), 'utf8'), before);
  } finally {
    assert.equal(resolve(dirname(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('qvc-export-'));
    await rm(dir, { recursive: true, force: true });
  }
});

test('status escapes supplied programme text and does not embed executable source data', () => {
  const html = renderStatus({ ...feed, programmes: [{ start: '2026-11-01T19:00:00+09:00', title: '<img src=x onerror=alert(1)>' }] });
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
});
