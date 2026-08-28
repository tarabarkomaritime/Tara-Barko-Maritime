/* tools/serve.js — run the system on this laptop.
 *
 * The site is plain files, so it is tempting to open index.html by
 * double-clicking it. That does not work: a page opened from the filesystem has
 * no origin, and a request with no origin is one Supabase refuses. It has to be
 * served over http, which is the whole of what this does.
 *
 * No dependency, nothing to install, and no cache headers — an edit shows up on
 * the next refresh rather than three refreshes later, which is the only thing
 * more annoying than a bug.
 *
 *   node tools/serve.js          → http://localhost:4173
 *   node tools/serve.js 8080     → a different port, if that one is busy
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2]) || 4173;

const TYPES = {
  '.html':'text/html; charset=utf-8',
  '.js':  'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2':'font/woff2',
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if(rel === '/') rel = '/index.html';

  /* Nothing above the project folder is servable, whatever the URL asks for. */
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if(!file.startsWith(ROOT)){ res.writeHead(403).end('No.'); return; }

  fs.readFile(file, (err, body) => {
    if(err){
      res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
      res.end('Not found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      /* Edits show on the next refresh, not eventually. */
      'Cache-Control': 'no-store',
    });
    res.end(body);
  });
}).listen(PORT, () => {
  console.log('');
  console.log('  Tara Barko Maritime is running on this laptop.');
  console.log('');
  console.log('    Staff system   http://localhost:' + PORT + '/');
  console.log('    Registration   http://localhost:' + PORT + '/register.html');
  console.log('');
  console.log('  This uses the SAME Supabase as the live site. Anything you save');
  console.log('  here is saved for the whole office, exactly as if you were on');
  console.log('  tarabarkomaritime.online. It is the same records, not a copy.');
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
