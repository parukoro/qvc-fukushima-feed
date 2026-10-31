import { createHash } from 'node:crypto';

export const SOURCE_URL = 'https://qvc.jp/information/feature/guest/guestpedia/1320.html';
export const GUEST = Object.freeze({ id: '1320', name: '福島豊' });
export const REFRESH_MS = 15 * 60 * 1000;
export const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function programmeStart(href) {
  let url;
  try { url = new URL(href, SOURCE_URL); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'qvc.jp') return null;
  const found = /^\/content\/programguide\.qvc\.(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\.html$/.exec(url.pathname);
  if (!found) return null;
  const [, y, m, d, h, min] = found;
  const text = `${y}-${m}-${d}T${h}:${min}:00+09:00`;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  // Date.parse can normalize impossible calendar dates. Reject such inputs.
  if (new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 16) !== text.slice(0, 16)) return null;
  return text;
}

export function cleanTitle(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function makeFeed(records, now = Date.now()) {
  if (!Array.isArray(records) || records.length > 200) throw new Error('Invalid official programme list');
  const byStart = new Map();
  for (const record of records) {
    const start = programmeStart(record.href);
    const title = cleanTitle(record.title);
    if (!start || title.length < 2 || title.length > 300) throw new Error('Programme date/title missing or invalid');
    const startMs = Date.parse(start);
    if (startMs < now - 36 * 60 * 60 * 1000 || startMs > now + 180 * 24 * 60 * 60 * 1000) continue;
    const previous = byStart.get(start);
    if (previous && previous !== title) throw new Error('Conflicting titles at one official start time');
    byStart.set(start, title);
  }
  if (byStart.size === 0) throw new Error('No verified scheduled programmes; keep prior cache, never treat empty placeholder as success');
  const programmes = [...byStart].map(([start, title]) => ({ start, title })).sort((a, b) => a.start.localeCompare(b.start));
  return {
    schemaVersion: 1,
    guestId: GUEST.id,
    guestName: GUEST.name,
    source: SOURCE_URL,
    retrievedUtc: new Date(now).toISOString(),
    refreshAfterUtc: new Date(now + REFRESH_MS).toISOString(),
    expiresUtc: new Date(now + MAX_AGE_MS).toISOString(),
    status: 'fresh',
    programmes
  };
}

export function validateSavedFeed(value) {
  if (!value || value.schemaVersion !== 1 || value.guestId !== GUEST.id || value.source !== SOURCE_URL || !Array.isArray(value.programmes)) return false;
  const retrieved = Date.parse(value.retrievedUtc);
  if (!Number.isFinite(retrieved) || value.programmes.length === 0 || value.programmes.length > 200) return false;
  if (Date.parse(value.expiresUtc) !== retrieved + MAX_AGE_MS) return false;
  return value.programmes.every(row => typeof row.title === 'string' && row.title.length >= 2 && row.title.length <= 300 && typeof row.start === 'string' && programmeStart(`https://qvc.jp/content/programguide.qvc.${row.start.slice(0,16).replace(/[-T:]/g,'')}.html`) === row.start);
}

export function responseFor(feed, now = Date.now(), lastFailure = null) {
  const age = feed ? now - Date.parse(feed.retrievedUtc) : Infinity;
  if (!feed || !Number.isFinite(age) || age < -60_000 || age >= MAX_AGE_MS) {
    return { code: 503, body: { schemaVersion: 1, guestId: GUEST.id, guestName: GUEST.name, source: SOURCE_URL, status: 'unavailable', retrievedUtc: feed?.retrievedUtc ?? null, expiresUtc: feed?.expiresUtc ?? null, programmes: [], message: 'Official appearance data unavailable or expired' } };
  }
  return { code: 200, body: { ...feed, status: age >= REFRESH_MS || lastFailure ? 'stale' : 'fresh' } };
}

export function etagFor(body) {
  return '"' + createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 24) + '"';
}
