import { dailyDates, parseDailyHtml } from './daily.mjs';
import { SOURCE_URL } from './feed.mjs';

const date = dailyDates()[0];
const targets = {
  programmeGuide: 'https://qvc.jp/content/programguide.html',
  nextQ: 'https://qvc.jp/information/bookviewer.html',
  guest: SOURCE_URL
};
for (const [name, url] of Object.entries(targets)) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(25_000),
      headers: { Accept: 'text/html' } });
    let html = '';
    const decoder = new TextDecoder();
    const limit = response.ok ? 2_000_000 : 8192;
    let size = 0;
    for await (const bytes of response.body ?? []) {
      const prefix = bytes.subarray(0, limit - size);
      size += prefix.length;
      html += decoder.decode(prefix, { stream: true });
      if (size >= limit) break;
    }
    html += decoder.decode();
    const outcome = { name, status: response.status,
      mime: response.headers.get('content-type')?.split(';')[0], inspectedBytes: size,
      accessDenied: /access denied|request (?:rejected|blocked)|you do not have permission to access|アクセスが拒否/i.test(html),
      verification: /verify (?:that )?you are human|captcha-delivery|challenge-platform|verify you are not a robot/i.test(html) };
    if (response.ok && name === 'programmeGuide') {
      try { outcome.validatedRows = parseDailyHtml(html, date).length; }
      catch (error) { outcome.validation = error.message; }
    }
    if (response.ok && name === 'nextQ') {
      outcome.viewerMarkup = /scene7|catalogviewer|bookviewer/.test(html.toLowerCase());
    }
    if (response.ok && name === 'guest') {
      outcome.appearanceContainerInHtml = /id=["']program_information["']/i.test(html);
    }
    console.log(JSON.stringify(outcome));
    if (outcome.accessDenied || outcome.verification) break;
  } catch (error) {
    console.log(JSON.stringify({ name, failure: error.name, code: error.cause?.code }));
  }
}

const viewerUrl = 'https://qvc.jp/files/information/bookviewer/202611/index.html';
const viewer = await fetch(viewerUrl, { signal: AbortSignal.timeout(25_000) });
console.log(JSON.stringify({ name: 'monthlyIssue', status: viewer.status,
  mime: viewer.headers.get('content-type')?.split(';')[0] }));
if (viewer.ok) {
  const markup = await viewer.text();
  const references = [...markup.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
    .map(match => new URL(match[1], viewerUrl)).filter(url => url.origin === 'https://qvc.jp')
    .map(url => url.pathname).filter(path => /\.(?:js|json|pdf|xml)$/i.test(path));
  const linkedPdf = [...markup.matchAll(/[\w./-]+\.pdf\b/gi)].map(match => match[0]).slice(0, 8);
  console.log(JSON.stringify({ name: 'monthlyIssueMarkup', references: [...new Set(references)].slice(0, 24), linkedPdf }));
}
const guestPage = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(25_000) });
if (guestPage.ok) {
  const markup = await guestPage.text();
  const scriptUrls = [...markup.matchAll(/https?:\/\/cdn-(?:edge|blocks)\.karte\.io\/[a-z0-9/_-]+\/(?:edge|builder)\.js/gi)]
    .map(match => match[0]);
  for (const url of [...new Set(scriptUrls)].slice(0, 4)) {
    const script = await fetch(url, { signal: AbortSignal.timeout(25_000), redirect: 'manual' });
    const contentType = script.headers.get('content-type')?.split(';')[0];
    console.log(JSON.stringify({ name: 'guestDependency', host: new URL(url).hostname,
      status: script.status, contentType }));
    await script.body?.cancel();
  }
}
