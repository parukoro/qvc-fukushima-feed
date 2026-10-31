import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { REFRESH_MS, validateSavedFeed, responseFor, etagFor } from './feed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export function createFeedServer({ getFeed, getFailure = () => null, clock = Date.now }) {
  return http.createServer((req, res) => {
    const pathname = (req.url ?? '').split('?')[0];
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
    }
    if (pathname !== '/qvc-fukushima.json' && pathname !== '/healthz') {
      res.writeHead(404); res.end(); return;
    }
    const { code, body } = responseFor(getFeed(), clock(), getFailure());
    const value = pathname === '/healthz' ? { status: body.status, retrievedUtc: body.retrievedUtc, expiresUtc: body.expiresUtc } : body;
    const etag = etagFor(value);
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30, must-revalidate', 'X-Content-Type-Options': 'nosniff', ETag: etag };
    if (code === 503) headers['Retry-After'] = '60';
    if (code === 200 && req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
    const json = JSON.stringify(value);
    res.writeHead(code, { ...headers, 'Content-Length': Buffer.byteLength(json) });
    res.end(req.method === 'HEAD' ? undefined : json);
  });
}

export async function main() {
  // This application never reads a browser profile, auth token, or purchased asset.
  // Its only configurable exposure is the HTTP listener; loopback is the safe default.
  const host = process.env.QVC_FEED_HOST ?? '127.0.0.1';
  const port = Number(process.env.QVC_FEED_PORT ?? '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid QVC_FEED_PORT');
  const dataDir = join(HERE, 'data');
  const cachePath = join(dataDir, 'cache.json');
  let feed = null, lastFailure = null, busy = false, stopping = false;
  try { const parsed = JSON.parse(await readFile(cachePath, 'utf8')); if (validateSavedFeed(parsed)) feed = parsed; } catch { /* Missing or invalid cache means unavailable, never fabricated data. */ }
  const refresh = async () => {
    if (busy || stopping) return;
    busy = true;
    try {
      const { scrapeOfficialGuest } = await import('./scraper.mjs');
      const next = await scrapeOfficialGuest();
      await mkdir(dataDir, { recursive: true });
      await writeFile(cachePath + '.tmp', JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
      await rename(cachePath + '.tmp', cachePath);
      feed = next; lastFailure = null;
      console.log(`Updated official guest feed: ${next.programmes.length} programmes at ${next.retrievedUtc}`);
    } catch (error) {
      lastFailure = 'refresh_failed';
      console.error(`Official guest refresh failed: ${String(error?.message ?? error).slice(0, 300)}`);
    } finally { busy = false; }
  };
  const server = createFeedServer({ getFeed: () => feed, getFailure: () => lastFailure });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, host, resolveListen); });
  console.log(`QVC guest-only GET feed: http://${host}:${port}/qvc-fukushima.json`);
  void refresh();
  const timer = setInterval(() => { void refresh(); }, REFRESH_MS);
  const stop = () => { stopping = true; clearInterval(timer); server.close(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return { server, refresh, stop };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
