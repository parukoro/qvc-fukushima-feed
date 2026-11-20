
const base = new URL('https://qvc.jp/files/information/bookviewer/202611/index.html');
for (const page of [20,21,22,23]) {
  const file='data/highlight/'+String(page).padStart(4,'0')+'.txt';
  const response=await fetch(new URL(file,base),{signal:AbortSignal.timeout(20000)});
  if (!response.ok) {console.log(JSON.stringify({page,status:response.status}));continue;}
  const chars=(await response.json()).map(c=>({...c,x:Number(c.x),y:Number(c.y),w:Number(c.width),h:Number(c.height)}));
  const groups=new Map();
  for(const c of chars){
    const y=Math.round(c.y*2)/2;
    if(!groups.has(y)) groups.set(y,[]);
    groups.get(y).push(c);
  }
  const line = (arr)=>arr.sort((a,b)=>a.x-b.x).map(c=>[c.x.toFixed(1),c.text]).slice(0,30);
  const labels = [...groups.entries()].map(([y,a])=>[y,a.filter(c=>c.x<35).sort((a,b)=>a.x-b.x).map(c=>c.text).join('')]).filter(([,s])=>s.trim());
  console.log(JSON.stringify({page, n:chars.length, yMax:Math.max(...chars.map(c=>c.y)), xMax:Math.max(...chars.map(c=>c.x)), headers:[...groups.entries()].filter(([y])=>y>20&&y<58).sort((a,b)=>a[0]-b[0]).slice(0,15).map(([y,a])=>[y,line(a)]), labels:labels.slice(0,38).sort((a,b)=>a[0]-b[0])}));
}
