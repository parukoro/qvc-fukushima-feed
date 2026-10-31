import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { SOURCE_URL, makeFeed } from './feed.mjs';

// This function is serialized into Playwright's page context. No network APIs,
// cookies, global application state, or user browser profiles are inspected.
export function collectDomRecords() {
  const root = document.querySelector('#program_information');
  if (!root) return [];
  return Array.from(root.querySelectorAll('a[href*="/content/programguide.qvc."]')).map(anchor => {
    const copy = anchor.cloneNode(true);
    // The official markup puts a hidden date and a visible hour in spans.
    // Both must be removed; the href is the authoritative full date/time.
    copy.querySelectorAll('span').forEach(span => span.remove());
    return { href: anchor.href, title: copy.textContent.trim() };
  });
}

export async function scrapeOfficialGuest({ now = Date.now(), browserFactory } = {}) {
  const chromium = browserFactory ?? (await import('playwright')).chromium;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
    // Do not block scripts/Karte: #program_information is rendered after navigation.
    await context.route('**/*', route => {
      const type = route.request().resourceType();
      return ['image', 'media', 'font'].includes(type) ? route.abort() : route.continue();
    });
    const page = await context.newPage();
    const response = await page.goto(SOURCE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (!response || !response.ok()) throw new Error('Official guest page HTTP failure');
    if (new URL(page.url()).pathname !== '/information/feature/guest/guestpedia/1320.html') throw new Error('Unexpected guest page redirect');
    await page.waitForFunction(() => {
      const root = document.querySelector('#program_information');
      return root && Array.from(root.querySelectorAll('a[href*="/content/programguide.qvc."]')).some(a => /\d{12}\.html/.test(a.href) && a.textContent.trim().length > 3);
    }, undefined, { timeout: 60_000 });
    const identity = await page.locator('h1').allTextContents();
    if (!identity.some(text => text.replace(/\s+/g, '').includes('福島豊'))) throw new Error('Official guest identity mismatch');
    const records = await page.evaluate(collectDomRecords);
    return makeFeed(records, now);
  } finally { await browser.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  scrapeOfficialGuest().then(feed => { console.log(JSON.stringify(feed, null, 2)); }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
