
const issue = new URL('https://qvc.jp/files/information/bookviewer/202611/index.html');
const read = async file => {
  const response = await fetch(new URL(file, issue), {signal:AbortSignal.timeout(25000)});
  if (!response.ok) throw new Error(file + ' HTTP ' + response.status);
  return response.text();
};
const viewer = await read('js/viewer.min.js');
const refs = [...viewer.matchAll(/.{0,100}(?:txtsearch\.txt|data\/text|\/\.txt|page_txt|\+"\.txt").{0,110}/gi)].map(m => m[0]).slice(0,18);
const text = await read('data/txtsearch.txt');
const markers = ['11月20日', '11月23日', '福島豊', 'インベルナーレ', 'HIROKO'];
console.log(JSON.stringify({ name:'bookText', chars:text.length,
  lineCount:text.split(/\r?\n/).length, objectParts:text.split(/\f/).length,
  found:Object.fromEntries(markers.map(s=>[s,text.indexOf(s)])), refs }));
