
const issue = new URL('https://qvc.jp/files/information/bookviewer/202611/index.html');
const settings = await (await fetch(new URL('data/book.txt', issue), {signal:AbortSignal.timeout(20000)})).json();
const relevant = object => Object.fromEntries(Object.entries(object).filter(([k]) => /text|txt|search|copy/i.test(k)));
console.log(JSON.stringify({name:'settings', fields:relevant(settings), optionText:relevant(settings.options ?? {})}));
for (const file of ['data/highlight/0022.txt','data/txtcopy/0022.txt']) {
  const response = await fetch(new URL(file, issue), { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    console.log(JSON.stringify({file,status:response.status}));
    continue;
  }
  const data = await response.json();
  const rows = Array.isArray(data) ? data : Object.values(data);
  console.log(JSON.stringify({file,status:response.status, entries:rows.length,
    sample:rows.slice(0,3).map(x=>JSON.stringify(x).slice(0,360)),
    relevant:rows.filter(value=>/11月|23日|23\(月\)|アイロボット|00:00|サンルミエ/i.test(JSON.stringify(value))).slice(0,6).map(x=>JSON.stringify(x).slice(0,360))}));
}
