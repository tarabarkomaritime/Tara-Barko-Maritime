/* tools/stamp.js — put the build's fingerprint on every asset URL.
 *
 * This exists because "hard-refresh and try again" stopped being an acceptable
 * answer. A browser holding yesterday's app.js against today's database is not
 * a cosmetic problem: it signs people out, refuses saves, and reports faults
 * that were fixed hours ago — and every one of those costs somebody a round
 * trip to find out the code was simply old.
 *
 * Revalidation headers are advice. A URL is not. Stamping each script and
 * stylesheet with the commit it came from means a new deploy is a new address,
 * and there is no version of "stale" left for the browser to serve.
 *
 *   node tools/stamp.js          → stamps with the current git commit
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html', 'register.html'];

/* The fingerprint is of the assets themselves, not of the commit.
 *
 * A commit hash would be one behind: this runs before the commit that ships it,
 * so the page would carry the previous build's name. Hashing what is actually
 * being served means the version changes exactly when the code changes, and
 * stays put when it does not — so a deploy that touched only a migration does
 * not force every browser in the office to download everything again. */
const crypto = require('crypto');
const stamp = (() => {
  const files = fs.readdirSync(path.join(ROOT, 'assets')).sort()
    .filter(f => /\.(js|css)$/.test(f));
  const h = crypto.createHash('sha256');
  files.forEach(f => h.update(fs.readFileSync(path.join(ROOT, 'assets', f))));
  return h.digest('hex').slice(0, 8);
})();

let touched = 0;
for(const page of PAGES){
  const file = path.join(ROOT, page);
  if(!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');

  /* Only our own files. A CDN URL is not ours to rewrite, and there are none
     here today, but there is no reason for this to be the thing that breaks if
     one ever appears. */
  const after = before.replace(
    /(<(?:script|link)[^>]*\b(?:src|href)=")(assets\/[^"?]+)(?:\?v=[^"]*)?(")/g,
    (_, head, url, tail) => `${head}${url}?v=${stamp}${tail}`);

  if(after !== before){ fs.writeFileSync(file, after); touched++; }
}

console.log(`stamped ${touched} page(s) with ${stamp}`);
