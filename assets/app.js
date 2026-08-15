/* app.js — session, router and the eleven modules of the portal. */

/* ---------- session ---------- */
window.SESSION = null;
const state = { view:'dashboard', sub:'', q:{} };

const DEFAULT_ADDONS = [
  { desc:'Training kit & assessment fee', account:'4100', price:450 },
  { desc:'ID & certificate processing',   account:'4100', price:250 },
  { desc:'Accident insurance coverage',   account:'4100', price:150 },
  { desc:'Course manual / workbook',      account:'4100', price:350 },
];

const NAV = [
  { group:'Operations' },
  { id:'dashboard',   label:'Dashboard',    ico:'◈' },
  { id:'admissions',  label:'Admissions',   ico:'✉' },
  { id:'trainees',    label:'Trainees',     ico:'☺' },
  { id:'courses',     label:'Courses',      ico:'▤' },
  { id:'batches',     label:'Schedules',    ico:'▦' },
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
  admissions:['Admissions','Applications received from the public registration portal'],
  trainees:['Trainee Registry','Seafarer master records'],
  courses:['Course Catalogue','Accredited courses and published rates'],
  batches:['Training Schedules','Batches, rooms and instructors'],
  enrollments:['Enrollments','Registration, billing status and results'],
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
const BAT  = id => D().batches.find(x => x.id === id);
const ENR  = id => D().enrollments.find(x => x.id === id);
const INV  = id => D().invoices.find(x => x.id === id);
const PAY  = id => D().payments.find(x => x.id === id);
/* Trainees and applications carry the same name fields, so one formatter serves both. */
const name = t => APPS.forName(t);
const addons = () => D().company.addons || DEFAULT_ADDONS;
const can = v => SESSION && DB.PERMS[SESSION.role].includes(v);
const seats = b => D().enrollments.filter(e => e.batchId === b.id && ['Enrolled','Reserved','Completed'].includes(e.status)).length;
const monthKey = d => (d || '').slice(0,7);
const firstOfMonth = () => new Date().toISOString().slice(0,8) + '01';
const startOfYear  = () => new Date().getFullYear() + '-01-01';

/* Overdue = unpaid balance and training has already started. */
function invStatus(inv){
  ACC.recomputeInvoice(inv);
  if(inv.voided) return 'Void';
  if(inv.status === 'Paid') return 'Paid';
  const e = ENR(inv.enrollmentId), b = e && BAT(e.batchId);
  if(b && b.start < DB.today()) return 'Overdue';
  return inv.status;
}
const invOf = enrId => D().invoices.find(i => i.enrollmentId === enrId && !i.voided);
function traineeBalance(tid){
  return ACC.r2(D().invoices.filter(i => i.traineeId === tid && !i.voided)
    .reduce((s,i) => s + ACC.balanceOf(ACC.recomputeInvoice(i)), 0));
}

/* ================= LOGIN ================= */
function initLogin(){
  const sel = document.getElementById('loginUser');
  sel.innerHTML = D().users.map(u => `<option value="${u.id}">${UI.esc(u.name)} — ${u.role}</option>`).join('');
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
    if(n.id === 'admissions'){
      const c = APPS.pending().length;
      if(c) badge = `<span class="badge">${c}</span>`;
    }
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

/* ---------- Dashboard ---------- */
VIEWS.dashboard = () => {
  const d = D(), tdy = DB.today(), mk = monthKey(tdy);

  const activeIds = new Set(d.enrollments.filter(e => ['Enrolled','Reserved'].includes(e.status)).map(e => e.traineeId));
  const enrThisMonth = d.enrollments.filter(e => monthKey(e.date) === mk).length;
  const collected = ACC.collections(firstOfMonth(), tdy).total;
  const aging = ACC.arAging(tdy);
  const ongoing = d.batches.filter(b => b.status === 'Ongoing').length;

  /* Last six months, billed vs collected. */
  const months = [];
  for(let i = 5; i >= 0; i--){
    const dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - i);
    const key = dt.toISOString().slice(0,7);
    months.push({
      label:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()],
      a:ACC.r2(d.invoices.filter(x => !x.voided && monthKey(x.date) === key).reduce((s,x) => s + x.total, 0)),
      b:ACC.r2(d.payments.filter(x => !x.voided && monthKey(x.date) === key).reduce((s,x) => s + x.amount, 0)),
    });
  }

  const upcoming = d.batches.filter(b => ['Open','Ongoing'].includes(b.status))
    .sort((a,b) => a.start.localeCompare(b.start)).slice(0,7);

  const statusCounts = ['Enrolled','Reserved','Completed','Cancelled']
    .map((s,i) => ({ label:s, value:d.enrollments.filter(e => e.status === s).length,
                     color:['#12805c','#c9a227','#1d4571','#b9c3d2'][i] }))
    .filter(p => p.value);

  const topCourses = d.courses.map(c => ({
      label:c.code, value:d.enrollments.filter(e => e.courseId === c.id).length }))
    .filter(x => x.value).sort((a,b) => b.value - a.value).slice(0,7);

  return `
    <div class="grid g4" style="margin-bottom:18px">
      ${UI.kpi('Active Trainees', UI.int(activeIds.size), `${d.trainees.length} in registry`, 'sea')}
      ${UI.kpi('Enrollments This Month', UI.int(enrThisMonth), `${ongoing} batch${ongoing===1?'':'es'} ongoing`, '')}
      ${UI.kpi('Collections This Month', UI.peso(collected), 'Official receipts issued', 'ok')}
      ${UI.kpi('Outstanding Receivables', UI.peso(aging.grand), `${aging.buckets.slice(1).reduce((s,b)=>s+b.rows.length,0)} past-due invoice(s)`, aging.grand > 0 ? 'warn' : 'ok')}
    </div>

    <div class="grid g-2-1">
      <div>
        ${UI.card('Billing vs Collections — last 6 months', UI.columns(months))}
        ${UI.card('Upcoming & ongoing batches',
          UI.table([
            { h:'Batch', k:b => `<b>${UI.esc(b.no)}</b>` },
            { h:'Course', k:b => UI.esc(CRS(b.courseId)?.title || '—') },
            { h:'Schedule', k:b => UI.dateRange(b.start,b.end) },
            { h:'Instructor', k:'instructor' },
            { h:'Seats', k:b => {
                const s = seats(b), pct = Math.min(100, s/b.capacity*100);
                return `<div style="display:flex;gap:8px;align-items:center"><div class="progress ${s>=b.capacity?'full':''}" style="flex:1"><div style="width:${pct}%"></div></div><span class="mono nowrap">${s}/${b.capacity}</span></div>`;
              }, w:'150px' },
            { h:'Status', k:b => UI.statusTag(b.status) },
          ], upcoming, { empty:'No open batches scheduled.', rowClass:'clickable',
                         rowAttrs:b => `data-act="roster" data-id="${b.id}"` }), { flush:true })}
      </div>
      <div>
        ${can('admissions') ? UI.card('Admissions queue', (() => {
          const waiting = APPS.pending();
          if(!waiting.length) return `<div class="empty"><span class="big">✉</span>No applications waiting.</div>`;
          return UI.table([
            { h:'Applicant', k:a => `<b>${UI.esc(APPS.forName(a))}</b><br>
                <span class="muted mono" style="font-size:11px">${UI.esc(a.ref)}</span>` },
            { h:'Course', k:a => UI.esc(CRS(a.courseId)?.code || '—'), w:'70px' },
            { h:'Waiting', k:a => { const n = APPS.ageDays(a);
                return n >= 3 ? `<b style="color:var(--warn)">${n}d</b>` : `${n}d`; }, cls:'num' },
            { h:'Status', k:a => UI.statusTag(a.status) },
          ], waiting.slice(0,8), { rowClass:'clickable',
              rowAttrs:a => `data-act="view-application" data-id="${a.id}"` });
        })(), { flush:true, sub:`${APPS.pending().length} awaiting a decision`,
                actions:`<a class="btn btn-ghost btn-xs" href="#/admissions">View all</a>` }) : ''}
        ${UI.card('Receivables ageing', `
          ${UI.barChart(aging.buckets.map(b => ({ label:b.label, value:b.total })), { money:true })}
          <div class="hr"></div>
          <div style="display:flex;justify-content:space-between;font-weight:700">
            <span>Total due</span><span class="mono">${UI.peso(aging.grand)}</span></div>`)}
        ${UI.card('Enrollment status', UI.donut(statusCounts, { center:'ENROLLMENTS' }))}
        ${UI.card('Most availed courses', UI.barChart(topCourses))}
      </div>
    </div>

    ${UI.card('Recent activity', UI.table([
      { h:'When', k:l => UI.esc(new Date(l.ts).toLocaleString('en-PH',{ month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })), w:'170px' },
      { h:'User', k:'user', w:'150px' },
      { h:'Action', k:'action' },
      { h:'Reference', k:l => `<span class="mono">${UI.esc(l.ref)}</span>` },
    ], d.log.slice(0,10), { empty:'No activity recorded yet.' }), { flush:true })}
  `;
};

/* ---------- Admissions ----------
   The registrar's side of the public portal. Applications arrive here as soft
   claims on a seat; nothing touches the ledger until one is converted, at which
   point the trainee record, the enrollment and the invoice are created together. */
VIEWS.admissions = () => {
  const q = (state.q.app || '').toLowerCase();
  const f = state.q.appStatus == null ? 'open' : state.q.appStatus;
  const c = APPS.counts();

  const rows = D().applications.filter(a => {
    if(f === 'open' && !APPS.isOpen(a)) return false;
    if(f && f !== 'open' && a.status !== f) return false;
    if(!q) return true;
    const crs = CRS(a.courseId), bat = BAT(a.batchId);
    return [a.no, a.ref, APPS.forName(a), a.mobile, a.email, a.agency, a.rank, crs?.code, bat?.no]
      .join(' ').toLowerCase().includes(q);
  }).sort((a,b) => b.submitted.localeCompare(a.submitted) || b.no.localeCompare(a.no));

  const waiting = APPS.pending();
  const stale = waiting.filter(a => APPS.ageDays(a) >= 3).length;

  return `
    <div class="grid g4" style="margin-bottom:16px">
      ${UI.kpi('Awaiting a decision', UI.int(waiting.length),
        stale ? `${stale} waiting 3+ days` : 'All within one working day', stale ? 'warn' : 'ok')}
      ${UI.kpi('Submitted', UI.int(c['Submitted']), 'Not yet opened', 'sea')}
      ${UI.kpi('Under review', UI.int(c['Under Review']), 'Registrar is checking documents', '')}
      ${UI.kpi('Converted to enrollment', UI.int(c['Enrolled']),
        `${c['Rejected']} rejected · ${c['Withdrawn']} withdrawn`, 'ok')}
    </div>

    <div class="toolbar">
      <input type="search" data-q="app" value="${UI.esc(state.q.app||'')}"
             placeholder="Search name, reference code, mobile, course…" style="min-width:290px">
      <select data-q="appStatus" style="min-width:180px">
        ${[['open','Open applications'],['','All applications'],
           ...APPS.ALL_STATES.map(s => [s,s])].map(([v,l]) =>
          `<option value="${v}" ${f===v?'selected':''}>${UI.esc(l)}</option>`).join('')}
      </select>
      <span class="muted">${rows.length} application(s)</span>
      <span class="spacer"></span>
      <a class="btn btn-ghost btn-sm" href="register.html" target="_blank" rel="noopener">Open public portal ↗</a>
    </div>

    ${UI.card('', UI.table([
      { h:'Application', k:a => `<span class="mono">${UI.esc(a.no)}</span><br>
          <span class="muted mono" style="font-size:11px">Ref ${UI.esc(a.ref)}</span>`, w:'150px' },
      { h:'Applicant', k:a => `<b>${UI.esc(APPS.forName(a))}</b><br>
          <span class="muted" style="font-size:11.5px">${UI.esc(a.rank || '—')}${a.agency ? ' · ' + UI.esc(a.agency) : ''}</span>` },
      { h:'Course requested', k:a => { const crs = CRS(a.courseId), b = a.batchId ? BAT(a.batchId) : null;
          return `<b>${UI.esc(crs?.title || '—')}</b><br><span class="muted" style="font-size:11.5px">${
            b ? UI.dateRange(b.start,b.end) + ' · ' + UI.esc(b.center)
              : UI.esc(crs?.duration || '') + ' · <i>schedule not yet assigned</i>'}</span>`; } },
      { h:'Contact', k:a => `${UI.esc(a.mobile)}<br><span class="muted" style="font-size:11.5px">${UI.esc(a.email || '—')}</span>` },
      { h:'Payer', k:a => `<span class="tag t-${a.payer === 'Agency-billed' ? 'info' : 'muted'}">${UI.esc(a.payer || 'Self-paid')}</span>` },
      { h:'Submitted', k:a => { const d = APPS.ageDays(a);
          return `${UI.date(a.submitted)}<br><span class="muted" style="font-size:11.5px">${d === 0 ? 'today' : d + ' day(s) ago'}</span>`; } },
      { h:'Status', k:a => UI.statusTag(a.status) },
      { h:'On file', k:a => { if(a.enrollmentId){ const e = ENR(a.enrollmentId);
            return e ? `<span class="mono" style="font-size:11.5px">${UI.esc(e.no)}</span>` : '—'; }
          const m = APPS.matchTrainee(a);
          return m ? `<span class="tag t-warn">Existing trainee</span>` : '<span class="muted">New</span>'; } },
    ], rows, { empty:f === 'open' ? 'No applications are waiting — the queue is clear.' : 'No application matches that filter.',
               rowClass:'clickable', rowAttrs:a => `data-act="view-application" data-id="${a.id}"` }), { flush:true })}
  `;
};

/* ---------- Trainees ---------- */
VIEWS.trainees = () => {
  const q = (state.q.trainee || '').toLowerCase();
  const rows = D().trainees.filter(t =>
    !q || [t.no,t.last,t.first,t.srn,t.sirb,t.rank,t.agency,t.mobile].join(' ').toLowerCase().includes(q));

  return `
    <div class="toolbar">
      <input type="search" data-q="trainee" value="${UI.esc(state.q.trainee||'')}" placeholder="Search name, SRN, SIRB, agency…" style="min-width:280px">
      <span class="muted">${rows.length} of ${D().trainees.length} record(s)</span>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="new-trainee">+ Register trainee</button>
    </div>
    ${UI.card('', UI.table([
      { h:'Trainee No.', k:t => `<span class="mono">${UI.esc(t.no)}</span>`, w:'130px' },
      { h:'Name', k:t => `<b>${UI.esc(name(t))}</b>` },
      { h:'Rank / Position', k:'rank' },
      { h:'Company', k:'agency' },
      { h:'SRN', k:t => `<span class="mono">${UI.esc(t.srn)}</span>` },
      { h:'Mobile', k:'mobile' },
      { h:'Courses', k:t => UI.int(D().enrollments.filter(e => e.traineeId === t.id).length), cls:'num' },
      { h:'Balance', k:t => { const b = traineeBalance(t.id);
          return b > 0 ? `<b style="color:var(--bad)">${UI.peso(b)}</b>` : `<span class="muted">—</span>`; }, cls:'num' },
    ], rows, { empty:'No trainee matches that search.', rowClass:'clickable',
               rowAttrs:t => `data-act="view-trainee" data-id="${t.id}"` }), { flush:true })}
  `;
};

/* ---------- Courses ---------- */
VIEWS.courses = () => {
  /* 239 courses — the list is only usable with a filter in front of it. */
  const q = (state.q.crs || '').toLowerCase();
  const all = D().courses;
  const rows = all.filter(c => !q || [c.code, c.title, ...(c.modes||[]), c.duration].join(' ').toLowerCase().includes(q));
  return `
    <div class="toolbar">
      <input type="search" data-q="crs" value="${UI.esc(state.q.crs||'')}"
             placeholder="Search course title, code or duration…" style="min-width:300px">
      <span class="muted">${rows.length} of ${all.filter(c=>c.active).length} active course(s)</span>
      <span class="spacer"></span>
      ${can('settings') ? `<button class="btn btn-primary btn-sm" data-act="new-course">+ Add course</button>` : ''}
    </div>
    ${UI.card('', UI.table([
      { h:'Code', k:c => `<b class="mono">${UI.esc(c.code)}</b>`, w:'90px' },
      { h:'Course Title', k:'title' },
      { h:'Duration', k:c => UI.esc(c.duration || '—') },
      { h:'Delivery', k:c => (c.modes||[]).length ? UI.esc(c.modes.join(', ')) : '<span class="muted">—</span>' },
      { h:'Scheduled', k:c => UI.int(D().batches.filter(b => b.courseId === c.id).length), cls:'num' },
      { h:'Enrolled', k:c => UI.int(D().enrollments.filter(e => e.courseId === c.id).length), cls:'num' },
      { h:'Status', k:c => UI.statusTag(c.active ? 'Open' : 'Closed') },
      { h:'', k:c => can('settings') ? `<button class="btn btn-ghost btn-xs" data-act="edit-course" data-id="${c.id}">Edit</button>` : '' },
    ], rows, { empty:'No course matches that search.' }), { flush:true })}
  `;
};

/* ---------- Batches ---------- */
VIEWS.batches = () => {
  const f = state.q.batchStatus || '';
  const rows = D().batches.filter(b => !f || b.status === f)
    .sort((a,b) => b.start.localeCompare(a.start));
  return `
    <div class="toolbar">
      <select data-q="batchStatus" style="min-width:160px">
        ${['','Open','Ongoing','Completed','Cancelled'].map(s =>
          `<option value="${s}" ${f===s?'selected':''}>${s||'All statuses'}</option>`).join('')}
      </select>
      <span class="muted">${rows.length} batch(es)</span>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="new-batch">+ Schedule batch</button>
    </div>
    ${UI.card('', UI.table([
      { h:'Batch No.', k:b => `<b class="mono">${UI.esc(b.no)}</b>`, w:'120px' },
      { h:'Course', k:b => { const c = CRS(b.courseId); return `<b>${UI.esc(c?.code||'')}</b> — ${UI.esc(c?.title||'')}`; } },
      { h:'Schedule', k:b => UI.dateRange(b.start,b.end) },
      { h:'Center', k:'center' },
      { h:'Venue', k:'room' },
      { h:'Instructor', k:'instructor' },
      { h:'Seats', k:b => { const s = seats(b), pct = Math.min(100, s/b.capacity*100);
          return `<div style="display:flex;gap:8px;align-items:center"><div class="progress ${s>=b.capacity?'full':''}" style="flex:1"><div style="width:${pct}%"></div></div><span class="mono nowrap">${s}/${b.capacity}</span></div>`; }, w:'140px' },
      { h:'Status', k:b => UI.statusTag(b.status) },
      { h:'', k:b => `<button class="btn btn-ghost btn-xs" data-act="roster" data-id="${b.id}">Roster</button>` },
    ], rows, { empty:'No batches scheduled.' }), { flush:true })}
  `;
};

/* ---------- Enrollments ---------- */
VIEWS.enrollments = () => {
  const q = (state.q.enr || '').toLowerCase(), f = state.q.enrStatus || '';
  const rows = D().enrollments.filter(e => {
    if(f && e.status !== f) return false;
    if(!q) return true;
    const t = T(e.traineeId), c = CRS(e.courseId), b = BAT(e.batchId);
    return [e.no, name(t), c?.code, c?.title, b?.no].join(' ').toLowerCase().includes(q);
  }).sort((a,b) => b.date.localeCompare(a.date));

  const billed = ACC.r2(rows.reduce((s,e) => { const i = invOf(e.id); return s + (i ? i.total : 0); }, 0));
  const due    = ACC.r2(rows.reduce((s,e) => { const i = invOf(e.id); return s + (i ? ACC.balanceOf(ACC.recomputeInvoice(i)) : 0); }, 0));

  return `
    <div class="toolbar">
      <input type="search" data-q="enr" value="${UI.esc(state.q.enr||'')}" placeholder="Search trainee, course, batch…" style="min-width:250px">
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
      { h:'Batch', k:e => { const b = BAT(e.batchId); return b ? `<span class="mono">${UI.esc(b.no)}</span><br><span class="muted" style="font-size:11.5px">${UI.dateRange(b.start,b.end)}</span>` : '—'; } },
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
      ${UI.kpi('Total Billed', UI.peso(tot), 'VAT inclusive', 'sea')}
      ${UI.kpi('Total Collected', UI.peso(paid), 'Applied to these invoices', 'ok')}
      ${UI.kpi('Outstanding', UI.peso(ACC.r2(tot - paid)), 'Still collectible', tot-paid>0?'warn':'ok')}
    </div>
    ${UI.card('', UI.table([
      { h:'Invoice No.', k:i => `<b class="mono">${UI.esc(i.no)}</b>`, w:'135px' },
      { h:'Date', k:i => UI.date(i.date), w:'115px' },
      { h:'Trainee', k:i => UI.esc(name(T(i.traineeId))) },
      { h:'Particulars', k:i => UI.esc(i.items.map(x => x.desc).join(', ')) },
      { h:'VAT', k:i => UI.num(i.vat), cls:'num' },
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
        { h:'Method', k:p => UI.tag(p.method, p.method==='Cash'?'ok':'sea') },
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
            <dt>Output VAT payable</dt><dd class="mono">${UI.peso(g('2100'))}</dd>
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
      <p class="muted" style="font-size:12px;margin-top:12px">Revenue is shown net of VAT and net of discounts given. Prepared on a modified cash basis from posted journal entries.</p>`);
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
      m.count++; m.gross = ACC.r2(m.gross + i.total); m.net = ACC.r2(m.net + i.net);
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
        { h:'Net of VAT', k:r => UI.num(r.net), cls:'num' },
        { h:'Collected', k:r => UI.num(r.collected), cls:'num' },
        { h:'Uncollected', k:r => { const v = ACC.r2(r.gross - r.collected);
            return v > 0.004 ? `<b style="color:var(--bad)">${UI.num(v)}</b>` : '<span class="muted">—</span>'; }, cls:'num' },
      ], rows, { empty:'No billings in this period.',
        foot:['','TOTAL', UI.int(rows.reduce((s,r)=>s+r.count,0)), UI.num(rows.reduce((s,r)=>s+r.gross,0)),
              UI.num(rows.reduce((s,r)=>s+r.net,0)), UI.num(rows.reduce((s,r)=>s+r.collected,0)),
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
          ${UI.f.text('accreditation','Accreditation reference', c.accreditation)}
          ${UI.row(
            UI.f.num('vatRate','VAT rate (%)', c.vatRate, { step:'0.01', min:0 }),
            UI.f.select('vatInclusive','Published fees are', c.vatInclusive ? '1' : '0',
              [{ v:'1', l:'VAT inclusive' }, { v:'0', l:'VAT exclusive (added on top)' }]))}
          <button class="btn btn-primary" type="submit">Save company profile</button>
        </form>`)}
      <div>
        ${UI.card('Optional fees', `
          <p class="muted" style="font-size:12.5px;margin-top:0">Offered as tick-boxes when billing an enrollment.</p>
          ${UI.table([
            { h:'Description', k:'desc' },
            { h:'Account', k:a => `<span class="mono">${UI.esc(a.account)}</span>` },
            { h:'Amount', k:a => UI.peso(a.price), cls:'num' },
          ], addons())}
          <button class="btn btn-ghost btn-sm btn-block" data-act="edit-addons">Edit optional fees</button>`, { flush:false })}

        ${UI.card('Users & access', UI.table([
          { h:'User', k:'name' },
          { h:'Role', k:u => UI.tag(u.role, 'info') },
          { h:'Modules', k:u => `<span class="muted">${DB.PERMS[u.role].length} of ${Object.keys(TITLES).length}</span>` },
        ], d.users), { flush:true })}

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

/* ----- admissions ----- */
function applicationModal(a){
  const c = CRS(a.courseId), b = a.batchId ? BAT(a.batchId) : null;
  const match = APPS.matchTrainee(a);
  const options = c ? APPS.openBatches(c.id) : [];
  const closed = APPS.isFinal(a);

  /* Only offer transitions the lifecycle actually permits. */
  const allow = s => APPS.NEXT[a.status].includes(s);
  const acts = [
    allow('Under Review') ? `<button type="button" class="btn btn-ghost" id="aReview">Mark under review</button>` : '',
    allow('Approved')     ? `<button type="button" class="btn btn-ghost" id="aApprove">Approve</button>` : '',
    allow('Enrolled')     ? `<button type="button" class="btn btn-accent" id="aEnroll">Enroll &amp; bill</button>` : '',
    allow('Rejected')     ? `<button type="button" class="btn btn-danger" id="aReject">Reject</button>` : '',
  ].filter(Boolean).join('');

  UI.modal({
    title:`${APPS.forName(a)}`,
    sub:`${a.no} · Ref ${a.ref} · submitted ${UI.date(a.submitted)} via ${a.channel}`,
    wide:true, hideSubmit:true, footExtra:acts,
    body:`
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
        ${UI.statusTag(a.status)}
        <span class="tag t-${a.payer === 'Agency-billed' ? 'info' : 'muted'}">${UI.esc(a.payer || 'Self-paid')}</span>
        ${APPS.isOpen(a) && APPS.ageDays(a) >= 3
          ? `<span class="tag t-warn">Waiting ${APPS.ageDays(a)} days</span>` : ''}
      </div>

      ${match && !a.traineeId ? `<div class="note warn">
        <b>This applicant is already in the registry.</b> Matched on ${UI.esc(match.on)} —
        <b>${UI.esc(name(match.trainee))}</b> (${UI.esc(match.trainee.no)}). Enrolling will
        reuse that master record and refresh its contact details rather than create a
        second file.</div>` : ''}
      ${!match && !a.traineeId ? `<div class="note">No matching trainee on file. Enrolling
        this application creates a new master record.</div>` : ''}

      <div class="note ${!closed && !options.length && !b ? 'warn' : ''}">
        <b>${UI.esc(c?.title || 'Course no longer in the catalogue')}</b>
        ${(c?.modes||[]).length ? ` · ${UI.esc(c.modes.join(' / '))}` : ''}<br>
        ${UI.esc(c?.duration || 'Duration to be confirmed')}<br>
        ${b
          ? `<b>Placed on</b> ${UI.dateRange(b.start,b.end)} · ${UI.esc(b.center)} ·
             ${UI.esc(b.room)} · fee ${UI.peso(b.fee)}`
          : options.length
            ? `<b>${options.length} open schedule(s)</b> to choose from at enrollment —
               earliest ${UI.dateRange(options[0].start, options[0].end)} at ${UI.esc(options[0].center)},
               ${UI.peso(options[0].fee)}`
            : `<b>No open schedule for this course.</b> Schedule a batch before enrolling this applicant.`}
      </div>

      <div class="grid g2">
        <dl class="def">
          <dt>SRN</dt><dd class="mono"><b>${UI.esc(a.srn || '—')}</b></dd>
          <dt>SIRB</dt><dd class="mono">${UI.esc(a.sirb || '—')}</dd>
          <dt>Passport</dt><dd class="mono">${UI.esc(a.passport || '—')}</dd>
          <dt>Sex / Birthdate</dt><dd>${a.sex === 'F' ? 'Female' : 'Male'} · ${UI.date(a.birth)}</dd>
          <dt>Place of birth</dt><dd>${UI.esc(a.birthPlace || '—')}</dd>
          <dt>Rank / position</dt><dd>${UI.esc(a.rank || '—')}</dd>
          <dt>Company</dt><dd>${UI.esc(a.agency || 'Direct hire / walk-in')}</dd>
        </dl>
        <dl class="def">
          <dt>Mobile</dt><dd>${UI.esc(a.mobile || '—')}</dd>
          <dt>Email</dt><dd>${UI.esc(a.email || '—')}</dd>
          <dt>Address</dt><dd>${UI.esc(a.address || '—')}</dd>
          <dt>Emergency contact</dt><dd>${UI.esc(a.emergencyName || '—')}${a.emergencyRelation ? ` <span class="muted">(${UI.esc(a.emergencyRelation)})</span>` : ''}</dd>
          <dt>Emergency number</dt><dd>${UI.esc(a.emergencyMobile || '—')}</dd>
          <dt>Notes</dt><dd>${UI.esc(a.remarks || '—')}</dd>
          ${a.reason ? `<dt>Reason</dt><dd>${UI.esc(a.reason)}</dd>` : ''}
          ${a.enrollmentId ? `<dt>Enrollment</dt><dd class="mono">${UI.esc(ENR(a.enrollmentId)?.no || '—')}</dd>` : ''}
        </dl>
      </div>

      <div class="hr"></div>
      <h4 style="margin:0 0 8px;font-size:13px">Audit trail</h4>
      ${UI.table([
        { h:'When', k:h => UI.date(h.ts.slice(0,10)) + ' ' + h.ts.slice(11,16), w:'150px' },
        { h:'Status', k:h => UI.statusTag(h.status), w:'130px' },
        { h:'By', k:'by', w:'150px' },
        { h:'Note', k:'note' },
      ], a.history, { empty:'No history recorded.' })}
      ${closed ? '' : `<div class="note" style="margin:14px 0 0">Nothing is posted to the
        ledger until this application is enrolled. Rejecting or withdrawing it leaves the
        books untouched.</div>`}`
  });

  const step = (status, verb) => {
    APPS.advance(a, status, SESSION.name, '');
    DB.activity(verb, a.no); DB.save();
    UI.toast(`${a.no} — ${status.toLowerCase()}.`);
    UI.close(); render();
  };
  const on = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };

  on('aReview',  () => step('Under Review', 'Opened application for review'));
  on('aApprove', () => step('Approved', 'Approved application'));
  on('aEnroll',  () => convertForm(a));
  on('aReject',  () => UI.confirm(`Reject application ${a.no}?`, fd => {
    APPS.reject(a, fd.reason || '', SESSION.name);
    DB.save(); UI.toast('Application rejected.'); render();
  }, { danger:true, yes:'Reject application', reason:true,
       detail:'The applicant will see this status and the reason on the public tracker. Nothing is posted to the ledger.' }));
}

/* Approve → enroll: one confirmation that creates the trainee, the enrollment and
   (unless it is only reserved) the invoice and its journal entry. */
function convertForm(a){
  const c = CRS(a.courseId);
  if(!c){ UI.toast('The course this application asked for no longer exists.', 'bad'); return; }

  /* The applicant asked for a course; the registrar chooses which dated run at
     which partner center they go on. That choice sets the fee. */
  const options = APPS.openBatches(c.id);
  if(!options.length){
    UI.confirm(`No open schedule for ${c.title}.`, () => { location.hash = '#/batches'; },
      { yes:'Schedule a batch', title:'Nothing to place them on',
        detail:'This applicant asked for a course that has no open batch with a free seat. Schedule one first, then come back and enroll them.' });
    return;
  }
  const match = APPS.matchTrainee(a);
  const first = options[0];

  UI.modal({
    title:'Enroll applicant — ' + APPS.forName(a),
    sub:`${a.no} · ${c.title}`,
    wide:true,
    submitLabel:'Enroll and post',
    body:`
      <div class="note ${match ? 'warn' : ''}">
        ${match
          ? `Reusing existing master record <b>${UI.esc(name(match.trainee))}</b>
             (${UI.esc(match.trainee.no)}), matched on ${UI.esc(match.on)}.`
          : `A new trainee master record will be created for this applicant.`}
      </div>
      <h4 style="margin:0 0 8px;font-size:13px">Place them on a schedule</h4>
      ${UI.f.select('batchId','Schedule', first.id, options.map(o => {
          const s = APPS.seatsTaken(o);
          return { v:o.id, l:`${UI.dateRange(o.start,o.end)} · ${o.center} · ${UI.peso(o.fee)} · ${s.free} seat(s) left` };
        }), { req:true })}
      ${UI.row(
        UI.f.select('mode','Enrollment status','Enrolled',
          [{v:'Enrolled',l:'Enrolled — issue the invoice now'},
           {v:'Reserved',l:'Reserved — hold the seat, bill later'}]),
        UI.f.text('payer','Fee billed to', a.payer || 'Self-paid', { ro:true }))}
      <div class="hr"></div>
      <h4 style="margin:0 0 8px;font-size:13px">Charges</h4>
      <div class="note" id="batchNote" style="margin-bottom:12px"></div>
      <div class="chips" id="addonBox" style="margin-bottom:12px">
        ${addons().map((ad,i) => `<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;background:var(--surface-2);border:1px solid var(--border);padding:6px 10px;border-radius:7px;cursor:pointer">
            <input type="checkbox" name="addon${i}" value="${i}" style="width:auto;margin:0"> ${UI.esc(ad.desc)} — ${UI.peso(ad.price)}</label>`).join('')}
      </div>
      ${UI.row(UI.f.num('discount','Discount (₱)','0',{ min:0 }),
               UI.f.text('discountNote','Reason for discount','',{ ph:'e.g. agency package rate' }))}
      <div class="hr"></div>
      <div id="summary"></div>`,
    onSubmit: fd => {
      const chosen = addons().filter((ad,i) => fd['addon'+i]);
      try{
        const out = APPS.convert(a, {
          by:SESSION.name, batchId:fd.batchId, mode:fd.mode, addons:chosen,
          discount:fd.discount, discountNote:fd.discountNote,
        });
        UI.toast(out.invoice
          ? `Enrolled ${out.enrollment.no} — invoice ${out.invoice.no} for ${UI.peso(out.invoice.total)}`
          : `Seat reserved as ${out.enrollment.no} — not yet billed.`);
        refresh();
      }catch(e){
        UI.toast(e.message, 'bad');
        return false;
      }
    }
  });

  const form = document.getElementById('mForm');
  const recalc = () => {
    const b = BAT(form.batchId.value) || first;
    document.getElementById('batchNote').innerHTML =
      `<b>${UI.esc(c.title)}</b> · ${UI.esc(c.duration || '')}<br>
       ${UI.esc(b.center)} · ${UI.dateRange(b.start,b.end)} · ${UI.esc(b.room)} · fee ${UI.peso(b.fee)}`;
    const items = [{ qty:1, price:b.fee }];
    addons().forEach((ad,i) => { if(form['addon'+i] && form['addon'+i].checked) items.push({ qty:1, price:ad.price }); });
    const t = ACC.computeInvoice(items, form.discount.value);
    const reserved = form.mode.value === 'Reserved';
    document.getElementById('summary').innerHTML = `
      <div style="display:flex;justify-content:flex-end">
        <table style="width:320px">
          <tr><td>Gross charges</td><td class="num">${UI.num(t.subtotal)}</td></tr>
          <tr><td>Less: discount</td><td class="num">${t.discount ? '(' + UI.num(t.discount) + ')' : '—'}</td></tr>
          <tr><td>VAT-able amount</td><td class="num">${UI.num(t.net)}</td></tr>
          <tr><td>VAT (${D().company.vatRate}%)</td><td class="num">${UI.num(t.vat)}</td></tr>
          <tr><td style="font-weight:700;border-top:2px solid var(--border-strong)">Amount due</td>
              <td class="num" style="font-weight:700;font-size:15px;border-top:2px solid var(--border-strong)">${UI.peso(t.total)}</td></tr>
        </table>
      </div>
      ${reserved ? '<div class="note warn">Reserved slots are <b>not billed</b>. No invoice or journal entry will be created until the enrollment is confirmed.</div>' : ''}`;
  };
  form.addEventListener('input', recalc);
  form.addEventListener('change', recalc);
  recalc();
}

function traineeForm(t){
  const isNew = !t;
  t = t || { srn:'', last:'', first:'', middle:'', suffix:'', sex:'M', birth:'', birthPlace:'',
             sirb:'', passport:'', rank:'', agency:'', mobile:'', email:'', address:'',
             emergencyName:'', emergencyRelation:'', emergencyMobile:'', remarks:'' };
  const H = s => `<h4 style="margin:18px 0 8px;font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--tb-orange);border-bottom:2px solid var(--tb-orange-soft);padding-bottom:5px">${s}</h4>`;
  UI.modal({
    title: isNew ? 'Register trainee' : 'Edit trainee — ' + t.no,
    sub: 'Seafarer master record',
    wide:true,
    body: `
      ${H('Seafarer identity')}
      ${UI.row(UI.f.text('srn','SRN', t.srn, { req:true, hint:'Seafarer Registration No.' }),
               UI.f.text('sirb','SIRB No.', t.sirb), UI.f.text('passport','Passport No.', t.passport))}
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
        const rec = { id:DB.uid('trn'), no:DB.nextNo('trainee','TRN'), registered:DB.today(), ...fd };
        D().trainees.push(rec);
        DB.activity('Registered trainee', rec.no);
        UI.toast('Trainee registered — ' + rec.no);
      }else{
        Object.assign(t, fd);
        DB.activity('Updated trainee', t.no);
        UI.toast('Trainee record updated.');
      }
      refresh();
    }
  });
}

function traineeProfile(t){
  const enr = D().enrollments.filter(e => e.traineeId === t.id).sort((a,b) => b.date.localeCompare(a.date));
  const invs = D().invoices.filter(i => i.traineeId === t.id).map(i => (ACC.recomputeInvoice(i), i));
  const pays = D().payments.filter(p => p.traineeId === t.id && !p.voided);
  const bal = traineeBalance(t.id);

  UI.modal({
    title: name(t), sub:`${t.no} · ${t.rank || 'No rank on file'} · ${t.agency || 'No agency'}`, wide:true,
    hideSubmit:true,
    footExtra:`<button type="button" class="btn btn-ghost" id="editTrainee">Edit record</button>
               <button type="button" class="btn btn-accent" id="enrollHere">Enroll in a course</button>`,
    body: `
      <div class="grid g2">
        <dl class="def">
          <dt>SRN</dt><dd class="mono"><b>${UI.esc(t.srn||'—')}</b></dd>
          <dt>SIRB</dt><dd class="mono">${UI.esc(t.sirb||'—')}</dd>
          <dt>Passport</dt><dd class="mono">${UI.esc(t.passport||'—')}</dd>
          <dt>Sex / Birthdate</dt><dd>${t.sex === 'F' ? 'Female' : 'Male'} · ${UI.date(t.birth)}</dd>
          <dt>Place of birth</dt><dd>${UI.esc(t.birthPlace||'—')}</dd>
        </dl>
        <dl class="def">
          <dt>Mobile</dt><dd>${UI.esc(t.mobile||'—')}</dd>
          <dt>Email</dt><dd>${UI.esc(t.email||'—')}</dd>
          <dt>Address</dt><dd>${UI.esc(t.address||'—')}</dd>
          <dt>Emergency contact</dt><dd>${UI.esc(t.emergencyName||'—')}${t.emergencyRelation ? ` <span class="muted">(${UI.esc(t.emergencyRelation)})</span>` : ''}</dd>
          <dt>Emergency number</dt><dd>${UI.esc(t.emergencyMobile||'—')}</dd>
          <dt>Registered</dt><dd>${UI.date(t.registered)}</dd>
        </dl>
      </div>
      <div class="hr"></div>
      <div class="grid g3" style="margin-bottom:16px">
        ${UI.kpi('Courses taken', UI.int(enr.length), `${enr.filter(e=>e.result==='Passed').length} passed`, '')}
        ${UI.kpi('Total billed', UI.peso(invs.filter(i=>!i.voided).reduce((s,i)=>s+i.total,0)), `${pays.length} payment(s)`, 'sea')}
        ${UI.kpi('Outstanding', UI.peso(bal), bal > 0 ? 'Please settle' : 'Fully settled', bal > 0 ? 'bad' : 'ok')}
      </div>
      <h4 style="margin:0 0 8px;font-size:13px">Training history</h4>
      ${UI.table([
        { h:'Enrollment', k:e => `<span class="mono">${UI.esc(e.no)}</span>` },
        { h:'Course', k:e => UI.esc(CRS(e.courseId)?.title || '—') },
        { h:'Schedule', k:e => { const b = BAT(e.batchId); return b ? UI.dateRange(b.start,b.end) : '—'; } },
        { h:'Status', k:e => UI.statusTag(e.status) },
        { h:'Result', k:e => e.result ? UI.statusTag(e.result) : '—' },
        { h:'Certificate', k:e => `<span class="mono">${UI.esc(e.certificateNo||'—')}</span>` },
      ], enr, { empty:'No training history yet.' })}
      <div class="hr"></div>
      <h4 style="margin:0 0 8px;font-size:13px">Statement of account</h4>
      ${UI.table([
        { h:'Invoice', k:i => `<span class="mono">${UI.esc(i.no)}</span>` },
        { h:'Date', k:i => UI.date(i.date) },
        { h:'Total', k:i => UI.num(i.total), cls:'num' },
        { h:'Paid', k:i => UI.num(i.paid||0), cls:'num' },
        { h:'Balance', k:i => i.voided ? '—' : UI.num(ACC.balanceOf(i)), cls:'num' },
        { h:'Status', k:i => UI.statusTag(invStatus(i)) },
      ], invs, { empty:'No invoices issued.' })}`
  });
  document.getElementById('editTrainee').onclick = () => traineeForm(t);
  document.getElementById('enrollHere').onclick = () => enrollmentForm(null, t.id);
}

function courseForm(c){
  const isNew = !c;
  c = c || { code:'', title:'', regulation:'', category:'Basic Safety', days:3, fee:0, capacity:25, active:true };
  UI.modal({
    title: isNew ? 'Add course' : 'Edit course — ' + c.code,
    body: `
      ${UI.row(UI.f.text('code','Course code', c.code, { req:true, ph:'e.g. SCRB' }),
               UI.f.text('modes','Delivery modes', (c.modes||[]).join(', '), { ph:'e.g. Blended, Face to face' }))}
      ${UI.f.text('title','Course title', c.title, { req:true })}
      ${UI.row(UI.f.num('days','Duration (days)', c.days, { step:'0.5', min:0 }),
               UI.f.text('duration','Duration shown to applicants', c.duration, { ph:'e.g. 5 days' }),
               UI.f.select('active','Status', c.active ? '1' : '0', [{v:'1',l:'Open for enrollment'},{v:'0',l:'Not offered'}]))}`,
    submitLabel: isNew ? 'Add course' : 'Save changes',
    onSubmit: fd => {
      const rec = { ...fd, days:fd.days ? +fd.days : null, active:fd.active === '1',
                    modes:String(fd.modes||'').split(',').map(s => s.trim()).filter(Boolean) };
      if(isNew){ D().courses.push({ id:DB.uid('crs'), ...rec }); DB.activity('Added course', rec.code); UI.toast('Course added.'); }
      else { Object.assign(c, rec); DB.activity('Updated course', c.code); UI.toast('Course updated.'); }
      refresh();
    }
  });
}

function batchForm(b){
  const isNew = !b;
  const active = D().courses.filter(c => c.active);
  b = b || { courseId:active[0]?.id, start:DB.today(), end:'', center:'', room:'', instructor:'',
             fee:0, capacity:25, status:'Open' };
  const centers = [...new Set(D().batches.map(x => x.center).filter(Boolean))].sort();
  UI.modal({
    title: isNew ? 'Schedule a batch' : 'Edit batch — ' + b.no,
    wide:true,
    body: `
      ${UI.f.select('courseId','Course', b.courseId, active.map(c => ({ v:c.id, l:`${c.title}${c.duration ? ' (' + c.duration + ')' : ''}` })), { req:true, attr:'list="centerList"' })}
      ${UI.row(UI.f.text('center','Training center', b.center, { req:true, hint:'partner running this batch', attr:'list="centerList"' }),
               UI.f.num('fee','Training fee (₱)', b.fee, { req:true, min:0, hint:'this center, this batch' }))}
      <datalist id="centerList">${centers.map(x => `<option value="${UI.esc(x)}">`).join('')}</datalist>
      ${UI.row(UI.f.date('start','Start date', b.start, { req:true }), UI.f.date('end','End date', b.end, { req:true }))}
      ${UI.row(UI.f.text('room','Venue / room', b.room, { ph:'e.g. Simulator A' }), UI.f.text('instructor','Instructor', b.instructor))}
      ${UI.row(UI.f.num('capacity','Seat capacity', b.capacity, { step:'1', min:1, req:true }),
               UI.f.select('status','Status', b.status, ['Open','Ongoing','Completed','Cancelled']))}
      <div class="note">The fee belongs to the batch, not the course — the same course costs
        a different amount at each partner center. Leave the end date blank and it will be
        computed from the course duration.</div>`,
    submitLabel: isNew ? 'Schedule batch' : 'Save changes',
    onSubmit: fd => {
      const c = CRS(fd.courseId);
      let end = fd.end;
      if(!end){ const e = new Date(fd.start); e.setDate(e.getDate() + Math.ceil(c.days || 1) - 1); end = e.toISOString().slice(0,10); }
      if(end < fd.start){ UI.toast('End date cannot precede the start date.', 'bad'); return false; }
      const rec = { ...fd, end, capacity:+fd.capacity, fee:ACC.r2(fd.fee) };
      if(isNew){
        D().seq.batch++;
        const no = `${c.code}-${String(D().seq.batch).padStart(3,'0')}`;
        D().batches.push({ id:DB.uid('bat'), no, ...rec });
        DB.activity('Scheduled batch', no); UI.toast('Batch scheduled — ' + no);
      }else{
        Object.assign(b, rec); DB.activity('Updated batch', b.no); UI.toast('Batch updated.');
      }
      refresh();
    }
  });
  // Track the course's own defaults as the selection changes.
  const sel = document.querySelector('#mForm [name=courseId]');
  sel.onchange = () => {
    const c = CRS(sel.value), form = sel.form;
    if(form.start.value){ const e = new Date(form.start.value); e.setDate(e.getDate() + Math.ceil(c.days || 1) - 1); form.end.value = e.toISOString().slice(0,10); }
  };
  const st = document.querySelector('#mForm [name=start]');
  st.onchange = () => { const c = CRS(sel.value); if(!c || !st.value) return; const e = new Date(st.value); e.setDate(e.getDate() + Math.ceil(c.days || 1) - 1); st.form.end.value = e.toISOString().slice(0,10); };
}

function rosterModal(b){
  const c = CRS(b.courseId);
  const list = D().enrollments.filter(e => e.batchId === b.id);
  UI.modal({
    title: `Roster — ${b.no}`, wide:true,
    sub: `${c?.title} · ${UI.dateRange(b.start,b.end)} · ${b.room} · ${b.instructor}`,
    hideSubmit:true,
    footExtra:`<button type="button" class="btn btn-ghost" id="editBatch">Edit batch</button>
               <button type="button" class="btn btn-accent" id="addToBatch">Add trainee</button>
               <button type="button" class="btn btn-ghost" onclick="UI.print()">Print roster</button>`,
    body: `
      <div class="grid g3" style="margin-bottom:16px">
        ${UI.kpi('Seats taken', `${seats(b)} / ${b.capacity}`, `${Math.max(b.capacity - seats(b),0)} remaining`, seats(b) >= b.capacity ? 'bad' : 'ok')}
        ${UI.kpi('Billed', UI.peso(list.reduce((s,e) => { const i = invOf(e.id); return s + (i ? i.total : 0); }, 0)), 'For this batch', 'sea')}
        ${UI.kpi('Uncollected', UI.peso(list.reduce((s,e) => { const i = invOf(e.id); return s + (i ? ACC.balanceOf(ACC.recomputeInvoice(i)) : 0); }, 0)), 'Outstanding', 'warn')}
      </div>
      ${UI.table([
        { h:'#', k:(e,i) => i+1, w:'40px' },
        { h:'Trainee', k:e => `<b>${UI.esc(name(T(e.traineeId)))}</b><br><span class="muted" style="font-size:11.5px">${UI.esc(T(e.traineeId)?.srn||'')}</span>` },
        { h:'Agency', k:e => UI.esc(T(e.traineeId)?.agency || '—') },
        { h:'Status', k:e => UI.statusTag(e.status) },
        { h:'Billing', k:e => { const i = invOf(e.id); return i ? UI.statusTag(invStatus(i)) : UI.tag('Not billed','muted'); } },
        { h:'Result', k:e => e.result ? UI.statusTag(e.result) : '<span class="muted">—</span>' },
        { h:'', k:e => `<button type="button" class="btn btn-ghost btn-xs no-print" data-act="view-enrollment" data-id="${e.id}">Open</button>` },
      ], list, { empty:'No one enrolled in this batch yet.' })}`
  });
  document.getElementById('editBatch').onclick = () => batchForm(b);
  document.getElementById('addToBatch').onclick = () => enrollmentForm(null, null, b.id);
}

/* ----- enrollment ----- */
function enrollmentForm(existing, presetTrainee, presetBatch){
  const openBatches = D().batches.filter(b => ['Open','Ongoing'].includes(b.status))
    .sort((a,b) => a.start.localeCompare(b.start));
  if(!openBatches.length){ UI.toast('Schedule a batch first — there are no open batches.', 'bad'); return; }

  const body = `
    ${UI.f.select('traineeId','Trainee', presetTrainee || '', D().trainees
        .slice().sort((a,b) => a.last.localeCompare(b.last))
        .map(t => ({ v:t.id, l:`${name(t)} — ${t.no}${t.agency ? ' · ' + t.agency : ''}` })),
        { req:true, blank:'— select trainee —' })}
    ${UI.f.select('batchId','Batch', presetBatch || '', openBatches.map(b => {
        const c = CRS(b.courseId), taken = seats(b);
        return { v:b.id, l:`${b.no} · ${c.code} · ${UI.dateRange(b.start,b.end)} · ${taken}/${b.capacity} seats` };
      }), { req:true, blank:'— select batch —' })}
    ${UI.row(
      UI.f.select('status','Registration status','Enrolled',
        [{v:'Enrolled',l:'Enrolled — bill now'},{v:'Reserved',l:'Reserved — bill later'}]),
      UI.f.date('date','Date of registration', DB.today(), { req:true }))}
    <div class="hr"></div>
    <h4 style="margin:0 0 8px;font-size:13px">Charges</h4>
    <div id="feeBase" class="note">Select a batch to load the published rate.</div>
    <div class="chips" id="addonBox" style="margin-bottom:12px">
      ${addons().map((a,i) => `<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;background:var(--surface-2);border:1px solid var(--border);padding:6px 10px;border-radius:7px;cursor:pointer">
          <input type="checkbox" name="addon${i}" value="${i}" style="width:auto;margin:0"> ${UI.esc(a.desc)} — ${UI.peso(a.price)}</label>`).join('')}
    </div>
    ${UI.row(UI.f.num('discount','Discount (₱)','0',{ min:0 }), UI.f.text('discountNote','Reason for discount','',{ ph:'e.g. agency package rate' }))}
    ${UI.f.area('remarks','Remarks','')}
    <div class="hr"></div>
    <div id="summary"></div>`;

  UI.modal({
    title:'New enrollment', sub:'Registration and billing in one step', wide:true, body,
    submitLabel:'Enroll trainee',
    onSubmit: fd => {
      const b = BAT(fd.batchId), c = CRS(b.courseId);
      if(!fd.traineeId) { UI.toast('Select a trainee.', 'bad'); return false; }
      if(D().enrollments.some(e => e.traineeId === fd.traineeId && e.batchId === fd.batchId && e.status !== 'Cancelled')){
        UI.toast('That trainee is already on this batch.', 'bad'); return false;
      }
      if(seats(b) >= b.capacity){ UI.toast('This batch is already full.', 'bad'); return false; }

      const chosen = addons().filter((a,i) => fd['addon'+i]);
      const discount = ACC.r2(fd.discount);
      const enr = {
        id:DB.uid('enr'), no:DB.nextNo('enrollment','ENR'),
        traineeId:fd.traineeId, batchId:b.id, courseId:c.id,
        date:fd.date, status:fd.status, result:'',
        fee:b.fee, discount, discountNote:fd.discountNote || '',
        certificateNo:'', remarks:fd.remarks || '',
      };
      D().enrollments.push(enr);

      if(fd.status === 'Enrolled'){
        const items = [{ desc:`${c.title} — ${b.center}`, account:'4000', qty:1, price:b.fee },
                       ...chosen.map(a => ({ desc:a.desc, account:a.account, qty:1, price:a.price }))];
        const inv = ACC.buildInvoice({ enrollmentId:enr.id, traineeId:enr.traineeId, date:enr.date, items, discount });
        D().invoices.push(inv); ACC.postInvoice(inv); enr.invoiceId = inv.id;
        DB.activity('Enrolled trainee and billed', `${enr.no} / ${inv.no}`);
        UI.toast(`Enrolled — invoice ${inv.no} for ${UI.peso(inv.total)}`);
      }else{
        DB.activity('Reserved a slot', enr.no);
        UI.toast('Slot reserved — bill it when the trainee confirms.');
      }
      refresh();
    }
  });

  /* Live charge summary */
  const form = document.getElementById('mForm');
  const recalc = () => {
    const b = BAT(form.batchId.value);
    if(!b){ document.getElementById('feeBase').textContent = 'Select a batch to load the published rate.'; document.getElementById('summary').innerHTML = ''; return; }
    const c = CRS(b.courseId);
    document.getElementById('feeBase').innerHTML =
      `<b>${UI.esc(c.title)}</b><br>${UI.esc(b.center)} · ${UI.peso(b.fee)} · ${UI.esc(c.duration || '')} · ${UI.dateRange(b.start,b.end)} · ${seats(b)}/${b.capacity} seats taken`;

    const items = [{ qty:1, price:b.fee }];
    addons().forEach((a,i) => { if(form['addon'+i] && form['addon'+i].checked) items.push({ qty:1, price:a.price }); });
    const t = ACC.computeInvoice(items, form.discount.value);
    const reserved = form.status.value === 'Reserved';
    document.getElementById('summary').innerHTML = `
      <div style="display:flex;justify-content:flex-end">
        <table style="width:320px">
          <tr><td>Gross charges</td><td class="num">${UI.num(t.subtotal)}</td></tr>
          <tr><td>Less: discount</td><td class="num">${t.discount ? '(' + UI.num(t.discount) + ')' : '—'}</td></tr>
          <tr><td>VAT-able amount</td><td class="num">${UI.num(t.net)}</td></tr>
          <tr><td>VAT (${D().company.vatRate}%)</td><td class="num">${UI.num(t.vat)}</td></tr>
          <tr><td style="font-weight:700;border-top:2px solid var(--border-strong)">Amount due</td>
              <td class="num" style="font-weight:700;font-size:15px;border-top:2px solid var(--border-strong)">${UI.peso(t.total)}</td></tr>
        </table>
      </div>
      ${reserved ? '<div class="note warn">Reserved slots are <b>not billed</b>. No invoice or journal entry will be created until the enrollment is confirmed.</div>' : ''}`;
  };
  form.addEventListener('input', recalc);
  form.addEventListener('change', recalc);
  recalc();
}

function enrollmentModal(e){
  const t = T(e.traineeId), c = CRS(e.courseId), b = BAT(e.batchId), inv = invOf(e.id);
  const bal = inv ? ACC.balanceOf(ACC.recomputeInvoice(inv)) : 0;

  UI.modal({
    title:`Enrollment ${e.no}`, sub:`${name(t)} · ${c?.code}`, wide:true, hideSubmit:true,
    footExtra:`
      ${!inv && e.status !== 'Cancelled' ? `<button type="button" class="btn btn-brass" id="billIt">Generate invoice</button>` : ''}
      ${inv && bal > 0.004 && can('payments') ? `<button type="button" class="btn btn-accent" id="payIt">Record payment</button>` : ''}
      ${inv ? `<button type="button" class="btn btn-ghost" id="openInv">Open invoice</button>` : ''}
      ${e.status !== 'Cancelled' ? `<button type="button" class="btn btn-ghost" id="markResult">Record result</button>` : ''}
      ${e.status !== 'Cancelled' ? `<button type="button" class="btn btn-danger" id="cancelEnr">Cancel enrollment</button>` : ''}`,
    body: `
      <div class="grid g2">
        <dl class="def">
          <dt>Trainee</dt><dd><b>${UI.esc(name(t))}</b> · ${UI.esc(t?.no||'')}</dd>
          <dt>Rank / agency</dt><dd>${UI.esc(t?.rank||'—')} · ${UI.esc(t?.agency||'—')}</dd>
          <dt>Course</dt><dd>${UI.esc(c?.title||'—')}<br><span class="muted">${UI.esc(c?.regulation||'')}</span></dd>
          <dt>Batch</dt><dd>${UI.esc(b?.no||'—')} · ${b ? UI.dateRange(b.start,b.end) : ''}</dd>
        </dl>
        <dl class="def">
          <dt>Registered</dt><dd>${UI.date(e.date)}</dd>
          <dt>Status</dt><dd>${UI.statusTag(e.status)}</dd>
          <dt>Result</dt><dd>${e.result ? UI.statusTag(e.result) : '<span class="muted">Not yet assessed</span>'}</dd>
          <dt>Certificate</dt><dd class="mono">${UI.esc(e.certificateNo || '—')}</dd>
          <dt>Instructor</dt><dd>${UI.esc(b?.instructor||'—')}</dd>
          <dt>Venue</dt><dd>${UI.esc(b?.room||'—')}</dd>
        </dl>
      </div>
      ${e.remarks ? `<div class="note">${UI.esc(e.remarks)}</div>` : ''}
      <div class="hr"></div>
      <h4 style="margin:0 0 8px;font-size:13px">Billing</h4>
      ${inv ? `
        <div class="grid g3" style="margin-bottom:12px">
          ${UI.kpi('Invoice total', UI.peso(inv.total), inv.no, '')}
          ${UI.kpi('Paid', UI.peso(inv.paid||0), `${D().payments.filter(p => p.invoiceId === inv.id && !p.voided).length} receipt(s)`, 'ok')}
          ${UI.kpi('Balance', UI.peso(bal), bal > 0.004 ? invStatus(inv) : 'Fully settled', bal > 0.004 ? 'bad' : 'ok')}
        </div>
        ${UI.table([
          { h:'OR No.', k:p => `<span class="mono">${UI.esc(p.no)}</span>` },
          { h:'Date', k:p => UI.date(p.date) },
          { h:'Mode', k:'method' },
          { h:'Reference', k:p => UI.esc(p.ref||'—') },
          { h:'Amount', k:p => UI.num(p.amount), cls:'num' },
        ], D().payments.filter(p => p.invoiceId === inv.id && !p.voided), { empty:'No payments received yet.' })}`
      : `<div class="note warn">This enrollment has <b>not been billed</b>. Reserved slots stay off the books until an invoice is generated.</div>`}`
  });

  const on = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };
  on('billIt', () => billEnrollment(e));
  on('payIt', () => paymentForm(inv));
  on('openInv', () => invoiceModal(inv));
  on('markResult', () => resultForm(e));
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

function resultForm(e){
  UI.modal({
    title:'Record assessment result', sub:`${e.no} · ${name(T(e.traineeId))}`,
    body: `
      ${UI.f.select('result','Result', e.result || '', ['Passed','Failed'], { blank:'— not yet assessed —' })}
      ${UI.f.text('certificateNo','Certificate no.', e.certificateNo, { ph:'Issued on passing' })}
      ${UI.f.select('status','Enrollment status', e.status, ['Enrolled','Completed','Dropped'])}
      ${UI.f.area('remarks','Remarks', e.remarks)}`,
    submitLabel:'Save result',
    onSubmit: fd => {
      Object.assign(e, fd);
      if(fd.result === 'Passed' && !fd.certificateNo){
        e.certificateNo = `TBM-${CRS(e.courseId).code}-${String(9000 + D().enrollments.length).padStart(4,'0')}`;
      }
      DB.activity('Recorded result', `${e.no} — ${fd.result || 'cleared'}`);
      UI.toast('Result recorded.');
      refresh();
    }
  });
}

/* ----- invoice ----- */
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
          <div class="co">${UI.esc(co.address)}<br>${UI.esc(co.contact)}<br>TIN ${UI.esc(co.tin)} · ${UI.esc(co.accreditation)}</div>
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
          <dt>Schedule</dt><dd>${e && BAT(e.batchId) ? UI.dateRange(BAT(e.batchId).start, BAT(e.batchId).end) : '—'}</dd>
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
        <tr><td>VAT-able amount</td><td class="num">${UI.num(inv.net)}</td></tr>
        <tr><td>VAT (${co.vatRate}%)</td><td class="num">${UI.num(inv.vat)}</td></tr>
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
      <p class="muted" style="font-size:11px;margin-top:18px">This document is computer-generated. VAT registered TIN ${UI.esc(co.tin)}.</p>
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
function paymentForm(inv){
  const open = D().invoices.map(i => (ACC.recomputeInvoice(i), i))
    .filter(i => !i.voided && ACC.balanceOf(i) > 0.004)
    .sort((a,b) => a.date.localeCompare(b.date));
  if(!inv && !open.length){ UI.toast('Nothing outstanding — every invoice is settled.', 'bad'); return; }

  const bal = inv ? ACC.balanceOf(inv) : 0;
  UI.modal({
    title:'Record collection', sub: inv ? `Against ${inv.no} · balance ${UI.peso(bal)}` : 'Issue an official receipt',
    body: `
      ${inv ? `<input type="hidden" name="invoiceId" value="${inv.id}">
               <div class="note"><b>${UI.esc(name(T(inv.traineeId)))}</b><br>${UI.esc(inv.no)} · total ${UI.peso(inv.total)} · balance <b>${UI.peso(bal)}</b></div>`
            : UI.f.select('invoiceId','Apply to invoice','', open.map(i =>
                ({ v:i.id, l:`${i.no} · ${name(T(i.traineeId))} · balance ${UI.peso(ACC.balanceOf(i))}` })), { req:true, blank:'— select invoice —' })}
      ${UI.row(UI.f.num('amount','Amount received (₱)', inv ? bal.toFixed(2) : '', { req:true, min:0.01 }),
               UI.f.date('date','Date received', DB.today(), { req:true }))}
      ${UI.row(UI.f.select('method','Mode of payment','Cash',['Cash','GCash','Bank Transfer','Cheque','Card']),
               UI.f.text('ref','Reference no.','',{ ph:'Cheque / transaction no.' }))}
      ${UI.f.text('note','Notes','')}
      <div id="payWarn"></div>`,
    submitLabel:'Issue official receipt',
    onSubmit: fd => {
      const target = inv || INV(fd.invoiceId);
      if(!target){ UI.toast('Select an invoice.', 'bad'); return false; }
      const amt = ACC.r2(fd.amount), due = ACC.balanceOf(ACC.recomputeInvoice(target));
      if(amt <= 0){ UI.toast('Enter an amount greater than zero.', 'bad'); return false; }
      if(amt - due > 0.004){ UI.toast(`Amount exceeds the balance of ${UI.peso(due)}.`, 'bad'); return false; }
      const p = ACC.buildPayment({ invoiceId:target.id, traineeId:target.traineeId, date:fd.date,
                                   amount:amt, method:fd.method, ref:fd.ref, note:fd.note });
      D().payments.push(p); ACC.postPayment(p, target);
      DB.activity('Issued official receipt', `${p.no} vs ${target.no}`);
      DB.save();
      UI.toast(`OR ${p.no} issued for ${UI.peso(amt)}`);
      render();
      receiptModal(p);
      return false; // receiptModal already replaced the dialog
    }
  });

  /* Warn when a partial payment is being keyed in. */
  const form = document.getElementById('mForm');
  const warn = () => {
    const target = inv || INV(form.invoiceId.value);
    const box = document.getElementById('payWarn');
    if(!target){ box.innerHTML = ''; return; }
    const due = ACC.balanceOf(ACC.recomputeInvoice(target)), amt = ACC.r2(form.amount.value);
    box.innerHTML = !amt ? ''
      : amt - due > 0.004 ? `<div class="note bad">Amount exceeds the balance of ${UI.peso(due)}.</div>`
      : amt < due ? `<div class="note warn">Partial payment. Remaining balance after this receipt: <b>${UI.peso(ACC.r2(due-amt))}</b>.</div>`
      : `<div class="note"><b>Full settlement.</b> This invoice will be marked Paid.</div>`;
  };
  form.addEventListener('input', warn);
  form.addEventListener('change', () => {
    const target = inv || INV(form.invoiceId.value);
    if(target && !inv) form.amount.value = ACC.balanceOf(ACC.recomputeInvoice(target)).toFixed(2);
    warn();
  });
  warn();
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
        <dt>Mode of payment</dt><dd>${UI.esc(p.method)}${p.ref ? ' · Ref ' + UI.esc(p.ref) : ''}</dd>
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
               UI.f.select('method','Paid from','Cash',['Cash','Bank Transfer','Cheque']))}
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

function addonsForm(){
  const a = addons();
  const line = i => `<div class="split" style="margin-bottom:8px">
      ${UI.f.text('desc'+i, i===0?'Description':'', a[i]?.desc || '')}
      ${UI.f.num('price'+i, i===0?'Amount':'', a[i]?.price ?? '')}
    </div>`;
  UI.modal({
    title:'Optional fees', sub:'Shown as tick-boxes when billing an enrollment', wide:true,
    body:[0,1,2,3,4,5].map(line).join('') +
      '<div class="note">Leave a row blank to remove it. All optional fees post to account 4100 — Assessment & Other Fees.</div>',
    submitLabel:'Save fees',
    onSubmit: fd => {
      D().company.addons = [0,1,2,3,4,5]
        .map(i => ({ desc:(fd['desc'+i]||'').trim(), account:'4100', price:ACC.r2(fd['price'+i]) }))
        .filter(x => x.desc && x.price > 0);
      DB.activity('Updated optional fees');
      UI.toast('Optional fees updated.');
      refresh();
    }
  });
}

function globalSearch(term){
  const q = term.toLowerCase().trim();
  if(!q) return;
  const tr = D().trainees.filter(t => [t.no,t.last,t.first,t.srn,t.sirb,t.mobile].join(' ').toLowerCase().includes(q)).slice(0,8);
  const iv = D().invoices.filter(i => i.no.toLowerCase().includes(q)).slice(0,8);
  const pr = D().payments.filter(p => p.no.toLowerCase().includes(q)).slice(0,8);
  const en = D().enrollments.filter(e => e.no.toLowerCase().includes(q)).slice(0,8);
  /* Applicants are searchable by reference code too — that is what they quote on the phone. */
  const ap = can('admissions') ? D().applications.filter(a =>
    [a.no, a.ref, APPS.forName(a), a.mobile].join(' ').toLowerCase().includes(q)).slice(0,8) : [];

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
    'view-application':() => applicationModal(APPS.find(id)),
    'new-trainee':   () => traineeForm(),
    'view-trainee':  () => traineeProfile(T(id)),
    'new-course':    () => courseForm(),
    'edit-course':   () => { ev.stopPropagation(); courseForm(CRS(id)); },
    'new-batch':     () => batchForm(),
    'roster':        () => rosterModal(BAT(id)),
    'new-enrollment':() => enrollmentForm(),
    'view-enrollment':() => enrollmentModal(ENR(id)),
    'view-invoice':  () => invoiceModal(INV(id)),
    'new-payment':   () => paymentForm(null),
    'view-receipt':  () => receiptModal(PAY(id)),
    'new-expense':   () => expenseForm(),
    'new-journal':   () => journalForm(),
    'edit-addons':   () => addonsForm(),
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
  Object.assign(D().company, fd, { vatRate:Number(fd.vatRate)||0, vatInclusive:fd.vatInclusive === '1' });
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
  const before = APPS.pending().length;
  DB.reload();
  const now = APPS.pending().length;
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
