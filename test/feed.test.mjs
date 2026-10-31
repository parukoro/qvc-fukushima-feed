import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { programmeStart, cleanTitle, makeFeed, validateSavedFeed, responseFor, REFRESH_MS, MAX_AGE_MS } from '../feed.mjs';
import { createFeedServer } from '../server.mjs';

const NOW = Date.parse('2026-11-01T02:00:00+09:00');
const rows = [
  { href: 'https://qvc.jp/content/programguide.qvc.202611011900.html', title: 'プロショッパーのお奨め！便利なお掃除グッズ　ハキマックス' },
  { href: 'https://qvc.jp/content/programguide.qvc.202611080700.html', title: '使って便利！楽ちんパワフルキャリー' }
];

test('exact href provides year, date, and minutes; external/invalid dates are rejected', () => {
  assert.equal(programmeStart(rows[0].href), '2026-11-01T19:00:00+09:00');
  assert.equal(programmeStart('/content/programguide.qvc.202612312330.html'), '2026-12-31T23:30:00+09:00');
  assert.equal(programmeStart('https://evil.example/content/programguide.qvc.202611011900.html'), null);
  assert.equal(programmeStart('/content/programguide.qvc.202602300100.html'), null);
  assert.equal(programmeStart('/content/programguide.qvc.202611012500.html'), null);
});

test('official records sorted and deduplicated; placeholders and conflicts fail closed', () => {
  const feed = makeFeed([rows[1], rows[0], rows[0]], NOW);
  assert.equal(feed.programmes.length, 2);
  assert.equal(feed.programmes[0].start, '2026-11-01T19:00:00+09:00');
  assert.equal(feed.programmes[0].title, cleanTitle(rows[0].title));
  assert.equal(feed.guestId, '1320');
  assert.equal(validateSavedFeed(feed), true);
  assert.equal(validateSavedFeed({ ...feed, expiresUtc: '2099-01-01T00:00:00Z' }), false);
  assert.throws(() => makeFeed([], NOW));
  assert.throws(() => makeFeed([rows[0], { ...rows[0], title: '別番組' }], NOW));
});

test('failed refresh keeps cached fact age; stale and expiry are explicit', () => {
  const feed = makeFeed(rows, NOW);
  assert.equal(responseFor(feed, NOW).body.status, 'fresh');
  assert.equal(responseFor(feed, NOW + 1000, 'refresh_failed').body.status, 'stale');
  assert.equal(responseFor(feed, NOW + REFRESH_MS).body.status, 'stale');
  assert.equal(responseFor(feed, NOW + MAX_AGE_MS).code, 503);
  assert.deepEqual(responseFor(feed, NOW + MAX_AGE_MS).body.programmes, []);
  assert.equal(responseFor(null, NOW).body.status, 'unavailable');
});

test('GET endpoint, ETag/HEAD, no proxy route, and expiry response', async () => {
  const feed = makeFeed(rows, NOW);
  let clock = NOW;
  const server = createFeedServer({ getFeed: () => feed, clock: () => clock });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base + '/qvc-fukushima.json');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).programmes.length, 2);
    const etag = response.headers.get('etag');
    assert.equal((await fetch(base + '/qvc-fukushima.json', { headers: { 'If-None-Match': etag } })).status, 304);
    assert.equal(await (await fetch(base + '/qvc-fukushima.json', { method: 'HEAD' })).text(), '');
    assert.equal((await fetch(base + '/qvc-fukushima.json', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/?url=https://example.com')).status, 404);
    clock += MAX_AGE_MS;
    assert.equal((await fetch(base + '/qvc-fukushima.json')).status, 503);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
