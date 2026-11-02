import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {dailyDates,dailySource,parseDailyHtml,makeDailyFeed,validateDailyFeed,fetchDailyGuides} from '../daily.mjs';
const NOW=Date.parse('2026-11-02T08:00:00+09:00');
const fixture=date=>`<ul data-channelcode="QVC"><li data-starttime="${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T00:00:00+09:00" data-endtime="${new Date(Date.parse(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T00:00:00Z`)+86400000).toISOString().slice(0,10)}T00:00:00+09:00" data-showname="番組 &amp; 特集"></li></ul>`;
test('daily dates use JST, include today through +7, and validate calendar',()=>{
 assert.deepEqual(dailyDates(Date.parse('2026-12-31T23:30:00Z')).slice(0,2),['20270101','20270102']);
 assert.equal(dailyDates(NOW).length,8);
 assert.throws(()=>dailySource('20260230'));assert.throws(()=>dailySource('../test'));
});
test('QVC channel only, entities and nested lists; ignore script and other channel',()=>{
 const good=fixture('20261102');
 assert.equal(parseDailyHtml(`<script>${good}</script><ul data-channelcode="QVC2">${good.replace('data-channelcode="QVC"','')} </ul>${good}`,'20261102').length,1);
 assert.equal(parseDailyHtml(good,'20261102')[0].title,'番組 & 特集');
 assert.throws(()=>parseDailyHtml(good.replace('data-channelcode="QVC"','data-channelcode="QVC2"'),'20261102'));
 const nested=good.replace('<li data-starttime','<li><ul><li data-starttime').replace('</li></ul>','</li></ul></li></ul>');
 assert.equal(parseDailyHtml(nested,'20261102').length,1);
});
test('reject incomplete, overlapping, duplicate, wrong-day and invalid-time rows',()=>{
 const good=fixture('20261102');
 for(const html of [good.replace('T00:00:00+09:00','T01:00:00+09:00'),good+good,good.replace('2026-11-03T','2026-11-02T'),good.replace('T00:00:00+09:00','T25:00:00+09:00')]) assert.throws(()=>parseDailyHtml(html,'20261102'));
 assert.throws(()=>parseDailyHtml(good,'20261103'));
});
test('daily schema freshness and source validation',()=>{
 const feed=makeDailyFeed(parseDailyHtml(fixture('20261102'),'20261102'),'20261102',NOW);
 assert.equal(validateDailyFeed(feed,NOW),true);
 for(const change of [{schemaVersion:2},{source:'https://example.com'},{channel:'QVC2'},{expiresUtc:new Date(NOW+86400000).toISOString()},{date:'20261103'},{status:'stale'}]) assert.equal(validateDailyFeed({...feed,...change},NOW),false);
 assert.equal(validateDailyFeed(feed,NOW+7200000),false);
});
test('eight sequential official GETs; no redirects or arbitrary URLs and fail closed',async()=>{
 const requests=[];let active=0;
 const fetchImpl=async(url,options)=>{assert.equal(active++,0);requests.push(url);assert.equal(options.redirect,'error');active--;return new Response(fixture(/\.(\d{8})0000/.exec(url)[1]));};
 const feeds=await fetchDailyGuides({fetchImpl,clock:()=>NOW});
 assert.equal(feeds.length,8);assert.deepEqual(requests,dailyDates(NOW).map(dailySource));
 await assert.rejects(()=>fetchDailyGuides({clock:()=>NOW,fetchImpl:async()=>new Response('failure',{status:503})}));
 await assert.rejects(()=>fetchDailyGuides({clock:()=>NOW,fetchImpl:async()=>new Response('no guide')}));
});
test('real saved official HTML contains complete QVC 24-hour schedule',async(t)=>{
 // Public reference fixture lives outside this publishable folder. CI has no
 // fixture, so this check is exercised locally without publishing full HTML.
 let html;try{html=await readFile(new URL('../../QvcResearch/nov01-guide.html',import.meta.url),'utf8');}catch{t.skip('Public reference HTML intentionally not published');return;}
 const rows=parseDailyHtml(html,'20261101');assert.equal(rows.length,20);assert.equal(rows.at(-1).end,'2026-11-02T00:00:00+09:00');
});
