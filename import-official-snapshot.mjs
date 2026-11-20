import { mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dailyDates, dailySource, makeDailyFeed } from './daily.mjs';
import { exportStatic } from './export-static.mjs';
import { makeFeed, REFRESH_MS, responseFor, SOURCE_URL } from './feed.mjs';

export async function importOfficialSnapshot(snapshot, outputDir, now = Date.now()) {
  const captured = Date.parse(snapshot?.capturedUtc);
  if (!Number.isFinite(captured) || new Date(captured).toISOString() !== snapshot.capturedUtc ||
      captured > now || now - captured >= REFRESH_MS) {
    throw new Error('Snapshot needs a UTC capture timestamp less than 24 hours old');
  }

  const dates = dailyDates(now);
  if (dailyDates(captured)[0] !== dates[0] || !Array.isArray(snapshot.days) ||
      snapshot.days.length !== dates.length) {
    throw new Error('Snapshot needs all eight days starting today in JST');
  }
  const daily = snapshot.days.map((day, index) => {
    const date = dates[index];
    if (day?.date !== date || day.source !== dailySource(date)) {
      throw new Error(`Invalid date or official source for guide ${date}`);
    }
    return makeDailyFeed(day.programmes, date, captured);
  });

  if (snapshot.guest?.source !== SOURCE_URL) throw new Error('Invalid official guest source');
  const guest = makeFeed(snapshot.guest.records, captured);
  if (responseFor(guest, now).body.status !== 'fresh') throw new Error('Guest snapshot is stale');

  // Build everything before exposing the output directory to an uploader.
  const target = resolve(outputDir);
  const temporary = await mkdtemp(join(dirname(target), '.qvc-snapshot-'));
  try {
    const result = await exportStatic({
      outputDir: temporary,
      clock: () => captured,
      includeDaily: true,
      scrapeDaily: async () => daily,
      scrape: async () => guest
    });
    if (result.guestError) throw new Error(result.guestError);
    await rename(temporary, target);
    return result;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , input, output, ...extra] = process.argv;
  if (!input || !output || extra.length) {
    console.error('Usage: node import-official-snapshot.mjs SNAPSHOT.json OUTPUT_DIR');
    process.exitCode = 2;
  } else {
    try {
      const snapshot = JSON.parse(await readFile(input, 'utf8'));
      console.log(JSON.stringify(await importOfficialSnapshot(snapshot, output)));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
