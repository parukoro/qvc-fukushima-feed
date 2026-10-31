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

const TABLE_ORIGIN = 'https://action-table.karte.io';
const TABLE_PATHS = new Set(['/collection/getByKey','/collection/getByQuery']);

function publicText(value, limit=240) {
  return String(value ?? '').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ')
    .replace(/(?:api[_-]?key|access[_-]?token|authorization|cookie|password)["']?\s*[=:]\s*["']?[^"'\s,;&}]+/gi,'[redacted]')
    .slice(0,limit);
}

// Pick only public table selectors, never log full POST bodies or headers.
export function publicTableRequest(request) {
  let url;
  try { url=new URL(request.url()); } catch { return null; }
  if(url.origin!==TABLE_ORIGIN || !TABLE_PATHS.has(url.pathname)) return null;
  let body={};try{body=JSON.parse(request.postData() ?? '{}');}catch{}
  const result={endpoint:url.pathname,method:publicText(request.method(),10)};
  for(const field of ['name','key','query_name']) {
    if(typeof body?.[field]==='string' || typeof body?.[field]==='number') result[field]=publicText(body[field],160);
  }
  return result;
}

export function attachPublicNetworkDiagnostics(page) {
  const entries=[];
  const requests=new Map();
  page.on('request', request=>{
    const entry=publicTableRequest(request);
    if(entry && entries.length<30){entries.push(entry);requests.set(request,entry);}
  });
  page.on('response', response=>{
    const request=response.request();const entry=requests.get(request);
    if(entry) entry.status=response.status();
  });
  page.on('requestfailed', request=>{
    const entry=requests.get(request);
    if(entry) entry.failure=publicText(request.failure()?.errorText ?? 'request_failed',100);
  });
  return entries;
}

export async function publicPageDiagnostics(page) {
  if(!page)return {pageTitle:'Page not created',h1:[],programContainerCount:0,programmeLinkCount:0,programmeText:''};
  return page.evaluate(()=>{
    const roots=Array.from(document.querySelectorAll('#program_information'));
    return {pageTitle:document.title,h1:Array.from(document.querySelectorAll('h1')).slice(0,3).map(h=>h.textContent?.slice(0,160)),programContainerCount:roots.length,programmeLinkCount:roots.reduce((n,r)=>n+r.querySelectorAll('a[href*="/content/programguide.qvc."]').length,0),programmeText:roots.map(r=>(r.innerText??r.textContent??'').slice(0,350)).join(' ').slice(0,350)};
  });
}

export async function scrapeOfficialGuest({ now, browserFactory, reportDiagnostics=data=>console.error('QVC_PUBLIC_DIAGNOSTICS '+JSON.stringify(data)) } = {}) {
  const chromium = browserFactory ?? (await import('playwright')).chromium;
  const browser = await chromium.launch({ headless: true });
  let page,network=[],stage='context',scrolledToHeading=false;
  try {
    const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
    // Allow normal resources: aborting images/fonts can affect onload-driven
    // widgets. No stealth flags, fake user-agent, CAPTCHA solving, or bypass.
    page = await context.newPage();
    network=attachPublicNetworkDiagnostics(page);stage='navigation';
    const response = await page.goto(SOURCE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (!response || !response.ok()) throw new Error('Official guest page HTTP failure');
    if (new URL(page.url()).pathname !== '/information/feature/guest/guestpedia/1320.html') throw new Error('Unexpected guest page redirect');
    stage='ordinary-page-load';
    try{await page.waitForLoadState('load',{timeout:30_000});}catch{}
    stage='appearance-heading';
    // This heading exists in the actual official page's initial markup.
    // Ordinary scrolling may trigger view/lazy widgets; it changes no content.
    try{await page.getByRole('heading',{name:'福島豊さんの出演予定',exact:true}).first().scrollIntoViewIfNeeded({timeout:10_000});scrolledToHeading=true;}catch{}
    stage='delayed-programme-container';
    await page.waitForFunction(() => {
      const root = document.querySelector('#program_information');
      return root && Array.from(root.querySelectorAll('a[href*="/content/programguide.qvc."]')).some(a => /\d{12}\.html/.test(a.href) && a.textContent.trim().length > 3);
    }, undefined, { timeout: 120_000 });
    stage='guest-identity';
    const identity = await page.locator('h1').allTextContents();
    if (!identity.some(text => text.replace(/\s+/g, '').includes('福島豊'))) throw new Error('Official guest identity mismatch');
    const records = await page.evaluate(collectDomRecords);
    stage='validate-programmes';
    // Record acquisition time after delayed scripts have actually populated data.
    return makeFeed(records, now ?? Date.now());
  } catch(error) {
    let dom;try{dom=await publicPageDiagnostics(page);}catch{dom={pageTitle:'Unavailable',h1:[],programContainerCount:0,programmeLinkCount:0,programmeText:''};}
    const diagnostic={stage,scrolledToHeading,pageTitle:publicText(dom.pageTitle,180),h1:(dom.h1??[]).map(text=>publicText(text,160)),programContainerCount:dom.programContainerCount??0,programmeLinkCount:dom.programmeLinkCount??0,programmeText:publicText(dom.programmeText,350),network};
    const reason=error?.name==='TimeoutError'||/timeout/i.test(error?.message??'')?'timeout':'render-or-validation-failure';
    reportDiagnostics({...diagnostic,reason});
    // Do not propagate arbitrary browser error text, which can contain URLs or
    // request details. The stage and allowlisted diagnostics are sufficient.
    throw new Error(`Official guest scrape failed at ${stage}: ${reason}`);
  } finally { await browser.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  scrapeOfficialGuest().then(feed => { console.log(JSON.stringify(feed, null, 2)); }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
