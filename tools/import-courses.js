/* tools/import-courses.js — build the public course catalogue from the price matrix.

   The source is the internal PRICE & REBATES MATRIX, which lists the same course
   once per partner training center, each with its own fee, duration and rebate.
   The public catalogue must show neither fees nor rebates nor partner names, so
   this script reduces the matrix to what the public may see:

       Course Title  ·  Duration

   Everything commercial stays out of assets/ entirely.

   Duplicate handling
     exact      same normalised title            -> merged into one entry
     variant    same base course, different mode -> kept separate, reported
     conflict   merged entry with clashing days  -> kept as a range, reported

   Run:  node tools/import-courses.js "<path to csv>"
   Writes assets/courses.js and prints the duplicate report.
*/

const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
const OUT = path.join(__dirname, '..', 'assets', 'courses.js');
if(!SRC){ console.error('usage: node tools/import-courses.js <csv>'); process.exit(1); }

/* ---------- CSV ---------- */
function parseCSV(text){
  const rows = []; let row = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for(let i = 0; i < s.length; i++){
    const c = s[i];
    if(q){
      if(c === '"'){ if(s[i+1] === '"'){ cell += '"'; i++; } else q = false; }
      else cell += c;
    }else if(c === '"') q = true;
    else if(c === ','){ row.push(cell); cell = ''; }
    else if(c === '\n'){ row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if(cell || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

/* ---------- title normalisation ---------- */
const clean = s => String(s || '')
  .replace(/\s+/g, ' ')
  .replace(/\s*-\s*/g, ' - ')
  .replace(/\s*\/\s*/g, '/')
  .trim();

/* The comparison key. Case, punctuation and roman/slash notation vary row to row
   ("II-4 Deck Ratings", "II-4 DECK RATINGS", "II/4"), and those are the same
   course written by different hands. */
const keyOf = s => clean(s)
  .toUpperCase()
  .replace(/[.,'’]/g, '')
  .replace(/[-/]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* ---------- same course, two spellings ----------
   Reviewed by hand from the near-duplicate report. Only pairs that are genuinely
   one course belong here. Deliberately NOT included:
     AB DECK        vs II-5 AB Deck    — a 7-day course vs a 2-day STCW rating assessment
     AB ENGINE      vs III-5 AB Engine — same
     SMAW WITH ASS  vs SMAW ASS        — course with assessment vs assessment alone
     SVI - SIRE…    vs VETTING INSPECTION COURSE — 2 days vs 5 days, different depth
   Each of those is two products, and merging them would hide one. */
/* Matched against keyOf(title), so every spelling of the same thing resolves:
   "II/4", "II-4" and "II - 4" all normalise to the key "II 4". */
const ALIAS = [
  [/^AB DECK COURSE$/,    'AB DECK'],
  [/^AB ENGINE COURSE$/,  'AB ENGINE'],
  [/^GOC GMDSS$/,         'GOC FOR GMDSS'],
  [/^II 4$/,              'II - 4 DECK RATINGS'],
  [/^III 4$/,             'III - 4 ENGINE RATINGS'],
  [/^FOOD & BEVERAGES FNB$/, 'FOOD & BEVERAGES - NCII'],   // same course, two codes
  [/^CSHI PASSENGER SAFETY.*HULL INTEGRITY TRAINING$/,
    'PASSENGER SAFETY, CARGO SAFETY AND HULL INTEGRITY TRAINING'],
];
function unalias(title){
  const k = keyOf(title);
  for(const [re, canonical] of ALIAS) if(re.test(k)) return canonical;
  return clean(title);
}

/* ---------- delivery modes ----------
   "AFF", "AFF - F2F" and "AFF - DISTANCE LEARNING" are one course delivered three
   ways. Listing them as three catalogue rows reads as a data-entry error to a
   seafarer scanning the list, so they collapse to one row carrying its modes. */
const MODES = [
  [/\s*-\s*FACE TO FACE$/i, 'Face to face'],
  [/\s*-\s*F2F$/i,          'Face to face'],
  [/\s*-\s*BLENDED$/i,      'Blended'],
  [/\s*-\s*DISTANCE LEARNING$/i, 'Distance learning'],
  [/\s*W\/\s*ACCOM$/i,      'With accommodation'],
  [/\s*W\/O\s*ACCOM$/i,     'Without accommodation'],
];
function splitMode(title){
  const t = unalias(title);
  for(const [re, label] of MODES){
    if(re.test(t)) return { base:clean(t.replace(re, '')), mode:label };
  }
  return { base:clean(t), mode:'' };
}

/* ---------- duration ---------- */
/* Raw values include "10 DAYS", "5.5 DAYS", "1 DAY", "5 D AYS", "5  DAYS",
   "2 DAYS BLENDED", "1 DAY MODULE", "1-5 DAYS" and blanks. */
function parseDuration(raw){
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if(!s) return { days:null, label:'', note:'', raw:s, bad:true };

  const note = /MODULE/i.test(s) ? 'Module' : /BLENDED/i.test(s) ? 'Blended' : '';

  const range = s.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if(range){
    return { days:Number(range[1]), daysTo:Number(range[2]), label:`${range[1]}–${range[2]} days`,
             note, raw:s, ambiguous:true };
  }
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if(!m) return { days:null, label:'', note, raw:s, bad:true };

  const n = Number(m[1]);
  return { days:n, label:n === 1 ? '1 day' : `${n} days`, note, raw:s };
}

const fmt = (a, b) => {
  if(a == null) return 'Duration to be confirmed';
  if(b == null || b === a) return a === 1 ? '1 day' : `${a} days`;
  return `${a}–${b} days`;
};

/* ---------- build ---------- */
const rows = parseCSV(fs.readFileSync(SRC, 'utf8'));
const header = rows.shift().map(h => h.trim().toUpperCase());
const col = n => header.indexOf(n);
const cTitle = col('COURSE'), cCenter = col('TRAINING CENTER'), cDur = col('DURATION');

const byKey = new Map();
const skipped = [];

rows.forEach((r, i) => {
  const title = clean(r[cTitle]);
  const center = clean(r[cCenter]);
  const dur = parseDuration(r[cDur]);

  /* A row whose course name is just a number is a data-entry slip, not a course. */
  if(!title || /^\d+$/.test(title)){ skipped.push({ line:i + 2, title:r[cTitle], why:'not a course name' }); return; }

  /* Group on the BASE course: aliases resolved, delivery mode stripped. One row
     per course in the catalogue, whatever it was called in the matrix. */
  const { base, mode } = splitMode(title);
  const k = keyOf(base);
  if(!byKey.has(k)){
    byKey.set(k, { key:k, title:base, base, modes:[], spellings:new Set(),
                   sources:[], durations:[] });
  }
  const e = byKey.get(k);
  e.sources.push(center);
  e.spellings.add(title);
  if(mode && !e.modes.includes(mode)) e.modes.push(mode);
  else if(!mode) e.plain = true;      // listed with no mode — i.e. taught in person
  if(dur.days != null) e.durations.push(dur);
  else e.missingDuration = true;
  if(dur.note && !e.note) e.note = dur.note;
  if(dur.ambiguous) e.ambiguous = true;
  /* Keep the longest spelling of the base — "II-4 Deck Ratings" beats "II/4". */
  if(base.length > e.title.length) e.title = base;
});

/* Resolve each merged entry's duration to a single value or a range. */
/* A course listed both plainly and with a delivery mode is taught in person as
   well — the matrix just does not bother writing "face to face" on the default
   row. Without this, BT-PSSR reads as distance-learning-only, which is wrong.
   Accommodation is not a delivery mode, so it does not trigger the inference. */
const DELIVERY = ['Face to face','Blended','Distance learning'];

/* Modes the matrix lists but the office does not actually endorse. Matched
   against the course key, so `^AFF$` hits AFF alone and leaves AFF - R be.
   Each entry is a business decision, not a data fix — give it a reason. */
const MODE_EXCLUDE = [
  { course:/^AFF$/,  mode:'Distance learning' },   // not offered
  { course:/^SCRB$/, mode:'Distance learning' },   // not offered
];

const catalogue = [...byKey.values()].map(e => {
  const lo = e.durations.length ? Math.min(...e.durations.map(d => d.days)) : null;
  const hi = e.durations.length ? Math.max(...e.durations.map(d => d.daysTo ?? d.days)) : null;

  let modes = e.modes.slice();
  MODE_EXCLUDE.forEach(x => {
    if(x.course.test(e.key)) modes = modes.filter(m => m !== x.mode);
  });
  if(e.plain && modes.some(m => DELIVERY.includes(m)) && !modes.includes('Face to face')){
    modes.push('Face to face');
  }

  return {
    key:e.key,
    title:e.title,
    base:e.base,
    modes:modes.sort(),
    spellings:[...e.spellings],
    days:lo,
    daysTo:hi !== lo ? hi : undefined,
    duration:fmt(lo, hi),
    note:e.note || '',
    offers:[...new Set(e.sources)].length,
    _conflict:lo != null && hi != null && lo !== hi,
    _ambiguous:!!e.ambiguous,
    _missing:!!e.missingDuration && !e.durations.length,
  };
}).sort((a,b) => a.title.localeCompare(b.title, 'en', { sensitivity:'base', numeric:true }));

/* ---------- duplicate report ---------- */
const merged = [...byKey.values()].filter(e => e.sources.length > 1)
  .sort((a,b) => b.sources.length - a.sources.length);

/* Courses that absorbed more than one spelling or delivery mode. */
const collapsed = catalogue.filter(c => c.spellings.length > 1);

const conflicts = catalogue.filter(c => c._conflict);
const ambiguous = catalogue.filter(c => c._ambiguous);
const missing   = catalogue.filter(c => c._missing);

/* ---------- near-duplicates ----------
   Titles that survived exact matching but are probably the same course written
   two ways: "AB DECK" / "AB DECK COURSE", "II 4" / "II 4 DECK RATINGS". These are
   NOT merged — a wrong merge silently deletes a course from the catalogue, which
   is far worse than a human spending a minute on a list. */
const NOISE = new Set(['COURSE','TRAINING','THE','AND','OF','FOR','WITH','A','ON','IN']);
const sig = s => keyOf(s).split(' ').filter(w => w && !NOISE.has(w));

/* Two rules only, both deliberately narrow. A loose rule here produces a wall of
   false positives — "AFF" vs "AFF - R" is a course and its refresher, not a
   duplicate — and a report nobody reads is worse than no report. */
const near = [];
for(let i = 0; i < catalogue.length; i++){
  for(let j = i + 1; j < catalogue.length; j++){
    const a = catalogue[i], b = catalogue[j];
    const A = sig(a.title), B = sig(b.title);
    if(!A.length || !B.length) continue;

    /* A — identical once filler words like "COURSE" and "TRAINING" are dropped.
           "AB DECK" vs "AB DECK COURSE". */
    if(A.length === B.length && A.every((w,k) => w === B[k])){
      near.push({ a, b, why:'identical once filler words are dropped' });
      continue;
    }

    /* B — same title, one of them prefixed with its own acronym.
           "CSHI - PASSENGER SAFETY…" vs "PASSENGER SAFETY…". */
    const [shortT, longT] = A.length < B.length ? [A,B] : [B,A];
    const extra = longT.length - shortT.length;
    if(extra >= 1 && extra <= 2){
      const tail = longT.slice(extra);
      const prefix = longT.slice(0, extra);
      if(tail.every((w,k) => w === shortT[k]) && prefix.every(w => w.length <= 6)){
        near.push({ a, b, why:`same title, one prefixed with "${prefix.join(' ')}"` });
      }
    }
  }
}

const line = '─'.repeat(74);
console.log(`\n${line}\nCOURSE CATALOGUE IMPORT\n${line}`);
console.log(`source rows            ${rows.length}`);
console.log(`skipped                ${skipped.length}`);
console.log(`unique courses         ${catalogue.length}`);
console.log(`exact duplicates       ${merged.length} title(s) appeared more than once`);
console.log(`  rows collapsed       ${merged.reduce((s,e) => s + e.sources.length - 1, 0)}`);
console.log(`near-duplicates        ${near.length} pair(s) flagged for review`);

console.log(`\n${line}\nEXACT DUPLICATES — merged into one catalogue entry\n${line}`);
merged.slice(0, 30).forEach(e => {
  console.log(`  ${String(e.sources.length).padStart(2)}×  ${e.title}`);
});
if(merged.length > 30) console.log(`  … and ${merged.length - 30} more`);

console.log(`\n${line}\nCOLLAPSED — several spellings or delivery modes, now one catalogue row\n${line}`);
collapsed.forEach(c => {
  console.log(`  ${c.title}  — ${c.duration}${c.modes.length ? '   [' + c.modes.join(', ') + ']' : ''}`);
  c.spellings.forEach(s => { if(s !== c.title) console.log(`     was also: ${s}`); });
});
if(!collapsed.length) console.log('  none');

console.log(`\n${line}\nNEAR-DUPLICATES — probably the same course, NOT merged automatically\n${line}`);
if(near.length){
  console.log('  Review these by hand. Merging is a one-line edit in the source matrix;');
  console.log('  an automatic merge that guesses wrong deletes a course silently.\n');
  near.forEach(({a,b,why}) => {
    console.log(`  "${a.title}"  (${a.duration})`);
    console.log(`  "${b.title}"  (${b.duration})`);
    console.log(`     -> ${why}\n`);
  });
}else console.log('  none');

console.log(`${line}\nDURATION CONFLICTS — centers disagree, shown as a range\n${line}`);
conflicts.forEach(c => console.log(`  ${c.duration.padEnd(14)} ${c.title}`));
if(!conflicts.length) console.log('  none');

if(ambiguous.length){
  console.log(`\n${line}\nAMBIGUOUS SOURCE VALUES — check these by hand\n${line}`);
  ambiguous.forEach(c => console.log(`  ${c.title} — parsed as ${c.duration}`));
}
if(missing.length){
  console.log(`\n${line}\nNO DURATION IN SOURCE\n${line}`);
  missing.forEach(c => console.log(`  ${c.title}`));
}
if(skipped.length){
  console.log(`\n${line}\nSKIPPED ROWS\n${line}`);
  skipped.forEach(s => console.log(`  line ${s.line}: "${s.title}" — ${s.why}`));
}

/* ---------- emit ---------- */
/* Titles ship upper-cased. The matrix mixes cases for the same kind of entry
   ("CCMD - Crowd and Crisis Management for Domestic" beside "BTR - BASIC
   TRAINING REFRESHER"), and a catalogue that switches case down the column reads
   as sloppy. Doing it here rather than in CSS keeps the internal system, the
   acknowledgement slip and the public list identical. */
const publicRows = catalogue.map(c => ({
  code:c.key.split(' ')[0].slice(0,10),
  title:c.title.toUpperCase(),
  days:c.days,
  daysTo:c.daysTo,
  duration:c.duration,
  note:c.note || undefined,
  modes:c.modes.length ? c.modes : undefined,
}));

const js = `/* assets/courses.js — GENERATED FILE, DO NOT EDIT BY HAND.

   Built from the internal PRICE & REBATES MATRIX by tools/import-courses.js.
   Regenerate with:

       node tools/import-courses.js "<path to the matrix csv>"

   Deliberately carries no fees, no rebates and no partner training center names.
   Those are commercial terms between Tara Barko and its partners; the public
   catalogue shows a course title and how long it takes, and nothing else.

   ${catalogue.length} unique courses, reduced from ${rows.length} matrix rows.
   Generated from: ${path.basename(SRC)}
*/

const COURSE_CATALOGUE = ${JSON.stringify(publicRows, null, 2)
    .replace(/\n/g, '\n')};

if(typeof module !== 'undefined') module.exports = { COURSE_CATALOGUE };
`;

fs.writeFileSync(OUT, js, 'utf8');
console.log(`\n${line}`);
console.log(`wrote ${path.relative(path.join(__dirname,'..'), OUT)} — ${catalogue.length} courses, no commercial data`);
console.log(`${line}\n`);
