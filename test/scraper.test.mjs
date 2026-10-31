import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDomRecords, scrapeOfficialGuest, publicTableRequest, attachPublicNetworkDiagnostics, publicScriptUrl, attachPublicScriptDiagnostics } from '../scraper.mjs';

test('DOM extractor uses actual container and removes hidden date/visible hour spans', () => {
  const removed = [];
  const root = { querySelectorAll(selector) {
    assert.equal(selector, 'a[href*="/content/programguide.qvc."]');
    return [{ href: 'https://qvc.jp/content/programguide.qvc.202611011900.html', cloneNode() {
      return { querySelectorAll(selector) { assert.equal(selector, 'span'); return [{ remove() { removed.push('hidden date'); } }, { remove() { removed.push('visible hour'); } }]; }, get textContent() { assert.equal(removed.length, 2); return ' プロショッパーのお奨め！便利なお掃除グッズ　ハキマックス '; } };
    } }];
  } };
  const previous = globalThis.document;
  globalThis.document = { querySelector(selector) { assert.equal(selector, '#program_information'); return root; } };
  try { assert.deepEqual(collectDomRecords(), [{ href: 'https://qvc.jp/content/programguide.qvc.202611011900.html', title: 'プロショッパーのお奨め！便利なお掃除グッズ　ハキマックス' }]); }
  finally { globalThis.document = previous; }
});

test('scraper waits for delayed correct container and closes isolated browser', async () => {
  let waited = false, closed = false;
  const now = Date.parse('2026-11-01T02:00:00+09:00');
  const browserFactory = { async launch(options) {
    assert.equal(options.headless, true);
    assert.equal(options.channel,'chromium');
    assert.deepEqual(Object.keys(options).sort(),['channel','headless']);
    return { async close() { closed = true; }, async newContext(options) {
      assert.equal(options.timezoneId, 'Asia/Tokyo');
      return { async route() { assert.fail('Normal resources must not be intercepted'); }, async newPage() { return {
        on() {},
        async goto(url) { assert.equal(url, 'https://qvc.jp/information/feature/guest/guestpedia/1320.html'); return { ok: () => true }; },
        url: () => 'https://qvc.jp/information/feature/guest/guestpedia/1320.html',
        async waitForLoadState(state) { assert.equal(state,'load'); },
        getByRole: () => ({ first:()=>({async scrollIntoViewIfNeeded(){}}) }),
        async waitForFunction(fn, arg, options) { assert.match(fn.toString(), /program_information/); assert.equal(options.timeout, 120_000); waited = true; },
        locator: () => ({ allTextContents: async () => ['福島豊さん'] }),
        async evaluate(fn) { assert.equal(waited, true); assert.equal(fn, collectDomRecords); return [{ href: 'https://qvc.jp/content/programguide.qvc.202611011900.html', title: 'ハキマックス' }]; }
      }; } };
    } };
  } };
  const feed = await scrapeOfficialGuest({ now, browserFactory });
  assert.equal(feed.programmes[0].start, '2026-11-01T19:00:00+09:00');
  assert.equal(closed, true);
});

test('public diagnostics allow only exact table endpoints and safe selector fields', () => {
  const request = {
    url:()=> 'https://action-table.karte.io/collection/getByKey?api_key=PRIVATE_QUERY',
    method:()=> 'POST',
    postData:()=>JSON.stringify({api_key:'PRIVATE_BODY',name:'v2/official_schedule',key:'1320',query_name:'guest',params:{cookie:'PRIVATE_PARAMS'},visitor_id:'PRIVATE_VISITOR'}),
    failure:()=>({errorText:'net::ERR_FAILED'})
  };
  assert.deepEqual(publicTableRequest(request),{endpoint:'/collection/getByKey',method:'POST',name:'v2/official_schedule',key:'1320',query_name:'guest'});
  assert.equal(publicTableRequest({...request,url:()=> 'https://example.com/collection/getByKey'}),null);
  assert.equal(publicTableRequest({...request,url:()=> 'https://action-table.karte.io/unrelated'}),null);
  const handlers={};const network=attachPublicNetworkDiagnostics({on(event,handler){handlers[event]=handler;}});
  handlers.request(request);handlers.response({request:()=>request,status:()=>403});handlers.requestfailed(request);
  assert.equal(network[0].status,403);assert.equal(network[0].failure,'net::ERR_FAILED');
  assert.doesNotMatch(JSON.stringify(network),/PRIVATE|api_key|params|visitor|cookie/);
});

function fakeBrowser(page,close=()=>{}) {
  return {async launch(){return {close,async newContext(){return {async newPage(){return page;}};}};}};
}

test('ordinary headed mode changes only supported headless setting, not identity or security',async()=>{
  const calls=[];
  const browserFactory={async launch(options){calls.push(options);return{async close(){},async newContext(){return{async newPage(){return{
    on(){},async goto(){return{ok:()=>true};},url:()=> 'https://qvc.jp/information/feature/guest/guestpedia/1320.html',
    async waitForLoadState(){},getByRole:()=>({first:()=>({async scrollIntoViewIfNeeded(){}})}),async waitForFunction(){},
    locator:()=>({async allTextContents(){return['福島豊さん'];}}),async evaluate(){return[{href:'https://qvc.jp/content/programguide.qvc.202611011900.html',title:'ハキマックス'}];}
  };}};}};}};
  await scrapeOfficialGuest({now:Date.parse('2026-11-01T02:00:00+09:00'),browserFactory,browserMode:'headed'});
  assert.deepEqual(calls,[{headless:false,channel:'chromium'}]);
});

test('failure log includes only public DOM excerpt and endpoint metadata, and browser closes', async()=>{
  const messages=[];let closed=false;
  const browserFactory=fakeBrowser({
    on(){},async goto(){return{ok:()=>true};},url:()=> 'https://qvc.jp/information/feature/guest/guestpedia/1320.html',
    async waitForLoadState(){},getByRole:()=>({first:()=>({async scrollIntoViewIfNeeded(){}})}),
    async waitForFunction(){const error=new Error('Timeout 120000ms api_key=DO_NOT_LOG cookie=DO_NOT_LOG');error.name='TimeoutError';throw error;},
    async evaluate(){return{pageTitle:'QVCゲスト 福島豊さん',h1:['福島豊さん'],programContainerCount:0,programmeLinkCount:0,programmeText:''};}
  },()=>{closed=true;});
  await assert.rejects(()=>scrapeOfficialGuest({browserFactory,reportDiagnostics:data=>messages.push(data)}),/delayed-programme-container: timeout/);
  assert.equal(closed,true);assert.equal(messages.length,1);assert.equal(messages[0].reason,'timeout');assert.equal(messages[0].programContainerCount,0);
  assert.equal(messages[0].scrolledToHeading,true);assert.doesNotMatch(JSON.stringify(messages),/DO_NOT_LOG|api_key|cookie/);
  assert.equal(messages[0].browserMode,'full-chromium-new-headless');
});

test('default retrieval time is captured after delayed extraction, not navigation start', async()=>{
  const originalNow=Date.now;let clock=Date.parse('2026-11-01T02:00:00+09:00');const finished=clock+180_000;
  Date.now=()=>clock;
  const browserFactory=fakeBrowser({
    on(){},async goto(){return{ok:()=>true};},url:()=> 'https://qvc.jp/information/feature/guest/guestpedia/1320.html',
    async waitForLoadState(){},getByRole:()=>({first:()=>({async scrollIntoViewIfNeeded(){}})}),async waitForFunction(){},
    locator:()=>({async allTextContents(){return['福島豊さん'];}}),
    async evaluate(){clock=finished;return[{href:'https://qvc.jp/content/programguide.qvc.202611011900.html',title:'ハキマックス'}];}
  });
  try{const feed=await scrapeOfficialGuest({browserFactory});assert.equal(Date.parse(feed.retrievedUtc),finished);}finally{Date.now=originalNow;}
});

test('script diagnostics show public script failures without queries, site IDs, or console values',()=>{
  const siteId='a'.repeat(32);
  assert.equal(publicScriptUrl(`https://cdn-edge.karte.io/${siteId}/edge.js?api_key=PRIVATE#token`),'https://cdn-edge.karte.io/[identifier]/edge.js');
  assert.equal(publicScriptUrl('data:text/javascript,PRIVATE'),null);
  assert.equal(publicScriptUrl('https://unknown.example/PRIVATE'),null);
  const handlers={};const d=attachPublicScriptDiagnostics({on(event,fn){handlers[event]=fn;}});
  const request={resourceType:()=> 'script',url:()=>`https://cdn-edge.karte.io/${siteId}/edge.js?api_key=PRIVATE`,failure:()=>({errorText:'net::ERR_FAILED'})};
  handlers.request(request);handlers.response({request:()=>request,status:()=>403});handlers.requestfailed(request);
  handlers.pageerror({name:'ReferenceError',message:'widget is not defined api_key=PRIVATE cookie=PRIVATE'});
  handlers.console({type:()=> 'error',text:()=> 'KARTE api_key=PRIVATE visitor_id=PRIVATE'});
  assert.equal(d.requests[0].status,403);assert.equal(d.requests[0].failure,'net::ERR_FAILED');
  assert.match(d.pageErrors[0].message,/widget is not defined/);
  assert.deepEqual(d.consoleCategories,[{type:'error',category:'karte-message'}]);
  assert.doesNotMatch(JSON.stringify(d),/PRIVATE|api_key|cookie|visitor_id|a{32}/);
});
