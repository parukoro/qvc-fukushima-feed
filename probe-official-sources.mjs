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
