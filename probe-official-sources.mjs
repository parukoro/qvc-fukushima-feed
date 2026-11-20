
const issue = new URL('https://qvc.jp/files/information/bookviewer/202611/index.html');
for (const file of ['data/book.txt','data/page.txt','data/txtsearch.txt','book.pdf']) {
  const response = await fetch(new URL(file, issue), { redirect: 'manual',
    signal: AbortSignal.timeout(20000), headers: { Range: 'bytes=0-65535' } });
  const mime = response.headers.get('content-type')?.split(';')[0];
  const details = { file, status: response.status, mime, size: response.headers.get('content-length') };
  if (response.ok) {
    const parts = [];
    let size = 0;
    for await (const chunk of response.body ?? []) {
      const prefix = chunk.subarray(0, 65536-size);
      parts.push(prefix);
      size += prefix.length;
      if (size >= 65536) break;
    }
    const bytes = Buffer.concat(parts);
    const text = bytes.toString('utf8').replace(/^\ufeff/, '');
    const cleaned = text.slice(0, 160).replace(/[\r\n\t]/g, ' ');
    Object.assign(details, { pdf: bytes.subarray(0,5).toString() === '%PDF-',
      startsWith: mime?.includes('text') && !/^\s*</.test(text) ? cleaned : undefined,
      titleMatch: /HIROKO KOSHINO|ベストセラー|インベルナーレ/.test(text), appearanceName: /福島\s*豊/.test(text) });
  } else await response.body?.cancel();
  console.log(JSON.stringify(details));
}