
const issue = new URL('https://qvc.jp/files/information/bookviewer/202611/index.html');
const mark = await fetch(issue, { signal: AbortSignal.timeout(25000) });
if (!mark.ok) throw new Error('Issue HTTP ' + mark.status);
const html = await mark.text();
const declared = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
  .map(match => new URL(match[1], issue)).filter(url => url.origin === issue.origin && /(?:^|\/)viewer\.min\.js$/.test(url.pathname));
for (const url of declared.slice(0, 1)) {
  const resource = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!resource.ok) throw new Error('Viewer HTTP ' + resource.status);
  const body = await resource.text();
  const references = [...body.matchAll(/["']([a-z0-9_./-]{2,100}\.(?:pdf|xml|json|txt|csv))["']/gi)]
    .map(m => m[1]);
  console.log(JSON.stringify({ name: 'documentFormats', declaredPaths: [...new Set(references)].slice(0, 40),
    hasPdfViewer: /pdf.js|pdfjs|application\/pdf/i.test(body),
    hasTextLayer: /textLayer|searchEnabled|searchText/i.test(body) }));
}