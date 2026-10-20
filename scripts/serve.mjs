import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/src/core.mjs', ['src/core.mjs', 'text/javascript']],
  ['/src/app.mjs', ['src/app.mjs', 'text/javascript']]
]);
createServer(async (request, response) => {
  const entry = files.get(new URL(request.url, 'http://localhost').pathname);
  if (!entry) { response.writeHead(404); response.end('Not found'); return; }
  try { response.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(await readFile(entry[0])); }
  catch { response.writeHead(500); response.end('Preview file unavailable'); }
}).listen(4180, '127.0.0.1', () => console.log('Envpair preview: http://127.0.0.1:4180'));
