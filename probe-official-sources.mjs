
const base = new URL('https://qvc.jp/files/information/bookviewer/202611/index.html');
const response = await fetch(new URL('data/txtsearch.txt',base),{signal:AbortSignal.timeout(20000)});
const text=(await response.text()).split('\n');
console.log(JSON.stringify({name:'candidatePages',data:text.map((line,index)=>[index+1,(line.match(/ワクワク/g)||[]).length,(line.match(/ドキドキ/g)||[]).length]).filter(([,w,d])=>w+d>=4)}));
for (const page of [22,23]) {
  const url=new URL('data/highlight/'+String(page).padStart(4,'0')+'.txt',base);
  const chars=(await (await fetch(url,{signal:AbortSignal.timeout(20000)})).json()).map(c=>({...c,x:Number(c.x),y:Number(c.y),w:Number(c.width),h:Number(c.height)}));
  const bands=[[46,53],[58,80],[94,121],[122,151],[164,196],[547,570]];
  const data=bands.map(([lo,hi])=>{const lines=new Map();for(const c of chars.filter(c=>c.y>=lo&&c.y<hi&&c.x<(page===22?130:112))){
    const y=Math.round(c.y*2)/2;if(!lines.has(y))lines.set(y,[]);lines.get(y).push(c);}
    return [...lines].sort(([a],[b])=>a-b).map(([y,cs])=>{
      cs.sort((a,b)=>a.x-b.x);
      return [y,cs.map(c=>c.text).join(''),cs.slice(0,3).map(c=>[c.x,c.h,c.w])];});});
  console.log(JSON.stringify({page,data}));
}
