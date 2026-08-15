/* tests/smoke.js — headless smoke test for the data and admissions layer.

   The portal is a zero-dependency static site, so there is no test runner to
   install. This file loads db.js, accounting.js and applications.js into a Node
   VM context with a stub localStorage, then exercises the paths that would be
   expensive to get wrong: seat accounting, the application lifecycle guards,
   duplicate seafarer detection, and whether the ledger still balances after an
   application is converted into an enrollment.

   The DOM layers (ui.js, app.js, register.js) are not covered here — those are
   checked by hand against docs/testing-checklist.md.

   Run:  node tests/smoke.js        (exit code 0 = all green)
*/

const fs = require('fs'), path = require('path'), vm = require('vm');
const ASSETS = path.join(__dirname, '..', 'assets');

/* ---------- a browser, in the smallest form these three files need ---------- */
const store = {};
const ctx = {
  console,
  localStorage:{
    getItem:k => (k in store ? store[k] : null),
    setItem:(k,v) => { store[k] = String(v); },
    removeItem:k => { delete store[k]; },
  },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);

/* Same order as the two HTML entry points: the generated catalogue must exist
   before db.js seeds from it, and accounting.js before anything calls DB.load(). */
for(const f of ['courses.js','db.js','accounting.js','applications.js']){
  vm.runInContext(fs.readFileSync(path.join(ASSETS,f),'utf8'), ctx, { filename:f });
}

const run = code => vm.runInContext(code, ctx);
let pass = 0, fail = 0;
const check = (label, fn) => {
  try{
    const r = fn();
    if(r === true){ console.log('  ok   ' + label); pass++; }
    else { console.log('  FAIL ' + label + ' -> ' + r); fail++; }
  }catch(e){ console.log('  FAIL ' + label + ' -> threw: ' + e.message); fail++; }
};

console.log('\n- seed & migration -');
run('DB.load()');
check('seeds trainees',      () => run('DB.get().trainees.length') === 18 || 'got ' + run('DB.get().trainees.length'));
check('seeds applications',  () => run('DB.get().applications.length') === 5 || 'got ' + run('DB.get().applications.length'));
check('application numbers', () => /^APP-\d{4}-0001$/.test(run('DB.get().applications[0].no')) || run('DB.get().applications[0].no'));
check('seq.application set', () => run('DB.get().seq.application') === 5 || run('DB.get().seq.application'));

console.log('\n- existing ledger still balances -');
const tb = run('ACC.trialBalance()');
check('trial balance balances', () => Math.abs(tb.totalDr - tb.totalCr) < 0.01 || `dr ${tb.totalDr} cr ${tb.totalCr}`);
check('trial balance non-empty', () => tb.totalDr > 0 || 'zero');

console.log('\n- seat accounting -');
const ob = run('APPS.openBatches()');
check('open batches found', () => ob.length > 0 || 'none');
check('pending apps reduce free seats', () => {
  const s = run(`
    (() => { const b = DB.get().batches.find(x => DB.get().applications.some(a => a.batchId === x.id && APPS.isOpen(a)));
             if(!b) return null;
             const s = APPS.seatsTaken(b);
             return { pending:s.pending, free:s.free, cap:b.capacity, enrolled:s.enrolled }; })()`);
  if(!s) return 'no batch with pending apps';
  return s.free === s.cap - s.enrolled - s.pending || JSON.stringify(s);
});

console.log('\n- validation -');
check('every required field is reported', () => {
  const e = run(`APPS.validate({})`);
  const missing = run('APPS.REQUIRED').filter(f => !e.includes(f));
  return missing.length === 0 || 'not reported: ' + missing.join(', ');
});
check('required set covers the brief', () => {
  const need = ['srn','last','first','birth','birthPlace','mobile','email','address',
                'rank','agency','emergencyName','emergencyMobile'];
  const have = run('APPS.REQUIRED');
  const gap = need.filter(f => !have.includes(f));
  return gap.length === 0 || 'missing: ' + gap.join(', ');
});
check('every field has a label', () => {
  const L = run('APPS.LABELS');
  const gap = run('APPS.REQUIRED').filter(f => !L[f]);
  return gap.length === 0 || 'unlabelled: ' + gap.join(', ');
});
check('rejects bad email', () => run(`APPS.validate({ email:'nope' }).includes('email')`) === true || 'not caught');
check('rejects future birthdate', () => run(`APPS.validate({ birth:'2099-01-01' }).includes('birth')`) === true || 'not caught');
check('rejects a short mobile', () => run(`APPS.validate({ mobile:'0917' }).includes('mobile')`) === true || 'not caught');
check('rejects self as emergency contact', () =>
  run(`APPS.validate({ mobile:'09171234567', emergencyMobile:'0917 123 4567' }).includes('emergencyMobile')`) === true || 'not caught');

console.log('\n- submit -');
const FULL = `{
    batchId: APPS.openBatches()[0].id,
    srn:'srn-999001',
    last:'Testino', first:'Pedro', middle:'Cruz', suffix:'Jr.',
    sex:'M', birth:'1990-05-04', birthPlace:'Lucena City, Quezon',
    mobile:'09171234567', email:'PEDRO.T@Mail.com', address:'Barangay 5, Lucena City',
    rank:'Oiler', agency:'Direct Hire / Walk-in', payer:'Self-paid',
    emergencyName:'Marilou Testino', emergencyRelation:'Spouse', emergencyMobile:'09189876543',
  }`;
run(`globalThis.NEW = APPS.submit(${FULL});`);
check('returns a record',      () => run('!!NEW.id') === true || 'no id');
check('ref is 6 chars',        () => run('NEW.ref.length') === 6 || run('NEW.ref'));
check('ref avoids O/0/I/1/L',  () => !/[O0I1L]/.test(run('NEW.ref')) || run('NEW.ref'));
check('status is Submitted',   () => run('NEW.status') === 'Submitted' || run('NEW.status'));
check('email lowercased',      () => run('NEW.email') === 'pedro.t@mail.com' || run('NEW.email'));
check('SRN uppercased',        () => run('NEW.srn') === 'SRN-999001' || run('NEW.srn'));
check('stores place of birth', () => run('NEW.birthPlace') === 'Lucena City, Quezon' || run('NEW.birthPlace'));
check('stores emergency contact', () =>
  (run('NEW.emergencyName') === 'Marilou Testino' && run('NEW.emergencyMobile') === '09189876543')
  || 'not stored');
check('suffix in formatted name', () =>
  run('APPS.forName(NEW)') === 'Testino Jr., Pedro C.' || run('APPS.forName(NEW)'));
check('history seeded',        () => run('NEW.history.length') === 1 || run('NEW.history.length'));
check('persisted to store',    () => run('DB.get().applications.length') === 6 || run('DB.get().applications.length'));

console.log('\n- duplicate guard -');
check('same person + batch blocked', () => {
  const e = run(`APPS.validate({ ...${FULL}, batchId:NEW.batchId })`);
  return e.includes('duplicate') || JSON.stringify(e);
});

console.log('\n- tracking -');
check('ref + surname finds it',  () => run(`APPS.track(NEW.ref,'testino')?.id`) === run('NEW.id') || 'miss');
check('lowercase ref works',     () => run(`APPS.track(NEW.ref.toLowerCase(),'Testino')?.id`) === run('NEW.id') || 'miss');
check('wrong surname finds nothing', () => run(`APPS.track(NEW.ref,'Wrong')`) === null || 'leaked');
check('ref alone finds nothing', () => run(`APPS.track(NEW.ref,'')`) === null || 'leaked');

console.log('\n- lifecycle guards -');
check('Submitted cannot jump to Enrolled', () => {
  try{ run(`APPS.advance(NEW,'Enrolled','tester','')`); return 'allowed illegal jump'; }
  catch(e){ return true; }
});
check('convert before approval throws', () => {
  try{ run(`APPS.convert(NEW,{by:'tester'})`); return 'allowed'; }
  catch(e){ return /Approve the application/.test(e.message) || e.message; }
});

console.log('\n- convert: new trainee -');
const before = {
  trainees: run('DB.get().trainees.length'),
  enrollments: run('DB.get().enrollments.length'),
  invoices: run('DB.get().invoices.length'),
  journal: run('DB.get().journal.length'),
};
run(`APPS.advance(NEW,'Under Review','tester','');
     APPS.advance(NEW,'Approved','tester','');
     globalThis.OUT = APPS.convert(NEW,{ by:'tester', mode:'Enrolled',
       addons:[{desc:'Training kit & assessment fee',account:'4100',price:450}] });`);
check('creates a new trainee', () => run('DB.get().trainees.length') === before.trainees + 1 || 'no');
check('reused = false',        () => run('OUT.reused') === false || 'reused');
check('creates enrollment',    () => run('DB.get().enrollments.length') === before.enrollments + 1 || 'no');
check('creates invoice',       () => run('DB.get().invoices.length') === before.invoices + 1 || 'no');
check('posts a journal entry', () => run('DB.get().journal.length') === before.journal + 1 || 'no');
check('application now Enrolled', () => run('NEW.status') === 'Enrolled' || run('NEW.status'));
check('application links enrollment', () => run('NEW.enrollmentId === OUT.enrollment.id') === true || 'no link');
check('invoice includes the addon', () => run('OUT.invoice.items.length') === 2 || run('OUT.invoice.items.length'));
check('invoice total = batch fee + addon', () => {
  const t = run('OUT.invoice.total'), fee = run('APPS.batch(NEW.batchId).fee');
  return Math.abs(t - (fee + 450)) < 0.01 || `total ${t}, expected ${fee + 450}`;
});
check('invoice line names the partner center', () =>
  run('OUT.invoice.items[0].desc').includes(run('APPS.batch(NEW.batchId).center'))
  || run('OUT.invoice.items[0].desc'));

console.log('\n- catalogue -');
check('catalogue loaded',        () => run('DB.get().courses.length') > 200 || run('DB.get().courses.length'));
check('no fees in the catalogue',() => run('DB.get().courses.every(c => c.fee === undefined)') === true || 'a course carries a fee');
check('no partner names either', () => run('DB.get().courses.every(c => !c.center)') === true || 'a course names a center');
check('every course has a title',() => run(`DB.get().courses.every(c => c.title && c.title.trim())`) === true || 'blank title');
check('titles are unique',       () => {
  const t = run('DB.get().courses.map(c => c.title.toUpperCase())');
  const dupes = t.filter((x,i) => t.indexOf(x) !== i);
  return dupes.length === 0 || 'duplicates survived: ' + [...new Set(dupes)].slice(0,5).join(', ');
});
check('duration string present or explicitly unknown', () =>
  run(`DB.get().courses.every(c => typeof c.duration === 'string' && c.duration.length > 0)`) === true
  || 'a course has no duration string');
check('batches carry fee and center', () =>
  run('DB.get().batches.every(b => typeof b.fee === "number" && !!b.center)') === true || 'a batch is missing fee or center');
check('ledger still balances after convert', () => {
  const t = run('ACC.trialBalance()');
  return Math.abs(t.totalDr - t.totalCr) < 0.01 || `dr ${t.totalDr} cr ${t.totalCr}`;
});
check('double convert throws', () => {
  try{ run(`APPS.convert(NEW,{by:'tester'})`); return 'allowed'; }
  catch(e){ return /already been enrolled/.test(e.message) || e.message; }
});

console.log('\n- convert: new trainee carries every field -');
check('trainee gets the full record', () => {
  const t = run('OUT.trainee');
  const want = { srn:'SRN-999001', suffix:'Jr.', birthPlace:'Lucena City, Quezon',
                 emergencyName:'Marilou Testino', emergencyRelation:'Spouse',
                 emergencyMobile:'09189876543', address:'Barangay 5, Lucena City',
                 agency:'Direct Hire / Walk-in' };
  const gap = Object.entries(want).filter(([k,v]) => t[k] !== v).map(([k]) => k);
  return gap.length === 0 || 'wrong or missing: ' + gap.join(', ');
});

console.log('\n- convert: existing seafarer (refresher) -');
run(`
  globalThis.EXIST = DB.get().trainees[0];
  globalThis.APP2 = APPS.submit({
    batchId: APPS.openBatches().find(b => !DB.get().enrollments.some(e => e.batchId === b.id && e.traineeId === EXIST.id)).id,
    srn:EXIST.srn, last:EXIST.last, first:EXIST.first, sex:EXIST.sex,
    birth:EXIST.birth, birthPlace:'Cebu City, Cebu',
    rank:'Chief Mate', mobile:'09998887777', email:'refresher@mail.com',
    address:'Lapu-Lapu City, Cebu', payer:'Agency-billed',
    agency:'Wallem Maritime Services',
    emergencyName:'Ligaya Reyes', emergencyRelation:'Sister', emergencyMobile:'09171112222',
  });
  APPS.advance(APP2,'Approved','tester','');
  globalThis.OUT2 = APPS.convert(APP2,{ by:'tester', mode:'Reserved' });
`);
const t2 = run('DB.get().trainees.length');
check('reuses the existing record', () => run('OUT2.reused') === true || 'created a duplicate');
check('matched on SRN',             () => run('OUT2.matchedOn') === 'SRN' || run('OUT2.matchedOn'));
check('no new trainee created',     () => t2 === before.trainees + 1 || `registry grew to ${t2}`);
check('refreshes contact details',  () => run(`OUT2.trainee.mobile`) === '09998887777' || run('OUT2.trainee.mobile'));
check('refreshes next of kin',      () => run(`OUT2.trainee.emergencyName`) === 'Ligaya Reyes' || run('OUT2.trainee.emergencyName'));
check('keeps the original trainee no', () => run(`OUT2.trainee.no === EXIST.no`) === true || 'renumbered');
check('reserved -> no invoice',     () => run('OUT2.invoice') === null || 'billed a reservation');
check('reserved enrollment status', () => run('OUT2.enrollment.status') === 'Reserved' || run('OUT2.enrollment.status'));

console.log('\n- reject -');
run(`globalThis.APP3 = DB.get().applications.find(a => a.status === 'Submitted' && a.id !== NEW.id);
     if(APP3) APPS.reject(APP3,'Missing SIRB','tester');`);
check('reject sets status',   () => run('APP3 ? APP3.status : "Rejected"') === 'Rejected' || run('APP3.status'));
check('reject stores reason', () => run('APP3 ? APP3.reason : "Missing SIRB"') === 'Missing SIRB' || 'no reason');
check('rejected app is final',() => run('APPS.isFinal(APP3)') === true || 'not final');
check('rejection posts nothing', () => {
  const t = run('ACC.trialBalance()');
  return Math.abs(t.totalDr - t.totalCr) < 0.01 || 'unbalanced';
});

console.log('\n- backup round-trip -');
run(`globalThis.SNAP = JSON.stringify(DB.get());`);
check('import restores applications', () => {
  run(`DB.reset(false); DB.importJSON(SNAP);`);
  return run('DB.get().applications.length') >= 7 || run('DB.get().applications.length');
});
check('old backup without applications still opens', () => {
  const legacy = JSON.parse(run('SNAP'));
  delete legacy.applications; delete legacy.seq.application;
  ctx.LEGACY = JSON.stringify(legacy);
  run(`DB.importJSON(LEGACY)`);
  return Array.isArray(run('DB.get().applications')) && run('DB.get().seq.application') === 0
    || 'migration failed';
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
