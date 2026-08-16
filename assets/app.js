/* app.js — session, router and the eleven modules of the portal. */

/* ---------- session ---------- */
window.SESSION = null;
const state = { view:'dashboard', sub:'', q:{} };

/* Chargeable items the desk can add to a booking. The last three come straight
   out of the terms and conditions: a reschedule, a make-up class and a
   cancellation all cost the trainee money, so they have to be billable rather
   than settled in a chat thread. Editable under Settings. */
/* Fallback only — the real list is maintained by the admin under Settings and
   lives on the company profile. These three come out of the terms and
   conditions: a reschedule, a make-up class and a cancellation all cost the
   trainee money, so they have to be billable rather than settled in a chat. */
const DEFAULT_ADDONS = [
  { desc:'Rescheduling fee',  account:'4100', price:500 },
  { desc:'Make-up class fee', account:'4100', price:800 },
  { desc:'Cancellation fee',  account:'4100', price:500 },
];

const NAV = [
  { group:'Operations' },
  { id:'dashboard',   label:'Dashboard',    ico:'◈' },
  { id:'trainees',    label:'Trainees',     ico:'☺' },
  { id:'courses',     label:'Courses',      ico:'▤' },
  { id:'enrollments', label:'Enrollments',  ico:'✓' },
  { group:'Finance' },
  { id:'invoices',    label:'Billing',      ico:'₱' },
  { id:'payments',    label:'Collections',  ico:'◉' },
  { id:'expenses',    label:'Disbursements',ico:'▼' },
  { id:'ledger',      label:'General Ledger',ico:'≡' },
  { id:'reports',     label:'Reports',      ico:'▲' },
  { group:'System' },
  { id:'settings',    label:'Settings',     ico:'⚙' },
];

const TITLES = {
  dashboard:['Dashboard','Operational and financial position at a glance'],
  trainees:['Trainee Registry','Seafarer master records — search, register and enroll'],
  courses:['Course Catalogue','Courses, centers, amounts and rebates'],
  enrollments:['Enrollments','Bookings encoded per trainee, with billing status and results'],
  invoices:['Billing','Statements of account issued to trainees'],
  payments:['Collections','Official receipts and cash position'],
  expenses:['Disbursements','Vouchers for operating expenses'],
  ledger:['General Ledger','Journal entries and chart of accounts'],
  reports:['Reports','Financial statements and enrollment analytics'],
  settings:['Settings','Company profile, rates, users and data'],
};

/* ---------- lookups ---------- */
const D    = () => DB.get();
const T    = id => D().trainees.find(x => x.id === id);
const CRS  = id => D().courses.find(x => x.id === id);
const ENR  = id => D().enrollments.find(x => x.id === id);
const INV  = id => D().invoices.find(x => x.id === id);
const PAY  = id => D().payments.find(x => x.id === id);
/* Trainees and applications carry the same name fields, so one formatter serves both. */
const name = t => APPS.forName(t);

/* The Registrar replies on Facebook, so these are meant to be clicked. Applicants
   paste bare handles as often as full URLs, so add the scheme when it is missing.
   rel=noopener because the target is a stranger's link. */
function fbLink(v){
  const s = String(v || '').trim();
  if(!s) return '<span class="muted">—</span>';
  const href = /^https?:\/\//i.test(s) ? s : 'https://' + s.replace(/^\/+/, '');
  return `<a href="${UI.esc(href)}" target="_blank" rel="noopener noreferrer">${UI.esc(s)}</a>`;
}
const addons = () => D().company.addons || DEFAULT_ADDONS;
const can = v => SESSION && DB.PERMS[SESSION.role].includes(v);
const monthKey = d => (d || '').slice(0,7);
const firstOfMonth = () => new Date().toISOString().slice(0,8) + '01';
const startOfYear  = () => new Date().getFullYear() + '-01-01';

/* Overdue = unpaid balance and training has already started. */
function invStatus(inv){
  ACC.recomputeInvoice(inv);
  if(inv.voided) return 'Void';
  if(inv.status === 'Paid') return 'Paid';
  const e = ENR(inv.enrollmentId);
  if(e && e.start && e.start < DB.today()) return 'Overdue';
  return inv.status;
}
const invOf = enrId => D().invoices.find(i => i.enrollmentId === enrId && !i.voided);
function traineeBalance(tid){
  return ACC.r2(D().invoices.filter(i => i.traineeId === tid && !i.voided)
    .reduce((s,i) => s + ACC.balanceOf(ACC.recomputeInvoice(i)), 0));
}

/* ================= LOGIN ================= */
/* The sign-in list is rebuilt rather than written once: an account added in
   Settings has to be usable without reloading the page. */
function fillLoginList(){
  const sel = document.getElementById('loginUser');
  if(!sel) return;
  const keep = sel.value;
  sel.innerHTML = D().users.map(u => `<option value="${u.id}">${UI.esc(u.name)} — ${u.role}</option>`).join('');
  if(keep && D().users.some(u => u.id === keep)) sel.value = keep;
}

function initLogin(){
  const sel = document.getElementById('loginUser');
  fillLoginList();
  const go = () => {
    const u = D().users.find(x => x.id === sel.value);
    const pass = document.getElementById('loginPass').value.trim();
    if(!u) return;
    if(pass !== u.code) return UI.toast('Incorrect access code.', 'bad');
    window.SESSION = u;
    document.getElementById('login').classList.add('hidden');
    document.getElementById('shell').classList.remove('hidden');
    document.getElementById('userName').textContent = u.name;
    document.getElementById('userRole').textContent = u.role;
    document.getElementById('userAvatar').textContent = u.initials;
    DB.activity('Signed in'); DB.save();
    renderNav();
    location.hash = '#/dashboard';
    route();
  };
  document.getElementById('loginBtn').onclick = go;
  document.getElementById('loginPass').onkeydown = e => { if(e.key === 'Enter') go(); };
}

function renderNav(){
  const allowed = DB.PERMS[SESSION.role];
  let html = '';
  NAV.forEach(n => {
    if(n.group){ html += `<div class="nav-group">${n.group}</div>`; return; }
    if(!allowed.includes(n.id)) return;
    let badge = '';
    if(n.id === 'enrollments'){
      const c = D().enrollments.filter(e => e.status === 'Reserved').length;
      if(c) badge = `<span class="badge">${c}</span>`;
    }
    if(n.id === 'invoices'){
      const c = D().invoices.filter(i => !i.voided && invStatus(i) === 'Overdue').length;
      if(c) badge = `<span class="badge">${c}</span>`;
    }
    html += `<button class="nav-item" data-nav="${n.id}"><span class="ico">${n.ico}</span>${n.label}${badge}</button>`;
  });
  // Groups whose items were all filtered out shouldn't leave a dangling header.
  document.getElementById('nav').innerHTML = html.replace(/<div class="nav-group">[^<]*<\/div>(?=(<div class="nav-group">|$))/g, '');
  document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { location.hash = '#/' + b.dataset.nav; });
}

/* ================= ROUTER ================= */
function route(){
  if(!SESSION) return;
  const parts = (location.hash.replace('#/','') || 'dashboard').split('/');
  let view = parts[0];
  if(!can(view)){ view = DB.PERMS[SESSION.role][0]; location.hash = '#/' + view; }
  state.view = view; state.sub = parts[1] || '';
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === view));
  const [t,s] = TITLES[view] || ['',''];
  document.getElementById('pageTitle').textContent = t;
  document.getElementById('pageSub').textContent = s;
  render();
  window.scrollTo(0,0);
}

function render(){
  const fn = VIEWS[state.view];
  document.getElementById('view').innerHTML = fn ? fn() : '<div class="empty">Module not available.</div>';
  renderNav();
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === state.view));
}
const refresh = () => { DB.save(); render(); };

/* ================= VIEWS ================= */
const VIEWS = {};

/* ---------- Dashboard ----------
   Built for the two desks that use it. Everything on the top row answers a
   question about *today*, because that is what a registrar or a cashier
   actually needs to know: who did we enroll, who trains tomorrow, what came in,
   what went out, and what is in the drawer right now.

   The date box drives every figure on the page, so yesterday can be reviewed
   the same way today is watched. It defaults to today. */
VIEWS.dashboard = () => {
  const d = D();
  const on = state.q.day || DB.today();
  const tomorrow = (() => { const x = new Date(on); x.setDate(x.getDate() + 1); return x.toISOString().slice(0,10); })();
  const isToday = on === DB.today();

  /* --- enrollments encoded on the day --- */
  const enrolledToday = d.enrollments.filter(e => e.date === on);
  const billedToday = ACC.r2(enrolledToday.reduce((s,e) => { const i = invOf(e.id); return s + (i ? i.total : 0); }, 0));

  /* --- who is due to start training the next day --- */
  const startingTomorrow = d.enrollments
    .filter(e => e.start === tomorrow && ['Enrolled','Reserved'].includes(e.status))
    .sort((x,y) => String(x.center||'').localeCompare(String(y.center||'')));

  /* --- money in and money out, by the channel it moved through --- */
  const CHANNELS = ACC.methodNames();
  const received = {}; CHANNELS.forEach(m => received[m] = 0);
  let receivedTotal = 0, receiptCount = 0;
  d.payments.filter(p => !p.voided && p.date === on).forEach(p => {
    receiptCount++;
    (p.tenders && p.tenders.length ? p.tenders : [{ method:p.method, amount:p.amount }]).forEach(t => {
      const m = CHANNELS.includes(t.method) ? t.method : CHANNELS[CHANNELS.length-1];
      received[m] = ACC.r2(received[m] + t.amount);
      receivedTotal = ACC.r2(receivedTotal + t.amount);
    });
  });

  const paidOut = {}; CHANNELS.forEach(m => paidOut[m] = 0);
  let paidTotal = 0, voucherCount = 0;
  d.expenses.filter(v => v.date === on).forEach(v => {
    voucherCount++;
    const m = CHANNELS.includes(v.method) ? v.method : CHANNELS[CHANNELS.length-1];
    paidOut[m] = ACC.r2(paidOut[m] + v.amount);
    paidTotal = ACC.r2(paidTotal + v.amount);
  });

  /* --- what is in the drawer, as of the day being viewed --- */
  const tb = ACC.trialBalance(on);
  const bal = code => { const r = tb.rows.find(x => x.code === code); return r ? r.balance : 0; };
  /* Cash on hand is whatever the first mode's account holds — the drawer — and
     the rest are shown beside it so the till is never read in isolation. */
  const drawer = ACC.methods()[0] || { account:'1000' };
  const cashOnHand = bal(drawer.account);
  const otherPots = ACC.methods().slice(1)
    .map(m => `${m.name} ${UI.shortMoney(bal(m.account))}`).join(' · ');

  const channelRows = CHANNELS.map(m => ({
    label:m, inAmt:received[m], outAmt:paidOut[m], net:ACC.r2(received[m] - paidOut[m]),
  }));

  return `
    <div class="toolbar" style="margin-bottom:16px">
      <label class="fld" style="margin:0">
        <span>Showing figures for</span>
        <input type="date" data-q="day" value="${on}" max="${DB.today()}">
      </label>
      <span class="muted">${isToday ? 'Today' : 'As of ' + UI.date(on)}</span>
    </div>

    <div class="grid g4" style="margin-bottom:18px">
      ${UI.kpi('Enrollments ' + (isToday ? 'Today' : 'That Day'), UI.int(enrolledToday.length),
               billedToday ? UI.peso(billedToday) + ' billed' : 'nothing billed yet', 'sea')}
      ${UI.kpi('Training Starts Tomorrow', UI.int(startingTomorrow.length),
               startingTomorrow.length ? 'confirm attendance today' : 'nobody starting',
               startingTomorrow.length ? 'warn' : '')}
      ${UI.kpi('Amount Received', UI.peso(receivedTotal),
               `${receiptCount} official receipt(s)`, 'ok')}
      ${UI.kpi('Cash on Hand', UI.peso(cashOnHand),
               otherPots,
               cashOnHand < 0 ? 'bad' : '')}
    </div>

    <div class="grid g2" style="margin-bottom:18px">
      ${UI.card('Money by channel', UI.table([
        { h:'Channel', k:r => `<b>${UI.esc(r.label)}</b>` },
        { h:'Received', k:r => UI.num(r.inAmt), cls:'num' },
        { h:'Disbursed', k:r => UI.num(r.outAmt), cls:'num' },
        { h:'Net', k:r => UI.num(r.net), cls:'num' },
      ], channelRows, { empty:'No movement.',
          foot:['TOTAL', UI.num(receivedTotal), UI.num(paidTotal), UI.num(ACC.r2(receivedTotal - paidTotal))] }),
        { flush:true, sub:`${receiptCount} receipt(s) in · ${voucherCount} voucher(s) out` })}

      ${UI.card('Training starting tomorrow', UI.table([
        { h:'Trainee', k:e => { const t = T(e.traineeId); return t
            ? `<b>${UI.esc(name(t))}</b><br><span class="muted" style="font-size:11.5px">${UI.esc(t.mobile||'')}</span>`
            : '—'; } },
        { h:'Course', k:e => { const c = CRS(e.courseId); return c ? UI.esc(c.title) : '—'; } },
        { h:'Center', k:e => UI.esc(e.center || '—') },
        { h:'Balance', k:e => { const i = invOf(e.id); if(!i) return '<span class="muted">not billed</span>';
            const due = ACC.balanceOf(ACC.recomputeInvoice(i));
            return due > 0 ? UI.num(due) : 'settled'; }, cls:'num' },
      ], startingTomorrow, { empty:'Nobody starts tomorrow.', rowClass:'clickable',
          rowAttr:e => `data-act="view-enrollment" data-id="${e.id}"` }),
        { flush:true, sub:UI.date(tomorrow) })}
    </div>

    ${UI.card('Recent activity', UI.table([
      { h:'When', k:l => UI.esc(new Date(l.ts).toLocaleString('en-PH',{ month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })), w:'170px' },
      { h:'User', k:'user', w:'150px' },
      { h:'Action', k:'action' },
      { h:'Reference', k:l => `<span class="mono">${UI.esc(l.ref)}</span>` },
    ], d.log.slice(0,8), { empty:'No activity recorded yet.' }), { flush:true })}
  `;
};

/* ---------- Trainees ----------
   The list opens on one day, not on the whole registry. The desk works today's
   sign-ups; a registry that grows without bound is not a working list.

   Searching overrides the date. Somebody looking for a name needs to find them
   whenever they signed up, and a search that silently only looked at today
   would report "not found" for a trainee who is plainly on file. */
VIEWS.trainees = () => {
  const q = (state.q.trainee || '').toLowerCase().trim();
  const day = state.q.tday || DB.today();
  const all = D().trainees;

  const matches = t => [t.no,t.last,t.first,t.srn,t.rank,t.agency,t.mobile]
    .join(' ').toLowerCase().includes(q);
  const rows = q ? all.filter(matches) : all.filter(t => t.registered === day);
  const isToday = day === DB.today();

  return `
    <div class="toolbar">
      <input type="search" data-q="trainee" value="${UI.esc(state.q.trainee||'')}"
             placeholder="Search name, SRN, company or mobile…" style="min-width:280px">
      <label class="fld" style="margin:0">
        <span>Signed up on</span>
        <input type="date" data-q="tday" value="${day}" max="${DB.today()}" ${q ? 'disabled' : ''}>
      </label>
      <span class="muted">${q
        ? `${rows.length} match(es) across all ${all.length} record(s)`
        : `${rows.length} signed up ${isToday ? 'today' : 'on ' + UI.date(day)}`}</span>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="new-trainee">+ Register trainee</button>
    </div>
    ${UI.card('', UI.table([
      { h:'Trainee No.', k:t => `<span class="mono">${UI.esc(t.no)}</span>`, w:'130px' },
      { h:'Name', k:t => `<b>${UI.esc(name(t))}</b>` },
      { h:'SRN', k:t => `<span class="mono">${UI.esc(t.srn)}</span>` },
      { h:'Mobile', k:'mobile' },
      { h:'Signed up', k:t => UI.date(t.registered) },
      { h:'Courses', k:t => UI.int(D().enrollments.filter(e => e.traineeId === t.id).length), cls:'num' },
      { h:'Balance', k:t => { const b = traineeBalance(t.id);
          return b > 0 ? `<b style="color:var(--bad)">${UI.peso(b)}</b>` : `<span class="muted">—</span>`; }, cls:'num' },
      { h:'', k:t => `<button class="btn btn-accent btn-xs" data-act="enroll-trainee" data-id="${t.id}">Enroll</button>`, w:'90px' },
    ], rows, { empty: q
        ? 'Nobody matches that search.'
        : `Nobody signed up ${isToday ? 'today' : 'on ' + UI.date(day)}. Type a name above to search the whole registry.`,
        rowClass:'clickable',
        rowAttrs:t => `data-act="view-trainee" data-id="${t.id}"` }), { flush:true })}
  `;
};

/* ---------- Courses ----------
   The admin's price list, not a brochure. One row is a course as it is sold:
   the code the office uses for it, how long it runs, how it is delivered, which
   partner center runs it, what it costs and what the rebate on it is.

   "Deduct" decides what we remit to the center, never what the trainee is
   charged. Deducted, the rebate comes off the payable; not deducted, we pay the
   full fee and the center settles the rebate separately. Getting that switch
   wrong misstates what we owe a partner, so it is a column, not a footnote. */
VIEWS.courses = () => {
  const q = (state.q.crs || '').toLowerCase();
  const all = D().courses;
  const rows = all.filter(c => !q ||
    [c.code, c.title, c.center, c.duration, ...(c.modes||[])].join(' ').toLowerCase().includes(q));
  const admin = can('settings');

  return `
    <div class="toolbar">
      <input type="search" data-q="crs" value="${UI.esc(state.q.crs||'')}"
             placeholder="Search course, code, center or delivery…" style="min-width:300px">
      <span class="muted">${rows.length} of ${all.length} course(s)</span>
      <span class="spacer"></span>
      ${admin ? `<button class="btn btn-primary btn-sm" data-act="new-course">+ Add course</button>` : ''}
    </div>
    ${UI.card('', UI.table([
      { h:'Course ID', k:c => `<b class="mono">${UI.esc(c.code)}</b>`, w:'100px' },
      { h:'Course Title', k:c => UI.esc(c.title.toUpperCase())
          + ((c.options||[]).length
              ? ` <span class="muted" style="font-size:11.5px">${UI.esc(c.options.join(' · ').toUpperCase())}</span>`
              : '') },
      { h:'Duration', k:c => UI.esc((c.duration || '—').toUpperCase()), w:'110px' },
      { h:'Mode of Learning', k:c => (c.modes||[]).length
          ? (c.modes||[]).map(m => UI.tag(m.toUpperCase(), 'info')).join(' ')
          : '<span class="muted">—</span>' },
      { h:'Training Center', k:c => UI.esc(c.center || '—') },
      { h:'Amount', k:c => c.amount ? UI.num(c.amount) : '<span class="muted">—</span>', cls:'num' },
      { h:'Rebate', k:c => c.rebate ? UI.num(c.rebate) : '<span class="muted">—</span>', cls:'num' },
      { h:'Rebate treatment', k:c => c.rebate
          ? (c.deduct ? UI.tag('DEDUCT','warn') : UI.tag('DO NOT DEDUCT','ok'))
          : '<span class="muted">—</span>' },
      { h:'', k:c => admin
          ? `<button class="btn btn-ghost btn-xs" data-act="edit-course" data-id="${c.id}">Edit</button>`
          : '', w:'70px' },
    ], rows, { empty:'No course matches that search.' }), { flush:true })}
  `;
};

/* ---------- Enrollments ---------- */
VIEWS.enrollments = () => {
  const q = (state.q.enr || '').toLowerCase(), f = state.q.enrStatus || '';
  const rows = D().enrollments.filter(e => {
    if(f && e.status !== f) return false;
    if(!q) return true;
    const t = T(e.traineeId), c = CRS(e.courseId);
    return [e.no, name(t), t?.srn, c?.code, c?.title, e.center].join(' ').toLowerCase().includes(q);
  }).sort((a,b) => b.date.localeCompare(a.date));

  const billed = ACC.r2(rows.reduce((s,e) => { const i = invOf(e.id); return s + (i ? i.total : 0); }, 0));
  const due    = ACC.r2(rows.reduce((s,e) => { const i = invOf(e.id); return s + (i ? ACC.balanceOf(ACC.recomputeInvoice(i)) : 0); }, 0));

  return `
    <div class="toolbar">
      <input type="search" data-q="enr" value="${UI.esc(state.q.enr||'')}" placeholder="Search trainee, SRN, course or center…" style="min-width:250px">
      <select data-q="enrStatus" style="min-width:150px">
        ${['','Reserved','Enrolled','Completed','Cancelled'].map(s =>
          `<option value="${s}" ${f===s?'selected':''}>${s||'All statuses'}</option>`).join('')}
      </select>
      <span class="muted">${rows.length} record(s) · billed ${UI.peso(billed)} · due ${UI.peso(due)}</span>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="new-enrollment">+ New enrollment</button>
    </div>
    ${UI.card('', UI.table([
      { h:'Enrollment No.', k:e => `<span class="mono">${UI.esc(e.no)}</span>`, w:'140px' },
      { h:'Trainee', k:e => `<b>${UI.esc(name(T(e.traineeId)))}</b>` },
      { h:'Course', k:e => UI.esc(CRS(e.courseId)?.code || '—'), w:'80px' },
      { h:'Training date', k:e => e.start
          ? `${UI.dateRange(e.start, e.end)}<br><span class="muted" style="font-size:11.5px">${UI.esc(e.center || '')}</span>`
          : '—' },
      { h:'Status', k:e => UI.statusTag(e.status) },
      { h:'Result', k:e => e.result ? UI.statusTag(e.result) : '<span class="muted">—</span>' },
      { h:'Net Fee', k:e => UI.peso(e.fee - (e.discount||0)), cls:'num' },
      { h:'Billing', k:e => { const i = invOf(e.id);
          return i ? `${UI.statusTag(invStatus(i))}<br><span class="muted mono" style="font-size:11px">${UI.esc(i.no)}</span>`
                   : `<span class="tag t-muted">Not billed</span>`; } },
      { h:'Balance', k:e => { const i = invOf(e.id); if(!i) return '<span class="muted">—</span>';
          const b = ACC.balanceOf(ACC.recomputeInvoice(i));
          return b > 0.004 ? `<b style="color:var(--bad)">${UI.peso(b)}</b>` : `<span style="color:var(--ok)">Settled</span>`; }, cls:'num' },
    ], rows, { empty:'No enrollments recorded.', rowClass:'clickable',
               rowAttrs:e => `data-act="view-enrollment" data-id="${e.id}"` }), { flush:true })}
  `;
};

/* ---------- Invoices ---------- */
VIEWS.invoices = () => {
  const q = (state.q.inv || '').toLowerCase(), f = state.q.invStatus || '';
  const rows = D().invoices.map(i => (ACC.recomputeInvoice(i), i)).filter(i => {
    if(f && invStatus(i) !== f) return false;
    if(!q) return true;
    return [i.no, name(T(i.traineeId))].join(' ').toLowerCase().includes(q);
  }).sort((a,b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));

  const tot  = ACC.r2(rows.filter(i=>!i.voided).reduce((s,i) => s + i.total, 0));
  const paid = ACC.r2(rows.filter(i=>!i.voided).reduce((s,i) => s + (i.paid||0), 0));

  return `
    <div class="toolbar">
      <input type="search" data-q="inv" value="${UI.esc(state.q.inv||'')}" placeholder="Search invoice no. or trainee…" style="min-width:250px">
      <select data-q="invStatus" style="min-width:150px">
        ${['','Unpaid','Partial','Paid','Overdue','Void'].map(s =>
          `<option value="${s}" ${f===s?'selected':''}>${s||'All statuses'}</option>`).join('')}
      </select>
      <span class="spacer"></span>
    </div>
    <div class="grid g4" style="margin-bottom:18px">
      ${UI.kpi('Invoices Shown', UI.int(rows.length), 'Matching current filter', '')}
      ${UI.kpi('Total Billed', UI.peso(tot), 'no tax applied', 'sea')}
      ${UI.kpi('Total Collected', UI.peso(paid), 'Applied to these invoices', 'ok')}
      ${UI.kpi('Outstanding', UI.peso(ACC.r2(tot - paid)), 'Still collectible', tot-paid>0?'warn':'ok')}
    </div>
    ${UI.card('', UI.table([
      { h:'Invoice No.', k:i => `<b class="mono">${UI.esc(i.no)}</b>`, w:'135px' },
      { h:'Date', k:i => UI.date(i.date), w:'115px' },
      { h:'Trainee', k:i => UI.esc(name(T(i.traineeId))) },
      { h:'Particulars', k:i => UI.esc(i.items.map(x => x.desc).join(', ')) },
      { h:'Total', k:i => `<b>${UI.peso(i.total)}</b>`, cls:'num' },
      { h:'Paid', k:i => UI.num(i.paid||0), cls:'num' },
      { h:'Balance', k:i => { const b = ACC.balanceOf(i);
          return i.voided ? '<span class="muted">—</span>' : (b > 0.004 ? `<b style="color:var(--bad)">${UI.num(b)}</b>` : `<span style="color:var(--ok)">0.00</span>`); }, cls:'num' },
      { h:'Status', k:i => UI.statusTag(invStatus(i)) },
    ], rows, { empty:'No invoices found.', rowClass:'clickable',
               rowAttrs:i => `data-act="view-invoice" data-id="${i.id}"` }), { flush:true })}
  `;
};

/* ---------- Payments ---------- */
VIEWS.payments = () => {
  const q = (state.q.pay || '').toLowerCase();
  const from = state.q.payFrom || firstOfMonth(), to = state.q.payTo || DB.today();
  const rows = D().payments.filter(p => p.date >= from && p.date <= to)
    .filter(p => !q || [p.no, name(T(p.traineeId)), p.ref, p.method].join(' ').toLowerCase().includes(q))
    .sort((a,b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));

  const col = ACC.collections(from, to);
  const methods = Object.entries(col.byMethod).map(([m,v],i) =>
    ({ label:m, value:v, color:['#1d4571','#0f7b8a','#c9a227','#12805c','#7a8aa3'][i%5] }));

  return `
    <div class="toolbar">
      <input type="search" data-q="pay" value="${UI.esc(state.q.pay||'')}" placeholder="Search OR no. or trainee…" style="min-width:230px">
      <label class="muted" style="font-size:12px">From</label><input type="date" data-q="payFrom" value="${from}">
      <label class="muted" style="font-size:12px">To</label><input type="date" data-q="payTo" value="${to}">
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="new-payment">+ Record collection</button>
    </div>
    <div class="grid g-2-1">
      <div>${UI.card('', UI.table([
        { h:'OR No.', k:p => `<b class="mono">${UI.esc(p.no)}</b>`, w:'130px' },
        { h:'Date', k:p => UI.date(p.date), w:'115px' },
        { h:'Received from', k:p => UI.esc(name(T(p.traineeId))) },
        { h:'Applied to', k:p => { const i = INV(p.invoiceId); return i ? `<span class="mono">${UI.esc(i.no)}</span>` : '—'; }, w:'135px' },
        { h:'Mode', k:p => (p.tenders && p.tenders.length > 1)
            ? p.tenders.map(t => UI.tag(t.method, t.method==='Cash'?'ok':'sea')).join(' ')
            : UI.tag(p.method, p.method==='Cash'?'ok':'sea') },
        { h:'Reference', k:p => `<span class="mono">${UI.esc(p.ref||'—')}</span>` },
        { h:'Amount', k:p => p.voided ? `<s class="muted">${UI.num(p.amount)}</s>` : `<b>${UI.peso(p.amount)}</b>`, cls:'num' },
        { h:'', k:p => p.voided ? UI.tag('Void','muted') : '' },
      ], rows, { empty:'No collections in this period.', rowClass:'clickable',
                 rowAttrs:p => `data-act="view-receipt" data-id="${p.id}"` }), { flush:true })}</div>
      <div>
        ${UI.card('Collections this period', `
          <div class="kpi" style="border:none;box-shadow:none;padding:0;margin-bottom:14px">
            <div class="lbl">Total received</div><div class="val">${UI.peso(col.total)}</div>
            <div class="sub">${col.rows.length} official receipt(s)</div></div>
          <div class="hr"></div>
          ${UI.donut(methods, { money:true, center:'BY MODE' })}`)}
        ${UI.card('Cash position', (() => {
          const tb = ACC.trialBalance(DB.today());
          const g = c => (tb.rows.find(r => r.code === c) || { balance:0 }).balance;
          return `<dl class="def">
            <dt>Cash on hand</dt><dd class="mono">${UI.peso(g('1000'))}</dd>
            <dt>Cash in bank</dt><dd class="mono">${UI.peso(g('1010'))}</dd>
            <dt>Receivables</dt><dd class="mono">${UI.peso(g('1200'))}</dd>
          </dl>`;
        })())}
      </div>
    </div>`;
};

/* ---------- Expenses ---------- */
VIEWS.expenses = () => {
  const from = state.q.expFrom || startOfYear(), to = state.q.expTo || DB.today();
  const rows = D().expenses.filter(v => v.date >= from && v.date <= to)
    .sort((a,b) => b.date.localeCompare(a.date));
  const total = ACC.r2(rows.reduce((s,v) => s + v.amount, 0));
  const byAcct = {};
  rows.forEach(v => byAcct[v.account] = ACC.r2((byAcct[v.account]||0) + v.amount));

  return `
    <div class="toolbar">
      <label class="muted" style="font-size:12px">From</label><input type="date" data-q="expFrom" value="${from}">
      <label class="muted" style="font-size:12px">To</label><input type="date" data-q="expTo" value="${to}">
      <span class="muted">${rows.length} voucher(s) · ${UI.peso(total)}</span>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="new-expense">+ New disbursement</button>
    </div>
    <div class="grid g-2-1">
      <div>${UI.card('', UI.table([
        { h:'Voucher No.', k:v => `<b class="mono">${UI.esc(v.no)}</b>`, w:'135px' },
        { h:'Date', k:v => UI.date(v.date), w:'115px' },
        { h:'Payee', k:'payee' },
        { h:'Particulars', k:'particulars' },
        { h:'Account', k:v => `<span class="mono">${UI.esc(v.account)}</span> ${UI.esc(ACC.acct(v.account).name)}` },
        { h:'Mode', k:v => UI.tag(v.method, v.method==='Cash'?'ok':'sea') },
        { h:'Amount', k:v => `<b>${UI.peso(v.amount)}</b>`, cls:'num' },
      ], rows, { empty:'No disbursements in this period.' }), { flush:true })}</div>
      <div>${UI.card('Expenses by account',
        UI.barChart(Object.entries(byAcct).map(([c,v]) => ({ label:ACC.acct(c).name, value:v }))
          .sort((a,b) => b.value - a.value), { money:true }))}</div>
    </div>`;
};

/* ---------- General ledger ---------- */
VIEWS.ledger = () => {
  const tab = state.sub || 'journal';
  const tabs = [['journal','Journal'],['coa','Chart of Accounts'],['account','Account Ledger']];
  const nav = `<div class="toolbar">${tabs.map(([id,l]) =>
      `<button class="btn ${tab===id?'btn-primary':'btn-ghost'} btn-sm" data-act="ledger-tab" data-id="${id}">${l}</button>`).join('')}
      <span class="spacer"></span>
      ${can('settings') ? `<button class="btn btn-brass btn-sm" data-act="new-journal">+ Manual journal entry</button>` : ''}
    </div>`;

  if(tab === 'coa'){
    const tb = ACC.trialBalance(DB.today());
    return nav + UI.card('Chart of accounts — balances as of ' + UI.date(DB.today()), UI.table([
      { h:'Code', k:a => `<b class="mono">${UI.esc(a.code)}</b>`, w:'80px' },
      { h:'Account Name', k:'name' },
      { h:'Type', k:a => UI.tag(a.type, { Asset:'sea', Liability:'warn', Equity:'info', Revenue:'ok', Expense:'bad' }[a.type] || 'muted') },
      { h:'Normal Balance', k:a => UI.esc(a.nature === 'debit' ? 'Debit' : 'Credit') },
      { h:'Total Debits', k:a => UI.num((tb.rows.find(r=>r.code===a.code)||{}).drTotal || 0), cls:'num' },
      { h:'Total Credits', k:a => UI.num((tb.rows.find(r=>r.code===a.code)||{}).crTotal || 0), cls:'num' },
      { h:'Balance', k:a => { const b = (tb.rows.find(r=>r.code===a.code)||{}).balance || 0;
          return `<b>${UI.num(b)}</b>`; }, cls:'num' },
      { h:'', k:a => `<button class="btn btn-ghost btn-xs" data-act="acct-ledger" data-id="${a.code}">Ledger</button>` },
    ], D().accounts), { flush:true });
  }

  if(tab === 'account'){
    const code = state.q.acct || '1200';
    const from = state.q.ledFrom || startOfYear(), to = state.q.ledTo || DB.today();
    const rows = ACC.ledgerFor(code, from, to);
    const a = ACC.acct(code);
    return nav + `
      <div class="toolbar">
        <select data-q="acct" style="min-width:280px">
          ${D().accounts.map(x => `<option value="${x.code}" ${x.code===code?'selected':''}>${UI.esc(x.code)} — ${UI.esc(x.name)}</option>`).join('')}
        </select>
        <label class="muted" style="font-size:12px">From</label><input type="date" data-q="ledFrom" value="${from}">
        <label class="muted" style="font-size:12px">To</label><input type="date" data-q="ledTo" value="${to}">
      </div>
      ${UI.card(`${a.code} — ${a.name}`, UI.table([
        { h:'Date', k:r => UI.date(r.date), w:'115px' },
        { h:'JE No.', k:r => `<span class="mono">${UI.esc(r.no)}</span>`, w:'120px' },
        { h:'Reference', k:r => `<span class="mono">${UI.esc(r.ref||'—')}</span>`, w:'130px' },
        { h:'Particulars', k:'memo' },
        { h:'Debit', k:r => r.debit ? UI.num(r.debit) : '', cls:'num' },
        { h:'Credit', k:r => r.credit ? UI.num(r.credit) : '', cls:'num' },
        { h:'Running Balance', k:r => `<b>${UI.num(r.running)}</b>`, cls:'num' },
      ], rows, { empty:'No movement on this account for the period.' }), { flush:true, sub:`Normal balance: ${a.nature}` })}`;
  }

  const from = state.q.jFrom || startOfYear(), to = state.q.jTo || DB.today();
  const entries = D().journal.filter(j => j.date >= from && j.date <= to)
    .sort((a,b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));

  const body = entries.length ? `<div class="table-wrap"><table>
      <thead><tr><th style="width:115px">Date</th><th style="width:120px">JE No.</th><th>Particulars</th>
        <th style="width:100px">Account</th><th class="num" style="width:120px">Debit</th><th class="num" style="width:120px">Credit</th></tr></thead>
      <tbody>${entries.map(j => j.lines.map((l,idx) => `
        <tr style="${idx===0?'border-top:2px solid var(--border-strong)':''}">
          ${idx===0 ? `<td rowspan="${j.lines.length}">${UI.date(j.date)}</td>
                       <td rowspan="${j.lines.length}"><b class="mono">${UI.esc(j.no)}</b>${j.voided?'<br>'+UI.tag('Voided','muted'):''}</td>
                       <td rowspan="${j.lines.length}">${UI.esc(j.memo)}${j.refNo?`<br><span class="muted mono" style="font-size:11px">${UI.esc(j.refNo)}</span>`:''}</td>` : ''}
          <td><span class="mono">${UI.esc(l.account)}</span> <span class="muted">${UI.esc(ACC.acct(l.account).name)}</span></td>
          <td class="num">${l.debit ? UI.num(l.debit) : ''}</td>
          <td class="num">${l.credit ? UI.num(l.credit) : ''}</td>
        </tr>`).join('')).join('')}</tbody>
      <tfoot><tr><td colspan="4">TOTAL — ${entries.length} entries</td>
        <td class="num">${UI.num(entries.reduce((s,j)=>s+j.debit,0))}</td>
        <td class="num">${UI.num(entries.reduce((s,j)=>s+j.credit,0))}</td></tr></tfoot>
    </table></div>` : '<div class="empty">No journal entries in this period.</div>';

  return nav + `
    <div class="toolbar">
      <label class="muted" style="font-size:12px">From</label><input type="date" data-q="jFrom" value="${from}">
      <label class="muted" style="font-size:12px">To</label><input type="date" data-q="jTo" value="${to}">
      <span class="muted">Every posting is generated automatically from a source document.</span>
    </div>
    ${UI.card('', body, { flush:true })}`;
};

/* ---------- Reports ---------- */
VIEWS.reports = () => {
  const tab = state.sub || 'tb';
  const tabs = [['tb','Trial Balance'],['is','Income Statement'],['ar','AR Ageing'],
                ['col','Collections'],['rev','Revenue by Course'],['enr','Enrollment Statistics']];
  const from = state.q.rFrom || startOfYear(), to = state.q.rTo || DB.today();

  const nav = `<div class="toolbar">
      ${tabs.map(([id,l]) => `<button class="btn ${tab===id?'btn-primary':'btn-ghost'} btn-sm" data-act="rep-tab" data-id="${id}">${l}</button>`).join('')}
      <span class="spacer"></span>
      <label class="muted" style="font-size:12px">From</label><input type="date" data-q="rFrom" value="${from}">
      <label class="muted" style="font-size:12px">To</label><input type="date" data-q="rTo" value="${to}">
      <button class="btn btn-ghost btn-sm" data-act="print">Print</button>
    </div>`;

  const head = (title, period) => `<div class="doc-head" style="border:none;padding:0;margin-bottom:14px">
      <div><h2>${UI.esc(D().company.name)}</h2><div class="co">${UI.esc(D().company.address)}<br>TIN ${UI.esc(D().company.tin)}</div></div>
      <div class="doc-title"><div class="t">${UI.esc(title)}</div><div class="muted" style="font-size:12px">${UI.esc(period)}</div></div>
    </div>`;

  if(tab === 'tb'){
    const tb = ACC.trialBalance(to);
    const balanced = Math.abs(tb.totalDr - tb.totalCr) < 0.01;
    return nav + UI.card('', head('TRIAL BALANCE', 'As of ' + UI.date(to)) +
      (balanced ? `<div class="note"><b>In balance.</b> Total debits equal total credits — ${UI.peso(tb.totalDr)}.</div>`
                : `<div class="note bad"><b>Out of balance</b> by ${UI.peso(Math.abs(tb.totalDr-tb.totalCr))}. Review the journal.</div>`) +
      UI.table([
        { h:'Code', k:r => `<span class="mono">${UI.esc(r.code)}</span>`, w:'80px' },
        { h:'Account', k:'name' },
        { h:'Type', k:'type', w:'110px' },
        { h:'Debit', k:r => r.dr ? UI.num(r.dr) : '', cls:'num' },
        { h:'Credit', k:r => r.cr ? UI.num(r.cr) : '', cls:'num' },
      ], tb.rows, { empty:'No postings yet.',
                    foot:['','TOTAL','', UI.num(tb.totalDr), UI.num(tb.totalCr)] }));
  }

  if(tab === 'is'){
    const is = ACC.incomeStatement(from, to);
    const fmt  = v => v < 0 ? `(${UI.num(Math.abs(v))})` : UI.num(v);   // accountants read brackets, not minus signs
    const line = (l,v,bold) => `<tr><td style="${bold?'font-weight:700':''}">${UI.esc(l)}</td><td class="num" style="${bold?'font-weight:700;border-top:1px solid var(--border-strong)':''}">${fmt(v)}</td></tr>`;
    return nav + UI.card('', head('STATEMENT OF INCOME', `${UI.date(from)} to ${UI.date(to)}`) + `
      <div class="table-wrap"><table>
        <thead><tr><th>Particulars</th><th class="num" style="width:180px">Amount</th></tr></thead>
        <tbody>
          <tr><td colspan="2" style="font-weight:700;background:var(--surface-2)">REVENUE</td></tr>
          ${is.revenue.map(a => line('   ' + a.name, a.amount)).join('') || '<tr><td colspan="2" class="muted">   No revenue in period</td></tr>'}
          ${line('NET REVENUE', is.grossRevenue, true)}
          <tr><td colspan="2" style="font-weight:700;background:var(--surface-2)">OPERATING EXPENSES</td></tr>
          ${is.expenses.map(a => line('   ' + a.name, a.amount)).join('') || '<tr><td colspan="2" class="muted">   No expenses in period</td></tr>'}
          ${line('TOTAL OPERATING EXPENSES', is.totalExpense, true)}
        </tbody>
        <tfoot><tr><td>NET INCOME ${is.netIncome < 0 ? '(LOSS)' : ''}</td>
          <td class="num" style="color:${is.netIncome<0?'var(--bad)':'var(--ok)'}">${UI.peso(is.netIncome)}</td></tr></tfoot>
      </table></div>
      <p class="muted" style="font-size:12px;margin-top:12px">Revenue is shown net of discounts given. No VAT or other tax is applied. Prepared on a modified cash basis from posted journal entries.</p>`);
  }

  if(tab === 'ar'){
    const ag = ACC.arAging(to);
    const rows = ag.buckets.flatMap(b => b.rows.map(r => ({ ...r, bucket:b.label })));
    return nav + UI.card('', head('AGEING OF RECEIVABLES', 'As of ' + UI.date(to)) + `
      <div class="grid g4" style="margin-bottom:18px">
        ${ag.buckets.map(b => UI.kpi(b.label, UI.peso(b.total), `${b.rows.length} invoice(s)`,
            b.label === 'Current' ? 'ok' : b.label === 'Over 90' ? 'bad' : 'warn')).join('')}
      </div>` +
      UI.table([
        { h:'Invoice', k:r => `<b class="mono">${UI.esc(r.inv.no)}</b>` },
        { h:'Date', k:r => UI.date(r.inv.date), w:'115px' },
        { h:'Trainee', k:r => UI.esc(name(T(r.inv.traineeId))) },
        { h:'Course', k:r => { const e = ENR(r.inv.enrollmentId); return UI.esc(e ? CRS(e.courseId)?.code : '—'); }, w:'80px' },
        { h:'Age (days)', k:r => UI.int(Math.max(r.age,0)), cls:'num' },
        { h:'Bucket', k:r => UI.tag(r.bucket, r.bucket==='Current'?'ok':r.bucket==='Over 90'?'bad':'warn') },
        { h:'Invoice Total', k:r => UI.num(r.inv.total), cls:'num' },
        { h:'Balance Due', k:r => `<b>${UI.num(r.bal)}</b>`, cls:'num' },
      ], rows.sort((a,b) => b.age - a.age), { empty:'Nothing outstanding — all invoices settled.',
        foot:['','','','','','TOTAL','', UI.num(ag.grand)] }));
  }

  if(tab === 'col'){
    const col = ACC.collections(from, to);
    const byDay = {};
    col.rows.forEach(p => byDay[p.date] = ACC.r2((byDay[p.date]||0) + p.amount));
    return nav + UI.card('', head('COLLECTION REPORT', `${UI.date(from)} to ${UI.date(to)}`) + `
      <div class="grid g3" style="margin-bottom:18px">
        ${UI.kpi('Total Collections', UI.peso(col.total), `${col.rows.length} official receipt(s)`, 'ok')}
        ${UI.kpi('Cash', UI.peso(col.byMethod['Cash']||0), 'Received at the window', '')}
        ${UI.kpi('Non-cash', UI.peso(ACC.r2(col.total-(col.byMethod['Cash']||0))), 'Bank, GCash, cheque', 'sea')}
      </div>` +
      UI.table([
        { h:'OR No.', k:p => `<b class="mono">${UI.esc(p.no)}</b>`, w:'130px' },
        { h:'Date', k:p => UI.date(p.date), w:'115px' },
        { h:'Received from', k:p => UI.esc(name(T(p.traineeId))) },
        { h:'Invoice', k:p => { const i = INV(p.invoiceId); return i ? `<span class="mono">${UI.esc(i.no)}</span>` : '—'; } },
        { h:'Mode', k:p => UI.esc(p.method) },
        { h:'Reference', k:p => UI.esc(p.ref||'—') },
        { h:'Amount', k:p => `<b>${UI.num(p.amount)}</b>`, cls:'num' },
      ], col.rows.sort((a,b) => a.date.localeCompare(b.date)), { empty:'No collections in this period.',
        foot:['','','','','','TOTAL', UI.num(col.total)] }));
  }

  if(tab === 'rev'){
    const map = {};
    D().invoices.filter(i => !i.voided && i.date >= from && i.date <= to).forEach(i => {
      const e = ENR(i.enrollmentId), c = e && CRS(e.courseId);
      const key = c ? c.code : 'Other';
      const m = map[key] || (map[key] = { code:key, title:c ? c.title : 'Unclassified', count:0, gross:0, net:0, collected:0 });
      m.count++; m.gross = ACC.r2(m.gross + i.total);
      m.collected = ACC.r2(m.collected + (i.paid||0));
    });
    const rows = Object.values(map).sort((a,b) => b.gross - a.gross);
    return nav + UI.card('', head('REVENUE BY COURSE', `${UI.date(from)} to ${UI.date(to)}`) +
      UI.barChart(rows.map(r => ({ label:r.code, value:r.gross })), { money:true }) + '<div class="hr"></div>' +
      UI.table([
        { h:'Code', k:r => `<b class="mono">${UI.esc(r.code)}</b>`, w:'90px' },
        { h:'Course', k:'title' },
        { h:'Invoices', k:r => UI.int(r.count), cls:'num' },
        { h:'Gross Billed', k:r => UI.num(r.gross), cls:'num' },
        { h:'Collected', k:r => UI.num(r.collected), cls:'num' },
        { h:'Uncollected', k:r => { const v = ACC.r2(r.gross - r.collected);
            return v > 0.004 ? `<b style="color:var(--bad)">${UI.num(v)}</b>` : '<span class="muted">—</span>'; }, cls:'num' },
      ], rows, { empty:'No billings in this period.',
        foot:['','TOTAL', UI.int(rows.reduce((s,r)=>s+r.count,0)), UI.num(rows.reduce((s,r)=>s+r.gross,0)),
              UI.num(rows.reduce((s,r)=>s+r.collected,0)),
              UI.num(rows.reduce((s,r)=>s+r.gross-r.collected,0))] }));
  }

  /* Enrollment statistics */
  const es = D().enrollments.filter(e => e.date >= from && e.date <= to);
  const byAgency = {}, byMonth = {}, byStatus = {};
  es.forEach(e => {
    const t = T(e.traineeId);
    byAgency[t ? t.agency : 'Unknown'] = (byAgency[t ? t.agency : 'Unknown']||0) + 1;
    byMonth[monthKey(e.date)] = (byMonth[monthKey(e.date)]||0) + 1;
    byStatus[e.status] = (byStatus[e.status]||0) + 1;
  });
  const passed = es.filter(e => e.result === 'Passed').length;
  const assessed = es.filter(e => e.result).length;
  return nav + UI.card('', head('ENROLLMENT STATISTICS', `${UI.date(from)} to ${UI.date(to)}`) + `
    <div class="grid g4" style="margin-bottom:18px">
      ${UI.kpi('Total Enrollments', UI.int(es.length), 'Within the period', '')}
      ${UI.kpi('Unique Trainees', UI.int(new Set(es.map(e => e.traineeId)).size), 'Head count', 'sea')}
      ${UI.kpi('Assessed', UI.int(assessed), `${passed} passed`, 'ok')}
      ${UI.kpi('Passing Rate', assessed ? Math.round(passed/assessed*100) + '%' : '—', 'Of assessed trainees', assessed && passed/assessed < .8 ? 'warn' : 'ok')}
    </div>
    <div class="grid g2">
      ${UI.card('By company', UI.barChart(Object.entries(byAgency).map(([l,v]) => ({ label:l, value:v })).sort((a,b) => b.value - a.value)))}
      ${UI.card('By month', UI.barChart(Object.entries(byMonth).sort().map(([l,v]) => ({ label:l, value:v }))))}
    </div>` +
    UI.table([
      { h:'Status', k:r => UI.statusTag(r[0]) },
      { h:'Count', k:r => UI.int(r[1]), cls:'num' },
      { h:'Share', k:r => es.length ? Math.round(r[1]/es.length*100) + '%' : '—', cls:'num' },
    ], Object.entries(byStatus), { empty:'No enrollments in this period.' }));
};

/* ---------- Settings ---------- */
VIEWS.settings = () => {
  const c = D().company, d = D();
  return `
    <div class="grid g2">
      ${UI.card('Company profile', `
        <form id="coForm">
          ${UI.f.text('name','Registered name', c.name, { req:true })}
          ${UI.f.area('address','Business address', c.address)}
          ${UI.row(UI.f.text('tin','TIN', c.tin), UI.f.text('contact','Contact details', c.contact))}
          ${UI.f.area('hours','Office hours', c.hours, { ph:'One line per row — shown in the public portal footer' })}
          ${UI.f.text('page','Page for screenshots', c.page, { hint:'where applicants send proof of submission', ph:'e.g. fb.com/tarabarkomaritime — blank shows “our page”' })}
          ${UI.f.area('requirements','Requirements to send in', c.requirements, { ph:'One per line — listed on the applicant’s acknowledgement' })}
          <div class="note">No VAT or other tax is applied to fees. The amount agreed
            with the trainee is the amount billed, collected and reported.</div>
          <button class="btn btn-primary" type="submit">Save company profile</button>
        </form>`)}
      <div>
        ${UI.card('User accounts', UI.table([
          { h:'Name', k:u => `<b>${UI.esc(u.name)}</b><br><span class="muted" style="font-size:11.5px">${UI.esc(u.email || 'no email on file')}</span>` },
          { h:'Role', k:u => UI.tag(u.role, 'info') },
          { h:'Modules', k:u => `<span class="muted">${DB.PERMS[u.role].length} of ${Object.keys(TITLES).length}</span>` },
          { h:'', k:u => `<button class="btn btn-ghost btn-xs" data-act="edit-user" data-id="${u.id}">Edit</button>`, w:'70px' },
        ], d.users, { empty:'No accounts.' }), { flush:true,
            actions:'<button class="btn btn-primary btn-xs" data-act="new-user">+ Add user</button>',
            sub:'Name, email, password and role' })}

        ${UI.card('Modes of payment', UI.table([
          { h:'Mode', k:m => `<b>${UI.esc(m.name)}</b>` },
          { h:'Posts to', k:m => { const a = ACC.acct(m.account);
              return `<span class="mono">${UI.esc(m.account)}</span> ${UI.esc(a.name || '')}`; } },
          { h:'Reference', k:m => m.ref ? UI.tag('required','warn') : '<span class="muted">not asked</span>' },
        ], ACC.methods(), { empty:'No modes configured.' }), { flush:true,
            actions:'<button class="btn btn-ghost btn-xs" data-act="edit-methods">Edit modes</button>',
            sub:'Offered at the collection window' })}

        ${UI.card('Charges', UI.table([
          { h:'Description', k:'desc' },
          { h:'Amount', k:a => UI.peso(a.price), cls:'num' },
        ], addons(), { empty:'No charges configured.' }), { flush:true,
            actions:'<button class="btn btn-ghost btn-xs" data-act="edit-addons">Edit charges</button>',
            sub:'Tick-boxes when billing a booking' })}

        ${UI.card('Courses', `
          <dl class="def">
            <dt>Course entries</dt><dd>${UI.int(d.courses.length)}</dd>
            <dt>Training centers</dt><dd>${UI.int(new Set(d.courses.map(c => c.center).filter(Boolean)).size)}</dd>
          </dl>
          <a class="btn btn-ghost btn-sm btn-block" href="#/courses">Open the course list</a>`)}

        ${UI.card('Data', `
          <dl class="def">
            <dt>Trainees</dt><dd>${UI.int(d.trainees.length)}</dd>
            <dt>Enrollments</dt><dd>${UI.int(d.enrollments.length)}</dd>
            <dt>Invoices</dt><dd>${UI.int(d.invoices.length)}</dd>
            <dt>Receipts</dt><dd>${UI.int(d.payments.length)}</dd>
            <dt>Journal entries</dt><dd>${UI.int(d.journal.length)}</dd>
            <dt>Storage</dt><dd>${(JSON.stringify(d).length/1024).toFixed(1)} KB in this browser</dd>
          </dl>
          <div class="note warn" style="margin:14px 0 10px">Records live in this browser's local storage. Download a backup regularly and keep it with your other business records.</div>
          <div class="chips">
            <button class="btn btn-ghost btn-sm" data-act="backup">Download backup</button>
            <button class="btn btn-ghost btn-sm" data-act="restore">Restore from file</button>
            <button class="btn btn-danger btn-sm" data-act="wipe">Erase all records</button>
          </div>`)}
      </div>
    </div>`;
};

/* ================= MODALS / ACTIONS ================= */

/* `onDone` gets the record that was just created, so the encode form can
   register a walk-in and carry straight on with their enrollment. Fired a
   tick late because UI.modal closes this dialog after onSubmit returns. */
function traineeForm(t, onDone){
  const isNew = !t;
  t = t || { srn:'', last:'', first:'', middle:'', suffix:'', sex:'M', birth:'', birthPlace:'',
             rank:'', agency:'', mobile:'', email:'',
             facebook:'', messenger:'', address:'',
             emergencyName:'', emergencyRelation:'', emergencyMobile:'', remarks:'' };
  const H = s => `<h4 style="margin:18px 0 8px;font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--tb-orange);border-bottom:2px solid var(--tb-orange-soft);padding-bottom:5px">${s}</h4>`;
  UI.modal({
    title: isNew ? 'Register trainee' : 'Edit trainee — ' + t.no,
    sub: 'Seafarer master record',
    wide:true,
    body: `
      ${H('Seafarer identity')}
      ${UI.f.text('srn','SRN', t.srn, { req:true, hint:"the seafarer's registration number" })}
      ${UI.row(UI.f.text('last','Last name', t.last, { req:true }),
               UI.f.text('first','First name', t.first, { req:true }),
               UI.f.text('middle','Middle name', t.middle))}
      ${H('Personal information')}
      ${UI.row(UI.f.select('suffix','Suffix', t.suffix, ['','Jr.','Sr.','II','III','IV','V']),
               UI.f.select('sex','Sex', t.sex, [{v:'M',l:'Male'},{v:'F',l:'Female'}]),
               UI.f.date('birth','Date of birth', t.birth, { req:true }))}
      ${UI.f.text('birthPlace','Place of birth', t.birthPlace, { ph:'City / municipality, province' })}
      ${H('Contact details')}
      ${UI.row(UI.f.text('mobile','Mobile no.', t.mobile, { req:true }),
               UI.f.text('email','Email', t.email))}
      ${UI.row(UI.f.text('facebook','Facebook profile link', t.facebook, { ph:'facebook.com/…' }),
               UI.f.text('messenger','Messenger / Meta chat link', t.messenger, { ph:'m.me/…' }))}
      ${UI.f.text('address','Home address', t.address)}
      ${H('Employment')}
      ${UI.row(UI.f.text('rank','Rank / position', t.rank, { ph:'e.g. Able Seaman' }),
               UI.f.text('agency','Company', t.agency, { hint:'manning agency or employer' }))}
      ${H('In case of emergency')}
      ${UI.row(UI.f.text('emergencyName','Contact person', t.emergencyName),
               UI.f.text('emergencyRelation','Relationship', t.emergencyRelation, { ph:'e.g. Spouse' }),
               UI.f.text('emergencyMobile','Contact number', t.emergencyMobile))}
      ${UI.f.area('remarks','Remarks', t.remarks)}`,
    submitLabel: isNew ? 'Register trainee' : 'Save changes',
    onSubmit: fd => {
      if(isNew){
        const rec = { id:DB.uid('trn'), no:DB.nextNo('trainee','TRN'), registered:DB.today(),
                      source:'Encoded at the desk', ...fd };
        D().trainees.push(rec);
        DB.activity('Registered trainee', rec.no);
        UI.toast('Trainee registered — ' + rec.no);
        if(onDone) setTimeout(() => onDone(rec), 0);
      }else{
        Object.assign(t, fd);
        DB.activity('Updated trainee', t.no);
        UI.toast('Trainee record updated.');
      }
      refresh();
    }
  });
}

/* The trainee's page, in the words the desk uses out loud. No document numbers
   we do not hold, no exam results we do not issue — the training center marks
   and certifies, we book and bill. */
function traineeProfile(t){
  const enr = D().enrollments.filter(e => e.traineeId === t.id).sort((a,b) => b.date.localeCompare(a.date));
  const invs = D().invoices.filter(i => i.traineeId === t.id).map(i => (ACC.recomputeInvoice(i), i));
  const pays = D().payments.filter(p => p.traineeId === t.id && !p.voided);
  const bal = traineeBalance(t.id);

  UI.modal({
    title: name(t), sub:`${t.no} · ${t.rank || 'No rank on file'} · ${t.agency || 'No company'}`, wide:true,
    hideSubmit:true,
    footExtra:`<button type="button" class="btn btn-ghost" id="editTrainee">Edit details</button>
               <button type="button" class="btn btn-accent" id="enrollHere">Book a course</button>`,
    body: `
      <div class="grid g2">
        <dl class="def">
          <dt>SRN</dt><dd class="mono"><b>${UI.esc(t.srn||'—')}</b></dd>
          <dt>Man or woman</dt><dd>${t.sex === 'F' ? 'Woman' : 'Man'}</dd>
          <dt>Birthday</dt><dd>${UI.date(t.birth)}</dd>
          <dt>Born in</dt><dd>${UI.esc(t.birthPlace||'—')}</dd>
          <dt>Signed up on</dt><dd>${UI.date(t.registered)}</dd>
        </dl>
        <dl class="def">
          <dt>Mobile number</dt><dd>${UI.esc(t.mobile||'—')}</dd>
          <dt>Email</dt><dd>${UI.esc(t.email||'—')}</dd>
          <dt>Facebook</dt><dd>${fbLink(t.facebook)}</dd>
          <dt>Home address</dt><dd>${UI.esc(t.address||'—')}</dd>
          <dt>Who to call in an emergency</dt>
            <dd>${UI.esc(t.emergencyName||'—')}${t.emergencyRelation ? ` <span class="muted">(${UI.esc(t.emergencyRelation)})</span>` : ''}
                ${t.emergencyMobile ? `<br><span class="mono">${UI.esc(t.emergencyMobile)}</span>` : ''}</dd>
        </dl>
      </div>
      <div class="hr"></div>
      <div class="grid g3" style="margin-bottom:16px">
        ${UI.kpi('Courses booked', UI.int(enr.length),
                 enr.length ? 'with us so far' : 'none yet', '')}
        ${UI.kpi('Total charged', UI.peso(invs.filter(i=>!i.voided).reduce((s,i)=>s+i.total,0)),
                 `${pays.length} payment(s) received`, 'sea')}
        ${UI.kpi('Still to pay', UI.peso(bal),
                 bal > 0 ? 'not yet settled' : 'fully paid', bal > 0 ? 'bad' : 'ok')}
      </div>
      <h4 style="margin:0 0 8px;font-size:13px">Courses booked</h4>
      ${UI.table([
        { h:'Course', k:e => UI.esc(CRS(e.courseId)?.title || '—') },
        { h:'Training center', k:e => UI.esc(e.center || '—') },
        { h:'When', k:e => e.start ? UI.dateRange(e.start, e.end) : '—' },
        { h:'Booking', k:e => UI.statusTag(e.status) },
        { h:'Paid?', k:e => { const i = invOf(e.id);
            if(!i) return '<span class="muted">not billed</span>';
            const due = ACC.balanceOf(ACC.recomputeInvoice(i));
            return due > 0.004 ? `<span class="neg">${UI.peso(due)} left</span>` : 'Paid'; } },
      ], enr, { empty:'No courses booked yet.' })}
      <div class="hr"></div>
      <h4 style="margin:0 0 8px;font-size:13px">Bills and payments</h4>
      ${UI.table([
        { h:'Bill no.', k:i => `<span class="mono">${UI.esc(i.no)}</span>` },
        { h:'Date', k:i => UI.date(i.date) },
        { h:'Charged', k:i => UI.num(i.total), cls:'num' },
        { h:'Paid', k:i => UI.num(i.paid||0), cls:'num' },
        { h:'Left to pay', k:i => i.voided ? '—' : UI.num(ACC.balanceOf(i)), cls:'num' },
        { h:'Status', k:i => UI.statusTag(invStatus(i)) },
      ], invs, { empty:'Nothing billed yet.' })}`
  });
  document.getElementById('editTrainee').onclick = () => traineeForm(t);
  document.getElementById('enrollHere').onclick = () => enrollmentForm(null, t.id);
  document.getElementById('editTrainee').onclick = () => traineeForm(t);
  document.getElementById('enrollHere').onclick = () => enrollmentForm(null, t.id);
}

function courseForm(c){
  const isNew = !c;
  c = c || { code:'', title:'', duration:'', days:null, center:'', amount:0, rebate:0,
             deduct:false, modes:['Face-to-Face'] };
  const centers = [...new Set([
    ...D().courses.map(x => x.center),
    ...D().enrollments.map(x => x.center),
  ].filter(Boolean))].sort();

  UI.modal({
    title: isNew ? 'Add course' : 'Edit course — ' + c.code,
    wide:true,
    body: `
      ${UI.row(UI.f.text('code','Course ID', c.code, { req:true, ph:'e.g. SCRB' }),
               UI.f.text('title','Course title', c.title, { req:true }))}
      ${UI.row(UI.f.num('days','Duration (days)', c.days, { step:'0.5', min:0 }),
               UI.f.text('duration','Duration as written', c.duration, { ph:'e.g. 5 days' }),
               UI.f.text('_spacer','', '', { attr:'style="visibility:hidden"' }))}

      <label class="fld"><span>Mode of learning</span></label>
      <div class="chips" style="margin:-8px 0 14px">
        ${DB.DELIVERY.map((m,i) => `<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;background:var(--surface-2);border:1px solid var(--border);padding:6px 10px;border-radius:7px;cursor:pointer">
            <input type="checkbox" name="mode${i}" style="width:auto;margin:0"
                   ${(c.modes||[]).includes(m) ? 'checked' : ''}> ${UI.esc(m.toUpperCase())}</label>`).join('')}
      </div>

      <div class="hr"></div>
      <h4 style="margin:0 0 8px;font-size:13px">Where it runs, and what it costs</h4>
      ${UI.row(UI.f.text('center','Training center', c.center, { attr:'list="courseCenters"',
                          hint:'partner running this course' }),
               UI.f.num('amount','Amount (₱)', c.amount, { min:0, hint:'price at this center' }))}
      <datalist id="courseCenters">${centers.map(x => `<option value="${UI.esc(x)}">`).join('')}</datalist>
      ${UI.row(UI.f.num('rebate','Rebate (₱)', c.rebate, { min:0, hint:'what the center gives back' }),
               UI.f.select('deduct','Rebate treatment', c.deduct ? '1' : '0',
                 [{ v:'0', l:'Do not deduct — we remit the full fee; the center settles the rebate separately' },
                  { v:'1', l:'Deduct — the rebate comes off what we remit to the center' }]))}
      <div class="note" id="rebateNote"></div>`,
    submitLabel: isNew ? 'Add course' : 'Save changes',
    footExtra: isNew ? '' :
      `<button type="button" class="btn btn-danger" id="delCourse">Delete course</button>`,
    onSubmit: fd => {
      const picked = DB.DELIVERY.filter((m,i) => fd['mode'+i]);
      DB.DELIVERY.forEach((m,i) => { delete fd['mode'+i]; });
      const rec = {
        code:(fd.code||'').trim(), title:(fd.title||'').trim(),
        days: fd.days ? +fd.days : null,
        duration:(fd.duration||'').trim(),
        /* Nothing ticked means face to face — the same default the catalogue
           import applies. A course with no delivery at all is not a thing. */
        modes: picked.length ? picked : ['Face-to-Face'],
        center:(fd.center||'').trim(),
        amount:ACC.r2(fd.amount), rebate:ACC.r2(fd.rebate),
        deduct: fd.deduct === '1',
      };
      if(rec.rebate > rec.amount){
        UI.toast('The rebate cannot exceed the fee — we would be remitting a negative amount.', 'bad');
        return false;
      }
      if(isNew){ D().courses.push({ id:DB.uid('crs'), ...rec }); DB.activity('Added course', rec.code); UI.toast('Course added.'); }
      else { Object.assign(c, rec); DB.activity('Updated course', c.code); UI.toast('Course updated.'); }
      refresh();
    }
  });

  /* Spell out what the trainee actually pays, because the rebate switch is the
     one field on this form that can quietly change a price. */
  const form = document.getElementById('mForm');
  const showRebate = () => {
    const amount = ACC.r2(form.amount.value), rebate = ACC.r2(form.rebate.value);
    const box = document.getElementById('rebateNote');
    if(!amount && !rebate){ box.innerHTML = 'Leave the amount blank if this course is priced per booking.'; return; }
    const s = ACC.centerSettlement({ fee:amount, rebate, deduct:form.deduct.value === '1' });
    box.innerHTML = `Trainee is billed <b>${UI.peso(amount)}</b> either way. `
      + (form.deduct.value === '1'
        ? `We remit <b>${UI.peso(s.payable)}</b> to the center — the ${UI.peso(rebate)} rebate is deducted from the payable.`
        : `We remit the full <b>${UI.peso(s.payable)}</b>; the ${UI.peso(rebate)} rebate stays receivable from the center.`);
  };
  form.addEventListener('input', showRebate);
  form.addEventListener('change', showRebate);
  showRebate();

  const del = document.getElementById('delCourse');
  if(del) del.onclick = () => {
    /* A course with bookings against it cannot be deleted without orphaning
       invoices and certificates that name it. Closing it hides it from the
       encode form and keeps the history readable. */
    const used = D().enrollments.filter(e => e.courseId === c.id).length;
    if(used){
      return UI.toast(`${c.code} has ${used} booking(s) against it and cannot be deleted.`, 'bad');
    }
    UI.confirm(`Delete ${c.code} — ${c.title}?`, () => {
      D().courses = D().courses.filter(x => x.id !== c.id);
      DB.activity('Deleted course', c.code);
      UI.close(); UI.toast('Course deleted.'); refresh();
    }, { danger:true, yes:'Delete course', detail:'Nothing is booked against it, so nothing else changes.' });
  };
}

/* Encode an enrollment: who, which course, which dates, at what price.
   There is no schedule to pick from — every booking is made for the trainee in
   front of you, so the date is typed rather than chosen from a list, and the fee
   is the amount agreed with them for that center. A trainee may be enrolled as
   many times as they come back; nothing here blocks a repeat. */
function enrollmentForm(existing, presetTrainee){
  const roster = D().trainees.slice().sort((a,b) => a.last.localeCompare(b.last));
  if(!roster.length){ UI.toast('Register the trainee first — the registry is empty.', 'bad'); return; }
  const active = D().courses;
  /* Which course-at-center pairs appear more than once, so only those labels
     have to carry the delivery. */
  const seenPair = {}, sameTwice = new Set();
  active.forEach(c => { const k = c.title + '@' + c.center;
    if(seenPair[k]) sameTwice.add(k); else seenPair[k] = 1; });

  const body = `
    ${UI.f.select('traineeId','Trainee', presetTrainee || '', roster
        .map(t => ({ v:t.id, l:`${name(t)} — ${t.no}${t.srn ? ' · ' + t.srn : ''}${t.agency ? ' · ' + t.agency : ''}` })),
        { req:true, blank:'— search or select trainee —' })}
    <p class="p-note-inline muted" style="margin:-6px 0 12px;font-size:12px">
      Not on the list? <a href="#" data-act="new-trainee-here">Register a new trainee</a> first.</p>

    <h4 style="margin:0 0 8px;font-size:13px">Course and training date</h4>
    ${UI.f.select('courseId','Course', '', active
        .map(c => ({ v:c.id, l:`${c.title}${c.center ? ' — ' + c.center : ''}`
          /* A center can run the same course two ways — face to face and
             blended, at different prices. Without the delivery those two read
             as the same line and the desk picks whichever comes first. */
          + (sameTwice.has(c.title + '@' + c.center) ? ` · ${c.modes.join(' + ')}` : '') })),
        { req:true, blank:'— select course —' })}
    ${UI.f.date('start','Training starts', DB.today(), { req:true })}
    <div class="note" id="endsNote" style="margin:-4px 0 14px"></div>
    ${UI.f.num('fee','Agreed fee (₱)', '0', { req:true, min:0,
         hint:'from the price list — change it only if this booking was agreed at another figure' })}

    <div class="hr"></div>
    <h4 style="margin:0 0 8px;font-size:13px">Charges</h4>
    <div class="chips" id="addonBox" style="margin-bottom:12px">
      ${addons().map((a,i) => `<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;background:var(--surface-2);border:1px solid var(--border);padding:6px 10px;border-radius:7px;cursor:pointer">
          <input type="checkbox" name="addon${i}" value="${i}" style="width:auto;margin:0"> ${UI.esc(a.desc)} — ${UI.peso(a.price)}</label>`).join('')}
    </div>
    ${UI.row(UI.f.num('discount','Discount (₱)','0',{ min:0 }),
             UI.f.text('discountNote','Reason for discount','',{ ph:'e.g. agency package rate' }))}
    ${UI.f.area('remarks','Remarks','')}
    <div class="hr"></div>
    <div id="summary"></div>`;

  UI.modal({
    title:'Encode enrollment', sub:'Booking and billing in one step', wide:true, body,
    submitLabel:'Enroll trainee',
    onSubmit: fd => {
      const trainee = T(fd.traineeId);
      if(!trainee){ UI.toast('Select a trainee.', 'bad'); return false; }
      const chosen = addons().filter((a,i) => fd['addon'+i]);
      try{
        const out = APPS.enroll(trainee, {
          /* The center comes from the course entry — one course at one center
             is one row on the price list. */
          courseId:fd.courseId, start:fd.start, end:endsOn,
          fee:fd.fee, mode:'Enrolled', charges:chosen,
          discount:fd.discount, discountNote:fd.discountNote, remarks:fd.remarks,
          by:SESSION.name,
        });
        UI.toast(out.invoice
          ? `Enrolled ${out.enrollment.no} — invoice ${out.invoice.no} for ${UI.peso(out.invoice.total)}`
          : `Booking reserved as ${out.enrollment.no} — not yet billed.`);
        refresh();
      }catch(err){
        UI.toast(err.message, 'bad');
        return false;
      }
    }
  });

  const form = document.getElementById('mForm');

  /* Picking the course fills in what the price list says about it — the center
     it runs at and the amount, less the rebate when the rebate is one that gets
     deducted. Both stay editable: the list is the usual price, not the only one. */
  form.courseId.onchange = () => {
    const c = CRS(form.courseId.value);
    if(!c) return;
    /* The trainee pays the course amount. The rebate is settled between us
       and the center and never reaches this figure. */
    if(c.amount && !form.fee.dataset.touched) form.fee.value = ACC.r2(c.amount).toFixed(2);
    fillEnd();
    recalc();
  };
  form.fee.onchange = () => { form.fee.dataset.touched = '1'; };

  /* Typing the start date is the common case, so fill the end date from the
     course length and let the desk overrule it. */
  /* The end date is not asked for. It follows from the course length, so it is
     worked out and shown — one date to type instead of two to keep consistent. */
  let endsOn = '';
  const fillEnd = () => {
    const c = CRS(form.courseId.value);
    const box = document.getElementById('endsNote');
    if(!c || !form.start.value){ endsOn = ''; box.textContent = 'Pick the course and the start date.'; return; }
    const days = Math.ceil(c.days || 1);
    const x = new Date(form.start.value); x.setDate(x.getDate() + days - 1);
    endsOn = x.toISOString().slice(0,10);
    box.innerHTML = `Runs <b>${UI.dateRange(form.start.value, endsOn)}</b> — ${days} training day(s)`
      + (c.duration ? ` from the course length on the price list.` : `. This course has no length on the price list, so one day is assumed.`);
  };

  const recalc = () => {
    fillEnd();
    const items = [{ qty:1, price:form.fee.value }];
    addons().forEach((a,i) => { if(form['addon'+i] && form['addon'+i].checked) items.push({ qty:1, price:a.price }); });
    const t = ACC.computeInvoice(items, form.discount.value);
    document.getElementById('summary').innerHTML = `
      <div style="display:flex;justify-content:flex-end">
        <table style="width:320px">
          <tr><td>Training fee and charges</td><td class="num">${UI.num(t.subtotal)}</td></tr>
          <tr><td>Less: discount</td><td class="num">${t.discount ? '(' + UI.num(t.discount) + ')' : '—'}</td></tr>
          <tr><td style="font-weight:700;border-top:2px solid var(--border-strong)">Amount due</td>
              <td class="num" style="font-weight:700;font-size:15px;border-top:2px solid var(--border-strong)">${UI.peso(t.total)}</td></tr>
        </table>
      </div>
      `;
  };
  form.addEventListener('input', recalc);
  form.addEventListener('change', recalc);
  recalc();
}

/* One booking, read as a short report: who and what at the top, the money in a
   single block underneath, receipts below that. No result or certificate — the
   training center issues those — and no instructor or venue, which the center
   assigns and we never hold. */
function enrollmentModal(e){
  const t = T(e.traineeId), c = CRS(e.courseId), inv = invOf(e.id);
  const bal = inv ? ACC.balanceOf(ACC.recomputeInvoice(inv)) : 0;
  const receipts = D().payments.filter(p => p.invoiceId === (inv && inv.id) && !p.voided);

  /* One row of the money report: label, figure, and a note only where the
     figure needs explaining. */
  const line = (label, amount, note, strong) => `
    <tr${strong ? ' style="font-weight:700"' : ''}>
      <td style="padding:5px 0">${UI.esc(label)}
        ${note ? `<span class="muted" style="font-weight:400"> · ${UI.esc(note)}</span>` : ''}</td>
      <td class="num" style="padding:5px 0">${UI.num(amount)}</td>
    </tr>`;

  UI.modal({
    title:`Booking ${e.no}`, sub:`${name(t)} · ${c ? c.title : ''}`, wide:true, hideSubmit:true,
    footExtra:`
      ${!inv && e.status !== 'Cancelled' ? `<button type="button" class="btn btn-brass" id="billIt">Bill this booking</button>` : ''}
      ${inv && bal > 0.004 && can('payments') ? `<button type="button" class="btn btn-accent" id="payIt">Record payment</button>` : ''}
      ${inv ? `<button type="button" class="btn btn-ghost" id="openInv">Open bill</button>` : ''}
      ${e.status !== 'Cancelled' ? `<button type="button" class="btn btn-danger" id="cancelEnr">Cancel booking</button>` : ''}`,
    body: `
      <dl class="def def-tight">
        <dt>Trainee</dt><dd><b>${UI.esc(name(t))}</b> · ${UI.esc(t?.no||'')}
          ${t?.rank ? `<span class="muted">· ${UI.esc(t.rank)}</span>` : ''}</dd>
        <dt>Course</dt><dd>${UI.esc(c?.title || '—')}
          ${(c?.modes||[]).length ? `<span class="muted">· ${UI.esc(c.modes.join(' + '))}</span>` : ''}</dd>
        <dt>Training</dt><dd>${e.start ? UI.dateRange(e.start, e.end) : '—'}
          ${e.center ? `<span class="muted">· ${UI.esc(e.center)}</span>` : ''}</dd>
        <dt>Booked</dt><dd>${UI.date(e.date)} · ${UI.statusTag(e.status)}</dd>
        ${e.remarks ? `<dt>Remarks</dt><dd>${UI.esc(e.remarks)}</dd>` : ''}
      </dl>

      <div class="hr"></div>
      <table style="width:100%;font-size:13px">
        <tbody>
          ${line('Charged to the trainee', inv ? inv.total : (e.fee || 0), inv ? inv.no : 'not billed yet')}
          ${inv ? line('Paid', inv.paid || 0, `${receipts.length} receipt(s)`) : ''}
          ${inv ? line('Left to pay', bal, bal > 0.004 ? invStatus(inv) : 'settled', true) : ''}
        </tbody>
      </table>

      ${inv ? (receipts.length ? `
        <div class="hr"></div>
        ${UI.table([
          { h:'OR No.', k:p => `<span class="mono">${UI.esc(p.no)}</span>` },
          { h:'Date', k:p => UI.date(p.date) },
          { h:'Mode', k:'method' },
          { h:'Reference', k:p => UI.esc(p.ref||'—') },
          { h:'Amount', k:p => UI.num(p.amount), cls:'num' },
        ], receipts)}` : '')
      : `<div class="note warn">Not billed yet — nothing is on the books for this booking.</div>`}`
  });

  const on = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };
  on('billIt', () => billEnrollment(e));
  on('payIt', () => paymentForm(inv));
  on('openInv', () => invoiceModal(inv));
  on('cancelEnr', () => UI.confirm(
    'Cancel this enrollment?',
    fd => {
      e.status = 'Cancelled';
      if(inv && !inv.voided){
        inv.voided = true; inv.status = 'Void';
        ACC.reverse(inv.id, fd.reason || 'Enrollment cancelled');
      }
      DB.activity('Cancelled enrollment', e.no + (fd.reason ? ' — ' + fd.reason : ''));
      UI.toast('Enrollment cancelled' + (inv ? ' and invoice reversed.' : '.'));
      refresh();
    },
    { danger:true, reason:true, yes:'Cancel enrollment',
      detail: inv ? 'The invoice will be voided and a reversing journal entry posted. Payments already received are not automatically refunded.' : 'No invoice exists, so nothing will be reversed.' }));
}

function billEnrollment(e){
  const c = CRS(e.courseId);
  UI.modal({
    title:'Generate invoice', sub:`${e.no} · ${name(T(e.traineeId))}`,
    body: `
      <div class="note"><b>${UI.esc(c.title)}</b><br>${UI.esc(b.center)} · ${UI.esc(c.duration || '')} · fee ${UI.peso(b.fee)}</div>
      <div class="chips" style="margin-bottom:12px">
        ${addons().map((a,i) => `<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;background:var(--surface-2);border:1px solid var(--border);padding:6px 10px;border-radius:7px;cursor:pointer">
            <input type="checkbox" name="addon${i}" style="width:auto;margin:0"> ${UI.esc(a.desc)} — ${UI.peso(a.price)}</label>`).join('')}
      </div>
      ${UI.row(UI.f.date('date','Invoice date', DB.today(), { req:true }),
               UI.f.num('discount','Discount (₱)', e.discount || 0, { min:0 }))}
      ${UI.f.text('terms','Terms','Due on or before first day of training')}`,
    submitLabel:'Issue invoice',
    onSubmit: fd => {
      const items = [{ desc:`${c.title} — ${b.center}`, account:'4000', qty:1, price:b.fee }];
      addons().forEach((a,i) => { if(fd['addon'+i]) items.push({ desc:a.desc, account:a.account, qty:1, price:a.price }); });
      const inv = ACC.buildInvoice({ enrollmentId:e.id, traineeId:e.traineeId, date:fd.date, items, discount:ACC.r2(fd.discount), terms:fd.terms });
      D().invoices.push(inv); ACC.postInvoice(inv);
      e.invoiceId = inv.id; e.discount = ACC.r2(fd.discount);
      if(e.status === 'Reserved') e.status = 'Enrolled';
      DB.activity('Issued invoice', inv.no);
      UI.toast(`Invoice ${inv.no} issued — ${UI.peso(inv.total)}`);
      refresh();
    }
  });
}

function invoiceModal(inv){
  ACC.recomputeInvoice(inv);
  const t = T(inv.traineeId), e = ENR(inv.enrollmentId), c = e && CRS(e.courseId);
  const co = D().company, bal = ACC.balanceOf(inv);
  const pays = D().payments.filter(p => p.invoiceId === inv.id && !p.voided);

  UI.modal({
    title:'Statement of Account', sub:inv.no, wide:true, hideSubmit:true,
    footExtra:`
      ${!inv.voided && bal > 0.004 && can('payments') ? `<button type="button" class="btn btn-accent" id="payNow">Record payment</button>` : ''}
      ${!inv.voided && can('invoices') ? `<button type="button" class="btn btn-danger" id="voidInv">Void</button>` : ''}
      <button type="button" class="btn btn-primary" onclick="UI.print()">Print</button>`,
    body: `<div class="doc">
      <div class="doc-head">
        <div>
          <h2>${UI.esc(co.name)}</h2>
          <div class="co">${UI.esc(co.address)}<br>${UI.esc(co.contact)}<br>TIN ${UI.esc(co.tin)}</div>
        </div>
        <div class="doc-title">
          <div class="t">STATEMENT OF ACCOUNT</div>
          <div class="n">${UI.esc(inv.no)}</div>
          <div class="muted" style="font-size:12px">${UI.date(inv.date)}</div>
          <div style="margin-top:5px">${UI.statusTag(invStatus(inv))}</div>
        </div>
      </div>
      <div class="grid g2">
        <dl class="def">
          <dt>Billed to</dt><dd><b>${UI.esc(name(t))}</b></dd>
          <dt>Trainee no.</dt><dd class="mono">${UI.esc(t?.no||'—')}</dd>
          <dt>SRN</dt><dd class="mono">${UI.esc(t?.srn||'—')}</dd>
          <dt>Agency</dt><dd>${UI.esc(t?.agency||'—')}</dd>
        </dl>
        <dl class="def">
          <dt>Enrollment</dt><dd class="mono">${UI.esc(e?.no||'—')}</dd>
          <dt>Course</dt><dd>${UI.esc(c?.title||'—')}</dd>
          <dt>Training date</dt><dd>${e && e.start ? UI.dateRange(e.start, e.end) : '—'}</dd>
          <dt>Terms</dt><dd>${UI.esc(inv.terms||'—')}</dd>
        </dl>
      </div>
      ${UI.table([
        { h:'Particulars', k:'desc' },
        { h:'Account', k:i => `<span class="mono muted">${UI.esc(i.account)}</span>` },
        { h:'Qty', k:'qty', cls:'num', w:'60px' },
        { h:'Unit Price', k:i => UI.num(i.price), cls:'num' },
        { h:'Amount', k:i => UI.num(i.amount), cls:'num' },
      ], inv.items)}
      <div class="doc-total"><table>
        <tr><td>Gross charges</td><td class="num">${UI.num(inv.subtotal)}</td></tr>
        ${inv.discount ? `<tr><td>Less: discount</td><td class="num">(${UI.num(inv.discount)})</td></tr>` : ''}
        <tr class="grand"><td>TOTAL AMOUNT DUE</td><td class="num">${UI.peso(inv.total)}</td></tr>
        <tr><td>Payments received</td><td class="num">(${UI.num(inv.paid||0)})</td></tr>
        <tr class="grand"><td>BALANCE</td><td class="num">${UI.peso(bal)}</td></tr>
      </table></div>
      ${pays.length ? `<div class="hr"></div><h4 style="margin:0 0 6px;font-size:13px">Official receipts applied</h4>
        ${UI.table([
          { h:'OR No.', k:p => `<span class="mono">${UI.esc(p.no)}</span>` },
          { h:'Date', k:p => UI.date(p.date) },
          { h:'Mode', k:'method' },
          { h:'Reference', k:p => UI.esc(p.ref||'—') },
          { h:'Amount', k:p => UI.num(p.amount), cls:'num' },
        ], pays)}` : ''}
      ${inv.voided ? '<div class="note bad" style="margin-top:14px"><b>This invoice has been voided.</b> A reversing journal entry was posted.</div>' : ''}
      <div class="doc-sign"><div>Prepared by</div><div>Received by / Trainee</div></div>
      <p class="muted" style="font-size:11px;margin-top:18px">This document is computer-generated. TIN ${UI.esc(co.tin)}.</p>
    </div>`
  });
  const on = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };
  on('payNow', () => paymentForm(inv));
  on('voidInv', () => UI.confirm('Void this invoice?', fd => {
      if((inv.paid||0) > 0){ UI.toast('Void the receipts first — this invoice has payments applied.', 'bad'); return; }
      inv.voided = true; inv.status = 'Void';
      ACC.reverse(inv.id, fd.reason || 'Voided');
      DB.activity('Voided invoice', inv.no + (fd.reason ? ' — ' + fd.reason : ''));
      UI.toast('Invoice voided and reversed.');
      refresh();
    }, { danger:true, reason:true, yes:'Void invoice',
         detail:'The original entry stays in the journal and a mirror-image reversing entry is posted beside it.' }));
}

/* ----- payments ----- */
/* The collection window.

   Three ways to pay, and a receipt may use more than one of them — half in cash
   and half by GCash is an ordinary counter transaction, and forcing it through
   as two receipts would misstate both. Each tender carries its own reference
   number, because that is what gets matched against a GCash or bank statement;
   cash has nothing to match, so it asks for nothing.

   Full payment or part payment is a button, not arithmetic the cashier does in
   their head: "Full balance" fills the amount, and any shortfall is shown as the
   balance that will remain. */
function paymentForm(inv){
  const open = D().invoices.map(i => (ACC.recomputeInvoice(i), i))
    .filter(i => !i.voided && ACC.balanceOf(i) > 0.004)
    .sort((a,b) => a.date.localeCompare(b.date));
  if(!inv && !open.length){ UI.toast('Nothing outstanding — every invoice is settled.', 'bad'); return; }

  const bal = inv ? ACC.balanceOf(inv) : 0;
  const MODES = ACC.methodNames();
  const line = i => `
    <div class="tender-row" data-row="${i}">
      <select name="m${i}" class="t-mode">${MODES.map(m => `<option value="${m}">${m}</option>`).join('')}</select>
      <input type="number" name="a${i}" step="0.01" min="0" placeholder="Amount" class="t-amt">
      <input type="text" name="r${i}" placeholder="Reference no." class="t-ref">
    </div>`;

  UI.modal({
    title:'Record collection',
    sub: inv ? `Against ${inv.no} · balance ${UI.peso(bal)}` : 'Issue an official receipt',
    wide:true,
    body: `
      ${inv ? `<input type="hidden" name="invoiceId" value="${inv.id}">
               <div class="note"><b>${UI.esc(name(T(inv.traineeId)))}</b><br>${UI.esc(inv.no)} · total ${UI.peso(inv.total)} · balance <b>${UI.peso(bal)}</b></div>`
            : UI.f.select('invoiceId','Apply to invoice','', open.map(i =>
                ({ v:i.id, l:`${i.no} · ${name(T(i.traineeId))} · balance ${UI.peso(ACC.balanceOf(i))}` })), { req:true, blank:'— select invoice —' })}

      ${UI.f.text('note','Notes','')}
      <p class="muted" style="margin:-6px 0 4px;font-size:12px">Received today,
         ${UI.date(DB.today())} — an official receipt carries the date it is issued.</p>

      <div class="hr"></div>
      <h4 style="margin:0 0 4px;font-size:13px">How it was paid</h4>
      <p class="muted" style="margin:0 0 10px;font-size:12px">
        One line per mode. GCash and Bank need the reference number that appears
        on the statement.</p>
      <div id="tenders">${line(0)}</div>
      <div style="display:flex;gap:8px;margin:10px 0 4px;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost btn-xs" id="addTender">+ Split across another mode</button>
        <button type="button" class="btn btn-ghost btn-xs" id="fullPay">Full balance</button>
        <button type="button" class="btn btn-ghost btn-xs" id="halfPay">Half</button>
      </div>
      <div id="payWarn"></div>`,
    submitLabel:'Issue official receipt',
    onSubmit: fd => {
      const target = inv || INV(fd.invoiceId);
      if(!target){ UI.toast('Select an invoice.', 'bad'); return false; }

      const tenders = [];
      for(let i = 0; i < 6; i++){
        const amt = ACC.r2(fd['a'+i]);
        if(!amt) continue;
        const method = fd['m'+i] || 'Cash';
        const ref = String(fd['r'+i] || '').trim();
        if(ACC.needsRef(method) && !ref){
          UI.toast(`${method} needs its reference number.`, 'bad'); return false;
        }
        tenders.push({ method, ref, amount:amt });
      }
      if(!tenders.length){ UI.toast('Enter how much was received.', 'bad'); return false; }

      const amt = ACC.r2(tenders.reduce((s,t) => s + t.amount, 0));
      const due = ACC.balanceOf(ACC.recomputeInvoice(target));
      if(amt <= 0){ UI.toast('Enter an amount greater than zero.', 'bad'); return false; }
      if(amt - due > 0.004){ UI.toast(`Amount exceeds the balance of ${UI.peso(due)}.`, 'bad'); return false; }

      const p = ACC.buildPayment({ invoiceId:target.id, traineeId:target.traineeId,
                                   date:DB.today(), tenders, note:fd.note });
      D().payments.push(p); ACC.postPayment(p, target);
      DB.activity('Issued official receipt', `${p.no} vs ${target.no}`);
      DB.save();
      UI.toast(`OR ${p.no} issued for ${UI.peso(amt)}`);
      render();
      receiptModal(p);
      return false; // receiptModal already replaced the dialog
    }
  });

  const form = document.getElementById('mForm');
  const dueNow = () => {
    const target = inv || INV(form.invoiceId ? form.invoiceId.value : '');
    return target ? ACC.balanceOf(ACC.recomputeInvoice(target)) : 0;
  };
  const tendered = () => {
    let sum = 0;
    for(let i = 0; i < 6; i++){ const el = form['a'+i]; if(el) sum = ACC.r2(sum + ACC.r2(el.value)); }
    return sum;
  };

  /* A reference box only matters for the modes that have one. */
  const syncRefs = () => {
    [...form.querySelectorAll('.tender-row')].forEach(row => {
      const mode = row.querySelector('.t-mode').value;
      const ref = row.querySelector('.t-ref');
      const wanted = ACC.needsRef(mode);
      ref.disabled = !wanted;
      ref.placeholder = wanted ? `${mode} reference no.` : 'no reference for ' + mode.toLowerCase();
      if(!wanted) ref.value = '';
    });
  };

  const warn = () => {
    syncRefs();
    const due = dueNow(), amt = tendered();
    const box = document.getElementById('payWarn');
    box.innerHTML = !amt ? ''
      : amt - due > 0.004 ? `<div class="note bad">Amount exceeds the balance of ${UI.peso(due)}.</div>`
      : amt < due ? `<div class="note warn">Part payment of <b>${UI.peso(amt)}</b>.
          Balance after this receipt: <b>${UI.peso(ACC.r2(due - amt))}</b>.</div>`
      : `<div class="note"><b>Full settlement of ${UI.peso(amt)}.</b> This invoice will be marked Paid.</div>`;
  };

  let rows = 1;
  document.getElementById('addTender').onclick = () => {
    if(rows >= 6) return;
    const box = document.getElementById('tenders');
    box.insertAdjacentHTML('beforeend', line(rows));
    /* Default the new line to whatever is still unpaid on this receipt. */
    const left = ACC.r2(dueNow() - tendered());
    if(left > 0) form['a'+rows].value = left.toFixed(2);
    rows++;
    warn();
  };
  const setFirst = v => { form.a0.value = v.toFixed(2);
    for(let i = 1; i < 6; i++){ if(form['a'+i]) form['a'+i].value = ''; } warn(); };
  document.getElementById('fullPay').onclick = () => setFirst(dueNow());
  document.getElementById('halfPay').onclick = () => setFirst(ACC.r2(dueNow() / 2));

  form.addEventListener('input', warn);
  form.addEventListener('change', () => {
    if(!inv && form.invoiceId && form.invoiceId.value) setFirst(dueNow());
    else warn();
  });
  if(inv) setFirst(bal); else warn();
}

function receiptModal(p){
  const t = T(p.traineeId), inv = INV(p.invoiceId), co = D().company;
  const e = inv && ENR(inv.enrollmentId), c = e && CRS(e.courseId);
  const words = amountInWords(p.amount);

  UI.modal({
    title:'Official Receipt', sub:p.no, hideSubmit:true, wide:true,
    footExtra:`${!p.voided && can('payments') ? `<button type="button" class="btn btn-danger" id="voidPay">Void receipt</button>` : ''}
               <button type="button" class="btn btn-primary" onclick="UI.print()">Print</button>`,
    body: `<div class="doc">
      <div class="doc-head">
        <div><h2>${UI.esc(co.name)}</h2>
          <div class="co">${UI.esc(co.address)}<br>${UI.esc(co.contact)}<br>TIN ${UI.esc(co.tin)}</div></div>
        <div class="doc-title"><div class="t">OFFICIAL RECEIPT</div>
          <div class="n">${UI.esc(p.no)}</div>
          <div class="muted" style="font-size:12px">${UI.date(p.date)}</div>
          ${p.voided ? '<div style="margin-top:5px">' + UI.tag('VOID','bad') + '</div>' : ''}</div>
      </div>
      <dl class="def" style="margin-bottom:14px">
        <dt>Received from</dt><dd><b>${UI.esc(name(t))}</b> · ${UI.esc(t?.no||'')}</dd>
        <dt>Address</dt><dd>${UI.esc(t?.address||'—')}</dd>
        <dt>The sum of</dt><dd><b>${UI.esc(words)}</b></dd>
        <dt>In payment of</dt><dd>${UI.esc(c ? c.code + ' — ' + c.title : 'Training fees')}${inv ? ' · Invoice ' + UI.esc(inv.no) : ''}</dd>
        <dt>Mode of payment</dt><dd>${(p.tenders && p.tenders.length ? p.tenders : [{ method:p.method, ref:p.ref, amount:p.amount }])
          .map(t => `${UI.esc(t.method)}${t.ref ? ' · Ref ' + UI.esc(t.ref) : ''} — ${UI.num(t.amount)}`).join('<br>')}</dd>
      </dl>
      <div class="doc-total"><table>
        <tr><td>Amount received</td><td class="num">${UI.num(p.amount)}</td></tr>
        ${inv ? `<tr><td>Invoice total</td><td class="num">${UI.num(inv.total)}</td></tr>
                 <tr><td>Total paid to date</td><td class="num">${UI.num(inv.paid||0)}</td></tr>
                 <tr class="grand"><td>REMAINING BALANCE</td><td class="num">${UI.peso(ACC.balanceOf(ACC.recomputeInvoice(inv)))}</td></tr>` : ''}
      </table></div>
      ${p.note ? `<div class="note" style="margin-top:14px">${UI.esc(p.note)}</div>` : ''}
      <div class="doc-sign"><div>Cashier</div><div>Received the above amount</div></div>
      <p class="muted" style="font-size:11px;margin-top:18px">This receipt is valid only when the corresponding payment has cleared. Computer-generated.</p>
    </div>`
  });
  const vb = document.getElementById('voidPay');
  if(vb) vb.onclick = () => UI.confirm('Void this official receipt?', fd => {
      p.voided = true;
      ACC.reverse(p.id, fd.reason || 'Receipt voided');
      if(inv) ACC.recomputeInvoice(inv);
      DB.activity('Voided receipt', p.no + (fd.reason ? ' — ' + fd.reason : ''));
      UI.toast('Receipt voided; the balance has been restored.');
      refresh();
    }, { danger:true, reason:true, yes:'Void receipt',
         detail:'A reversing entry is posted and the amount returns to the trainee\'s outstanding balance.' });
}

/* Spelled-out amount for the receipt face. */
function amountInWords(n){
  const ones = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const under1000 = v => {
    if(v < 20) return ones[v];
    if(v < 100) return tens[Math.floor(v/10)] + (v%10 ? '-' + ones[v%10] : '');
    return ones[Math.floor(v/100)] + ' hundred' + (v%100 ? ' ' + under1000(v%100) : '');
  };
  const whole = Math.floor(Math.abs(n)), cents = Math.round((Math.abs(n) - whole) * 100);
  let s = '', v = whole;
  const units = [[1e6,'million'],[1e3,'thousand']];
  units.forEach(([base,label]) => {
    if(v >= base){ s += under1000(Math.floor(v/base)) + ' ' + label + ' '; v %= base; }
  });
  if(v || !s) s += under1000(v);
  s = s.trim();
  const cap = s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap} pesos${cents ? ' and ' + under1000(cents) + ' centavos' : ''} only`;
}

/* ----- expenses & journal ----- */
function expenseForm(){
  const exp = D().accounts.filter(a => a.type === 'Expense');
  UI.modal({
    title:'Disbursement voucher', sub:'Records the expense and credits cash automatically',
    body: `
      ${UI.row(UI.f.text('payee','Payee', '', { req:true }), UI.f.date('date','Date', DB.today(), { req:true }))}
      ${UI.f.select('account','Expense account','5100', exp.map(a => ({ v:a.code, l:`${a.code} — ${a.name}` })), { req:true })}
      ${UI.f.text('particulars','Particulars','',{ req:true, ph:'What was this for?' })}
      ${UI.row(UI.f.num('amount','Amount (₱)','',{ req:true, min:0.01 }),
               UI.f.select('method','Paid from', ACC.methodNames()[0], ACC.methodNames()))}
      <div class="note">Posts as: <b>debit</b> the expense account, <b>credit</b> ${'Cash on Hand or Cash in Bank'} depending on the mode.</div>`,
    submitLabel:'Post voucher',
    onSubmit: fd => {
      const v = { id:DB.uid('exp'), no:DB.nextNo('voucher','DV'), ...fd, amount:ACC.r2(fd.amount) };
      D().expenses.push(v); ACC.postExpense(v);
      DB.activity('Posted disbursement', v.no);
      UI.toast(`Voucher ${v.no} posted — ${UI.peso(v.amount)}`);
      refresh();
    }
  });
}

function journalForm(){
  const opts = D().accounts.map(a => ({ v:a.code, l:`${a.code} — ${a.name}` }));
  const line = i => `
    <div class="split" style="margin-bottom:8px">
      ${UI.f.select('acct'+i, i===0 ? 'Account' : '', '', opts, { blank:'— select —' })}
      ${UI.f.num('dr'+i, i===0 ? 'Debit' : '', '', { min:0 })}
      ${UI.f.num('cr'+i, i===0 ? 'Credit' : '', '', { min:0 })}
    </div>`;
  UI.modal({
    title:'Manual journal entry', sub:'For adjustments the system cannot infer', wide:true,
    body: `
      ${UI.row(UI.f.date('date','Date', DB.today(), { req:true }), UI.f.text('memo','Particulars','',{ req:true }))}
      <div class="hr"></div>
      ${[0,1,2,3].map(line).join('')}
      <div id="jeBal" class="note">Debits and credits must be equal before this entry can be posted.</div>`,
    submitLabel:'Post entry',
    onSubmit: fd => {
      const lines = [0,1,2,3].map(i => ({ account:fd['acct'+i], debit:ACC.r2(fd['dr'+i]), credit:ACC.r2(fd['cr'+i]) }))
        .filter(l => l.account && (l.debit || l.credit));
      const dr = ACC.r2(lines.reduce((s,l) => s + l.debit, 0)), cr = ACC.r2(lines.reduce((s,l) => s + l.credit, 0));
      if(lines.length < 2){ UI.toast('An entry needs at least two lines.', 'bad'); return false; }
      if(dr !== cr || !dr){ UI.toast('Entry is out of balance.', 'bad'); return false; }
      const je = ACC.post({ date:fd.date, memo:fd.memo, refType:'Manual', refNo:'', refId:DB.uid('man'), lines });
      DB.activity('Posted manual journal entry', je.no);
      UI.toast(`Journal entry ${je.no} posted.`);
      refresh();
    }
  });
  const form = document.getElementById('mForm');
  form.addEventListener('input', () => {
    const dr = [0,1,2,3].reduce((s,i) => s + (+form['dr'+i].value || 0), 0);
    const cr = [0,1,2,3].reduce((s,i) => s + (+form['cr'+i].value || 0), 0);
    const box = document.getElementById('jeBal');
    const diff = ACC.r2(dr - cr);
    box.className = 'note' + (diff === 0 && dr ? '' : ' warn');
    box.innerHTML = `Debits <b>${UI.num(dr)}</b> · Credits <b>${UI.num(cr)}</b> · ` +
      (diff === 0 && dr ? 'In balance — ready to post.' : `Out of balance by <b>${UI.num(Math.abs(diff))}</b>.`);
  });
}

/* ----- the three lists the admin maintains ----- */

/* A staff account. The password is stored as typed — see the note on USERS in
   db.js — so the field says so rather than pretending otherwise. */
function userForm(u){
  const isNew = !u;
  u = u || { name:'', email:'', code:'', role:'registrar', initials:'' };
  const roles = Object.keys(DB.PERMS).map(r => ({ v:r, l:`${r} — ${DB.PERMS[r].length} module(s)` }));

  UI.modal({
    title: isNew ? 'Add user account' : 'Edit account — ' + u.name,
    wide:true,
    body:`
      ${UI.row(UI.f.text('name','Full name', u.name, { req:true, ph:'e.g. Maria Santos' }),
               UI.f.text('email','Email address', u.email, { type:'email', ph:'name@tarabarkomaritime.com' }))}
      ${UI.row(UI.f.text('code','Password', u.code, { req:true, hint:'used to sign in' }),
               UI.f.select('role','Role', u.role, roles, { req:true }))}
      ${UI.f.text('initials','Initials', u.initials, { hint:'shown on the avatar — blank fills itself in', ph:'MS' })}
      <div class="note">
        <b>${UI.esc(u.role || 'registrar')}</b> can open:
        <span id="roleMods">${DB.PERMS[u.role] ? DB.PERMS[u.role].map(m => (TITLES[m]||[m])[0]).join(' · ') : ''}</span>
      </div>
      <div class="note warn">Passwords are kept in clear text in this browser's storage.
        Anyone who can open this machine can read them, so do not reuse a password
        that protects anything else.</div>
      ${isNew ? '' : `<div class="hr"></div>
        <button type="button" class="btn btn-danger btn-sm" id="delUser">Remove this account</button>`}`,
    submitLabel: isNew ? 'Create account' : 'Save changes',
    onSubmit: fd => {
      const name = (fd.name || '').trim();
      const code = (fd.code || '').trim();
      if(!name || !code){ UI.toast('A name and a password are both required.', 'bad'); return false; }
      if(fd.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fd.email)){
        UI.toast('That email address does not look right.', 'bad'); return false;
      }
      /* Two accounts with the same password cannot be told apart at sign-in,
         because the password is all the sign-in checks. */
      const clash = D().users.find(x => x.code === code && (isNew || x.id !== u.id));
      if(clash){ UI.toast(`That password is already used by ${clash.name}.`, 'bad'); return false; }

      const initials = (fd.initials || '').trim().toUpperCase()
        || name.split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase();
      const rec = { name, email:(fd.email||'').trim(), code, role:fd.role, initials };

      if(isNew){
        D().users.push({ id:DB.uid('usr'), ...rec });
        DB.activity('Added user account', name);
        UI.toast('Account created — ' + name);
        fillLoginList();
      }else{
        Object.assign(u, rec);
        DB.activity('Updated user account', name);
        UI.toast('Account updated.');
        fillLoginList();
        /* Editing yourself should not leave the header showing the old name. */
        if(SESSION && SESSION.id === u.id){
          document.getElementById('userName').textContent = u.name;
          document.getElementById('userRole').textContent = u.role;
          document.getElementById('userAvatar').textContent = u.initials;
        }
      }
      refresh();
    }
  });

  /* Show what the chosen role can actually reach, as it is chosen. */
  const form = document.getElementById('mForm');
  form.role.onchange = () => {
    document.getElementById('roleMods').textContent =
      (DB.PERMS[form.role.value] || []).map(m => (TITLES[m]||[m])[0]).join(' · ');
  };

  const del = document.getElementById('delUser');
  if(del) del.onclick = () => {
    if(SESSION && SESSION.id === u.id) return UI.toast('You cannot remove the account you are signed in with.', 'bad');
    if(u.role === 'admin' && D().users.filter(x => x.role === 'admin').length === 1)
      return UI.toast('This is the only admin account — make another one first.', 'bad');
    UI.confirm(`Remove ${u.name}?`, () => {
      D().users = D().users.filter(x => x.id !== u.id);
      DB.activity('Removed user account', u.name);
      UI.close(); UI.toast('Account removed.'); fillLoginList(); refresh();
    }, { danger:true, yes:'Remove account',
         detail:'Their receipts and entries stay in the ledger — only the sign-in goes.' });
  };
}

/* Modes of payment. Each one needs an account to post to, or the cash figures
   stop meaning anything, so the account is a dropdown of real asset accounts
   rather than a free-text box. */
function methodsForm(){
  const list = ACC.methods();
  const assets = D().accounts.filter(a => a.type === 'Asset')
    .map(a => ({ v:a.code, l:`${a.code} — ${a.name}` }));
  const rows = [0,1,2,3,4,5];
  const line = i => {
    const m = list[i] || { name:'', account:'', ref:false };
    return `<div class="grid g3" style="margin-bottom:8px">
      ${UI.f.text('name'+i, i===0 ? 'Mode' : '', m.name, { ph:'e.g. Maya' })}
      ${UI.f.select('acct'+i, i===0 ? 'Posts to' : '', m.account, assets, { blank:'— account —' })}
      ${UI.f.select('ref'+i, i===0 ? 'Reference no.' : '', m.ref ? '1' : '0',
        [{ v:'0', l:'Not asked' }, { v:'1', l:'Required' }])}
    </div>`;
  };
  UI.modal({
    title:'Modes of payment', sub:'Offered at the collection window', wide:true,
    body: rows.map(line).join('') +
      `<div class="note">Leave the mode blank to remove it. The first mode is treated
        as the cash drawer on the dashboard. Receipts already issued keep the mode
        they were taken with.</div>`,
    submitLabel:'Save modes',
    onSubmit: fd => {
      const next = rows
        .map(i => ({ name:(fd['name'+i]||'').trim(), account:fd['acct'+i], ref:fd['ref'+i] === '1' }))
        .filter(m => m.name);
      if(!next.length){ UI.toast('Keep at least one mode of payment.', 'bad'); return false; }
      const missing = next.find(m => !m.account);
      if(missing){ UI.toast(`Choose the account ${missing.name} posts to.`, 'bad'); return false; }
      const dupe = next.find((m,i) => next.findIndex(x => x.name.toLowerCase() === m.name.toLowerCase()) !== i);
      if(dupe){ UI.toast(`${dupe.name} is listed twice.`, 'bad'); return false; }
      D().company.methods = next;
      DB.activity('Updated modes of payment');
      UI.toast('Modes of payment updated.');
      refresh();
    }
  });
}

function addonsForm(){
  const a = addons();
  const rows = [0,1,2,3,4,5,6,7];
  const line = i => `<div class="split" style="margin-bottom:8px">
      ${UI.f.text('desc'+i, i===0?'Description':'', a[i]?.desc || '')}
      ${UI.f.num('price'+i, i===0?'Amount':'', a[i]?.price ?? '')}
    </div>`;
  UI.modal({
    title:'Charges', sub:'Shown as tick-boxes when billing a booking', wide:true,
    body: rows.map(line).join('') +
      '<div class="note">Leave a row blank to remove it. Every charge posts to account 4100 — Assessment &amp; Other Fees.</div>',
    submitLabel:'Save charges',
    onSubmit: fd => {
      D().company.addons = rows
        .map(i => ({ desc:(fd['desc'+i]||'').trim(), account:'4100', price:ACC.r2(fd['price'+i]) }))
        .filter(x => x.desc && x.price > 0);
      DB.activity('Updated charges');
      UI.toast('Charges updated.');
      refresh();
    }
  });
}

function globalSearch(term){
  const q = term.toLowerCase().trim();
  if(!q) return;
  const tr = D().trainees.filter(t => [t.no,t.last,t.first,t.srn,t.mobile].join(' ').toLowerCase().includes(q)).slice(0,8);
  const iv = D().invoices.filter(i => i.no.toLowerCase().includes(q)).slice(0,8);
  const pr = D().payments.filter(p => p.no.toLowerCase().includes(q)).slice(0,8);
  const en = D().enrollments.filter(e => e.no.toLowerCase().includes(q)).slice(0,8);
  /* Applicants are searchable by reference code too — that is what they quote on the phone. */
  const ap = [];

  const sec = (title, rows, act) => rows.length ? `<h4 style="margin:14px 0 6px;font-size:12.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">${title}</h4>` +
    rows.map(r => `<button type="button" class="btn btn-ghost btn-block" style="justify-content:flex-start;margin-top:4px" data-act="${act}" data-id="${r.id}">
      <span class="mono">${UI.esc(r.no)}</span> &nbsp; ${UI.esc(r.last ? name(r) : (T(r.traineeId) ? name(T(r.traineeId)) : ''))}</button>`).join('') : '';

  const body = (sec('Applications', ap, 'view-application') +
                sec('Trainees', tr, 'view-trainee') + sec('Enrollments', en, 'view-enrollment') +
                sec('Invoices', iv, 'view-invoice') + sec('Receipts', pr, 'view-receipt'))
    || '<div class="empty">Nothing matched that search.</div>';
  UI.modal({ title:`Search results for "${term}"`, body, hideSubmit:true });
}

/* ================= EVENT WIRING ================= */
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if(!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  const A = {
    'new-trainee':   () => traineeForm(),
    /* From inside the encode form: register the walk-in, then come back to
       the enrollment with them already selected. */
    'new-trainee-here':() => traineeForm(null, made => enrollmentForm(null, made.id)),
    'view-trainee':  () => traineeProfile(T(id)),
    'enroll-trainee':() => { ev.stopPropagation(); enrollmentForm(null, id); },
    'new-course':    () => courseForm(),
    'edit-course':   () => { ev.stopPropagation(); courseForm(CRS(id)); },
    'new-enrollment':() => enrollmentForm(),
    'view-enrollment':() => enrollmentModal(ENR(id)),
    'view-invoice':  () => invoiceModal(INV(id)),
    'new-payment':   () => paymentForm(null),
    'view-receipt':  () => receiptModal(PAY(id)),
    'new-expense':   () => expenseForm(),
    'new-journal':   () => journalForm(),
    'edit-addons':   () => addonsForm(),
    'edit-methods':  () => methodsForm(),
    'new-user':      () => userForm(),
    'edit-user':     () => userForm(D().users.find(u => u.id === id)),
    'ledger-tab':    () => { location.hash = '#/ledger/' + id; },
    'rep-tab':       () => { location.hash = '#/reports/' + id; },
    'acct-ledger':   () => { state.q.acct = id; location.hash = '#/ledger/account'; },
    'print':         () => UI.print(),
    'backup':        () => { DB.exportJSON(); UI.toast('Backup downloaded.'); },
    'restore':       () => document.getElementById('restoreFile').click(),
    'wipe':          () => UI.confirm('Erase every record in this system?', () => {
                        DB.reset(false); UI.toast('All records erased.'); location.hash = '#/dashboard'; render();
                      }, { danger:true, yes:'Erase everything',
                           detail:'Trainees, enrollments, invoices, receipts and the entire journal will be deleted. Download a backup first — this cannot be undone.' }),
  }[act];
  if(A){ ev.preventDefault(); A(); }
});

/* Filter inputs re-render their view without losing focus. */
document.addEventListener('input', ev => {
  const el = ev.target.closest('[data-q]');
  if(!el) return;
  state.q[el.dataset.q] = el.value;
  const key = el.dataset.q, pos = el.selectionStart;
  render();
  const again = document.querySelector(`[data-q="${key}"]`);
  if(again){ again.focus(); try{ again.setSelectionRange(pos,pos); }catch(e){} }
});
document.addEventListener('change', ev => {
  const el = ev.target.closest('select[data-q],input[type=date][data-q]');
  if(!el) return;
  state.q[el.dataset.q] = el.value;
  render();
});

/* Settings form is submitted rather than filtered. */
document.addEventListener('submit', ev => {
  if(ev.target.id !== 'coForm') return;
  ev.preventDefault();
  const fd = Object.fromEntries(new FormData(ev.target).entries());
  delete fd._taxNote;
  Object.assign(D().company, fd);
  DB.activity('Updated company profile');
  UI.toast('Company profile saved. New invoices will use these settings.');
  refresh();
});

/* ---------- boot ---------- */
window.addEventListener('hashchange', route);

/* The public portal writes to the same store from another tab. Pick up new
   applications without asking the registrar to reload. */
window.addEventListener('storage', ev => {
  if(ev.key !== 'tbm_is_v1' || !SESSION) return;
  const before = D().applications.length;
  DB.reload();
  const now = D().applications.length;
  if(now > before) UI.toast(`${now - before} new application(s) received.`);
  render();
});

document.getElementById('logoutBtn').onclick = () => location.reload();
document.getElementById('backupBtn').onclick = () => { DB.exportJSON(); UI.toast('Backup downloaded.'); };
document.getElementById('restoreBtn').onclick = () => document.getElementById('restoreFile').click();
document.getElementById('restoreFile').onchange = e => {
  const file = e.target.files[0];
  if(!file) return;
  const r = new FileReader();
  r.onload = () => {
    try{ DB.importJSON(r.result); UI.toast('Backup restored.'); renderNav(); route(); }
    catch(err){ UI.toast('Could not read that file: ' + err.message, 'bad'); }
  };
  r.readAsText(file);
  e.target.value = '';
};
document.getElementById('globalSearch').onkeydown = e => {
  if(e.key === 'Enter'){ globalSearch(e.target.value); e.target.value = ''; }
};

DB.load();
initLogin();
