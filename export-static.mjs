import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSavedFeed, responseFor } from './feed.mjs';
import { fetchDailyGuides, makeWeeklyFeed, validateWeeklyFeed } from './daily.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const displayJst = value => new Date(Date.parse(value) + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ') + ' JST（日本時間）';

export function renderStatus(feed) {
  const rows = feed.programmes.map(row => `<li><time>${escapeHtml(row.start.slice(0,16).replace('T',' '))} JST</time> ${escapeHtml(row.title)}</li>`).join('\n');
  return `<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>福島豊さんの公式出演予定・取得状態</title>
<style>body{font:16px/1.7 system-ui,sans-serif;max-width:850px;margin:40px auto;padding:0 20px;color:#17242b;background:#f7f9fa}time{font-weight:600}li{padding:10px 0}a{color:#005e83}.stale{color:#9d260c}</style>
<h1>福島豊さんの出演予定</h1>
<p>QVC公式ページに掲載された予定の個人用ミラーです。QVCとは関係のない非公式の表示で、予定は変更される場合があります。</p>
<p id="freshness" data-expiry="${escapeHtml(feed.expiresUtc)}">取得成功 / 自動更新予定は約30分ごと</p>
<p>取得: <time datetime="${escapeHtml(feed.retrievedUtc)}">${escapeHtml(displayJst(feed.retrievedUtc))}</time><br>有効期限: <time datetime="${escapeHtml(feed.expiresUtc)}">${escapeHtml(displayJst(feed.expiresUtc))}</time></p>
<p><a href="${escapeHtml(feed.source)}">QVC公式の最新情報</a> / <a href="qvc-fukushima.json">VRChat用JSON</a></p>
<ul>${rows}</ul>
<p>GitHubの実行遅延や取得失敗で更新が遅れることがあります。期限切れの予定を最新情報として利用しないでください。</p>
<script>const e=document.getElementById('freshness');function showAge(){if(Date.now()>=Date.parse(e.dataset.expiry)){e.textContent='情報期限切れ：公式ページで最新予定を確認してください';e.className='stale';}}showAge();setInterval(showAge,30000);</script>
</html>\n`;
}

export async function exportStatic({ outputDir = join(HERE, 'public'), scrape, clock = Date.now, includeDaily = false, scrapeDaily = fetchDailyGuides } = {}) {
  const acquire = scrape ?? (async () => { const { scrapeOfficialGuest } = await import('./scraper.mjs'); return scrapeOfficialGuest({browserMode:process.env.QVC_FEED_BROWSER_MODE??'headless'}); });
  // Collect the small sequential HTTP guides before launching Chromium, so a
  // guide error does not replace the existing successful guest deployment.
  const daily = includeDaily ? await scrapeDaily({clock}) : [];
  const feed = await acquire();
  const now = clock();
  const weekly=includeDaily ? makeWeeklyFeed(daily,now) : null;
  if (weekly && !validateWeeklyFeed(weekly,now)) throw new Error('Refusing invalid weekly guide');
  // Static hosting cannot change HTTP200 into 503 after expiry. Clients MUST
  // validate expiresUtc themselves. Failed refreshes leave the old deployment.
  if (!validateSavedFeed(feed) || responseFor(feed, now).body.status !== 'fresh' || now - Date.parse(feed.retrievedUtc) > 120_000) {
    throw new Error('Refusing to export stale, expired, or invalid official data');
  }
  const json = JSON.stringify(feed, null, 2) + '\n';
  const html = renderStatus(feed);
  await mkdir(outputDir, { recursive: true });
  if (includeDaily) {
    await mkdir(join(outputDir,'daily'),{recursive:true});
    for (const item of daily) {
      const target = join(outputDir,'daily',item.date+'.json');
      await writeFile(target+'.tmp',JSON.stringify(item,null,2)+'\n','utf8');
      await rename(target+'.tmp',target);
    }
    await writeFile(join(outputDir,'weekly.json.tmp'),JSON.stringify(weekly,null,2)+'\n','utf8');
    await rename(join(outputDir,'weekly.json.tmp'),join(outputDir,'weekly.json'));
  }
  // Both files are fully written before either public pathname is replaced.
  // Pages deploys a complete artifact only after this process succeeds.
  await writeFile(join(outputDir, 'qvc-fukushima.json.tmp'), json, 'utf8');
  await writeFile(join(outputDir, 'index.html.tmp'), html, 'utf8');
  await rename(join(outputDir, 'qvc-fukushima.json.tmp'), join(outputDir, 'qvc-fukushima.json'));
  await rename(join(outputDir, 'index.html.tmp'), join(outputDir, 'index.html'));
  await writeFile(join(outputDir, '.nojekyll'), '', 'utf8');
  return { programmeCount: feed.programmes.length, dailyCount: daily.length, retrievedUtc: feed.retrievedUtc, expiresUtc: feed.expiresUtc };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exportStatic({includeDaily:true}).then(result => { console.log(JSON.stringify(result)); }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
