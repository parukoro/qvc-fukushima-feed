
import { dailyDates } from './daily.mjs';

const INDEX = 'https://qvc.jp/information/bookviewer.html';
const LIMIT = 4_000_000;
const expected = [0, 1, 2, ...Array.from({length:17}, (_,i)=>i+7)];

async function get(url, fetchImpl) {
  const response = await fetchImpl(url, {redirect:'error',signal:AbortSignal.timeout(25_000)});
  if (!response.ok) throw new Error(`NextQ HTTP ${response.status} at ${new URL(url).pathname}`);
  const parts = [];
  let length = 0;
  for await (const part of response.body ?? []) {
    length += part.length;
    if (length > LIMIT) throw new Error('NextQ document exceeded size limit');
    parts.push(part);
  }
  return Buffer.concat(parts).toString('utf8');
}

const linesOf = glyphs => {
  const lines = new Map();
  for (const glyph of glyphs) {
    const band = Math.round(glyph.y * 2) / 2;
    if (!lines.has(band)) lines.set(band, []);
    lines.get(band).push(glyph);
  }
  return [...lines.entries()].sort(([a],[b])=>a-b).map(([y, row])=>[y,row.sort((a,b)=>a.x-b.x)]);
};
const lineText = row => row.map(g=>g.text).join('').trim();

export function parseSchedulePage(raw, month) {
  if (!Array.isArray(raw) || raw.length > 10_000) throw new Error('Invalid NextQ page');
  const glyphs = raw.map(g=>({ x:Number(g.x), y:Number(g.y), h:Number(g.height), w:Number(g.width), text:g.text }))
    .filter(g=>g.x>=0&&g.x<=450&&g.y>=0&&g.y<=610&&g.h>0&&g.w>=0&&typeof g.text==='string');
  const clock = new Map(linesOf(glyphs.filter(g=>g.x<36&&g.y>65&&g.y<580&&g.h>=8&&g.h<=10&&/^\d$/.test(g.text)))
    .map(([y,row])=>[Number(lineText(row)),{y,x:row[0].x}]));
  if (!expected.concat(6).every(hour=>clock.has(hour))) throw new Error('NextQ time scale does not match the published grid');
  const step = (clock.get(23).y-clock.get(7).y)/16;
  if (step<22||step>25||expected.slice(3).some(h=>Math.abs(clock.get(h).y-clock.get(7).y-(h-7)*step)>1)) {
    throw new Error('Unsupported NextQ schedule row spacing');
  }
  const left = clock.get(1).x+12;
  const width = 94.5;
  const columns = Array.from({length:4},(_,i)=>glyphs.filter(g=>g.x>=left+i*width&&g.x<left+(i+1)*width));
  const headings = columns.map(col=>lineText(col.filter(g=>g.y>=47&&g.y<=52&&g.h>=20&&/^\d$/.test(g.text)).sort((a,b)=>a.x-b.x)));
  const days = headings.flatMap((heading,index)=>/^\d{1,2}$/.test(heading)?[{date:Number(heading),index}]:[]);
  if (days.length<1 || !days.every(({date,index},i)=>date>=1&&date<=31&&
      (i===0||(date===days[i-1].date+1&&index===days[i-1].index+1)))) {
    throw new Error('Cannot confirm consecutive NextQ dates: '+JSON.stringify(headings));
  }

  const starts = expected.map(hour=>hour===0 ? 61 : hour===2 ? clock.get(1).y+10 : clock.get(hour).y-step*0.61);
  return days.map(({date:day,index})=>{
    const glyphs = columns[index];
    const date = month+String(day).padStart(2,'0');
    const iso = date.replace(/^(....)(..)(..)$/, '$1-$2-$3');
    if (new Date(iso).toISOString().slice(0,10)!==iso) throw new Error('Invalid NextQ date');
    const rows = starts.map((start,i)=>{
      const endY = starts[i+1] ?? clock.get(23).y+13;
      // Text at the programme title scale excludes smaller printed offer notes.
      const title = linesOf(glyphs.filter(g=>g.y>=start&&g.y<endY&&g.h>=6.6&&g.h<=8))
        .map(([,row])=>lineText(row)).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
      if (title.length<2) throw new Error(`Missing NextQ programme cell ${date} ${expected[i]}:00`);
      return { startHour:expected[i],endHour:expected[i+1] ?? 24,printedTitle:title };
    });
    return {date,rows};
  });
}

export async function checkNextQ({fetchImpl=fetch,now=Date.now()}={}) {
  const needed = dailyDates(now);
  const index = await get(INDEX,fetchImpl);
  const issues = new Map([...index.matchAll(/(?:https:\/\/qvc\.jp)?(\/files\/information\/bookviewer\/(20\d{2}(?:0[1-9]|1[0-2]))\/index\.html)\b/g)]
    .map(([,path,month])=>[month,new URL(path,INDEX)]));
  const days = new Map();
  const problems = [];
  for (const month of new Set(needed.map(date=>date.slice(0,6)))) {
    const issue = issues.get(month);
    if (!issue) { problems.push(`No linked NextQ issue for ${month}`); continue; }
    const indexText = await get(new URL('data/txtsearch.txt',issue),fetchImpl);
    const candidates = indexText.split(/\r?\n/).map((line,i)=>({line,page:i+1})).filter(({line})=>
      [...line.matchAll(/ワクワク|ドキドキ/g)].length>=4);
    if (candidates.length>12) throw new Error('Too many potential NextQ schedule pages');
    for (const {page} of candidates) {
      const url = new URL('data/highlight/'+String(page).padStart(4,'0')+'.txt',issue);
      try {
        const entries = await get(url,fetchImpl);
        for (const day of parseSchedulePage(JSON.parse(entries),month)) {
          if (!needed.includes(day.date)) continue;
          if (days.has(day.date)) throw new Error(`Duplicate NextQ date ${day.date}`);
          days.set(day.date,{...day,edition:month,page});
        }
      } catch (error) { problems.push(`Page ${page}: ${error.message}`); }
    }
  }
  return { found:needed.filter(date=>days.has(date)).map(date=>days.get(date)),missing:needed.filter(date=>!days.has(date)),problems };
}

const result = await checkNextQ();
console.log(JSON.stringify({ type:'planned-schedule-extraction', missing:result.missing, problems:result.problems,
  days:result.found.map(d=>({date:d.date,page:d.page,slots:d.rows.length,
    sampleHours:d.rows.filter(r=>[0,7,14,20].includes(r.startHour))})) }));
if (result.missing.length) process.exitCode=1;
