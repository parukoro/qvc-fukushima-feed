import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dailyDates, dailySource } from '../daily.mjs';
import { MAX_AGE_MS, SOURCE_URL } from '../feed.mjs';
import { importOfficialSnapshot } from '../import-official-snapshot.mjs';

const capturedUtc = '2026-11-20T04:00:00.000Z';
const captured = Date.parse(capturedUtc);
const now = captured + 2 * 60 * 60 * 1000;

function fixture() {
  const iso = date => date.replace(/^(....)(..)(..)$/, '$1-$2-$3');
  const days = dailyDates(captured).map(date => {
    const next = new Date(Date.parse(iso(date)) + 86_400_000).toISOString().slice(0, 10);
    return {
      date,
      source: dailySource(date),
      programmes: [{ start: iso(date) + 'T00:00:00+09:00', end: next + 'T00:00:00+09:00', title: '番組表テスト' }]
    };
  });
  return {
    capturedUtc,
    days,
    guest: {
      source: SOURCE_URL,
      records: [{ href: 'https://qvc.jp/content/programguide.qvc.202611211900.html', title: '出演予定テスト' }]
    }
  };
}

test('snapshot generates both feeds offline and preserves capture time and expiry', async t => {
  const parent = await mkdtemp(join(tmpdir(), 'qvc-snapshot-test-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const output = join(parent, 'output');
  const snapshot = fixture();
  const result = await importOfficialSnapshot(snapshot, output, now);
  const read = async path => JSON.parse(await readFile(join(output, path), 'utf8'));
  const weekly = await read('weekly.json');
  const guest = await read('qvc-fukushima.json');
  assert.equal(result.dailyCount, 8);
  assert.equal(result.programmeCount, 1);
  assert.equal(weekly.startDate, snapshot.days[0].date);
  for (const feed of [weekly, guest, ...weekly.days]) {
    assert.equal(feed.retrievedUtc, capturedUtc);
    assert.equal(feed.expiresUtc, new Date(captured + MAX_AGE_MS).toISOString());
  }
  for (const day of weekly.days) assert.deepEqual(await read('daily/' + day.date + '.json'), day);
  assert.deepEqual(await readdir(output), ['.nojekyll', 'daily', 'index.html', 'qvc-fukushima.json', 'weekly.json']);
});

test('invalid input or an existing populated target leaves prior output intact', async t => {
  const parent = await mkdtemp(join(tmpdir(), 'qvc-snapshot-test-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const output = join(parent, 'draft');
  const bad = fixture();
  await assert.rejects(importOfficialSnapshot(bad, output, captured - 1), /capture timestamp/);
  await assert.rejects(importOfficialSnapshot(bad, output, Date.parse('2026-11-20T15:00:00Z')), /starting today/);
  const last = bad.days.pop();
  await assert.rejects(importOfficialSnapshot(bad, output, now), /all eight days/);
  bad.days.push(last);
  bad.days[0].source = 'https://example.com/';
  await assert.rejects(importOfficialSnapshot(bad, output, now), /official source/);
  bad.days[0].source = dailySource(bad.days[0].date);
  const originalEnd = bad.days[0].programmes[0].end;
  bad.days[0].programmes[0].end = '2026-11-20T01:00:00+09:00';
  await assert.rejects(importOfficialSnapshot(bad, output, now), /full day/);
  bad.days[0].programmes[0].end = originalEnd;
  bad.guest.records = [];
  await assert.rejects(importOfficialSnapshot(bad, output, now), /No verified/);
  assert.deepEqual(await readdir(parent), []);

  await importOfficialSnapshot(fixture(), output, now);
  await writeFile(join(output, 'preserve.txt'), 'prior output');
  await assert.rejects(importOfficialSnapshot(fixture(), output, now));
  assert.equal(await readFile(join(output, 'preserve.txt'), 'utf8'), 'prior output');
  assert.deepEqual(await readdir(parent), ['draft']);
});
