/* tools/import-courses.js — builds assets/courses.js from the office price matrix.

   The matrix is the master list: one row per course *at a training center*, with
   the fee that center charges and the rebate it gives back. The same course at
   two centers is two rows at two prices, which is the business — so this script
   does not deduplicate them. It normalises spelling, pulls the delivery out of
   the course name, parses the numbers, and reports everything it could not read
   rather than quietly dropping it.

   Run:  node tools/import-courses.js "<path to the CSV>"
   Then: node tests/smoke.js
*/

const fs = require('fs'), path = require('path');

const SRC = process.argv[2];
if(!SRC){ console.error('usage: node tools/import-courses.js "<matrix.csv>"'); process.exit(1); }
const OUT = path.join(__dirname, '..', 'assets', 'courses.js');

/* ---------- CSV ---------- */
function parseCSV(text){
  const rows = []; let row = [], field = '', quoted = false;
  const s = text.replace(/^﻿/, '');
  for(let i = 0; i < s.length; i++){
    const ch = s[i];
    if(quoted){
      if(ch === '"'){ if(s[i+1] === '"'){ field += '"'; i++; } else quoted = false; }
      else field += ch;
    }else if(ch === '"') quoted = true;
    else if(ch === ','){ row.push(field); field = ''; }
    else if(ch === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else if(ch !== '\r') field += ch;
  }
  if(field || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}

const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/* ---------- delivery ----------
   The matrix writes the delivery into the course name — "AFF - DISTANCE
   LEARNING", "BASIC TRAINING - BLENDED". Blended means part classroom and part
   not, so it becomes both of the deliveries it is made of. */
const DELIVERY_SUFFIX = [
  { re:/\s*[-–]\s*FACE[\s-]*TO[\s-]*FACE$/i,  modes:['Face-to-Face'] },
  { re:/\s*[-–]\s*F2F$/i,                     modes:['Face-to-Face'] },
  { re:/\s*[-–]\s*BLENDED$/i,                 modes:['Face-to-Face','Distance Learning'] },
  { re:/\s*[-–]\s*DISTANCE\s+LEARNING$/i,     modes:['Distance Learning'] },
  { re:/\s+DISTANCE\s+LEARNING$/i,            modes:['Distance Learning'] },
];

/* Boarding, not delivery — kept as an option on the row. */
const ACCOM = [
  { re:/\s*W\/\s*O\s+ACCOM\.?$/i, label:'Without accommodation' },
  { re:/\s*W\/\s*ACCOM\.?$/i,     label:'With accommodation' },
];

/* Spellings of the same thing. Left side is what the matrix writes. */
const TITLE_ALIAS = {
  'GOC/GMDSS':'GOC FOR GMDSS',
  'GOC FOR GMDSS - ASST':'GOC FOR GMDSS',
  'BT PSSR':'BT - PSSR',
  'BTOCT':'BTOC',
  'AB DECK COURSE':'AB DECK',
  'AB ENGINE COURSE':'AB ENGINE',
  'II/4':'II-4 DECK RATINGS',
  'II-4':'II-4 DECK RATINGS',
  'II-4 DECK RATINGS':'II-4 DECK RATINGS',
  'III/4':'III-4 ENGINE RATINGS',
  'III-4':'III-4 ENGINE RATINGS',
  'II/5 - AB DECK':'II-5 AB DECK',
  'II-5 AB DECK':'II-5 AB DECK',
  'III/5 - AB ENGINE':'III-5 AB ENGINE',
  'III-5 AB ENGINE':'III-5 AB ENGINE',
  'ENGINE WATCHKEEPING':'ENGINE WATCH KEEPING',
  'NCI MESSMAN COURSE':'MESSMAN - NCI',
  'MESSMAN - NC1':'MESSMAN - NCI',
  "NCIII SHIP'S COOK":'SHIPS COOK - NCIII',
  'FOOD & BEVERAGES - FNB':'FOOD & BEVERAGES - NCII',
  'BREAD & PASTRY - BPP':'BREAD & PASTRY - NCII',
  'CSHI - PASSENGER SAFETY , CARGO SAFETY, AND HULL INTEGRITY TRAINING':
    'PASSENGER SAFETY, CARGO SAFETY AND HULL INTEGRITY TRAINING',
  'SAFETY - STPPDSPPS - PASSENGER SAFETY':'PASSENGER SAFETY',
};

/* Training centers, tidied. */
const CENTER_ALIAS = { 'GREAT SEAS':'GREAT SEAS', 'UNITED INTERNATIONAL':'UNITED INTERNATIONAL' };

/* The course ID the office uses: the acronym in front of the dash, or a short
   form of the title when there is no acronym. */
function courseId(title){
  const head = title.split(/\s+[-–]\s+/)[0].trim();
  if(/^[A-Z0-9][A-Z0-9/&.\- ]{0,11}$/.test(head) && head.length <= 12) return head.replace(/\s+/g,' ');
  return title.split(/\s+/).slice(0,2).join(' ').slice(0,12).toUpperCase();
}

/* The ID carries the acronym; the title need not repeat it. Kept in step with
   the same function in db.js, which cleans catalogues generated before this. */
function titleWithoutCode(code, title){
  const c = String(code || '').trim(), t = String(title || '').trim();
  if(!c || !t || !t.toUpperCase().startsWith(c.toUpperCase())) return t;
  const sep = t.slice(c.length).match(/^\s*[-–—]\s*/);
  if(!sep) return t;
  const rest = t.slice(c.length + sep[0].length).trim();
  /* "AFF - R" is Advanced Fire Fighting, refresher. Strip the AFF and what is
     left is "R", which names nothing — so a remainder too short to stand on
     its own means the title was never an ID plus a description, and the whole
     name stays. "BT - PSSR" and "COOKERY - NCII" survive the cut; the
     refreshers do not get mangled. */
  return rest.length >= 3 ? rest : t;
}

function parseDays(raw){
  const s = clean(raw).toUpperCase().replace(/D\s+AYS/,'DAYS');
  const m = s.match(/([\d.]+)\s*(?:DAYS?|D)/);
  if(!m) return { days:null, duration:'' };
  const days = parseFloat(m[1]);
  if(!isFinite(days)) return { days:null, duration:'' };
  return { days, duration:`${days} ${days === 1 ? 'day' : 'days'}` };
}

function parseMoney(raw){
  const s = clean(raw).replace(/[₱,]/g,'');
  if(!s) return null;
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/* ---------- read ---------- */
const rows = parseCSV(fs.readFileSync(SRC, 'utf8'));
const header = rows.shift().map(h => clean(h).toUpperCase());
const col = name => header.indexOf(name);
const iCourse = col('COURSE'), iCenter = col('TRAINING CENTER'),
      iFee = col('TRAINING FEE'), iDur = col('DURATION'), iReb = col('REBATES');
if([iCourse,iCenter,iFee].some(i => i < 0)){
  console.error('The matrix needs COURSE, TRAINING CENTER and TRAINING FEE columns.');
  process.exit(1);
}

const out = [], skipped = [], noDuration = [], noFee = [], rebateOverFee = [], oddPrice = [];
const seen = new Map();          // course+center -> first row, to spot true duplicates
const dupes = [];

rows.forEach((r, n) => {
  const line = n + 2;                       // 1-based, plus the header
  let title = clean(r[iCourse]).toUpperCase();
  const center = (CENTER_ALIAS[clean(r[iCenter]).toUpperCase()] || clean(r[iCenter]).toUpperCase());

  if(!title || !center){ skipped.push(`${line}: missing course or center`); return; }
  /* A course name that is only digits is a stray cell, not a course. */
  if(/^\d+$/.test(title)){ skipped.push(`${line}: course name is "${title}" at ${center} — looks like a stray cell`); return; }

  /* delivery out of the name */
  let modes = [];
  DELIVERY_SUFFIX.forEach(d => {
    if(d.re.test(title)){ modes = [...new Set([...modes, ...d.modes])]; title = title.replace(d.re, '').trim(); }
  });

  /* boarding out of the name */
  const options = [];
  ACCOM.forEach(a => { if(a.re.test(title)){ options.push(a.label); title = title.replace(a.re, '').trim(); } });

  title = clean(title).replace(/\s*,\s*/g, ', ');
  /* "BT-PSSR" and "BT - PSSR" are the same course, and two spellings list it
     twice. Space out the acronym dash — but only between letters, so "II-4" and
     "III-5" keep their numbering. */
  title = title.replace(/^([A-Z]{2,8})-(?=[A-Z])/, '$1 - ');
  title = TITLE_ALIAS[title] || title;
  if(!modes.length) modes = ['Face-to-Face'];

  const { days, duration } = parseDays(r[iDur]);
  const fee = parseMoney(r[iFee]);
  const rebate = iReb >= 0 ? parseMoney(r[iReb]) : null;

  if(!duration) noDuration.push(`${line}: ${title} at ${center}`);
  if(fee == null){ noFee.push(`${line}: ${title} at ${center}`); }
  if(fee != null && rebate != null && rebate > fee){
    rebateOverFee.push(`${line}: ${title} at ${center} — fee ${fee}, rebate ${rebate}`);
  }
  if(fee != null && days && fee / days < 150){
    oddPrice.push(`${line}: ${title} at ${center} — ${fee} for ${days} day(s)`);
  }

  const key = `${title}@@${center}@@${modes.join('+')}@@${options.join('+')}`;
  if(seen.has(key)){
    dupes.push(`${line}: ${title} at ${center} — also on line ${seen.get(key)}`);
    return;
  }
  seen.set(key, line);

  out.push({
    code:courseId(title), title:titleWithoutCode(courseId(title), title), center,
    amount:fee == null ? 0 : fee,
    rebate:rebate == null ? 0 : rebate,
    days, duration, modes,
    ...(options.length ? { options } : {}),
  });
});

out.sort((a,b) => a.title.localeCompare(b.title, 'en', { numeric:true }) || a.center.localeCompare(b.center));

/* ---------- write ---------- */
const centers = [...new Set(out.map(r => r.center))].sort();
const body = out.map(r => '  ' + JSON.stringify(r)).join(',\n');
fs.writeFileSync(OUT,
`/* courses.js — GENERATED. Do not edit by hand.

   Built from the office price matrix by tools/import-courses.js. One entry per
   course at a training center: the same course at two centers is two entries at
   two prices, because that is what the office sells.

   Source rows: ${rows.length}    Entries: ${out.length}    Centers: ${centers.length}
   Regenerate:  node tools/import-courses.js "<matrix.csv>"
*/

const COURSE_CATALOGUE = [
${body}
];

if(typeof module !== 'undefined') module.exports = { COURSE_CATALOGUE };
`, 'utf8');

/* ---------- report ---------- */
const report = (label, list) => {
  if(!list.length) return;
  console.log(`\n${label} (${list.length})`);
  list.forEach(x => console.log('  · ' + x));
};
console.log(`\nWrote ${out.length} course entries across ${centers.length} centers to assets/courses.js`);
console.log('Centers: ' + centers.join(', '));
report('Skipped', skipped);
report('Duplicate rows (same course, center and delivery) — kept the first', dupes);
report('No duration in the matrix', noDuration);
report('No fee in the matrix', noFee);
report('REBATE EXCEEDS THE FEE — check these', rebateOverFee);
report('Unusually low fee for the length — possible typo', oddPrice);
console.log('');
