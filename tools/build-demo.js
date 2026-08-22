/* Builds a single self-contained page from the internal system, for sharing a
   working prototype with people who cannot run a server.

   Two things are deliberately different from the real build:

   - No demo records. The course price list survives because the system is
     meaningless without it; the invented trainees, bookings, invoices,
     receipts, vouchers and journal entries do not ship.
   - No access codes. The real ones are stored in clear text, and a shared link
     is exactly the wrong place for them. Sign-in is left open instead, which is
     honest about what a demo is rather than pretending to a security it has
     never had.

   Run:  node tools/build-demo.js [outfile]
*/
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
/* Line endings are normalised on the way in. Git rewrites them on checkout, and
   every marker below is written with newlines — a CRLF working copy would fail
   the build for no reason a reader could see. */
const lf = s => s.split('\r\n').join('\n');
const read = f => lf(fs.readFileSync(path.join(ASSETS, f), 'utf8'));
const out = process.argv[2] || path.join(ROOT, 'tara-barko-demo.html');

const problems = [];
const must = (cond, what) => { if(!cond) problems.push(what); return cond; };

/* ---------- the data layer, with the demo records and codes taken out ---------- */
let db = read('db.js');

/* seed() builds the price list first and the invented office second. Stopping
   between the two keeps the catalogue and drops the story. */
const CUT = 'data.seq.course = data.courses.length;';
must(db.includes(CUT), 'the seed cut point');
db = db.replace(CUT, CUT + `
    /* build-demo.js: the seeded office stops here. Courses only. */
    return;`);

/* Nothing calls exportJSON in this build, but leaving the download machinery in
   the file means shipping code that cannot run where the page is going. */
const EXPORT = `function exportJSON(){
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = \`TBM-backup-\${today()}.json\`;
    a.click();
    URL.revokeObjectURL(a.href);
  }`;
must(db.includes(EXPORT), 'the exportJSON body');
db = db.replace(EXPORT, `function exportJSON(){
    /* build-demo.js: a shared page cannot hand the viewer a file. */
  }`);

/* Blank every access code. The login compares against the selected user's code,
   so an empty code means pressing Sign in is enough. Scoped to the user rows —
   `code` is also what a ledger account and a course are keyed on. */
const USER_CODE = /(id:'u\d+',[^}]*?)code:'[^']*'/g;
const codes = db.match(USER_CODE) || [];
must(codes.length === 3, `three access codes (found ${codes.length})`);
db = db.replace(USER_CODE, "$1code:''");

/* ---------- the page ---------- */
let html = lf(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const logo = 'data:image/svg+xml;base64,'
  + Buffer.from(read('logo.svg'), 'utf8').toString('base64');

/* Everything the page pulls in becomes part of it. Order is the order the two
   HTML entry points load them in: the catalogue before db.js seeds from it. */
const SCRIPTS = ['courses.js','db.js','ui.js','accounting.js','applications.js','app.js'];

/* The viewer's sandbox blocks a page from starting its own download, so Backup
   cannot work here. The buttons stay — app.js wires the toolbar one
   unconditionally and deleting it stops the page booting — but they say why
   instead of failing silently. There are two of them: the toolbar and Settings
   → Data. Restore is untouched: that is an upload, and it works. */
let app = read('app.js');
const BACKUP = /DB\.exportJSON\(\); UI\.toast\('Backup downloaded\.'\);/g;
const hits = app.match(BACKUP) || [];
must(hits.length === 2, `two backup handlers (found ${hits.length})`);
app = app.replace(BACKUP, "UI.toast('Downloads are blocked in a shared demo — "
  + "run the system itself to take a backup.', 'bad');");
must(!app.includes('DB.exportJSON()'), 'no way left to start a download');

const source = f => f === 'db.js' ? db : f === 'app.js' ? app : read(f);

const body = html
  .replace(/^[\s\S]*?<body>/, '')
  .replace(/<\/body>[\s\S]*$/, '')
  .replace(/src="assets\/logo\.svg"/g, `src="${logo}"`)
  /* A demo has no codes to quote. */
  .replace(/<p class="login-hint">Demo codes[\s\S]*?<\/p>/,
    '<p class="login-hint">Pick a user and press <b>Sign in</b> — this demo has no access codes.</p>')
  /* The public registration page is a second file and cannot come along. */
  .replace(/<p class="login-hint" style="border-top[\s\S]*?<\/p>/, '')
  .replace(/<script src="assets\/[^"]+"><\/script>\s*/g, '');

must(!body.includes('assets/'), 'every assets/ reference inlined');
must(!/Demo codes/.test(body), 'the demo-codes hint replaced');

if(problems.length){
  console.error('build-demo could not find: ' + problems.join(', '));
  process.exit(1);
}

const page = `<title>Tara Barko Maritime</title>
<style>
${read('styles.css')}
</style>
${body}
${SCRIPTS.map(f => `<script>\n${source(f)}\n</script>`).join('\n')}
`;

fs.writeFileSync(out, page);
console.log(`${out} — ${(page.length/1024).toFixed(0)} KB, ${SCRIPTS.length} scripts inlined, `
  + 'no demo records, no access codes');
