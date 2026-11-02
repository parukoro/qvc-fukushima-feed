import { MAX_AGE_MS } from './feed.mjs';

const DAY = 86_400_000;
const JST = 9 * 3_600_000;
export function dailyDates(now = Date.now()) {
  const midnight = Math.floor((now + JST) / DAY) * DAY;
  return Array.from({ length: 8 }, (_, i) => new Date(midnight + i * DAY).toISOString().slice(0, 10).replaceAll('-', ''));
}
export function dailySource(date) {
  if (!/^20\d{6}$/.test(date)) throw new Error('Invalid guide date');
  const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  if (new Date(iso).toISOString().slice(0,10) !== iso) throw new Error('Invalid calendar date');
  return `https://qvc.jp/content/programguide.qvc.${date}0000.html`;
}
function decode(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, code) => {
    if (code.startsWith('#')) {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2),16) : parseInt(code.slice(1),10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    }
    return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[code.toLowerCase()];
  }).replace(/[\r\n\t\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
}
function attributes(tag) {
  const values = {};
  for (const match of tag.matchAll(/\b(data-[\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) values[match[1].toLowerCase()] = decode(match[2] ?? match[3]);
  return values;
}
export function parseDailyHtml(html, date) {
  dailySource(date);
  if (typeof html !== 'string' || html.length > 2_000_000) throw new Error('Invalid guide HTML size');
  // Script strings and comments are not programme markup. Nested lists inherit
  // their channel, while another channel's entries can never fill QVC gaps.
  const markup = html.replace(/<!--[^]*?-->/g,'').replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi,'');
  const channels = [], rows = [];
  for (const match of markup.matchAll(/<\/?(?:ul|li)\b[^>]*>/gi)) {
    const tag = match[0];
    if (/^<\/ul\b/i.test(tag)) { channels.pop(); continue; }
    const attrs = attributes(tag);
    if (/^<ul\b/i.test(tag)) { channels.push(attrs['data-channelcode'] ?? channels.at(-1) ?? ''); continue; }
    if (!/^<li\b/i.test(tag) || channels.at(-1) !== 'QVC' || !attrs['data-starttime']) continue;
    rows.push({start:attrs['data-starttime'],end:attrs['data-endtime'],title:attrs['data-showname']});
  }
  return validateRows(rows,date);
}
function exactTime(value) {
  if (typeof value !== 'string' || !/^20\d\d-\d\d-\d\dT\d\d:\d\d:00\+09:00$/.test(value)) throw new Error('Invalid guide time');
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms + JST).toISOString().slice(0,19) !== value.slice(0,19)) throw new Error('Invalid calendar time');
  return ms;
}
function validateRows(rows,date) {
  const start = Date.parse(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T00:00:00+09:00`);
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 96) throw new Error('Missing daily programmes');
  const result = [...rows].sort((a,b) => String(a.start).localeCompare(String(b.start)));
  let cursor = start;
  for (const row of result) {
    const from = exactTime(row.start), to = exactTime(row.end);
    if (from !== cursor || to <= from || to > start + DAY || typeof row.title !== 'string' || row.title.length < 2 || row.title.length > 300 || /[\u0000-\u001f]/.test(row.title)) throw new Error('Incomplete, overlapping, or invalid 24-hour guide');
    cursor = to;
  }
  if (cursor !== start + DAY) throw new Error('Guide does not cover full day');
  return result.map(({start,end,title}) => ({start,end,title}));
}
export function makeDailyFeed(rows,date,now=Date.now()) {
  return {schemaVersion:1,channel:'QVC',date,source:dailySource(date),status:'fresh',retrievedUtc:new Date(now).toISOString(),expiresUtc:new Date(now+MAX_AGE_MS).toISOString(),programmes:validateRows(rows,date)};
}
export function validateDailyFeed(feed,now=Date.now()) {
  try {
    if (feed.schemaVersion !== 1 || feed.channel !== 'QVC' || feed.status !== 'fresh' || feed.source !== dailySource(feed.date)) return false;
    const at = Date.parse(feed.retrievedUtc), expires = Date.parse(feed.expiresUtc);
    if (!Number.isFinite(at) || at > now + 60_000 || now - at > 120_000 || expires !== at + MAX_AGE_MS || expires <= now) return false;
    validateRows(feed.programmes,feed.date); return true;
  } catch { return false; }
}
export async function fetchDailyGuides({fetchImpl=fetch,clock=Date.now}={}) {
  const dates = dailyDates(clock()), result = [];
  for (const date of dates) {
    const response = await fetchImpl(dailySource(date),{redirect:'error',signal:AbortSignal.timeout(30_000),headers:{Accept:'text/html'}});
    if (!response.ok) throw new Error(`Official daily guide HTTP ${response.status}`);
    const bytes = [];
    let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > 2_000_000) throw new Error('Daily response too large'); bytes.push(chunk); }
    const html = Buffer.concat(bytes).toString('utf8');
    result.push(makeDailyFeed(parseDailyHtml(html,date),date,clock()));
  }
  // A date rollover during collection must not silently export yesterday's set.
  if (JSON.stringify(dates) !== JSON.stringify(dailyDates(clock()))) throw new Error('JST date changed during collection; retry next run');
  return result;
}
