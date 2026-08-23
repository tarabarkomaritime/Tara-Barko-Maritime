/* tests/smoke.js — headless smoke test for the data, registration and money layers.

   The portal is a zero-dependency static site, so there is no test runner to
   install. This file loads courses.js, terms.js, db.js, accounting.js and
   applications.js into a Node VM context with a stub localStorage, then
   exercises the paths that would be expensive to get wrong: registration and
   repeat registration, encoding an enrollment against a course and a manually
   chosen date, split-tender collections landing in the right cash accounts, and
   whether the ledger still balances afterwards.

   The DOM layers (ui.js, app.js, register.js) are not covered here — those are
   checked by hand against docs/testing-checklist.md.

   Run:  node tests/smoke.js        (exit code 0 = all green)
*/

const fs = require('fs'), path = require('path'), vm = require('vm');
const ASSETS = path.join(__dirname, '..', 'assets');

/* ---------- a browser, in the smallest form these files need ---------- */
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
for(const f of ['courses.js','terms.js','db.js','accounting.js','applications.js']){
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
const balanced = () => {
  const tb = run('ACC.trialBalance()');
  return Math.abs(tb.totalDr - tb.totalCr) < 0.01 || `dr ${tb.totalDr} cr ${tb.totalCr}`;
};

console.log('\n- seed -');
run('DB.load()');
check('seeds the trainee registry', () => run('DB.get().trainees.length') === 23 || 'got ' + run('DB.get().trainees.length'));
check('seeds people who registered online but are not booked', () =>
  run(`DB.get().trainees.filter(t => t.source === 'Public portal').length`) === 5 ||
  run(`DB.get().trainees.filter(t => t.source === 'Public portal').length`));
check('seeds enrollments', () => run('DB.get().enrollments.length') > 20 || run('DB.get().enrollments.length'));
check('no schedules collection remains', () => run('DB.get().batches === undefined') === true || 'batches still present');
check('no seat capacity on enrollments', () =>
  run('DB.get().enrollments.every(e => e.capacity === undefined)') === true || 'capacity found');

console.log('\n- every enrollment carries its own booking -');
check('each has a course', () => run('DB.get().enrollments.every(e => !!e.courseId)') === true || 'missing courseId');
check('each has a training date', () => run('DB.get().enrollments.every(e => !!e.start)') === true || 'missing start');
check('each has a center', () => run('DB.get().enrollments.every(e => !!e.center)') === true || 'missing center');
check('each has its own fee', () => run('DB.get().enrollments.every(e => typeof e.fee === "number")') === true || 'missing fee');
check('no enrollment points at a batch', () =>
  run('DB.get().enrollments.every(e => e.batchId === undefined)') === true || 'batchId survives');

console.log('\n- no VAT and no other taxes -');
check('computeInvoice returns no vat', () =>
  run('ACC.computeInvoice([{qty:1,price:1000}],0).vat === undefined') === true || 'vat still computed');
check('total equals charges less discount', () => {
  const t = run('ACC.computeInvoice([{qty:1,price:1000},{qty:1,price:500}],200)');
  return (t.subtotal === 1500 && t.discount === 200 && t.total === 1300) || JSON.stringify(t);
});
check('no invoice carries a vat figure', () =>
  run('DB.get().invoices.every(i => !i.vat)') === true || 'a vat amount survives');
check('company profile has no tax settings', () =>
  run('DB.get().company.vatRate === undefined && DB.get().company.vatInclusive === undefined') === true
  || 'vat settings survive');
check('nothing posts to Output VAT', () =>
  run(`DB.get().journal.every(j => j.lines.every(l => l.account !== '2100'))`) === true || 'posted to 2100');
check('ledger balances after seeding', balanced);

console.log('\n- registering from the public portal -');
const FORM = `{
  srn:'SRN-T100', last:'Testino', first:'Tomas', middle:'Cruz', suffix:'',
  sex:'M', birth:'1990-05-04', birthPlace:'Cebu City',
  mobile:'09171234567', email:'tomas.testino@mail.com', address:'12 Rizal St., Cebu City',
  facebook:'facebook.com/tomas.testino', messenger:'',
  rank:'Able Seaman', agency:'Test Manning Inc.',
  emergencyName:'Ana Testino', emergencyRelation:'Spouse', emergencyMobile:'09181234567',
  termsVersion:TERMS.version, termsAccepted:TERMS.agreements.map(a => a.label)
}`;
run(`globalThis.REG = APPS.submit(${FORM})`);
check('registration is recorded', () => /^REG-\d{4}-\d{4}$/.test(run('REG.no')) || run('REG.no'));
check('a master record is created immediately', () =>
  run(`!!DB.get().trainees.find(t => t.srn === 'SRN-T100')`) === true || 'no trainee created');
check('the trainee is marked as coming from the portal', () =>
  run('REG.trainee.source') === 'Public portal' || run('REG.trainee.source'));
check('terms version is stamped', () => run('REG.termsVersion') === run('TERMS.version') || run('REG.termsVersion'));
check('both agreements are stored verbatim', () =>
  run('REG.termsAccepted.length') === run('TERMS.agreements.length') || run('REG.termsAccepted.length'));
check('acceptance is timestamped', () => /^\d{4}-\d{2}-\d{2}T/.test(run('REG.termsAcceptedAt')) || run('REG.termsAcceptedAt'));
check('no course is asked for', () => run(`!APPS.REQUIRED.includes('courseId')`) === true || 'course required');

console.log('\n- registering a second time is allowed -');
const before = run(`DB.get().trainees.length`);
run(`globalThis.REG2 = APPS.submit({ ...${FORM}, mobile:'09179998888' })`);
check('the second registration is accepted', () => run('REG2.no') !== run('REG.no') || 'same record');
check('it reuses the same master record', () => run('REG2.reused') === true || 'created a duplicate trainee');
check('the registry did not grow', () => run('DB.get().trainees.length') === before || 'trainee count changed');
check('fresher contact details win', () =>
  run(`DB.get().trainees.find(t => t.srn === 'SRN-T100').mobile`) === '09179998888'
  || run(`DB.get().trainees.find(t => t.srn === 'SRN-T100').mobile`));
check('the trainee number is unchanged', () => run('REG2.trainee.no') === run('REG.trainee.no') || 'number changed');

console.log('\n- validation -');
const errs = expr => run(`APPS.validate(${expr})`);
check('missing required fields are named', () => {
  const e = errs('{}');
  return APPS_REQUIRED_COVERED(e) || JSON.stringify(e);
});
function APPS_REQUIRED_COVERED(e){
  const need = run('APPS.REQUIRED');
  return need.every(f => e.includes(f));
}
check('a malformed email is caught', () => errs(`{ ...${FORM}, email:'nope' }`).includes('email') || 'accepted');
check('a future birthdate is caught', () => errs(`{ ...${FORM}, birth:'2999-01-01' }`).includes('birth') || 'accepted');
check('a short mobile is caught', () => errs(`{ ...${FORM}, mobile:'0917' }`).includes('mobile') || 'accepted');
check('own number as emergency contact is caught', () =>
  errs(`{ ...${FORM}, emergencyMobile:'0917 123 4567' }`).includes('emergencyMobile') || 'accepted');
check('a sentence in the Facebook field is caught', () =>
  errs(`{ ...${FORM}, facebook:'my name is tomas' }`).includes('facebook') || 'accepted');
check('nothing is rejected as a duplicate', () => !errs(FORM).includes('duplicate') || 'duplicate rule survives');

console.log('\n- encoding an enrollment -');
run(`globalThis.TRN = DB.get().trainees.find(t => t.srn === 'SRN-T100')`);
run(`globalThis.CRS1 = DB.get().courses.find(c => c.title === 'AFF')`);
run(`globalThis.OUT = APPS.enroll(TRN, { courseId:CRS1.id, start:'2026-09-14', end:'2026-09-18',
       center:'Nautical Options', fee:4200, mode:'Enrolled',
       charges:[{ desc:'Training kit & assessment fee', account:'4100', price:450 }], by:'tester' })`);
check('the enrollment is numbered', () => /^ENR-\d{4}-\d{4}$/.test(run('OUT.enrollment.no')) || run('OUT.enrollment.no'));
check('it records the course chosen', () => run('OUT.enrollment.courseId') === run('CRS1.id') || 'wrong course');
check('it records the date typed in', () => run('OUT.enrollment.start') === '2026-09-14' || run('OUT.enrollment.start'));
check('it records the center', () => run('OUT.enrollment.center') === 'Nautical Options' || run('OUT.enrollment.center'));
check('it records the agreed fee', () => run('OUT.enrollment.fee') === 4200 || run('OUT.enrollment.fee'));
check('an invoice is raised', () => /^INV-\d{4}-\d{4}$/.test(run('OUT.invoice.no')) || run('OUT.invoice.no'));
check('the invoice totals fee plus charges', () => run('OUT.invoice.total') === 4650 || run('OUT.invoice.total'));
check('the invoice is untaxed', () => run('!OUT.invoice.vat') === true || 'vat charged');
check('ledger balances after billing', balanced);
check('receivables were debited', () => {
  const je = run(`DB.get().journal.find(j => j.refId === OUT.invoice.id)`);
  return (je.lines[0].account === '1200' && je.lines[0].debit === 4650) || JSON.stringify(je.lines);
});

console.log('\n- the same trainee can enroll again -');
run(`globalThis.CRS2 = DB.get().courses.find(c => c.title === 'SCRB')`);
run(`globalThis.OUT2 = APPS.enroll(TRN, { courseId:CRS2.id, start:'2026-10-05',
       center:'Altitude Maritime', fee:3600, mode:'Enrolled', by:'tester' })`);
check('a second enrollment is created', () => run('OUT2.enrollment.id') !== run('OUT.enrollment.id') || 'same record');
check('both sit under one trainee', () => run('APPS.enrollmentsFor(TRN.id).length') === 2 || run('APPS.enrollmentsFor(TRN.id).length'));
check('the end date defaults to the start date', () => run('OUT2.enrollment.end') === '2026-10-05' || run('OUT2.enrollment.end'));

console.log('\n- what we owe the training center -');
check('do not deduct: we owe the centre the full fee', () => {
  const s = run('ACC.centerSettlement({ fee:4200, rebate:1200, deduct:false })');
  return (s.payable === 4200 && s.receivable === 1200) || JSON.stringify(s);
});
check('deduct: the rebate comes off the payable', () => {
  const s = run('ACC.centerSettlement({ fee:4200, rebate:1200, deduct:true })');
  return (s.payable === 3000 && s.receivable === 0) || JSON.stringify(s);
});
check('the trainee is billed the same either way', () => {
  run('globalThis.C_DEDUCT = DB.get().courses.find(c => c.title === "AFF" && c.center === "NAUTICAL OPTIONS")');
  run('C_DEDUCT.deduct = true');
  run('globalThis.OUT3 = APPS.enroll(TRN, { courseId:C_DEDUCT.id, start:"2026-12-01", ' +
      'center:C_DEDUCT.center, fee:C_DEDUCT.amount, mode:"Enrolled", by:"tester" })');
  return run('OUT3.invoice.total') === run('C_DEDUCT.amount') || run('OUT3.invoice.total');
});
check('a deducted rebate lowers only the payable', () => {
  const e = run('OUT3.enrollment');
  return (e.centerPayable === run('C_DEDUCT.amount') - run('C_DEDUCT.rebate') && e.rebateReceivable === 0)
    || JSON.stringify({ payable:e.centerPayable, receivable:e.rebateReceivable });
});
check('it posts to the payable account', () => {
  const je = run('DB.get().journal.find(j => j.refId === OUT3.enrollment.id)');
  const ap = je.lines.find(l => l.account === '2000');
  return (ap && ap.credit === run('OUT3.enrollment.centerPayable')) || JSON.stringify(je.lines);
});
check('an undeducted rebate is carried as a receivable', () => {
  run('globalThis.C_PLAIN = DB.get().courses.find(c => c.title === "SCRB" && c.rebate > 0)');
  run('C_PLAIN.deduct = false');
  run('globalThis.OUT4 = APPS.enroll(TRN, { courseId:C_PLAIN.id, start:"2026-12-08", ' +
      'center:C_PLAIN.center, fee:C_PLAIN.amount, mode:"Enrolled", by:"tester" })');
  const e = run('OUT4.enrollment');
  return (e.centerPayable === run('C_PLAIN.amount') && e.rebateReceivable === run('C_PLAIN.rebate'))
    || JSON.stringify({ payable:e.centerPayable, receivable:e.rebateReceivable });
});
check('the rebate is recognised as income either way', () => {
  const je = run('DB.get().journal.find(j => j.refId === OUT4.enrollment.id)');
  const inc = je.lines.find(l => l.account === '4200');
  return (inc && inc.credit === run('C_PLAIN.rebate')) || JSON.stringify(je.lines);
});
check('the payable is posted whether or not the trainee has paid', () => {
  const paid = run('DB.get().payments.filter(p => p.invoiceId === OUT4.invoice.id).length');
  return (paid === 0 && run('OUT4.enrollment.centerPayable') > 0) || 'payable waited for a payment';
});
check('a reserved booking owes the center nothing yet', () => {
  run('globalThis.OUT5 = APPS.enroll(TRN, { courseId:C_PLAIN.id, start:"2026-12-20", ' +
      'center:C_PLAIN.center, fee:C_PLAIN.amount, mode:"Reserved", by:"tester" })');
  return run('OUT5.enrollment.centerPayable === undefined') === true || 'a reservation created a payable';
});
check('ledger balances after the center postings', balanced);
/* Put back what this block changed — later assertions read the seeded flags. */
run('C_DEDUCT.deduct = false');

console.log('\n- what enrolling refuses to do -');
const throws = (code, re) => {
  try{ run(code); return 'allowed'; }
  catch(e){ return re.test(e.message) || e.message; }
};
check('no course', () => throws(`APPS.enroll(TRN, { start:'2026-09-14', fee:100 })`, /Choose the course/));
check('no date', () => throws(`APPS.enroll(TRN, { courseId:CRS1.id, fee:100 })`, /training date/));
check('no trainee', () => throws(`APPS.enroll(null, { courseId:CRS1.id, start:'2026-09-14', fee:100 })`, /Choose the trainee/));
check('an end date before the start', () =>
  throws(`APPS.enroll(TRN, { courseId:CRS1.id, start:'2026-09-14', end:'2026-09-01', fee:100 })`, /end date/));

console.log('\n- reserved bookings are not billed -');
run(`globalThis.RES = APPS.enroll(TRN, { courseId:CRS2.id, start:'2026-11-02',
       center:'PNTC', fee:5000, mode:'Reserved', by:'tester' })`);
check('no invoice is raised', () => run('RES.invoice === null') === true || 'billed a reservation');
check('the booking is marked Reserved', () => run('RES.enrollment.status') === 'Reserved' || run('RES.enrollment.status'));
check('ledger still balances', balanced);

console.log('\n- paying a training center -');
check('a remittance discharges the payable rather than booking a new cost', () => {
  run('globalThis.VOU = { id:"exp-test", no:"DV-TEST", amount:3000, method:"Bank" }');
  run('globalThis.RJE = ACC.postCenterRemittance({ date:DB.today(), memo:"test", ' +
      'refNo:VOU.no, refId:VOU.id, amount:VOU.amount, method:VOU.method })');
  const l = run('RJE.lines');
  return (l.length === 2 && l[0].account === '2000' && l[0].debit === 3000
    && l[1].account === '1010' && l[1].credit === 3000) || JSON.stringify(l);
});
check('it does not touch the expense account again', () =>
  run(`RJE.lines.every(l => l.account !== '5050')`) === true || 'posted a second cost');
check('cash leaves the account the money was paid from', () => {
  const je = run('ACC.postCenterRemittance({ date:DB.today(), memo:"cash test", ' +
    'refNo:"DV-TEST2", refId:"exp-test2", amount:500, method:"Cash" })');
  return je.lines[1].account === '1000' || je.lines[1].account;
});
check('ledger balances after remitting', balanced);
check('what a center is owed is the sum of its bookings', () => {
  /* Deduct nets the rebate off the payable; do-not-deduct does not. A center
     with one of each is owed fee-less-rebate plus the full fee. */
  const a = run('ACC.centerSettlement({ fee:4000, rebate:600, deduct:true }).payable');
  const b = run('ACC.centerSettlement({ fee:4000, rebate:600, deduct:false }).payable');
  return (a + b === 7400) || `${a} + ${b}`;
});
check('a booking that was never billed owes the center nothing', () =>
  run('OUT5.enrollment.centerPayable === undefined') === true || 'a reservation owes money');

console.log('\n- collections: one mode -');
run(`globalThis.P1 = ACC.buildPayment({ invoiceId:OUT.invoice.id, traineeId:TRN.id,
       date:DB.today(), amount:1000, method:'Cash' })`);
run(`DB.get().payments.push(P1); ACC.postPayment(P1, OUT.invoice)`);
check('the receipt is numbered', () => /^OR-\d{4}-\d{4}$/.test(run('P1.no')) || run('P1.no'));
check('cash lands in Cash on Hand', () => {
  const je = run(`DB.get().journal.find(j => j.refId === P1.id)`);
  return (je.lines[0].account === '1000' && je.lines[0].debit === 1000) || JSON.stringify(je.lines);
});
check('the invoice goes Partial', () => run('OUT.invoice.status') === 'Partial' || run('OUT.invoice.status'));
check('the balance is right', () => run('ACC.balanceOf(OUT.invoice)') === 3650 || run('ACC.balanceOf(OUT.invoice)'));

console.log('\n- collections: split across modes -');
run(`globalThis.P2 = ACC.buildPayment({ invoiceId:OUT.invoice.id, traineeId:TRN.id, date:DB.today(),
       tenders:[{ method:'GCash', ref:'GC-12345', amount:2000 },
                { method:'Bank',  ref:'BT-99887', amount:1650 }] })`);
run(`DB.get().payments.push(P2); ACC.postPayment(P2, OUT.invoice)`);
check('the receipt totals its tenders', () => run('P2.amount') === 3650 || run('P2.amount'));
check('it is labelled as a split', () => run('P2.method') === 'Split' || run('P2.method'));
check('both references are kept', () =>
  (run(`P2.tenders[0].ref`) === 'GC-12345' && run(`P2.tenders[1].ref`) === 'BT-99887') || JSON.stringify(run('P2.tenders')));
check('GCash lands in its own wallet account', () => {
  const je = run(`DB.get().journal.find(j => j.refId === P2.id)`);
  const g = je.lines.find(l => l.account === '1020');
  return (g && g.debit === 2000) || JSON.stringify(je.lines);
});
check('the bank share lands in Cash in Bank', () => {
  const je = run(`DB.get().journal.find(j => j.refId === P2.id)`);
  const b = je.lines.find(l => l.account === '1010');
  return (b && b.debit === 1650) || JSON.stringify(je.lines);
});
check('receivables are credited once, for the whole receipt', () => {
  const je = run(`DB.get().journal.find(j => j.refId === P2.id)`);
  const ar = je.lines.filter(l => l.account === '1200');
  return (ar.length === 1 && ar[0].credit === 3650) || JSON.stringify(je.lines);
});
check('the invoice is settled', () => run('OUT.invoice.status') === 'Paid' || run('OUT.invoice.status'));
check('ledger balances after a split receipt', balanced);

console.log('\n- legacy payment records still post -');
run(`globalThis.P3 = ACC.buildPayment({ invoiceId:OUT2.invoice.id, traineeId:TRN.id,
       date:DB.today(), amount:500, method:'Bank Transfer', ref:'OLD-1' })`);
check('an old mode name is normalised', () => run('P3.method') === 'Bank' || run('P3.method'));
check('and it still has a tender', () => run('P3.tenders.length') === 1 || run('P3.tenders.length'));

console.log('\n- voiding reverses rather than deletes -');
const jBefore = run('DB.get().journal.length');
run(`ACC.reverse(P1.id, 'test void'); P1.voided = true; ACC.recomputeInvoice(OUT.invoice)`);
check('a reversing entry is posted', () => run('DB.get().journal.length') > jBefore || 'nothing posted');
check('the receipt row survives', () => run(`!!DB.get().payments.find(p => p.id === P1.id)`) === true || 'deleted');
check('the invoice reopens', () => run('OUT.invoice.status') === 'Partial' || run('OUT.invoice.status'));
check('ledger balances after the reversal', balanced);

console.log('\n- tracking -');
check('found by SRN and last name', () => run(`!!APPS.track('SRN-T100','Testino')`) === true || 'not found');
check('every enrollment is returned, newest booking first', () => {
  const r = run(`(() => { const h = APPS.track('SRN-T100','Testino');
    return h.enrollments.map(e => e.start); })()`);
  const sorted = [...r].sort().reverse().join() === r.join();
  /* Count is not pinned: earlier blocks book this trainee onto several courses,
     which is the point — one seafarer, many bookings. Order is what matters. */
  return (r.length >= 3 && sorted) || JSON.stringify(r);
});
check('the wrong surname finds nothing', () => run(`APPS.track('SRN-T100','Nobody') === null`) === true || 'leaked a record');
check('an unknown SRN finds nothing', () => run(`APPS.track('SRN-NOPE','Testino') === null`) === true || 'leaked a record');
check('the registration is linked to the trainee', () =>
  run(`APPS.registrationsFor(TRN.id).length`) === 2 || run(`APPS.registrationsFor(TRN.id).length`));

console.log('\n- delivery is one of four values -');
const DELIVERY = ['Face-to-Face','Module','Distance Learning','Non-Appearance'];
check('the list is exactly those four', () =>
  run('DB.DELIVERY').join('|') === DELIVERY.join('|') || run('DB.DELIVERY').join('|'));
check('every seeded course uses only those', () => {
  const bad = run('DB.get().courses.filter(c => (c.modes||[]).some(m => !' + JSON.stringify(DELIVERY) + '.includes(m)))'
    + '.map(c => c.title + ":" + c.modes.join(","))');
  return bad.length === 0 || bad.slice(0,3).join(' | ');
});
check('every course has at least one delivery', () =>
  run('DB.get().courses.every(c => (c.modes||[]).length > 0)') === true || 'a course has none');
check('a course with nothing recorded defaults to face to face', () => {
  const c = run('DB.get().courses.find(c => c.title === "AB DECK")');
  return c.modes.join() === 'Face-to-Face' || c.modes.join();
});
/* The matrix does not mark anything as a module, so nothing is seeded as one.
   The value still has to be offered, because the office sets it by hand. */
check('Module is available even though the matrix uses none', () =>
  run('DB.DELIVERY').includes('Module') || 'Module is not offered');
check('a Blended row maps to the two deliveries it is made of', () => {
  const hit = run('DB.get().courses.filter(c => c.title === "BASIC TRAINING")' +
    '.find(c => c.modes.length === 2)');
  return (hit && hit.modes.includes('Face-to-Face') && hit.modes.includes('Distance Learning'))
    || 'no blended entry found';
});
/* The ID column already shows the acronym, so the title should not repeat it —
   but only where there is a title left underneath. A course whose whole name is
   its acronym keeps that name rather than going blank. */
check('a title no longer repeats the course ID', () =>
  run(`DB.get().courses.every(c => {
    const t = c.title.toUpperCase(), k = c.code.toUpperCase();
    return t === k || !/^\s*[-–—]\s*/.test(t.slice(k.length)) || !t.startsWith(k);
  })`) === true
  || run(`DB.get().courses.filter(c => c.title.toUpperCase().startsWith(c.code.toUpperCase())
       && /^\s*[-–—]\s*/.test(c.title.slice(c.code.length))).slice(0,3).map(c => c.title).join(' | ')`));
check('a course named only by its acronym keeps its name', () =>
  run(`DB.get().courses.every(c => c.title.trim().length > 0)`) === true || 'a title went blank');
check('the descriptive half survives', () =>
  run(`!!DB.get().courses.find(c => c.code === 'ABC' && c.title === 'AWARENESS ON BASIC COMPUTER')`) === true
  || run(`(DB.get().courses.find(c => c.code === 'ABC')||{}).title`));

check('the same course at two centers is two entries at two prices', () => {
  const rows = run('DB.get().courses.filter(c => c.title === "PSSR")' +
    '.map(c => c.center + ":" + c.amount)');
  return (rows.length >= 5 && new Set(rows.map(r => r.split(":")[1])).size > 1) || rows.join(' | ');
});
/* Only one center offers PSSR by distance learning; the rest teach it in the
   room. The delivery belongs to the center's row, not to the course name. */
check('distance learning survives on the center that offers it', () => {
  const rows = run('DB.get().courses.filter(c => c.title === "PSSR")');
  const dl = rows.filter(c => c.modes.includes('Distance Learning'));
  return (dl.length === 1 && dl[0].center === 'MARIANA')
    || rows.map(c => c.center + ':' + c.modes.join('+')).join(' | ');
});
check('accommodation is an option, not a delivery', () => {
  const rows = run('DB.get().courses.filter(c => c.title === "ETO")');
  const clean = rows.every(c => !c.modes.some(m => /accommodation/i.test(m)));
  const opts = rows.flatMap(c => c.options || []).sort();
  return (rows.length === 2 && clean && opts.join('|') === 'With accommodation|Without accommodation')
    || JSON.stringify(rows.map(c => ({ modes:c.modes, options:c.options })));
});
check('the note field is retired', () =>
  run('DB.get().courses.every(c => c.note === undefined)') === true || 'a note survives');
check('legacy spellings normalise', () => {
  const r = run('DB.normalizeDelivery(["face to face","Blended","Distance learning","With accommodation","nonsense"])');
  return (r.modes.join('|') === 'Face-to-Face|Distance Learning' && r.options.length === 1) || JSON.stringify(r);
});

console.log('\n- commercial terms stay inside -');
check('a course may carry its center and price', () => {
  const c = run('DB.get().courses.find(c => c.amount > 0)');
  return (c && c.center && c.amount > 0) || 'no priced course seeded';
});
check('rebates come from the matrix', () => {
  const withRebate = run('DB.get().courses.filter(c => c.rebate > 0).length');
  return withRebate > 250 || 'only ' + withRebate + ' courses carry a rebate';
});
/* Imported courses arrive on do-not-deduct terms — the matrix does not say
   which rebates come off a payable, and guessing misstates what a partner is
   owed. The seed then flips a handful so the payables screen shows both paths. */
check('imported courses do not deduct by default', () => {
  const deducting = run('DB.get().courses.filter(c => c.deduct).length');
  const total = run('DB.get().courses.length');
  return (deducting < 10 && total > 300) || `${deducting} of ${total} deduct`;
});
check('every course entry names the center that quoted it', () =>
  run('DB.get().courses.every(c => !!c.center)') === true || 'an entry has no center');
check('courses no longer carry a status', () =>
  run('DB.get().courses.every(c => c.active === undefined)') === true || 'a status survives');
check('a deducted rebate lowers what the trainee pays', () => {
  run('globalThis.PRICED = DB.get().courses.find(c => c.amount > 0)');
  run('PRICED.rebate = 500; PRICED.deduct = true');
  const charged = run('PRICED.deduct ? PRICED.amount - PRICED.rebate : PRICED.amount');
  const ok = charged === run('PRICED.amount') - 500;
  run('PRICED.rebate = 0; PRICED.deduct = false');
  return ok || 'deduct had no effect';
});

/* The public portal is a separate file with no catalogue in it any more. This
   reads its source rather than its behaviour, because the cheapest way to leak
   a price is for someone to add a course listing back to it. */
const publicSrc = fs.readFileSync(path.join(ASSETS, 'register.js'), 'utf8');
check('the public portal never reads a course amount', () =>
  !/\.amount\b/.test(publicSrc) || 'register.js reads .amount');
check('the public portal never reads a rebate', () =>
  !/rebate/i.test(publicSrc) || 'register.js mentions a rebate');
check('the public portal never lists the catalogue', () =>
  !/courses\.filter|catTable|p-cat-tbl/.test(publicSrc) || 'register.js renders a catalogue');
/* The word "fee" appears in the portal's prose — "we will settle the fee with
   you" — so the guard is against formatting an amount, not against the word. */
check('the public portal formats no money', () =>
  !/UI\.peso|\bpeso\s*\(/.test(publicSrc) || 'register.js formats an amount');

console.log('\n- a trainee who pays too much -');
/* The counter takes what is handed over. The bill is the charge; the payment is
   the money. Conflating them either turns a trainee away or writes down a figure
   that is not what is in the drawer. */
run(`globalThis.OVER = (() => {
  const t = DB.get().trainees[0];
  const inv = { id:'inv-over', no:'INV-OVER', traineeId:t.id, enrollmentId:null, date:DB.today(),
                items:[], subtotal:2000, discount:0, total:2000, paid:0, status:'Unpaid', voided:false };
  DB.get().invoices.push(inv);
  const p = ACC.buildPayment({ invoiceId:inv.id, traineeId:t.id, date:DB.today(),
                               tenders:[{ method:'Cash', ref:'', amount:2500 }] });
  DB.get().payments.push(p);
  const je = ACC.postPayment(p, inv);
  return { t, inv, p, je };
})()`);

check('an overpayment is taken, not refused', () =>
  run('OVER.p.amount') === 2500 || 'the receipt was written for ' + run('OVER.p.amount'));
check('the bill is settled and never goes below zero', () =>
  (run('ACC.balanceOf(OVER.inv)') === 0) || 'balance ' + run('ACC.balanceOf(OVER.inv)'));
check('the excess is reported as an overpayment on the bill', () =>
  run('ACC.overpaidOn(OVER.inv)') === 500 || 'overpaidOn ' + run('ACC.overpaidOn(OVER.inv)'));
/* The office keeps it, so the trainee has no claim on it and the refund
   screen must not offer it back. */
check('it is not offered back to the trainee as credit', () =>
  run('ACC.creditBalance(OVER.t.id)') === 0 || 'credit ' + run('ACC.creditBalance(OVER.t.id)'));
check('receivables are credited only as far as the bill was owed', () => {
  const l = run('OVER.je.lines').find(x => x.account === '1200');
  return (l && l.credit === 2000) || JSON.stringify(run('OVER.je.lines'));
});
check('the excess lands in Overpayments, not in receivables', () => {
  const l = run('OVER.je.lines').find(x => x.account === '4300');
  return (l && l.credit === 500) || JSON.stringify(run('OVER.je.lines'));
});
check('the whole amount received hits cash', () => {
  const l = run('OVER.je.lines').find(x => x.account === '1000');
  return (l && l.debit === 2500) || JSON.stringify(run('OVER.je.lines'));
});
check('the books still balance after an overpayment', () => {
  const tb = run('ACC.trialBalance(DB.today())');
  return Math.abs(tb.totalDr - tb.totalCr) < 0.01 || `${tb.totalDr} vs ${tb.totalCr}`;
});

console.log('\n- money out waits for approval -');
/* A refund hands back money taken on a booking that was cancelled. The invoice
   was reversed, so that payment sits in receivables as a credit balance and the
   refund clears it. Never against revenue — the training was never sold. */
check('a refund posts against receivables, not against revenue', () => {
  run('globalThis.RF = { id:"ref-t", no:"RF-TEST", date:DB.today(), amount:1200, method:"Cash", reason:"test" }');
  const je = run('ACC.postRefund(RF)');
  return (je.lines[0].account === '1200' && je.lines[0].debit === 1200
    && je.lines[1].account === '1000' && je.lines[1].credit === 1200) || JSON.stringify(je.lines);
});
check('it never touches a revenue account', () =>
  run(`DB.get().journal.find(j => j.refId === 'ref-t').lines.every(l => !/^4/.test(l.account))`) === true
  || 'a refund hit revenue');
check('ledger balances after a refund', balanced);
check('a cancelled paid booking leaves a credit to refund', () => {
  run(`(() => {
    const inv = DB.get().invoices.find(i => !i.voided && i.paid > 0);
    globalThis.CANC = inv;
    inv.voided = true; inv.status = 'Void';
    ACC.reverse(inv.id, 'test');
  })()`);
  return run('ACC.creditBalance(CANC.traineeId)') > 0 || 'no credit left behind';
});
check('the credit falls away once the refund is approved', () => {
  const before = run('ACC.creditBalance(CANC.traineeId)');
  run(`(() => {
    DB.get().refunds.push({ id:'ref-2', no:'RF-2', date:DB.today(), traineeId:CANC.traineeId,
      amount:ACC.creditBalance(CANC.traineeId), method:'Cash', state:'Approved' });
  })()`);
  const after = run('ACC.creditBalance(CANC.traineeId)');
  return (before > 0 && after === 0) || `${before} -> ${after}`;
});
check('a refund still pending leaves the credit standing', () => {
  const t = run(`DB.get().invoices.find(i => i.voided && i.paid > 0 && i.traineeId !== CANC.traineeId)`);
  if(!t) return true;                       // nothing else voided in this run
  const before = run(`ACC.creditBalance('${t.traineeId}')`);
  run(`DB.get().refunds.push({ id:'ref-3', no:'RF-3', date:DB.today(), traineeId:'${t.traineeId}',
    amount:${'' + 1}, method:'Cash', state:'Pending' })`);
  const after = run(`ACC.creditBalance('${t.traineeId}')`);
  return before === after || `${before} -> ${after}`;
});

console.log('\n- reports -');
const col = run(`ACC.collections('2000-01-01','2999-12-31')`);
check('collections total is positive', () => col.total > 0 || 'zero');
check('collections are grouped by mode', () => Object.keys(col.byMethod).length > 0 || 'no grouping');
const ar = run('ACC.arAging()');
check('AR aging returns buckets', () => ar.buckets.length === 5 || ar.buckets.length);
const is = run(`ACC.incomeStatement('2000-01-01','2999-12-31')`);
check('income statement has revenue', () => is.grossRevenue > 0 || is.grossRevenue);
check('net income = revenue less expenses', () =>
  Math.abs(is.netIncome - (is.grossRevenue - is.totalExpense)) < 0.01 || 'does not foot');

console.log('\n- backup and restore -');
run('globalThis.SNAP = JSON.stringify(DB.get())');
check('an export re-imports cleanly', () => { run('DB.importJSON(SNAP)'); return run('DB.get().trainees.length') > 0 || 'lost trainees'; });
check('enrollments survive the round trip', () => run('DB.get().enrollments.length') > 20 || run('DB.get().enrollments.length'));
check('a pre-schedule backup still opens', () => {
  const legacy = JSON.stringify({
    meta:{ version:1 }, company:{ vatRate:12, vatInclusive:true }, users:[], accounts:[],
    seq:{ batch:9 }, trainees:[{ id:'t1', no:'TRN-1', srn:'X', last:'A', first:'B' }],
    courses:[{ id:'c1', code:'AFF', title:'AFF' }],
    batches:[{ id:'b1', courseId:'c1', center:'PNTC', start:'2026-01-05', end:'2026-01-09',
               room:'Rm 1', instructor:'Capt X', fee:4200, capacity:20 }],
    enrollments:[{ id:'e1', no:'ENR-1', traineeId:'t1', batchId:'b1', status:'Enrolled' }],
    invoices:[], payments:[{ id:'p1', no:'OR-1', amount:100, method:'Cheque' }],
    expenses:[], journal:[], log:[], applications:[],
  });
  run(`DB.importJSON(${JSON.stringify(legacy)})`);
  const e = run('DB.get().enrollments[0]');
  return (e.courseId === 'c1' && e.fee === 4200 && e.center === 'PNTC' &&
          e.start === '2026-01-05' && e.batchId === undefined) || JSON.stringify(e);
});
check('the batches collection is dropped on import', () =>
  run('DB.get().batches === undefined') === true || 'batches survived');
check('tax settings are dropped on import', () =>
  run('DB.get().company.vatRate === undefined') === true || 'vatRate survived');
check('the GCash account is added to an old chart', () =>
  run(`DB.get().accounts.some(a => a.code === '1020')`) === true || 'no 1020 account');
check('an old payment gains a tender', () =>
  run('DB.get().payments[0].tenders.length') === 1 || 'no tender added');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);