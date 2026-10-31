import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDomRecords, scrapeOfficialGuest } from '../scraper.mjs';

test('DOM extractor uses actual container and removes hidden date/visible hour spans', () => {
  const removed = [];
  const root = { querySelectorAll(selector) {
    assert.equal(selector, 'a[href*="/content/programguide.qvc."]');
    return [{ href: 'https://qvc.jp/content/programguide.qvc.202611011900.html', cloneNode() {
      return { querySelectorAll(selector) { assert.equal(selector, 'span'); return [{ remove() { removed.push('hidden date'); } }, { remove() { removed.push('visible hour'); } }]; }, get textContent() { assert.equal(removed.length, 2); return ' プロショッパーのお奨め！便利なお掃除グッズ　ハキマックス '; } };
    } }];
  } };
  const previous = globalThis.document;
  globalThis.document = { querySelector(selector) { assert.equal(selector, '#program_information'); return root; } };
  try { assert.deepEqual(collectDomRecords(), [{ href: 'https://qvc.jp/content/programguide.qvc.202611011900.html', title: 'プロショッパーのお奨め！便利なお掃除グッズ　ハキマックス' }]); }
  finally { globalThis.document = previous; }
});

test('scraper waits for delayed correct container and closes isolated browser', async () => {
  let waited = false, closed = false;
  const now = Date.parse('2026-11-01T02:00:00+09:00');
  const browserFactory = { async launch(options) {
    assert.equal(options.headless, true);
    return { async close() { closed = true; }, async newContext(options) {
      assert.equal(options.timezoneId, 'Asia/Tokyo');
      return { async route() {}, async newPage() { return {
        async goto(url) { assert.equal(url, 'https://qvc.jp/information/feature/guest/guestpedia/1320.html'); return { ok: () => true }; },
        url: () => 'https://qvc.jp/information/feature/guest/guestpedia/1320.html',
        async waitForFunction(fn, arg, options) { assert.match(fn.toString(), /program_information/); assert.equal(options.timeout, 60_000); waited = true; },
        locator: () => ({ allTextContents: async () => ['福島豊さん'] }),
        async evaluate(fn) { assert.equal(waited, true); assert.equal(fn, collectDomRecords); return [{ href: 'https://qvc.jp/content/programguide.qvc.202611011900.html', title: 'ハキマックス' }]; }
      }; } };
    } };
  } };
  const feed = await scrapeOfficialGuest({ now, browserFactory });
  assert.equal(feed.programmes[0].start, '2026-11-01T19:00:00+09:00');
  assert.equal(closed, true);
});
