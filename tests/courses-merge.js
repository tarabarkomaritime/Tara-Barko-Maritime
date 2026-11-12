/* tests/courses-merge.js — folding a training that is in the price list twice.

   The catalogue is seeded on a fresh install and added to by hand, and one that
   was seeded more than once carries every course two or three times over. The
   office is then shown three PSSR rows for the same centre and gets a different
   amount depending on which one the mouse landed on.

   Merging is the one thing in this system that removes a record, so it is
   tested against the real functions rather than a copy of them: app.js is
   loaded into a Node VM with just enough of a browser under it to reach the end
   of the file, and courseGroups / mergeCourseGroup are called as the screen
   calls them. app.js stops on its last line, where it asks the window for
   events there are none of — by which point everything under test is defined.

   What matters most here is the last assertion of each group: a booking keeps
   the fee, the rebate and the treatment it agreed to on the day it was taken.
   Only the pointer moves. Restating a seat already remitted would make the
   books disagree with the money that actually went out.

   Run:  node tests/courses-merge.js        (exit code 0 = all green)
*/
const fs = require('fs'), path = require('path'), vm = require('vm');
const ASSETS = path.join(__dirname, '..', 'assets');

const store = {};
const el = () => {
  const n = {
    style:{}, dataset:{}, classList:{ add(){}, remove(){}, contains(){ return false; } },
    children:[], appendChild(c){ n.children.push(c); return c; }, append(){}, remove(){},
    addEventListener(){}, removeEventListener(){}, setAttribute(){}, removeAttribute(){},
    getAttribute(){ return null; }, closest(){ return null; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    insertAdjacentHTML(){}, focus(){}, click(){},
    getBoundingClientRect(){ return { width:0, height:0, top:0, left:0 }; },
    set innerHTML(v){ n._html = v; }, get innerHTML(){ return n._html || ''; },
    textContent:'', value:'', checked:false,
  };
  return n;
};
const doc = {
  addEventListener(){}, removeEventListener(){},
  getElementById(){ return null; }, querySelector(){ return null; }, querySelectorAll(){ return []; },
  createElement:el, createTextNode:() => el(), createDocumentFragment:el,
  body:el(), head:el(), documentElement:el(), title:'', readyState:'complete',
};

const ctx = {
  console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, URL,
  document:doc, navigator:{ userAgent:'node' }, history:{ replaceState(){}, pushState(){} },
  location:{ hash:'', href:'http://localhost/', search:'', pathname:'/' },
  matchMedia:() => ({ matches:false, addEventListener(){}, addListener(){} }),
  requestAnimationFrame:f => setTimeout(f, 0),
  fetch: async () => ({ ok:true, status:200, json:async () => [], text:async () => '[]' }),
  localStorage:{
    getItem:k => (k in store ? store[k] : null),
    setItem:(k,v) => { store[k] = String(v); },
    removeItem:k => { delete store[k]; },
    key:i => Object.keys(store)[i] ?? null,
    get length(){ return Object.keys(store).length; },
  },
  alert(){}, confirm(){ return true; }, print(){},
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);

const FILES = ['courses.js','terms.js','db.js','accounting.js','applications.js',
               'sync.js','cloud.js','ui.js','app.js'];
for(const f of FILES){
  try { vm.runInContext(fs.readFileSync(path.join(ASSETS, f), 'utf8'), ctx, { filename:f }); }
  catch(e){ console.log(`  (${f} stopped: ${e.message})`); }
}

const run = code => vm.runInContext(code, ctx);
let pass = 0, fail = 0;
const check = (label, fn) => {
  try { const r = fn();
    if(r === true){ console.log('  ok   ' + label); pass++; }
    else { console.log('  FAIL ' + label + ' -> ' + r); fail++; } }
  catch(e){ console.log('  FAIL ' + label + ' -> threw: ' + e.message); fail++; }
};

if(typeof run('typeof courseGroups') !== 'string' || run('typeof courseGroups') !== 'function'){
  console.log('\ncourseGroups did not load — app.js stopped before defining it.');
  process.exit(1);
}

console.log('\n- merging a training that is in the price list twice -');

run(`
  DB.reset(true);
  const d = DB.get();
  d.courses = []; d.enrollments = []; d.removed = [];
  globalThis.mk = (code,title,center,duration,modes,amount,rebate,deduct) => {
    const c = { id:DB.uid('crs'), code, title, center, duration, days:1, modes,
                amount, rebate, deduct, options:[] };
    d.courses.push(c); return c;
  };
  globalThis.RIGHT = mk('BT','PSSR','MARIANA','1 day',['Distance Learning'],1600,600,true);
  globalThis.WRONG = mk('BT','PSSR','MARIANA','1 day',['Distance Learning'],1600,500,true);
  globalThis.A1 = mk('BT','PSSR','ALTITUDE MARITIME','1 day',['Face-to-Face'],1000,300,false);
  globalThis.A2 = mk('BT','PSSR','ALTITUDE MARITIME','1 day',['Face-to-Face'],1000,300,false);
  globalThis.A3 = mk('BT','PSSR','ALTITUDE MARITIME','1 day',['Face-to-Face'],1000,300,false);
  globalThis.OTHER_CODE   = mk('UPDATING BT','PSSR','MARIANA','1 day',['Distance Learning'],1600,500,true);
  globalThis.OTHER_MODE   = mk('BT','PSSR','MARIANA','1 day',['Face-to-Face'],1600,600,true);
  globalThis.OTHER_CENTRE = mk('BT','PSSR','NEW WAVE','1 day',['Face-to-Face'],1300,300,false);

  globalThis.book = (c, no, fee, reb) => {
    const e = { id:DB.uid('e'), no, traineeId:'t1', courseId:c.id, center:c.center,
      date:'2026-11-12', start:'2026-11-13', end:'2026-11-13', status:'Enrolled',
      fee, discount:0, rebate:reb, deduct:c.deduct };
    d.enrollments.push(e); return e;
  };
  globalThis.ON_WRONG  = book(WRONG,'ENR-W',1600,500);
  globalThis.ON_RIGHT1 = book(RIGHT,'ENR-R1',1600,600);
  globalThis.ON_RIGHT2 = book(RIGHT,'ENR-R2',1600,600);
  globalThis.ON_DUP    = book(A2,'ENR-D',1000,300);
`);

check('eight rows, and exactly two of them are duplicated trainings', () => {
  const g = run('courseGroups()');
  return (run('DB.get().courses.length') === 8 && g.length === 2)
    || `${run('DB.get().courses.length')} courses, ${g.length} group(s)`;
});
check('a different code, mode or centre is left alone', () => {
  const codes = run('courseGroups().map(g => g.rows[0].center + "/" + g.rows[0].modes[0])');
  return (codes.includes('MARIANA/Distance Learning')
       && codes.includes('ALTITUDE MARITIME/Face-to-Face')
       && codes.length === 2) || JSON.stringify(codes);
});
check('the triplicate is seen as identical, the priced-two-ways one is not', () => {
  const g = run('courseGroups().map(x => x.rows[0].center + ":" + x.same)');
  return (g.includes('ALTITUDE MARITIME:true') && g.includes('MARIANA:false')) || JSON.stringify(g);
});
check('the row the office actually uses is offered first', () => {
  const g = run(`(() => { const x = courseGroups().find(x => x.rows[0].center === 'MARIANA');
    return x.rows.map(c => c.rebate); })()`);
  return (g[0] === 600) || 'offered ' + JSON.stringify(g);
});

/* ---- the merge itself ---- */
run(`globalThis.KEY_M = courseGroups().find(x => x.rows[0].center === 'MARIANA').key;
     globalThis.RES_M = mergeCourseGroup(KEY_M, RIGHT.id);`);

check('the wrong row is gone and the right one stays', () => {
  const left = run(`DB.get().courses.filter(c => c.center === 'MARIANA'
    && c.modes[0] === 'Distance Learning' && c.code === 'BT').map(c => c.rebate)`);
  return (left.length === 1 && left[0] === 600) || JSON.stringify(left);
});
check('its booking moved onto the row that survived', () => {
  const e = run(`DB.get().enrollments.find(e => e.no === 'ENR-W')`);
  return (e.courseId === run('RIGHT.id')) || 'still points at ' + e.courseId;
});
check('and what that booking agreed to pay did not change', () => {
  const e = run(`DB.get().enrollments.find(e => e.no === 'ENR-W')`);
  return (e.fee === 1600 && e.rebate === 500 && e.deduct === true)
    || `fee ${e.fee} rebate ${e.rebate} deduct ${e.deduct}`;
});
check('the bookings already on the surviving row are untouched', () => {
  const r = run(`DB.get().enrollments.filter(e => e.no.startsWith('ENR-R'))
    .map(e => e.courseId === RIGHT.id && e.rebate === 600)`);
  return r.every(Boolean) || JSON.stringify(r);
});
check('the server is told the row was removed, not left to infer it', () => {
  const rm = run(`DB.get().removed.filter(x => x.table === 'courses').map(x => x.id)`);
  return (rm.length === 1 && rm[0] === run('WRONG.id')) || JSON.stringify(rm);
});
check('it is reported as one row dropped and one booking moved', () => {
  const r = run('RES_M');
  return (r.dropped === 1 && r.moved === 1) || JSON.stringify(r);
});

run(`globalThis.KEY_A = courseGroups().find(x => x.rows[0].center === 'ALTITUDE MARITIME').key;
     globalThis.RES_A = mergeCourseGroup(KEY_A, courseGroups()
       .find(x => x.rows[0].center === 'ALTITUDE MARITIME').rows[0].id);`);

check('a triplicate folds to one row', () => {
  const n = run(`DB.get().courses.filter(c => c.center === 'ALTITUDE MARITIME').length`);
  return n === 1 || n + ' left';
});
check('the booking on the middle copy came with it', () => {
  const e = run(`DB.get().enrollments.find(e => e.no === 'ENR-D')`);
  const id = run(`DB.get().courses.find(c => c.center === 'ALTITUDE MARITIME').id`);
  return (e.courseId === id) || 'orphaned';
});
check('no booking anywhere points at a course that is gone', () => {
  const bad = run(`(() => { const ids = new Set(DB.get().courses.map(c => c.id));
    return DB.get().enrollments.filter(e => e.courseId && !ids.has(e.courseId)).map(e => e.no); })()`);
  return bad.length === 0 || 'orphaned: ' + JSON.stringify(bad);
});
check('nothing is left to merge', () => {
  const g = run('courseGroups()');
  return g.length === 0 || JSON.stringify(g.map(x => x.rows[0].center));
});
check('merging the same group twice does nothing the second time', () => {
  const r = run('mergeCourseGroup(KEY_M, RIGHT.id)');
  return (r.dropped === 0 && r.moved === 0) || JSON.stringify(r);
});
check('every merge is written to the activity log', () => {
  const n = run(`DB.get().log.filter(x => x.action === 'Merged course').length`);
  return n === 2 || n + ' entries';
});

console.log('\n- the panel the admin actually looks at -');
run(`
  DB.reset(true);
  globalThis.dd = DB.get(); dd.courses = []; dd.enrollments = []; dd.removed = [];
  globalThis.m = (code, center, amount, rebate, deduct) => {
    const c = { id:DB.uid('crs'), code, title:'PSSR', center, duration:'1 day', days:1,
                modes:['Face-to-Face'], amount, rebate, deduct, options:[] };
    dd.courses.push(c); return c;
  };
  m('BT','MARIANA',1600,600,true); m('BT','MARIANA',1600,500,true);
  m('BT','ALTITUDE MARITIME',1000,300,false); m('BT','ALTITUDE MARITIME',1000,300,false);
`);
check('the duplicates panel builds without throwing', () => {
  const h = run('courseDupesPanel()');
  return (typeof h === 'string' && h.length > 200
    && /Keep this one/.test(h) && /Merge all/.test(h)) || 'got: ' + String(h).slice(0, 200);
});
check('it offers the identical pair as one button and the priced pair as a choice', () => {
  const h = run('courseDupesPanel()');
  const keeps = (h.match(/Keep this one/g) || []).length;
  return (keeps === 2 && /Merge all 1 identical/.test(h)) || `${keeps} keep button(s)`;
});
check('with nothing duplicated it says so instead', () => {
  run(`DB.get().courses = DB.get().courses.slice(0, 1)`);
  const h = run('courseDupesPanel()');
  return /only row for its centre/.test(h) || 'got: ' + String(h).slice(0, 200);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
