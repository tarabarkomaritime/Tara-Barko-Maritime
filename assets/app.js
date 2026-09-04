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
  { id:'daily',       label:'Daily Report', ico:'☀' },
  { id:'trainees',    label:'Trainees',     ico:'☺' },
  { id:'courses',     label:'Courses',      ico:'▤' },
  { id:'enrollments', label:'Enrollments',  ico:'✓' },
  { group:'Finance' },
  { id:'sales',       label:'Sales',        ico:'▲' },
  { id:'invoices',    label:'Billing',      ico:'₱' },
  { id:'payments',    label:'Collections',  ico:'◉' },
  { id:'reconcile',   label:'Bank Reconciliation', ico:'⊜' },
  { id:'payables',    label:'Center Payables',ico:'⇄' },
  { id:'refunds',     label:'Refunds',      ico:'↩' },
  { id:'expenses',    label:'Disbursements',ico:'▼' },
  { id:'payroll',     label:'Payroll',      ico:'₱' },
  { id:'ledger',      label:'General Ledger',ico:'≡' },
  /* Money out and corrections to bookings both wait here. It was taken off the
     nav when approving moved onto the screen each document came from, which is
     still where approving happens — but with nowhere listing what is waiting,
     an admin had to already know it was there to go and look. Admin only: for
     everybody else it is a page of other people's decisions. */
  { id:'approvals',   label:'Approvals',    ico:'✓', adminOnly:true },
  { group:'System' },
  { id:'settings',    label:'Settings',     ico:'⚙' },
];

const TITLES = {
  dashboard:['Dashboard','Operational and financial position at a glance'],
  daily:['Daily Report','Everything that moved on one day'],
  refunds:['Refunds','Money going back to a trainee'],
  approvals:['Approvals','Money out waits here until an admin signs it off'],
  trainees:['Trainee Registry','Seafarer master records — search, register and enroll'],
  courses:['Course Catalogue','Courses, centers, amounts and rebates'],
  enrollments:['Enrollments','Bookings encoded per trainee, with billing status and results'],
  sales:['Sales','What the office earns on the seats it books — rebate by training center'],
  invoices:['Billing','Payment invoices issued to trainees'],
  payments:['Collections','Payments taken and cash position'],
  reconcile:['Bank Reconciliation','Every reference set beside the statement it should match'],
  payables:['Payables To Training Centers','What each center is owed, and the vouchers that settle it'],
  payroll:['Payroll','Salaries and wages — admin only'],
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
/* Names are shown in capitals throughout the staff screens, the way they are
   written on an SRN record, a PEME form and a certificate. The stored record
   keeps whatever case it was typed in — this is a display choice, so editing a
   trainee still shows what was actually entered. */
const caps = s => String(s || '').toUpperCase();

/* Trainees and applications carry the same name fields, so one formatter serves
   both — and there is only the one, deliberately. There used to be two, a short
   spelling for tables and a full one for anything leaving the office, which is
   two chances to show a trainee a different name for themselves than the
   certificate they are about to be handed. */
const name = t => caps(APPS.forName(t));

/* ---------- handing a trainee to a training center ----------
   The center re-keys these into its own form, or the office pastes them into
   a chat thread. Copying by hand off a screen is where a digit in an SRN goes
   wrong, so the block is built once and both the trainee page and the booking
   page use it. Pass the booking to have the course and dates on the end. */
function endorsementText(t, e){
  const c = e && CRS(e.courseId);
  const lines = [
    'NAME: ' + name(t),
    'TRAINEE NO: ' + (t && t.no || ''),
    'SRN: ' + (t && t.srn || ''),
    'DATE OF BIRTH: ' + (t && t.birth || ''),
    'PLACE OF BIRTH: ' + (t && t.birthPlace || ''),
    'SEX: ' + (t && t.sex === 'F' ? 'Female' : 'Male'),
    'RANK: ' + (t && t.rank || ''),
    'COMPANY: ' + (t && t.agency || ''),
    'MOBILE: ' + (t && t.mobile || ''),
    'EMAIL: ' + (t && t.email || ''),
    'ADDRESS: ' + (t && t.address || ''),
    'FACEBOOK: ' + (t && t.facebook || ''),
    'EMERGENCY: ' + (t && t.emergencyName || '')
      + (t && t.emergencyRelation ? ' (' + t.emergencyRelation + ')' : '')
      + (t && t.emergencyMobile ? ' - ' + t.emergencyMobile : ''),
  ];
  if(e){
    lines.push('',
      'COURSE: ' + (c ? c.title : '') + ((c && c.modes || []).length ? ' (' + c.modes.join(' + ') + ')' : ''),
      'TRAINING DATE: ' + (e.start ? UI.dateRange(e.start, e.end) : ''),
      'TRAINING CENTER: ' + (e.center || ''),
      'BOOKING REF: ' + e.no);
  }
  return lines.join(String.fromCharCode(10));
}

/* The button, the status line, and the box the text falls back into. */
/* The button opens the block and copies it in the same motion. Showing it
   matters: a clipboard is invisible, and an office that cannot see what it
   copied has to paste somewhere to find out whether the copy worked. */
const copyRow = label => `
  <div style="margin-top:8px">
    <button type="button" class="btn btn-ghost btn-sm" id="copyDetails">
      ${UI.esc(label)} <span id="copyCaret">&#9662;</span></button>
    <span class="muted" id="copyState" style="font-size:12px;margin-left:8px"></span>
    <div id="copyPanel" style="display:none;margin-top:8px">
      <textarea id="copyBox" readonly rows="16"
        style="width:100%;font-family:var(--mono);font-size:12px;line-height:1.5"></textarea>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button type="button" class="btn btn-ghost btn-xs" id="copyAgain">Copy again</button>
        <button type="button" class="btn btn-ghost btn-xs" id="copyHide">Hide</button>
      </div>
    </div>
  </div>`;

function wireCopy(textFn){
  const btn = document.getElementById('copyDetails');
  if(!btn) return;
  const el = id => document.getElementById(id);
  const said = m => { const s = el('copyState'); if(s) s.textContent = m; };

  const toClipboard = text => {
    const legacy = () => {
      /* No clipboard permission, or an insecure origin. The block is already
         on screen and selected, so this failing is not the end of the road. */
      const box = el('copyBox');
      let ok = false;
      try { box.focus(); box.select(); ok = document.execCommand('copy'); }
      catch(err) { ok = false; }
      said(ok ? 'Copied.' : 'Select the text above and copy it.');
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(() => said('Copied.'), legacy);
    } else legacy();
  };

  const open = () => {
    const text = textFn();
    el('copyBox').value = text;
    el('copyPanel').style.display = 'block';
    el('copyCaret').innerHTML = '&#9652;';
    el('copyBox').focus(); el('copyBox').select();
    toClipboard(text);
  };
  const shut = () => {
    el('copyPanel').style.display = 'none';
    el('copyCaret').innerHTML = '&#9662;';
    said('');
  };

  btn.onclick = () => (el('copyPanel').style.display === 'block' ? shut() : open());
  el('copyAgain').onclick = () => toClipboard(textFn());
  el('copyHide').onclick = shut;
}


/* The Registrar replies on Facebook, so these are meant to be clicked. Applicants
   paste bare handles as often as full URLs, so add the scheme when it is missing.
   rel=noopener because the target is a stranger's link. */
/* The company block as it appears at the head of a document. One function so
   the receipt, the bill and the voucher cannot drift into saying different
   things about who we are. */
/* The contact line is one field, written with a bullet between the number and
   the address it is reached at. On a letterhead each wants its own line and its
   own mark, so it is split where the office typed the separator and falls back
   to the whole string when there is none. */
function contactLines(){
  const co = D().company;
  return String(co.contact || '').split(/\s*\u2022\s*|\s{2,}\|\s{2,}/)
    .map(x => x.trim()).filter(Boolean);
}

/* The mark, once, from the file the rest of the system already uses. */
const LOGO = 'assets/logo.svg';

function docCompany(){
  const co = D().company;
  return `<div><h2>${UI.esc(co.name)}</h2>
    <div class="co">${UI.esc(co.address)}<br>${UI.esc(co.contact)}
      ${co.tradeName ? `<br>${UI.esc(co.tradeName)}` : ''}</div></div>`;
}

/* Sixteen-pixel strokes, drawn here rather than fetched, because the whole
   point of this system is that it opens with no network behind it. */
const ICO = (() => {
  const s = d => `<svg class="fact-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="17" height="17">${d}</svg>`;
  return {
    card:  s('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M7 10h4M7 14h7"/>'),
    doc:   s('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    cake:  s('<rect x="3" y="10" width="18" height="10" rx="2"/><path d="M12 10V7M8 10V8M16 10V8M3 15h18"/>'),
    pin:   s('<path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>'),
    rank:  s('<path d="M6 13l6-5 6 5M6 18l6-5 6 5"/>'),
    build: s('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h6"/>'),
    pen:   s('<path d="M4 20h16M5 16.5L16 5.5a2.1 2.1 0 0 1 3 3L8 19.5l-4 .5z"/>'),
    phone: s('<path d="M5 3h3l2 5-2.2 1.3a13 13 0 0 0 6.9 6.9L16 14l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 3 5.2 2 2 0 0 1 5 3z"/>'),
    mail:  s('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    fb:    s('<circle cx="12" cy="12" r="9"/><path d="M13.4 21v-7h2.2l.4-2.7h-2.6V9.6c0-.8.3-1.3 1.4-1.3h1.3V5.9c-.6-.1-1.4-.2-2.2-.2-2.2 0-3.5 1.2-3.5 3.5v2.1H8.2V14h2.2v7"/>'),
    home:  s('<path d="M3 10.5L12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>'),
    chat:  s('<path d="M12 3c5 0 9 3.6 9 8s-4 8-9 8a10 10 0 0 1-2.8-.4L4 21l1.2-3.4A7.6 7.6 0 0 1 3 11c0-4.4 4-8 9-8z"/>'),
    user:  s('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
    cal:   s('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    peso:  s('<circle cx="12" cy="12" r="9"/><path d="M9 17V7h3.2a2.9 2.9 0 0 1 0 5.8H9M7.6 10.4h6M7.6 13h6"/>'),
    alert: s('<path d="M12 3l9 16H3z"/><path d="M12 9v5M12 17.2v.1"/>'),
  };
})();

/* A Messenger inbox URL is 120 characters of query string and, printed in
   full, it is the widest thing on the page — the address that broke the
   layout was not even a profile, it was a link into somebody's inbox. The
   link still goes where it went; it just stops shouting. */
function shortLink(v, label){
  const s = String(v || '').trim();
  if(!s) return '<span class="muted">—</span>';
  const href = /^https?:\/\//i.test(s) ? s : 'https://' + s.replace(/^\/+/, '');
  let show = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if(show.length > 42) show = (label || show.split(/[/?]/)[0]) + ' \u2192';
  return `<a href="${UI.esc(href)}" target="_blank" rel="noopener noreferrer"
    title="${UI.esc(s)}">${UI.esc(show)}</a>`;
}

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
/* A bill can now cover several bookings, so it can no longer be found by
   searching invoices for the one booking they name. The booking has carried the
   invoice's id since the day it was billed; that is the pointer that still
   works when three bookings share one document. The old search stays as the
   fallback, for bookings written before the field was filled in. */
/* One receipt across the counter is several rows in the books — one per bill it
   settles, because that is what makes each balance right. They used to carry
   the same number, and the server refuses that: payments.no is unique, so the
   second row of every multi-training receipt was rejected and the whole save
   failed with "duplicate key value violates unique constraint payments_no_key".
   Nothing after it saved either.

   The rows are numbered OR-2026-0001, OR-2026-0001/2, OR-2026-0001/3 — distinct
   where the database needs them distinct, and one number wherever a person
   reads it. The suffix is never shown. */
const receiptNo = p => String((p && p.no) || '').split('/')[0];
const sameReceipt = (a, b) => receiptNo(a) === receiptNo(b);

const invOf = enrId => {
  const e = ENR(enrId);
  if(e && e.invoiceId){
    const i = INV(e.invoiceId);
    if(i && !i.voided) return i;
  }
  return D().invoices.find(i => i.enrollmentId === enrId && !i.voided);
};

/* What one booking is worth on the bill it shares.

   Since a day's bookings became one invoice, "what is still owed" stopped being
   a property of the bill and became a property of each training on it. The
   lines carry the booking they came from, so a booking's share is the sum of
   its own lines less its own discount.

   Bills raised before lines carried that (everything before today) have no such
   marks. Those are handled whole, as they always were — the alternative is
   guessing which of six trainings an old payment was for. */
function bookingShare(e){
  const inv = invOf(e.id);
  if(!inv) return 0;
  const mine = (inv.items || []).filter(x => x.enrId === e.id);
  if(!mine.length) return 0;
  return ACC.r2(mine.reduce((s, x) => s + ACC.r2(x.amount), 0)
                - ACC.r2(mine.reduce((s, x) => s + ACC.r2(x.discount || 0), 0)));
}

/* Bookings on a bill, oldest first — the order money is laid against them and
   the order they run in. */
function bookingsOn(inv){
  if(!inv) return [];
  const marked = (inv.items || []).some(x => x.enrId);
  if(!marked) return [];
  return D().enrollments
    .filter(e => e.invoiceId === inv.id && (inv.items || []).some(x => x.enrId === e.id))
    .sort((a, b) => String(a.start || '').localeCompare(String(b.start || ''))
                 || String(a.no || '').localeCompare(String(b.no || '')));
}

/* What this booking has had of the bill's payments.

   Payments taken since the office could say which training they were for name
   it, and those are simply added up. What is left over — money on the bill that
   names no training, which is every payment written before today — is laid over
   the bookings in order, oldest first, as it always was. Both halves are
   counted, so a bill part-paid before and part-paid after still adds up. */
function bookingPaid(e){
  const inv = invOf(e.id);
  if(!inv) return 0;
  const mine = D().payments
    .filter(p => !p.voided && p.enrollmentId === e.id)
    .reduce((s, p) => s + ACC.r2(p.amount), 0);

  const unnamed = D().payments
    .filter(p => !p.voided && p.invoiceId === inv.id && !p.enrollmentId)
    .reduce((s, p) => s + ACC.r2(p.amount), 0);

  let left = ACC.r2(unnamed);
  for(const b of bookingsOn(inv)){
    if(left <= 0.004) break;
    /* Only what that booking still owes after its own named payments. */
    const owed = ACC.r2(Math.max(0, bookingShare(b) - D().payments
      .filter(p => !p.voided && p.enrollmentId === b.id)
      .reduce((s, p) => s + ACC.r2(p.amount), 0)));
    const take = ACC.r2(Math.max(0, Math.min(owed, left)));
    left = ACC.r2(left - take);
    if(b.id === e.id) return ACC.r2(mine + take);
  }
  return ACC.r2(mine);
}

const bookingLeft = e => ACC.r2(Math.max(0, bookingShare(e) - bookingPaid(e)));

/* What one booking still owes, for the screens that list bookings.

   Since a day's courses became one invoice, showing the invoice's balance
   against each of them said the same figure six times — "₱4,900 left" beside
   every training, as though each owed the lot. The office reads those columns
   to know which seat to chase.

   Bills raised before the lines carried their booking cannot be split, so they
   still report the invoice's balance; there is nothing else to report. */
function bookingBalance(e){
  const inv = invOf(e.id);
  if(!inv) return null;                       /* not billed */
  return bookingsOn(inv).length
    ? bookingLeft(e)
    : ACC.balanceOf(ACC.recomputeInvoice(inv));
}

/* A booking that owes money and has no bill to owe it on.

   Two make these. A seat marked Open Schedule before the billing rule changed
   was recorded and never billed — the office is looking at a training the
   trainee is standing there paying for, with no bill to put the money against.
   And a Pending seat the centre has since agreed: the change form moves it to
   Enrolled and knows nothing about billing, so it stays unbilled forever.

   Both read as "not billed" beside a fee the trainee plainly owes. So the
   screens that list bookings say what it comes to and offer to raise it. */
const billableUnbilled = e => !!e && !e.invoiceId
  && !['Void', 'Pending', 'Reserved'].includes(e.status)
  && ACC.r2(e.fee || 0) > 0.004;

/* What it would be billed — the agreed fee less whatever was taken off it. */
const wouldBill = e => ACC.r2((e.fee || 0) - (e.discount || 0));

/* The trainings on a bill, in the words they were charged under.

   A charge booking has no fee line, so there is nothing on the invoice naming
   the course — which left the collection window offering "no course on file"
   and a cashier no way to tell which training a rescheduling fee belonged to.
   The bookings that share the bill know, so they are asked. */
const billCourses = i => {
  const lines = (i && i.items || [])
    .filter(x => (x.account || '4000') === '4000')
    .map(x => x.desc);
  if(lines.length) return lines;
  return D().enrollments
    .filter(e => i && e.invoiceId === i.id)
    .map(e => {
      const c = CRS(e.courseId);
      return (c ? c.title : '') + (e.center ? ' \u2014 ' + e.center : '');
    })
    .filter(x => x.trim());
};
function traineeBalance(tid){
  return ACC.r2(D().invoices.filter(i => i.traineeId === tid && !i.voided)
    .reduce((s,i) => s + ACC.balanceOf(ACC.recomputeInvoice(i)), 0));
}

/* ================= LOGIN ================= */
/* Nothing to rebuild any more — the form is two boxes. Kept so callers that
   refreshed the old list do not have to know that. */
function fillLoginList(){}

/* The password is checked by Supabase now, not by this file. That matters for
   a reason beyond tidiness: the browser build compared what was typed against a
   string in assets/db.js, and assets/db.js is served to anybody who opens the
   site. There was no version of that which was not "the passwords are public".

   Being signed in and being one of the office's people are still two questions.
   Anybody can create an account against this project; what they get is an empty
   system, because every table answers to row level security and every policy
   asks for a row in tbm.staff that only the roster hands out. */
function enterShell(staff){
  window.SESSION = staff;
  document.getElementById('login').classList.add('hidden');
  document.getElementById('shell').classList.remove('hidden');
  document.getElementById('userName').textContent = staff.name;
  document.getElementById('userRole').textContent = DB.roleName(staff.role);
  document.getElementById('userAvatar').textContent = staff.initials || '';
  renderNav();
  if(!location.hash || location.hash === '#/') location.hash = '#/dashboard';
  route();
}

/* Supabase sends a reset link back to the site with the tokens in the URL
   fragment — #access_token=…&type=recovery — which is the same place this app
   keeps its routes. So it has to be read and cleared before the router ever
   sees it, or the whole thing is mistaken for a page name and the person who
   clicked the link lands on the dashboard with nothing having happened.

   Clearing it also matters on its own: an access token sitting in the address
   bar is a token in the browser history, in a bookmark, and in whatever is
   pasted into a chat when somebody asks for help. */
function claimRecoveryLink(){
  const h = String(location.hash || '');
  if(h.indexOf('type=recovery') < 0) return false;
  const p = new URLSearchParams(h.replace(/^#/, ''));
  history.replaceState(null, '', location.pathname + location.search);

  if(p.get('error') || !p.get('access_token')){
    const why = p.get('error_description') || p.get('error') || 'that link is no longer valid';
    return { failed:String(why).replace(/\+/g, ' ') };
  }
  CLOUD.keepSession({
    access_token:p.get('access_token'),
    refresh_token:p.get('refresh_token') || '',
    expires_at:Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600),
    user:null,
  });
  return { ok:true };
}

function initLogin(){
  const box = document.getElementById('loginUser');
  const btn = document.getElementById('loginBtn');
  const say = m => { const el = document.getElementById('loginMsg'); if(el) el.textContent = m; };

  const go = async () => {
    const typed = String(box.value || '').trim().toLowerCase();
    const pass = document.getElementById('loginPass').value;
    if(!typed) return say('Enter your email address.');
    if(!pass)  return say('Enter your password.');

    btn.disabled = true; say('Signing in…');
    try{
      await CLOUD.signIn(typed, pass);
    }catch(e){
      btn.disabled = false;
      /* One message for a wrong address and a wrong password alike. Telling a
         stranger which half they got right tells them the other half is worth
         guessing, and which addresses are real accounts here. */
      const offline = /failed to fetch|networkerror/i.test(e.message || '');
      return say(offline
        ? 'Cannot reach the server. Check the internet connection and try again.'
        : 'That email and password do not match an account.');
    }

    try{
      const staff = await CLOUD.me();
      if(!staff){
        await CLOUD.signOut();
        btn.disabled = false;
        return say('That account is not on this office\'s staff list. Ask the admin to add it.');
      }
      say('Loading the records…');
      await DB.connect(staff);
      say('');
      btn.disabled = false;
      DB.activity('Signed in'); DB.save();
      enterShell(staff);
    }catch(e){
      btn.disabled = false;
      const why = e.message || 'unknown error';

      /* A tab that has been open for days is running the code it opened with,
         and that code can be asking the server for a column that has since been
         renamed. It reads as the office being locked out of their own system —
         "column journal.at does not exist" is not a sentence anybody at a desk
         can act on — and the answer, reloading, is the one thing the message
         did not say.

         The version bar catches this for tabs new enough to have it, and a tab
         old enough to hit this is often older than the bar. So the way out is
         put here too, where the person actually is. The reload carries a
         throwaway query so the page itself comes back from the server rather
         than from the cache that is causing the problem. */
      const stale = /column .* does not exist|schema cache|PGRST|could not find/i.test(why);
      say(stale
        ? 'This page is running an old copy of the system, which is asking the '
          + 'server for something that has since changed. Reloading fixes it.'
        : 'Signed in, but the records did not load: ' + why);

      const msg = document.getElementById('loginMsg');
      if(msg && !document.getElementById('reloadFix')){
        const b = document.createElement('button');
        b.id = 'reloadFix';
        b.type = 'button';
        b.className = 'btn btn-primary btn-block';
        b.textContent = 'Reload the system';
        b.onclick = () => location.replace(location.pathname + '?r=' + Date.now());
        msg.insertAdjacentElement('afterend', b);
        if(!stale){
          const note = document.createElement('p');
          note.className = 'login-hint';
          note.textContent = 'If reloading does not help, the message above is the real fault.';
          b.insertAdjacentElement('afterend', note);
        }
      }
    }
  };

  btn.onclick = go;
  box.onkeydown = e => { if(e.key === 'Enter') document.getElementById('loginPass').focus(); };
  document.getElementById('loginPass').onkeydown = e => { if(e.key === 'Enter') go(); };

  /* An admin can send somebody a reset link from Settings, and until now that
     was the only way one could be sent at all. That holds up right until the
     person locked out is the admin — and then the single door out of the
     building opens only from the inside, and the office waits on somebody with
     a laptop and a database to let them back in.

     Supabase answers 'recover' the same way whether or not the address has an
     account, and so does this: a stranger typing addresses into the box learns
     nothing about who works here. Nobody, this screen included, ever sees the
     new password — the link signs them in once and they set it themselves. */
  let sending = false;
  const forgot = document.getElementById('forgotPass');
  if(forgot) forgot.onclick = ev => {
    ev.preventDefault();
    if(sending) return;
    const typed = String(box.value || '').trim().toLowerCase();
    if(!typed){ box.focus(); return say('Type your email address above first, then click again.'); }

    sending = true; say('Sending the link…');
    CLOUD.resetPassword(typed)
      .then(() => say('If ' + typed + ' has an account here, a reset link is on its way to it. '
                    + 'It works once and expires within the hour — check the spam folder if it '
                    + 'does not arrive in a few minutes.'))
      .catch(e => say(/rate|429/i.test(e.message || '')
        ? 'Too many reset emails have gone out just now. Wait a few minutes, then try again.'
        : 'The email did not go: ' + (e.message || 'unknown error')))
      /* Held shut for a moment afterwards. The failure this prevents is not an
         attack but an ordinary one: nothing appears to happen, so it gets
         clicked again, and the fourth link invalidates the first three. */
      .finally(() => setTimeout(() => { sending = false; }, 30000));
  };

  if(sessionStorage.getItem('tbm_idle_out')){
    sessionStorage.removeItem('tbm_idle_out');
    say('Signed out after ' + IDLE_MINUTES + ' minutes with nobody at the screen. Everything was saved.');
  }

  /* Somebody arriving from a reset email. They are signed in by the link
     itself, which is the whole point of it — so let them in and put the change
     password form in front of them straight away, rather than showing a login
     box they cannot get past because they do not know the password. */
  const recovery = claimRecoveryLink();
  if(recovery && recovery.failed){
    say('That reset link has expired — ask an admin to send another. (' + recovery.failed + ')');
  }else if(recovery && recovery.ok){
    say('Checking the link…');
    CLOUD.me()
      .then(staff => {
        if(!staff) throw new Error('that account is not on this office\'s staff list');
        return DB.connect(staff).then(() => {
          say('');
          enterShell(staff);
          myPasswordForm();
          UI.toast('Set a new password now — the link that let you in only works once.');
        });
      })
      .catch(e => say('That reset link did not work: ' + (e.message || 'unknown error')));
    return;
  }

  /* A session that is still good should not ask again on every reload — and
     when it does ask, it has to say why.

     This used to swallow every failure and leave a blank login box: a slow
     answer, a dropped packet, a server having a bad second, all of it looked
     identical to being signed out, and the session was often still perfectly
     good underneath. So a failure that might be temporary is retried before
     anything is concluded from it, and only an answer from the server saying
     the credentials are dead ends the session. */
  async function resume(attempt){
    attempt = attempt || 0;
    try{
      const staff = await CLOUD.me();
      if(staff){
        await DB.connect(staff);
        say('');
        enterShell(staff);
        if(!CLOUD.sessionRemembered()){
          UI.toast('This browser will not remember the sign-in, so it will ask again '
                 + 'every time the page reloads.', 'bad');
        }
        return;
      }
      /* A clear answer, not a failure: this account is authenticated and is not
         one of the office's people. */
      await CLOUD.signOut().catch(() => {});
      say('That account is not on this office\'s staff list. Ask the admin to add it.');
    }catch(e){
      const dead = e.status === 400 || e.status === 401;
      if(!dead && attempt < 2){
        await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
        return resume(attempt + 1);
      }
      if(dead){
        await CLOUD.signOut().catch(() => {});
        say('Your sign-in has expired. Please sign in again.');
      }else{
        /* Still signed in. Saying otherwise would send somebody hunting for a
           password they do not need. */
        say('Cannot reach the server just now — you are still signed in. '
          + 'Check the connection and reload.');
      }
    }
  }

  if(CLOUD.signedIn()){
    say('Signing back in…');
    resume();
  }
}

/* ---------- is the work actually somewhere safe? ----------
   The whole reason this system moved off one browser is that a day of encoding
   could disappear without anybody being told. So the answer to "did that save"
   is on screen at all times rather than assumed. */
/* Half an hour of nobody touching it and the session ends.

   The sign-in is remembered in the browser and renews itself, so without this
   it lasts indefinitely: whoever opens that browser next is the cashier, with
   her receipts and her refunds, days later. That is fine for a personal laptop
   and wrong for a desk three people share.

   Two things it must not do. It must not throw away work — whatever has not
   reached the server is pushed first, and if that push fails the countdown
   starts again rather than signing out over the top of it. And it must not
   happen without warning: a minute before, it says so, and any key or click
   calls the whole thing off. */
const IDLE_MINUTES = 30;

function initIdleTimeout(){
  const LIMIT = IDLE_MINUTES * 60 * 1000;
  const WARN  = 60 * 1000;
  let last = Date.now(), warned = null;

  const clearWarning = () => { if(warned){ warned.remove(); warned = null; } };

  const touched = () => { last = Date.now(); clearWarning(); };
  ['pointerdown','keydown','wheel','touchstart','focus'].forEach(e =>
    window.addEventListener(e, touched, { passive:true, capture:true }));

  function warn(seconds){
    if(warned) return;
    warned = document.createElement('div');
    warned.id = 'idleWarn';
    warned.setAttribute('role', 'alert');
    warned.textContent = `Signing out in ${seconds} seconds — nobody has touched this screen. `
      + 'Press any key to stay.';
    document.body.appendChild(warned);
  }

  async function endIt(){
    /* Never sign out on top of unsaved work. If it will not go up, stay put
       and try again — being signed in is the lesser problem. */
    const s = DB.cloudStatus();
    if(s.on && s.pending){
      await DB.flush().catch(() => {});
      if(DB.cloudStatus().pending){ last = Date.now(); clearWarning(); return; }
    }
    clearWarning();
    try{ await CLOUD.signOut(); }catch(e){}
    DB.disconnect();
    sessionStorage.setItem('tbm_idle_out', '1');
    location.reload();
  }

  setInterval(() => {
    if(!SESSION) return;
    const idle = Date.now() - last;
    if(idle >= LIMIT) endIt();
    else if(idle >= LIMIT - WARN) warn(Math.max(1, Math.round((LIMIT - idle) / 1000)));
  }, 5000);
}

/* ---------- the tab that has been open since this morning ----------
   Fingerprinting the asset URLs fixed the browser serving a stale script on
   reload. It does nothing for a page that never reloads, and the office does
   not reload: the system is opened when the door opens and left up until it
   closes. So every fault fixed during the day was still sitting on their screen
   afterwards, and three separate rounds went on proving a bug that had already
   been gone for hours — the last one arguing about a message that no longer
   existed in the code.

   The page knows which build it is; the fingerprint is on its own script tag.
   It asks the server what the current one is and says so when they differ. It
   does not reload by itself: doing that under somebody mid-way through encoding
   a booking would lose the form they were filling in, which is a worse fault
   than the one it is fixing. */
const MY_BUILD = (() => {
  const el = document.querySelector('script[src*="assets/app.js"]');
  const m = el && String(el.getAttribute('src') || '').match(/[?&]v=([^&"]+)/);
  return m ? m[1] : '';
})();

function initBuildWatch(){
  if(!MY_BUILD) return;          /* served unstamped — nothing to compare against */
  let told = false;

  const announce = () => {
    if(told) return;
    told = true;
    const bar = document.createElement('div');
    bar.id = 'newBuild';
    bar.innerHTML = '<span>A newer version of the system is ready. '
      + 'This tab is still running the one it opened with.</span>'
      + '<button type="button">Reload now</button>';
    bar.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(bar);
  };

  const look = async () => {
    if(told || document.hidden) return;
    try{
      const r = await fetch('index.html', { cache:'no-store' });
      if(!r.ok) return;
      const m = (await r.text()).match(/assets\/app\.js\?v=([A-Za-z0-9]+)/);
      if(m && m[1] !== MY_BUILD) announce();
    }catch(e){ /* offline, or the deploy is mid-flight. Ask again later. */ }
  };

  /* Twice an hour, and whenever somebody comes back to the tab — which is when
     they are about to do something, and the moment worth catching them. */
  setInterval(look, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if(!document.hidden) look(); });
  setTimeout(look, 20 * 1000);
}

function initSaveState(){
  const bar = document.createElement('div');
  bar.id = 'saveState';
  document.body.appendChild(bar);
  const WORDS = {
    off:     ['', ''],
    ready:   ['ok',   'Saved'],
    partial: ['work', 'Saved — except the settings'],
    dirty:   ['work', 'Saving…'],
    saving:  ['work', 'Saving…'],
    error:   ['bad',  'NOT SAVED'],
  };
  DB.onCloud((state, note) => {
    /* 'Saved' must not be said over a table that was not sent. */
    const s = DB.cloudStatus();
    if(state === 'ready' && s.skipped && s.skipped.length) state = 'partial';
    const [cls, label] = WORDS[state] || WORDS.off;
    if(!label){ bar.className = ''; bar.textContent = ''; return; }
    bar.className = 'save-' + cls;
    bar.textContent = state === 'error'
      ? `NOT SAVED — ${note || 'the server did not answer'}. Your work is still here; do not close this page.`
      : label;
    bar.title = note || '';
  });
  /* A failed push is retried rather than left sitting: the connection that
     dropped at 3pm is usually back by 3.01, and nobody should have to know to
     press anything. */
  setInterval(() => { const s = DB.cloudStatus(); if(s.on && s.pending) DB.flush(); }, 15000);
  /* Somebody else's work, picked up when this desk is idle. */
  setInterval(() => { DB.refreshFromCloud().then(ok => { if(ok) refresh(); }).catch(() => {}); }, 60000);
  window.addEventListener('online',  () => DB.flush());
  window.addEventListener('beforeunload', e => {
    const s = DB.cloudStatus();
    if(s.on && s.pending){ e.preventDefault(); e.returnValue = ''; return ''; }
  });
}

function renderNav(){
  const allowed = DB.PERMS[SESSION.role];
  let html = '';
  NAV.forEach(n => {
    if(n.group){ html += `<div class="nav-group">${n.group}</div>`; return; }
    if(!allowed.includes(n.id)) return;
    if(n.adminOnly && !canApprove()) return;
    let badge = '';
    if(n.id === 'enrollments'){
      const c = D().enrollments.filter(e => e.status === 'Reserved').length;
      if(c) badge = `<span class="badge">${c}</span>`;
    }
    if(n.id === 'approvals'){
      const c = pendingMoneyOut().length + pendingChanges().length;
      if(c) badge = `<span class="badge">${c}</span>`;
    }
    if(n.id === 'payables'){
      const c = payablesByCenter().length;
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
  /* Cash on hand is the drawer and nothing else. What sits in a bank or a
     wallet is not in the drawer, and listing those balances beside it invited
     the two to be read as one number when counting the till at closing. The
     line underneath says how much of today's takings came in as cash, which is
     the figure the count is checked against. */
  const drawer = ACC.methods()[0] || { account:'1000' };
  const cashOnHand = bal(drawer.account);
  const cashToday = ACC.r2(received[drawer.name] || 0);

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
               `${receiptCount} payment(s)`, 'ok')}
      ${UI.kpi('Cash on Hand', UI.peso(cashOnHand),
               `${UI.peso(cashToday)} taken in cash today`,
               cashOnHand < 0 ? 'bad' : '')}
    </div>

    <div class="grid g2" style="margin-bottom:18px">
      ${UI.card('Money By Channel', UI.table([
        { h:'Channel', k:r => `<b>${UI.esc(r.label)}</b>` },
        { h:'Received', k:r => UI.num(r.inAmt), cls:'num' },
        { h:'Disbursed', k:r => UI.num(r.outAmt), cls:'num' },
        { h:'Net', k:r => UI.num(r.net), cls:'num' },
      ], channelRows, { empty:'No movement.',
          foot:['TOTAL', UI.num(receivedTotal), UI.num(paidTotal), UI.num(ACC.r2(receivedTotal - paidTotal))] }),
        { flush:true, sub:`${receiptCount} receipt(s) in · ${voucherCount} voucher(s) out` })}

      ${UI.card('Training Starting Tomorrow', UI.table([
        { h:'Trainee', k:e => { const t = T(e.traineeId); return t
            ? `<b>${UI.esc(name(t))}</b><br><span class="muted" style="font-size:11.5px">${UI.esc(t.mobile||'')}</span>`
            : '—'; } },
        { h:'Course', k:e => { const c = CRS(e.courseId); return c ? UI.esc(c.title) : '—'; } },
        { h:'Center', k:e => UI.esc(e.center || '—') },
        { h:'Balance', k:e => { const due = bookingBalance(e);
            if(due == null) return '<span class="muted">not billed</span>';
            return due > 0.004 ? UI.num(due) : 'settled'; }, cls:'num' },
      ], startingTomorrow, { empty:'Nobody starts tomorrow.', rowClass:'clickable',
          rowAttr:e => `data-act="view-enrollment" data-id="${e.id}"` }),
        { flush:true, sub:UI.date(tomorrow) })}
    </div>

    ${UI.card('Recent Activity', UI.table([
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
  /* A single day answered "who signed up today" and nothing else. The office
     asks for a week, or for last month, far more often than it asks for one
     date — and the way it used to get one was by clicking through the days one
     at a time and adding them up on paper. */
  let from = state.q.tfrom || DB.today();
  let to   = state.q.tto   || DB.today();
  /* Typed backwards is a range the office meant, not an error worth a message,
     and a silently empty table would look like nobody signed up that month. */
  if(from > to){ const x = from; from = to; to = x; }
  const all = D().trainees;

  const matches = t => [t.no,t.last,t.first,t.srn,t.rank,t.agency,t.mobile]
    .join(' ').toLowerCase().includes(q);
  const rows = q ? all.filter(matches)
                 : all.filter(t => t.registered >= from && t.registered <= to);
  const spanLabel = from === to
    ? (from === DB.today() ? 'today' : 'on ' + UI.date(from))
    : `between ${UI.date(from)} and ${UI.date(to)}`;

  return `
    <!-- Searching and filtering are two different jobs and the office does far
         more of the first, so the search gets a line to itself and the width
         that comes with it. A name and a company do not fit in the gap left
         beside two date boxes. -->
    <div class="toolbar" style="margin-bottom:8px">
      <input type="search" data-q="trainee" class="grow" value="${UI.esc(state.q.trainee||'')}"
             placeholder="Search name, SRN, company or mobile…">
      <button class="btn btn-primary btn-sm" data-act="new-trainee">+ Register trainee</button>
    </div>
    <div class="toolbar">
      <label class="fld" style="margin:0">
        <span>Signed up from</span>
        <input type="date" data-q="tfrom" value="${from}" max="${DB.today()}" ${q ? 'disabled' : ''}>
      </label>
      <label class="fld" style="margin:0">
        <span>to</span>
        <input type="date" data-q="tto" value="${to}" max="${DB.today()}" ${q ? 'disabled' : ''}>
      </label>
      <span class="muted">${q
        ? `${rows.length} match(es) across all ${all.length} record(s)`
        : `${rows.length} signed up ${spanLabel}`}</span>
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
        : `Nobody signed up ${spanLabel}. Type a name above to search the whole registry.`,
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
    ], rows, { empty:'No course matches that search.',
        /* Nine columns means the Edit button sits off the right edge on most
           screens, so the row opens it too — every other list here works that
           way and this one looked read-only because of it. */
        rowClass: admin ? 'clickable' : '',
        rowAttrs: c => admin ? `data-act="edit-course" data-id="${c.id}"` : '' }), { flush:true })}
  `;
};

/* ---------- Enrollments ---------- */
VIEWS.enrollments = () => {
  const q = (state.q.enr || '').toLowerCase(), f = state.q.enrStatus || '';
  /* The day the booking was taken, not the day the training runs. The question
     is about the desk's own work — who did Jocelyn and Kyla enroll today — and
     the training date answers a different one: a course booked on Monday for a
     run three weeks out belongs to Monday's tally, and a course running today
     that was booked last month does not. */
  const day = state.q.enrDay || '';
  const runsIn = e => !day || (e.date || '') === day;

  const rows = D().enrollments.filter(e => {
    if(f && e.status !== f) return false;
    if(!runsIn(e)) return false;
    if(!q) return true;
    const t = T(e.traineeId), c = CRS(e.courseId);
    return [e.no, name(t), t?.srn, c?.code, c?.title, e.center].join(' ').toLowerCase().includes(q);
  }).sort((a,b) => b.date.localeCompare(a.date));

  const billed = ACC.r2(rows.reduce((s,e) => { const i = invOf(e.id); return s + (i ? i.total : 0); }, 0));
  const due    = ACC.r2(rows.reduce((s,e) => { const i = invOf(e.id); return s + (i ? ACC.balanceOf(ACC.recomputeInvoice(i)) : 0); }, 0));

  /* Trainees, not bookings. One person on three courses is one person to
     expect at the door, and counting the bookings would have the office
     preparing for three. */
  const onDay = rows.filter(e => e.status === 'Enrolled');
  const whoIds = [...new Set(onDay.map(e => e.traineeId))];
  const heads = whoIds.length;

  /* Named, because "nineteen" is a number and the desk needs a list: who to
     expect, on what, and where they are going. */
  const who = whoIds.map(id => ({
    t:T(id),
    seats:onDay.filter(e => e.traineeId === id),
  })).filter(x => x.t).sort((a, b) => name(a.t).localeCompare(name(b.t)));

  return `
    ${changePanel(pendingChanges())}
    <div class="toolbar">
      <input type="search" data-q="enr" value="${UI.esc(state.q.enr||'')}" placeholder="Search trainee, SRN, course or center…" style="min-width:250px">
      <select data-q="enrStatus" style="min-width:150px">
        ${['','On Process','Enrolled','Open Schedule','Reserved','Completed','Cancelled'].map(s =>
          `<option value="${s}" ${f===s?'selected':''}>${s||'All statuses'}</option>`).join('')}
      </select>
      <label class="muted" style="font-size:12px">Enrolled on</label>
      <input type="date" data-q="enrDay" value="${day}">
      <button class="btn btn-ghost btn-xs" data-act="enr-today">Today</button>
      <button class="btn btn-ghost btn-xs" data-act="enr-any">Any day</button>
      <span class="muted">${rows.length} record(s)</span>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="new-enrollment">+ New enrollment</button>
    </div>

    ${day ? UI.card(`Enrolled On ${UI.date(day)}`,
      heads
        ? UI.table([
            { h:'Trainee', k:w => `<b>${UI.esc(name(w.t))}</b>`, },
            { h:'SRN', k:w => `<span class="mono">${UI.esc(w.t.srn || '—')}</span>`, w:'150px' },
            { h:'Mobile', k:w => UI.esc(w.t.mobile || '—'), w:'150px' },
            { h:'Booked onto', k:w => w.seats.map(e =>
                `${UI.esc((CRS(e.courseId)||{}).title || '—')}`
                + `<span class="muted"> — ${UI.esc(e.center || '')}</span>`
                + (e.start ? `<span class="muted" style="font-size:11.5px"><br>${UI.dateRange(e.start, e.end)}</span>` : '')
              ).join('<br>') },
          ], who, { empty:'' })
        : `<div class="empty"><span class="big">⚓</span>Nobody was enrolled on ${UI.date(day)}.</div>`,
      { flush:true,
        /* Plain text: the card escapes its subtitle, and a bold tag printed
           as &lt;b&gt; is worse than no bold at all. */
        sub:`${UI.int(heads)} trainee${heads === 1 ? '' : 's'} · `
            + `${UI.int(onDay.length)} seat${onDay.length === 1 ? '' : 's'} booked` })
      + '<div style="height:18px"></div>' : ''}
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
      { h:'Balance', k:e => { const b = bookingBalance(e);
          if(b != null)
            return b > 0.004 ? `<b style="color:var(--bad)">${UI.peso(b)}</b>`
                             : `<span style="color:var(--ok)">Settled</span>`;
          /* Agreed fee, no bill yet. The dash said nothing was owed. */
          return billableUnbilled(e)
            ? `<span class="muted">${UI.peso(wouldBill(e))} unbilled</span>`
            : '<span class="muted">—</span>'; }, cls:'num' },
    ], rows, { empty:'No enrollments recorded.', rowClass:'clickable',
               rowAttrs:e => `data-act="view-enrollment" data-id="${e.id}"` }), { flush:true })}
  `;
};

/* ---------- Invoices ---------- */
/* The statuses a booking can be sitting in with no bill behind it. Pending is
   waiting on the centre; Open Schedule and On Process are agreed but undated,
   and those two bill as they are taken — so an unbilled one is either a seat
   recorded before that rule, or one whose bill was voided. */
const BOOKING_ONLY = ['Pending', 'On Process', 'Open Schedule', 'Enrolled', 'Reserved'];

VIEWS.invoices = () => {
  const q = (state.q.inv || '').toLowerCase(), f = state.q.invStatus || '';
  const bookingFilter = BOOKING_ONLY.includes(f);

  const invRows = (bookingFilter ? [] : D().invoices.map(i => (ACC.recomputeInvoice(i), i)))
    .filter(i => {
      if(f && invStatus(i) !== f) return false;
      if(!q) return true;
      return [i.no, name(T(i.traineeId)), (i.items || []).map(x => x.desc).join(' ')]
        .join(' ').toLowerCase().includes(q);
    });

  /* Every training this trainee has, billed or not.

     The page listed invoices, so a seat marked Open Schedule or Pending was
     simply absent — searching a trainee's name returned the one course they had
     been billed for and nothing else, as though the other four did not exist.
     That is the page the office looks at to answer "what does this seafarer
     have with us", and it was answering half the question.

     So the bookings with no bill behind them are listed too, in the same rows,
     carrying their price and their booking status. They are not invoices and do
     not pretend to be: no invoice number, nothing paid, nothing outstanding,
     and the money tiles above stay measurements of what has actually been
     billed. */
  /* Every booking with no bill behind it — Pending included.

     This leaned on billableUnbilled, which is the rule for what may be billed
     and deliberately excludes Pending: a seat asked for and not yet agreed
     bills nothing. That is right for billing and wrong for looking. A trainee
     whose only booking was Pending did not appear on this page at all, and
     picking Pending from the status box could never return anything. */
  const unbilled = (f && !bookingFilter ? [] : D().enrollments)
    .filter(e => !e.invoiceId
      && e.status !== 'Void'
      && e.status !== 'Cancelled'
      && ACC.r2(e.fee || 0) > 0.004
      && (!bookingFilter || e.status === f))
    .filter(e => {
      if(!q) return true;
      const c = CRS(e.courseId);
      return [e.no, name(T(e.traineeId)), c ? c.title : '', e.center || '']
        .join(' ').toLowerCase().includes(q);
    });

  /* One list, newest first, whichever kind of thing the row is. */
  const rows = [
    ...invRows.map(i => ({ kind:'inv', id:i.id, date:i.date, no:i.no, i })),
    ...unbilled.map(e => ({ kind:'enr', id:e.id, date:e.date || e.start || '', no:e.no, e })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))
                || String(b.no).localeCompare(String(a.no)));

  const live = invRows.filter(i => !i.voided);
  const tot  = ACC.r2(live.reduce((s, i) => s + i.total, 0));
  const paid = ACC.r2(live.reduce((s, i) => s + (i.paid || 0), 0));
  const booked = ACC.r2(unbilled.reduce((s, e) => s + wouldBill(e), 0));

  return `
    <div class="toolbar">
      <input type="search" data-q="inv" value="${UI.esc(state.q.inv||'')}" placeholder="Search invoice no., trainee or course…" style="min-width:250px">
      <select data-q="invStatus" style="min-width:180px">
        <option value="" ${f===''?'selected':''}>All bills and bookings</option>
        <optgroup label="Billed">
          ${['Unpaid','Partial','Paid','Overdue','Void'].map(s =>
            `<option value="${s}" ${f===s?'selected':''}>${s}</option>`).join('')}
        </optgroup>
        <optgroup label="Booked, not yet billed">
          ${BOOKING_ONLY.map(s =>
            `<option value="${s}" ${f===s?'selected':''}>${s}</option>`).join('')}
        </optgroup>
      </select>
      <span class="spacer"></span>
    </div>
    <div class="grid g4" style="margin-bottom:18px">
      ${UI.kpi('Invoices Shown', UI.int(invRows.length),
               unbilled.length
                 ? `${UI.int(unbilled.length)} more booked, not yet billed`
                 : 'Matching current filter', '')}
      ${UI.kpi('Total Billed', UI.peso(tot),
               booked > 0.004 ? `${UI.peso(booked)} booked but unbilled` : 'no tax applied', 'sea')}
      ${UI.kpi('Total Collected', UI.peso(paid), 'Applied to these invoices', 'ok')}
      ${UI.kpi('Outstanding', UI.peso(ACC.r2(tot - paid)), 'Still collectible', tot-paid>0?'warn':'ok')}
    </div>
    ${UI.card('', UI.table([
      { h:'Invoice No.', k:r => r.kind === 'inv'
          ? `<b class="mono">${UI.esc(r.i.no)}</b>`
          : `<span class="mono muted">${UI.esc(r.e.no)}</span>`, w:'135px' },
      { h:'Date', k:r => r.date ? UI.date(r.date) : '<span class="muted">—</span>', w:'115px' },
      { h:'Trainee', k:r => UI.esc(name(T(r.kind === 'inv' ? r.i.traineeId : r.e.traineeId))) },
      { h:'Particulars', k:r => { if(r.kind === 'inv')
            return UI.esc(r.i.items.map(x => x.desc).join(', '));
          const c = CRS(r.e.courseId);
          return UI.esc((c ? c.title : 'no course on file')
                        + (r.e.center ? ' — ' + r.e.center : '')); } },
      /* The price of an unbilled seat is greyed: it is what the training costs,
         not what anybody has been asked for. */
      { h:'Total', k:r => r.kind === 'inv'
          ? `<b>${UI.peso(r.i.total)}</b>`
          : `<span class="muted">${UI.peso(wouldBill(r.e))}</span>`, cls:'num' },
      { h:'Paid', k:r => r.kind === 'inv' ? UI.num(r.i.paid||0)
                                          : '<span class="muted">—</span>', cls:'num' },
      { h:'Balance', k:r => { if(r.kind !== 'inv') return '<span class="muted">—</span>';
          const b = ACC.balanceOf(r.i);
          return r.i.voided ? '<span class="muted">—</span>'
            : (b > 0.004 ? `<b style="color:var(--bad)">${UI.num(b)}</b>`
                         : `<span style="color:var(--ok)">0.00</span>`); }, cls:'num' },
      { h:'Status', k:r => UI.statusTag(r.kind === 'inv' ? invStatus(r.i) : r.e.status) },
    ], rows, { empty:'Nothing billed or booked under that.', rowClass:'clickable',
               rowAttrs:r => r.kind === 'inv'
                 ? `data-act="view-invoice" data-id="${r.i.id}"`
                 : `data-act="view-enrollment" data-id="${r.e.id}"` }), { flush:true })}
  `;
};

/* ---------- Payments ---------- */
/* Rebates on the bookings marked "do not deduct". The center owes us that money
   separately, so it has to be chased and then banked — until now it was posted
   as a receivable at booking time and had no way of ever being cleared, which
   meant 1250 only ever grew. One row per booking, because that is the level the
   center's statement is written at. */
/* Every rebate on the books, not only the ones somebody has to go and collect.

   The two kinds are settled differently and the list only ever showed one of
   them. Where a centre lets us keep the rebate back from what we remit, there
   is nothing receivable — it is netted off the payable at the moment the seat
   is booked — so MARIANA, PNTC, JVV and the rest simply were not there, and the
   page read as though those centres owed no rebate at all.

   They owe it. It is already in our hands. So they are listed, saying which of
   the two it is, and only the ones that have to be chased carry a button. */
function rebatesAll(){
  return D().enrollments
    .filter(e => (e.rebate || 0) > 0 && e.status !== 'Void' && e.status !== 'Cancelled')
    .map(e => ({
      e,
      center:String(e.center || '').toUpperCase(),
      /* What the centre settles with us, whichever way round it goes. */
      amount:ACC.r2(e.rebate),
      /* And what is left of it after the discount we gave on that seat. The
         centre is owed the fee whatever we charged the trainee, so a discount
         comes out of this and nowhere else. It can go past the rebate: a seat
         discounted more than it earns is a loss on that seat, and saying so is
         the only way anybody finds out. */
      discount:ACC.r2(e.discount || 0),
      earned:ACC.r2(ACC.r2(e.rebate) - ACC.r2(e.discount || 0)),
      deduct:!!e.deduct,
      /* Deducted rebates are settled the day the remittance goes out, because
         that is the payment they were taken off. */
      received:e.deduct ? !!e.remitNo : !!e.rebateReceivedOn,
    }))
    /* Grouped under the center, because a rebate is chased one center at a
       time — you ring PNTC about everything PNTC owes, not about one seafarer.
       Inside a center the ones still outstanding come first, oldest training
       first, which is the order they should be asked for in. */
    .sort((a,b) => a.center.localeCompare(b.center)
      || (a.received - b.received)
      || String(a.e.start || '').localeCompare(String(b.e.start || '')));
}

/* Banking one. Once it is in, it is a fact rather than a plan: the entry is
   posted and the row locks, so nobody can quietly restate what a center paid or
   when it arrived. Correcting a mistake means a journal entry, which leaves a
   trail. */
function rebateReceiveForm(enrId){
  const e = ENR(enrId);
  if(!e){ UI.toast('That booking is gone.', 'bad'); return; }
  if(e.rebateReceivedOn){ UI.toast('That rebate is already recorded as received.', 'bad'); return; }
  const amount = ACC.r2(e.rebateReceivable || 0);
  if(amount <= 0){ UI.toast('Nothing outstanding on that booking.', 'bad'); return; }

  UI.modal({
    title:'Receive rebate',
    sub:`${UI.esc(String(e.center||'').toUpperCase())} · ${UI.peso(amount)}`,
    body:`
      <div class="note"><b>${UI.esc(name(T(e.traineeId)))}</b><br>
        ${UI.esc((CRS(e.courseId)||{}).title || '')} · ${UI.esc(e.no)}<br>
        Rebate owed by ${UI.esc(String(e.center||'').toUpperCase())}: <b>${UI.peso(amount)}</b></div>
      ${UI.row(UI.f.date('on','Date received', DB.today(), { req:true }),
               UI.f.select('method','Received in', ACC.methodNames()[0], ACC.methodNames()))}
      ${UI.f.text('ref','Reference no.','',{ ph:'cheque or transaction no.' })}
      <div class="note warn">This banks the rebate and clears the receivable. Once
        recorded it cannot be edited — a correction has to be a journal entry.</div>`,
    submitLabel:'Mark received',
    onSubmit: fd => {
      if(ACC.needsRef(fd.method) && !String(fd.ref||'').trim()){
        UI.toast(`${fd.method} needs its reference number.`, 'bad'); return false;
      }
      const on = fd.on || DB.today();
      if(on > DB.today()){ UI.toast('A rebate cannot arrive in the future.', 'bad'); return false; }

      e.rebateReceivedOn = on;
      e.rebateMethod = fd.method;
      e.rebateRef = String(fd.ref||'').trim();
      e.rebateReceivedBy = SESSION.name;
      ACC.postRebateReceipt({
        date:on, memo:`Rebate received — ${String(e.center||'').toUpperCase()} · ${e.no}`,
        refNo:e.no, refId:e.id, amount, method:fd.method,
      });
      DB.activity('Received rebate', `${e.no} · ${String(e.center||'').toUpperCase()} · ${UI.peso(amount)}`);
      DB.save();
      UI.toast(`${UI.peso(amount)} rebate banked.`);
      refresh();
    }
  });
}

/* Bookings the trainee has started paying and not finished. The training end
   date is the deadline that matters: after it the seafarer has the certificate
   and the office is chasing somebody who no longer needs anything from it, so
   the list is ordered by how little time is left rather than by how much is
   owed. Unbilled and untouched bookings are not here — this is for people who
   have shown they intend to pay. */
function partPaid(){
  const today = DB.today();
  return D().enrollments
    .filter(e => !['Cancelled','Dropped','Void'].includes(e.status))
    .map(e => {
      const inv = invOf(e.id);
      if(!inv) return null;
      ACC.recomputeInvoice(inv);
      const due = ACC.balanceOf(inv);
      if(due <= 0.004 || (inv.paid || 0) <= 0) return null;
      const ends = e.end || e.start || '';
      const daysLeft = ends ? Math.round((new Date(ends) - new Date(today)) / 86400000) : null;
      return { e, inv, t:T(e.traineeId), paid:ACC.r2(inv.paid || 0), due, ends, daysLeft };
    })
    .filter(Boolean)
    .sort((a,b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || b.due - a.due);
}

/* The letter the office would otherwise retype for every trainee. Plain text,
   because it has to survive being pasted into Messenger as often as into an
   email client. */
function reminderText(r){
  const co = D().company;
  const c = CRS(r.e.courseId);
  const when = r.e.start ? UI.dateRange(r.e.start, r.e.end) : 'your scheduled dates';
  return [
    `Good day, ${caps(APPS.forName(r.t))},`,
    '',
    `This is a reminder about your remaining balance for ${c ? c.title : 'your course'}`
      + ` at ${r.e.center || 'the training center'}, running ${when}.`,
    '',
    `  Total billed .... ${UI.peso(r.inv.total)}`,
    `  Paid so far ..... ${UI.peso(r.paid)}`,
    `  Still to pay .... ${UI.peso(r.due)}`,
    '',
    r.daysLeft != null && r.daysLeft >= 0
      ? `Kindly settle this on or before ${UI.date(r.ends)}, the last day of your training.`
      : `Your training has already ended, so kindly settle this at your earliest convenience.`,
    '',
    `You may pay in cash at our office, or through the modes we accept — ${ACC.methodNames().join(', ')}.`,
    'Please keep your reference number and send us a screenshot once paid.',
    '',
    'Thank you,',
    co.name,
    co.contact,
  ].join(String.fromCharCode(10));
}

function reminderModal(enrId){
  const r = partPaid().find(x => x.e.id === enrId);
  if(!r){ UI.toast('That booking has nothing outstanding.', 'bad'); return; }
  const body = reminderText(r);
  const subject = `Balance reminder — ${(CRS(r.e.courseId)||{}).title || 'your training'}`;
  const mail = r.t && r.t.email
    ? 'mailto:' + encodeURIComponent(r.t.email)
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(body)
    : '';

  UI.modal({
    title:'Payment reminder',
    sub:`${caps(APPS.forName(r.t))} · ${UI.peso(r.due)} outstanding`,
    wide:true, hideSubmit:true,
    /* Gmail's compose window rather than a mailto: link. mailto: hands the
       message to whatever the machine calls its mail program, which on an
       office PC is usually nothing at all — the button appeared to do nothing,
       or opened Outlook asking to be set up. The office sends from Gmail, so
       this opens Gmail with the message already in it. */
    footExtra: (r.t && r.t.email)
      ? `<a class="btn btn-primary" target="_blank" rel="noopener noreferrer"
            href="https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(r.t.email)}`
          + `&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}">Open in Gmail</a>`
      : '<span class="muted" style="font-size:12px">No email on file — copy the message instead.</span>',
    body:`
      <dl class="def def-tight">
        <dt>To</dt><dd>${r.t && r.t.email ? UI.esc(r.t.email) : '<span class="muted">no email on file</span>'}${
          r.t && r.t.mobile ? ` · <span class="mono">${UI.esc(r.t.mobile)}</span>` : ''}</dd>
        <dt>Subject</dt><dd>${UI.esc(subject)}</dd>
      </dl>
      ${copyRow('COPY MESSAGE')}
      <div class="note warn" style="margin-top:12px">Nothing is sent from here. Open in
        email hands it to your mail program with the message already written, and you
        press send.</div>`,
  });
  wireCopy(() => body);
}

VIEWS.payments = () => {
  const q = (state.q.pay || '').toLowerCase();
  const from = state.q.payFrom || firstOfMonth(), to = state.q.payTo || DB.today();
  const rows = D().payments.filter(p => p.date >= from && p.date <= to)
    .filter(p => !q || [receiptNo(p), name(T(p.traineeId)), p.ref, p.method].join(' ').toLowerCase().includes(q))
    .sort((a,b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));

  const chase = partPaid();
  const chaseDue = ACC.r2(chase.reduce((t,r) => t + r.due, 0));
  const allRebates = rebatesAll();
  /* Every center that owes a rebate stays in the picker whatever is selected —
     a filter that empties its own control cannot be undone. */
  const rebCenters = [...new Set(allRebates.map(r => r.center))].sort();
  const rebPick = state.q.rebCenter || '';
  const rebates = allRebates.filter(r => !rebPick || r.center === rebPick);
  /* Three figures, not two. Money still to be chased and money we are simply
     keeping back are both owed to us and neither is the other, so adding them
     into one "still to collect" would overstate what anybody has to ring a
     centre about. */
  const toCollect = ACC.r2(rebates.filter(r => !r.deduct && !r.received).reduce((s,r) => s + r.amount, 0));
  const collected = ACC.r2(rebates.filter(r => !r.deduct &&  r.received).reduce((s,r) => s + r.amount, 0));
  const deducted  = ACC.r2(rebates.filter(r =>  r.deduct).reduce((s,r) => s + r.amount, 0));

  return `
    <div class="toolbar">
      <input type="search" data-q="pay" value="${UI.esc(state.q.pay||'')}" placeholder="Search ref no. or trainee…" style="min-width:230px">
      <label class="muted" style="font-size:12px">From</label><input type="date" data-q="payFrom" value="${from}">
      <label class="muted" style="font-size:12px">To</label><input type="date" data-q="payTo" value="${to}">
      <span class="spacer"></span>
    </div>
    ${UI.card('', UI.table([
        { h:'Ref no.', k:p => `<b class="mono">${UI.esc(receiptNo(p))}</b>`, w:'130px' },
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
                 rowAttrs:p => `data-act="view-receipt" data-id="${p.id}"` }), { flush:true })}

        <div style="height:18px"></div>
        ${UI.card('Still To Pay Before Training Ends', UI.table([
          { h:'Trainee', k:r => `<b>${UI.esc(name(r.t))}</b>` },
          { h:'Course', k:r => UI.esc((CRS(r.e.courseId)||{}).title || '—') },
          { h:'Training ends', k:r => r.ends ? UI.date(r.ends) : '—', cls:'center', w:'120px' },
          { h:'Time left', k:r => r.daysLeft == null ? '<span class="muted">—</span>'
              : r.daysLeft < 0 ? UI.tag('ended','bad')
              : r.daysLeft === 0 ? UI.tag('last day','bad')
              : r.daysLeft <= 3 ? UI.tag(r.daysLeft + ' day(s)','warn')
              : `${r.daysLeft} days`, cls:'center', w:'110px' },
          { h:'Paid', k:r => UI.num(r.paid), cls:'numc' },
          { h:'Still to pay', k:r => `<b>${UI.num(r.due)}</b>`, cls:'num' },
          { h:'', k:r => can('payments')
              ? `<button class="btn btn-accent btn-xs" data-act="remind-pay" data-id="${r.e.id}">Remind</button>`
              : '', w:'100px' },
        ], chase, { empty:'Nobody is part-paid — every booking that has been started is settled.' }),
          { flush:true,
            sub:`${UI.peso(chaseDue)} outstanding across ${chase.length} booking(s), soonest deadline first` })}

        <div style="height:18px"></div>
        ${UI.card('Rebates From Training Centers', UI.table([
          { h:'Training center', k:r => `<b>${UI.esc(r.center)}</b>` },
          { h:'Trainee', k:r => UI.esc(name(T(r.e.traineeId))) },
          { h:'Course', k:r => UI.esc((CRS(r.e.courseId)||{}).title || '—') },
          { h:'Training', k:r => r.e.start ? UI.dateRange(r.e.start, r.e.end) : '—' },
          { h:'Rebate', k:r => `<b>${UI.num(r.amount)}</b>`, cls:'num' },
          { h:'How it settles', k:r => r.deduct
              ? UI.tag('Kept from remittance','sea')
              : UI.tag('Collected separately','warn'), cls:'center', w:'165px' },
          { h:'Settled', k:r => {
              if(r.deduct) return r.received
                ? `${UI.date(r.e.remitDate)}<br><span class="muted" style="font-size:11px">on ${UI.esc(r.e.remitNo)}</span>`
                : '<span class="muted">when we remit</span>';
              return r.received
                ? `${UI.date(r.e.rebateReceivedOn)}<br><span class="muted" style="font-size:11px">${UI.esc(r.e.rebateMethod||'')}${r.e.rebateRef ? ' · ' + UI.esc(r.e.rebateRef) : ''}</span>`
                : '<span class="muted">—</span>'; }, cls:'center', w:'150px' },
          /* Nothing to press on a deducted rebate. The money never comes in as
             its own payment, so a Receive button would be asking the office to
             record an arrival that will not happen. */
          /* Cancel sits beside Receive for everybody who can see the list.
             Registration presses it and it becomes a request; the admin presses
             it and it happens. Either way it says so before it does anything. */
          { h:'', k:r => {
              const held = pendingChangeFor(r.e.id);
              if(held) return `<span class="muted" style="font-size:11.5px">${UI.esc(held.no)} awaiting the admin</span>`;
              const cancel = can('payments')
                ? `<button class="btn btn-ghost btn-xs" data-act="cancel-rebate" data-id="${r.e.id}">Cancel</button>`
                : '';
              /* Nothing to cancel on a rebate kept back from a remittance.
                 There is no receipt to reverse and no receivable to write off —
                 it is a smaller debt to the centre, and the place to undo that
                 is the voucher, not here. */
              if(r.deduct) return r.received ? UI.tag('Deducted','ok') : '<span class="muted">—</span>';
              return (r.received
                ? UI.tag('Received','ok')
                : (can('payments')
                    ? `<button class="btn btn-accent btn-xs" data-act="receive-rebate" data-id="${r.e.id}">Receive</button>`
                    : '<span class="muted">—</span>')) + ' ' + cancel;
            }, w:'190px' },
        ], rebates, { empty:rebPick
            ? `Nothing recorded against ${rebPick}.`
            : 'No booking carries a rebate yet.' }),
          { flush:true,
            sub:`${UI.peso(toCollect)} still to collect`
                + (collected ? ` · ${UI.peso(collected)} already received` : '')
                + (deducted ? ` · ${UI.peso(deducted)} kept from remittances` : '')
                + (rebPick ? ` · ${rebPick}` : ''),
            actions:rebCenters.length > 1 ? `
              <select data-q="rebCenter" style="min-width:200px;font-size:12.5px">
                <option value="">All training centers</option>
                ${rebCenters.map(c => `<option value="${UI.esc(c)}" ${c === rebPick ? 'selected' : ''}>${UI.esc(c)}</option>`).join('')}
              </select>` : '' })}`;
};

/* ---------- sales ----------
   What the office actually earns. It does not sell training: it endorses
   seafarers to centres that run it, and the fee passes straight through — in
   from the trainee, out to the centre — so the rebate on each seat is the whole
   of the margin.

   It is a screen of its own rather than two figures in the corner of Payables
   because that is where they were, and reading the margin off the top of a
   list of debts made the earnings look like a kind of debt. It is also the one
   place the two ways a rebate settles are the same thing: kept back from a
   remittance or collected afterwards, both are income earned the day the seat
   was booked, and only the cash arrives at different times.

   Everything here reads from the same rebate rows as the payables screen, so
   pressing Receive there moves these figures without anything having to be
   entered twice. */
VIEWS.sales = () => {
  const from = state.q.salFrom || '', to = state.q.salTo || '';
  const all = rebatesAll().filter(r => {
    /* The day the seat was booked, not the day it trains.

       It was the other way round, which put a seat booked in September into
       October's earnings because that is when the centre happened to run it —
       and left September looking short on the day the office was counting.
       The page's own explanation has always said a seat earns its rebate the
       day it is booked; the filter now agrees with it.

       A booking with no date of its own falls back to the training date, which
       only reaches records old enough to predate the field. */
    const when = r.e.date || r.e.start || '';
    if(from && when < from) return false;
    if(to && when > to) return false;
    return true;
  });

  /* Two bookings for one seat.

     Double encoding puts the same training on the same trainee twice and the
     rebate on both, so the quota reads over by whatever the duplicate was
     worth. The copy is not counted — and it is not hidden either. The row says
     there are two of it, because the fix is to void one, and a report that
     quietly swallowed the extra would be the reason nobody ever did.

     Same trainee, same course, same centre, booked on the same day. A seafarer
     re-sitting a course books it on another day, and that is left alone: two
     genuine seats are two rebates. */
  const dupKey = r => [r.e.traineeId, r.e.courseId, r.center, r.e.date || ''].join('|');
  const groups = {};
  all.forEach(r => { const k = dupKey(r); (groups[k] = groups[k] || []).push(r); });

  const seats = [], extras = [];
  Object.keys(groups).forEach(k => {
    const g = groups[k].sort((a, b) => String(a.e.no).localeCompare(String(b.e.no)));
    seats.push({ ...g[0], copies:g.length });
    g.slice(1).forEach(r => extras.push(r));
  });
  seats.sort((a, b) =>
       String(b.e.date || b.e.start || '').localeCompare(String(a.e.date || a.e.start || ''))
    || String(b.e.no).localeCompare(String(a.e.no)));

  const sum = rows => ACC.r2(rows.reduce((s, r) => s + r.amount, 0));
  const net = rows => ACC.r2(rows.reduce((s, r) => s + r.earned, 0));
  const cut = rows => ACC.r2(rows.reduce((s, r) => s + r.discount, 0));

  /* Earned is what the office keeps: the rebate less the discount given on that
     seat. The three tiles beside it stay the gross rebate, because that is what
     actually moves between us and the centre — a discount changes what we
     collect from the trainee, never what the centre settles with us. */
  const doubled   = net(extras);
  const gross     = sum(seats);
  const discounts = cut(seats);
  const earned    = net(seats);
  /* A seat with no training date is an estimate: the rebate is agreed and the
     booking is real, but the training has not run and the seat can still move
     or be cancelled. It counts towards the quota — that is the point of
     knowing it — and it is marked so nobody reads it as money already made. */
  const estimated = net(seats.filter(r => !r.e.start));
  const kept      = sum(seats.filter(r => r.deduct));
  const toCollect = sum(seats.filter(r => !r.deduct && !r.received));
  const banked    = sum(seats.filter(r => !r.deduct && r.received));

  /* One line per centre, because that is the unit the office negotiates in —
     what a centre is worth over a season is the number that decides whether to
     keep sending people there. */
  const byCentre = {};
  seats.forEach(r => {
    const m = byCentre[r.center] || (byCentre[r.center] = {
      center:r.center, n:0, kept:0, toCollect:0, banked:0, discount:0, total:0 });
    m.n++;
    m.total = ACC.r2(m.total + r.earned);
    m.discount = ACC.r2(m.discount + r.discount);
    if(r.deduct) m.kept = ACC.r2(m.kept + r.amount);
    else if(r.received) m.banked = ACC.r2(m.banked + r.amount);
    else m.toCollect = ACC.r2(m.toCollect + r.amount);
  });
  const centres = Object.values(byCentre).sort((a, b) => b.total - a.total);

  const span = from || to
    ? `${from ? UI.date(from) : 'the beginning'} to ${to ? UI.date(to) : 'today'}`
    : 'all dates';

  return `
    <div class="toolbar">
      <label class="muted" style="font-size:12px">From</label>
      <input type="date" data-q="salFrom" value="${from}">
      <label class="muted" style="font-size:12px">to</label>
      <input type="date" data-q="salTo" value="${to}">
      <!-- It said "Training from", which is only true of the seats that have a
           training date. A seat still waiting on the centre is counted on the
           day it was booked, and saying so is the difference between a quota
           that looks short and one that is. -->
      <span class="muted">${seats.length} seat(s) · ${span} · by the day the seat was booked${
        extras.length ? ` · ${UI.int(extras.length)} double-encoded, counted once` : ''}</span>
    </div>

    <div class="grid g4" style="margin-bottom:18px">
      ${UI.kpi('Earned', UI.peso(earned),
               discounts > 0.004
                 ? `${UI.peso(gross)} rebate less ${UI.peso(discounts)} discount given`
                 : doubled > 0.004
                 ? `${seats.length} seat(s) · ${UI.peso(doubled)} left out as double-encoded`
                 : estimated > 0.004
                 ? `${seats.length} seat(s) · ${UI.peso(estimated)} estimated, not yet scheduled`
                 : `${seats.length} seat(s) booked`, earned < 0 ? 'bad' : 'ok')}
      ${UI.kpi('Rebates kept', UI.peso(kept), 'deducted from what we remit', '')}
      ${UI.kpi('Rebates to collect', UI.peso(toCollect), 'centers owe us this back',
               toCollect > 0 ? 'sea' : '')}
      ${UI.kpi('Already received', UI.peso(banked), 'collected and banked', 'ok')}
    </div>

    ${centres.length ? UI.card('Earnings By Training Center', UI.table([
      { h:'Training center', k:c => `<b>${UI.esc(c.center)}</b>` },
      { h:'Seats', k:c => UI.int(c.n), cls:'num', w:'80px' },
      { h:'Kept from remittance', k:c => c.kept ? UI.num(c.kept) : '<span class="muted">—</span>', cls:'num' },
      { h:'Still to collect', k:c => c.toCollect ? UI.num(c.toCollect) : '<span class="muted">—</span>', cls:'num' },
      { h:'Already received', k:c => c.banked ? UI.num(c.banked) : '<span class="muted">—</span>', cls:'num' },
      { h:'Less discount', k:c => c.discount
          ? `<span style="color:var(--bad)">(${UI.num(c.discount)})</span>`
          : '<span class="muted">—</span>', cls:'num' },
      { h:'Earned', k:c => `<b${c.total < 0 ? ' style="color:var(--bad)"' : ''}>${UI.num(c.total)}</b>`, cls:'num' },
      { h:'', k:c => can('payables')
          ? `<a class="btn btn-ghost btn-xs" href="#/payables">Open</a>` : '', w:'80px' },
    ], centres, { foot:['TOTAL', UI.int(seats.length), UI.num(kept), UI.num(toCollect),
                        UI.num(banked), UI.num(discounts), UI.num(earned), ''] }),
      { flush:true,
        sub:`Highest earning first · ${span}` })
      : UI.card('Earnings By Training Center',
          `<div class="empty"><span class="big">⚓</span>${from || to
            ? 'No seats with a rebate were trained in this window.'
            : 'No booking carries a rebate yet.'}</div>`, { flush:true })}

    <div style="height:18px"></div>
    ${seats.length ? UI.card('Rebate On Every Seat', UI.table([
      /* Booked first, because that is the day this row is counted on. When it
         runs is worth knowing and is not what the total is measured by. */
      { h:'Booked', k:r => `${UI.date(r.e.date)}<br>
          <span class="muted" style="font-size:11.5px">${r.e.start
            ? 'trains ' + UI.dateRange(r.e.start, r.e.end)
            : 'no training date yet'}</span>`, w:'165px' },
      { h:'Trainee', k:r => UI.esc(name(T(r.e.traineeId))) },
      { h:'Course', k:r => UI.esc((CRS(r.e.courseId) || {}).title || 'no course on file')
          + (r.copies > 1
              ? `<br><span style="color:var(--bad);font-size:11.5px">encoded ${UI.int(r.copies)}×
                   · counted once · void the extra</span>` : '') },
      { h:'Training center', k:r => UI.esc(r.center) },
      { h:'Booking', k:r => UI.statusTag(r.e.status) },
      { h:'How it settles', k:r => r.deduct
          ? '<span class="muted">kept from remittance</span>'
          : r.received ? '<span style="color:var(--ok)">received</span>'
                       : '<span style="color:var(--bad)">to collect</span>' },
      { h:'Rebate', k:r => UI.num(r.amount), cls:'num' },
      /* The discount was given out of this rebate, so it is shown against it
         rather than only on the bill — a seat discounted by more than it earns
         is a loss on that seat, and the office should be able to see which. */
      { h:'Less discount', k:r => r.discount
          ? `<span style="color:var(--bad)">(${UI.num(r.discount)})</span>`
          : '<span class="muted">—</span>', cls:'num' },
      /* Firm where the training has a date, marked est. where it does not. */
      { h:'Earned', k:r => r.e.start
          ? `<b${r.earned < 0 ? ' style="color:var(--bad)"' : ''}>${UI.num(r.earned)}</b>`
          : `<span class="muted">${UI.num(r.earned)} est.</span>`, cls:'num' },
    ], seats, { foot:['TOTAL', '', '', '', '', '', UI.num(gross),
                      UI.num(discounts), UI.num(earned)] }),
      { flush:true,
        sub:`Every booking that earns a rebate · ${span}`
            + (estimated > 0.004
                ? ` · ${UI.peso(estimated)} of it estimated on seats with no date yet`
                : '')
            + (doubled > 0.004
                ? ` · ${UI.peso(doubled)} on double-encoded copies is not in the total`
                : '') }) : ''}

    <div style="height:18px"></div>
    ${UI.card('How A Rebate Reaches Us', `
      <p class="muted" style="margin:0;font-size:12.5px;line-height:1.6">
        Every seat earns its rebate the day it is booked, whichever way the money
        comes. Where a centre lets us keep it back, it is netted off the
        remittance and never arrives as its own payment — those are the
        <b>kept</b> rows, and they are settled when the voucher goes out. The rest
        the centre owes us back, and they are marked received on
        <a href="#/payables">Center Payables</a> as each one is collected. Both
        halves are the same earnings; only the cash turns up at different times.
      </p>`, { flush:true })}`;
};

/* ---------- Expenses ---------- */
VIEWS.expenses = () => {
  const from = state.q.expFrom || startOfYear(), to = state.q.expTo || DB.today();
  const rows = D().expenses.filter(v => v.date >= from && v.date <= to)
    .sort((a,b) => b.date.localeCompare(a.date));
  /* Only approved vouchers have moved money, so only they are totalled — a
     pending one in the sum would overstate what has been spent. */
  const posted = rows.filter(v => (v.state || 'Approved') === 'Approved');
  const total = ACC.r2(posted.reduce((s,v) => s + v.amount, 0));
  const byAcct = {};
  posted.forEach(v => byAcct[v.account] = ACC.r2((byAcct[v.account]||0) + v.amount));

  return `
    <div class="toolbar">
      <label class="muted" style="font-size:12px">From</label><input type="date" data-q="expFrom" value="${from}">
      <label class="muted" style="font-size:12px">To</label><input type="date" data-q="expTo" value="${to}">
      <span class="muted">${rows.length} voucher(s) · ${UI.peso(total)} posted${rows.length - posted.length ? ` · ${rows.length - posted.length} awaiting approval` : ''}</span>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="new-expense">+ New disbursement</button>
    </div>

    ${approvalPanel(pendingExpenses())}

    <div class="grid g-2-1">
      <div>${UI.card('', UI.table([
        { h:'Voucher No.', k:v => `<b class="mono">${UI.esc(v.no)}</b>`, w:'135px' },
        { h:'Date', k:v => UI.date(v.date), w:'115px' },
        { h:'Payee', k:'payee' },
        { h:'Particulars', k:'particulars' },
        { h:'Account', k:v => `<span class="mono">${UI.esc(v.account)}</span> ${UI.esc(ACC.acct(v.account).name)}` },
        { h:'Mode', k:v => UI.tag(v.method, v.method==='Cash'?'ok':'sea') },
        { h:'Status', k:v => UI.statusTag(voucherState(v)) },
        { h:'Amount', k:v => `<b>${UI.peso(v.amount)}</b>`, cls:'num' },
        /* Every voucher, not only the ones that settle a training centre. A
           disbursement is a piece of paper somebody signs for — the payee signs
           it, the office files it — and it had no document at all. */
        { h:'', k:v => `<button class="btn btn-ghost btn-xs"
              data-act="view-expense" data-id="${v.id}">View</button>`, w:'80px' },
      ], rows, { empty:'No disbursements in this period.' }), { flush:true })}</div>
      <div>${UI.card('Expenses By Account',
        UI.barChart(Object.entries(byAcct).map(([c,v]) => ({ label:ACC.acct(c).name, value:v }))
          .sort((a,b) => b.value - a.value), { money:true }))}</div>
    </div>`;
};

/* ---------- Payables to training centers ----------
   Every booking creates a debt to the center that runs it. This is where those
   debts are sorted by center and paid off with one voucher each.

   What goes on the voucher is decided by the course, not here:
     Deduct        — the booking owes the fee less the rebate. We keep the
                     rebate by paying the center that much less.
     Do not deduct — the booking owes the whole fee. The rebate is a separate
                     debt the centre owes us, shown alongside so nobody forgets
                     to chase it, and never quietly netted off the voucher.

   A booking is outstanding until a voucher names it. Cancelled bookings drop
   out: their invoice is reversed, so the seat was never taken. */

const PAY_STATES = ['Enrolled','Completed'];

/* One row per booking that still owes a center something. A booking leaves this
   list once nothing is left on it, and comes back if the voucher that covered
   it is rejected.

   Three numbers per booking, and they are not the same number:

     fee        what the seat costs us. On a deduct course the rebate is already
                out of it — that is the whole of what deduct means, and it is
                settled once, here.
     collected  what the trainee has handed over against their bill.
     remittable what a voucher may pay right now: the collected money, capped at
                what the seat owes, less whatever has already been sent.

   The cap is why a rebate is never taken off a payment twice, and the collected
   figure is why a seat the trainee has only part-paid is never remitted in
   full. */
/* What has actually been collected against this one booking.

   Several bookings share a bill now, and the money on that bill is not marked
   as belonging to any of them — it is one payment against one document. So it
   is drawn down in the order the trainings were booked, which is the order the
   collection window fills them and the order they run in.

   The alternative is what the code did before there was anything to share: hand
   every booking the whole invoice's payments. On a shared bill that says three
   seats are paid for when one of them is, and the office remits for seats the
   trainee has not paid for. */
function collectedFor(e){
  const inv = invOf(e.id);
  if(!inv) return 0;
  const paid = ACC.r2(ACC.recomputeInvoice(inv).paid || 0);
  const mates = D().enrollments.filter(x => x.invoiceId === inv.id);
  if(mates.length <= 1) return paid;
  mates.sort((a, b) => String(a.start || '').localeCompare(String(b.start || ''))
                    || String(a.no || '').localeCompare(String(b.no || '')));
  let left = paid;
  for(const m of mates){
    const owed = ACC.r2((m.fee || 0) - (m.discount || 0));
    const take = ACC.r2(Math.max(0, Math.min(owed, left)));
    left = ACC.r2(left - take);
    if(m.id === e.id) return take;
  }
  return 0;
}

function openPayables(){
  return D().enrollments
    .filter(e => e.center && !e.remitNo && PAY_STATES.includes(e.status))
    .map(e => {
      const fee  = ACC.r2(e.centerPayable != null ? e.centerPayable : e.fee);
      const sent = ACC.r2(e.centerPaid || 0);
      /* What has actually been received against this one seat. collectedFor
         laid the bill's payments over its bookings in order, which is what the
         system had to do before a payment could name the training it was for.
         It can now, and bookingPaid asks that question properly — falling back
         to the same ordering only for bills raised before the lines carried
         their booking. Two functions answering one question differently is one
         of them being wrong on any bill where the cashier said which training
         the money was for. */
      const collected = bookingPaid(e);

      /* A discount is ours to give, and ours to fund.

         The centre is owed the fee. What the trainee is asked for is the fee
         less whatever we took off, so a seat discounted by 2,500 came to the
         counter as 100 — and the remittance, capped at what had been collected,
         sent the centre 100 for a seat they are owed 2,600 on. The centre was
         paying for our discount.

         So the discount counts as funded: a trainee who has paid everything
         they were asked for has settled the seat, and the centre is remitted in
         full. Where the money comes from is our rebate, which is exactly what
         it is for — Sales reports the rebate net of it. */
      const discount = ACC.r2(e.discount || 0);
      const funded = ACC.r2(collected + discount);
      return {
        e,
        center:e.center,
        fee,
        sent,
        collected,
        discount,
        payable:ACC.r2(fee - sent),
        remittable:ACC.r2(Math.min(funded, fee) - sent),
        rebate:ACC.r2(e.rebate || 0),
        receivable:ACC.r2(e.rebateReceivable || 0),
        deduct:!!e.deduct,
      };
    })
    .filter(r => r.payable > 0);
}

/* Everything outstanding, grouped under the center that is owed it. The date
   bounds are optional and read the training date, because that is how a center
   organises the statement the office reconciles against. Both bounds empty
   means everything: a payables screen that hides an old debt by default is a
   payables screen that lets an old debt go unpaid. */
function payablesByCenter(from, to){
  const map = {};
  openPayables().forEach(r => {
    const when = r.e.start || r.e.date || '';
    if(from && when < from) return;
    if(to && when > to) return;
    /* Keyed on the name in capitals: "Fareast" and "FAREAST" are one center
       that owes one amount, however the row happened to be typed. */
    const key = r.center.toUpperCase();
    const m = map[key] || (map[key] = {
      key, center:r.center, rows:[], payable:0, remittable:0, discount:0,
      rebateDeducted:0, receivable:0, oldest:'9999-12-31',
    });
    m.rows.push(r);
    m.payable = ACC.r2(m.payable + r.payable);
    m.discount = ACC.r2(m.discount + (r.discount || 0));
    m.remittable = ACC.r2(m.remittable + Math.max(0, r.remittable));
    if(r.deduct) m.rebateDeducted = ACC.r2(m.rebateDeducted + r.rebate);
    m.receivable = ACC.r2(m.receivable + r.receivable);
    if(when && when < m.oldest) m.oldest = when;
  });
  const out = Object.values(map);
  /* Oldest training first inside a center — that is the order the office pays
     in, and the order a statement arrives in. */
  out.forEach(m => m.rows.sort((a,b) =>
    String(a.e.start || a.e.date || '').localeCompare(String(b.e.start || b.e.date || ''))));
  return out.sort((a,b) => b.payable - a.payable);
}

/* The filter as the rest of the module reads it. centerVoucherForm uses the
   same values, so a voucher covers the bookings actually on screen. One date,
   read as "on or after" — a debt has no far end worth filtering to. */
const payablesFilter = () => ({
  from:state.q.payaFrom || '',
  center:state.q.payaCenter || '',
});

VIEWS.payables = () => {
  const { from, center:pick } = payablesFilter();
  const inWindow = d => !from || d >= from;

  /* The picker lists every center with something outstanding whatever the
     dates say. A filter that empties its own control cannot be undone. */
  const everyCenter = payablesByCenter().map(c => c.key).sort();

  const centers = payablesByCenter(from).filter(c => !pick || c.key === pick);
  const totalDue  = ACC.r2(centers.reduce((s,c) => s + c.payable, 0));
  const bookings  = centers.reduce((s,c) => s + c.rows.length, 0);

  const paid = D().expenses.filter(v => v.kind === 'remittance')
    .filter(v => !pick || String(v.payee).toUpperCase() === pick)
    .filter(v => inWindow(v.date))
    .sort((a,b) => b.date.localeCompare(a.date)).slice(0, 24);

  const filtered = !!(from || pick);
  const span = from ? `from ${UI.date(from)}` : 'all dates';

  /* One card per training center, with its own bookings and its own voucher
     button. The summary above is for deciding who to pay; these are for seeing
     exactly what is being paid for. */
  const section = c => UI.card(c.key, UI.table([
      { h:'Trainee', k:r => `<b>${UI.esc(name(T(r.e.traineeId)))}</b>` },
      { h:'Course', k:r => UI.esc((CRS(r.e.courseId) || {}).title || '—') },
      { h:'Training', k:r => r.e.start ? UI.dateRange(r.e.start, r.e.end) : '—' },
      /* What the trainee has handed over so far, and whether that settles their
         bill. The office reads this before deciding what to remit: a center
         being paid for a seat the trainee has not paid for is money out ahead
         of money in, and that is a decision, not an oversight. */
      /* The same figure the voucher pays from, so the two screens cannot
         disagree about what has come in. */
      { h:'Trainee paid', k:r => invOf(r.e.id) ? UI.num(r.collected) : '<span class="muted">—</span>',
        cls:'numc' },
      { h:'Payment', k:r => {
          const inv = invOf(r.e.id);
          if(!inv) return UI.tag('Not billed','muted');
          ACC.recomputeInvoice(inv);
          if(ACC.balanceOf(inv) <= 0.004) return UI.tag('Full','ok');
          return (inv.paid || 0) > 0 ? UI.tag('Partial','warn') : UI.tag('Unpaid','bad');
        }, cls:'center', w:'110px' },
      /* What the seat owes the center — what the subtotal adds up, and what a
         voucher pays for it. */
      { h:'Fee', k:r => `<b>${UI.num(r.payable)}</b>`, cls:'num' },
    ], c.rows, { foot:['SUBTOTAL', '', '', '', '', UI.num(c.payable)] }), {
      flush:true,
      sub:`${c.rows.length} booking(s) · oldest training ${c.oldest === '9999-12-31' ? '—' : UI.date(c.oldest)}`
          + ` · ${UI.peso(c.remittable)} collected and ready to remit`
          + (c.receivable ? ` · ${UI.peso(c.receivable)} rebate still to collect` : ''),
      actions:can('payables')
        ? `<button class="btn btn-accent btn-xs" data-act="pay-center"
             data-id="${UI.esc(c.center)}">Generate voucher</button>` : '',
    });

  return `
    <!-- The rebate figures moved to Sales. They are what the office earns, not
         what it owes, and reading them off the top of the payables screen made
         the margin look like a kind of debt. The per-centre columns below still
         carry them, because deciding what to remit needs both halves. -->
    <div class="grid g2" style="margin-bottom:18px">
      ${UI.kpi('Owed to centers', UI.peso(totalDue), `${centers.length} center(s) to settle`, totalDue > 0 ? 'warn' : 'ok')}
      ${UI.kpi('Bookings unpaid', UI.int(bookings), 'seats already taken', '')}
    </div>

    <div class="toolbar">
      <select data-q="payaCenter" style="min-width:210px">
        <option value="">All training centers</option>
        ${everyCenter.map(k => `<option value="${UI.esc(k)}" ${k === pick ? 'selected' : ''}>${UI.esc(k)}</option>`).join('')}
      </select>
      <label class="muted" style="font-size:12px">Training from</label>
      <input type="date" data-q="payaFrom" value="${from}">
      ${filtered ? '<button class="btn btn-ghost btn-sm" data-act="payables-all">Show everything</button>' : ''}
      <span class="spacer"></span>
      <span class="muted" style="font-size:12px">${UI.int(bookings)} booking(s) · ${span}</span>
    </div>

    ${approvalPanel(pendingRemittances(), { title:'Vouchers Waiting For Approval',
        sub:'Raised against the bookings below — no money has left until these are signed' })}

    ${centers.length > 1 ? UI.card('Payables', UI.table([
      { h:'Training center', k:c => `<b>${UI.esc(c.key)}</b>` },
      { h:'Bookings', k:c => UI.int(c.rows.length), cls:'num' },
      { h:'Oldest', k:c => c.oldest === '9999-12-31' ? '—' : UI.date(c.oldest) },
      /* The rebate columns went to Sales with the figures above them. This
         screen answers one question — what has to go out to whom — and the
         amount to remit already has the rebate taken off it where a centre
         lets us keep it. Showing the workings beside the answer had the desk
         adding and subtracting to arrive at a number that was in front of
         them. */
      { h:'To remit', k:c => `<b>${UI.num(c.payable)}</b>`, cls:'num' },
      { h:'', k:c => `<button class="btn btn-ghost btn-xs" data-act="paya-only"
            data-id="${UI.esc(c.key)}">Open</button>`, w:'90px' },
    ], centers, { foot:['TOTAL', UI.int(bookings), '', UI.num(totalDue), ''] }),
      { flush:true, sub:`By training date · ${span}` }) + '<div style="height:18px"></div>' : ''}

    ${centers.length
      ? centers.map(c => section(c) + '<div style="height:18px"></div>').join('')
      : UI.card('Outstanding Bookings',
          `<div class="empty"><span class="big">⚓</span>${filtered
            ? 'Nothing outstanding in this window. Widen the dates, or show everything.'
            : 'Nothing outstanding — every booking has been remitted.'}</div>`,
          { flush:true }) + '<div style="height:18px"></div>'}

    ${UI.card('Vouchers Issued To Centers', UI.table([
      { h:'Voucher No.', k:v => `<b class="mono">${UI.esc(v.no)}</b>`, w:'135px' },
      { h:'Date', k:v => UI.date(v.date), w:'115px' },
      { h:'Training center', k:v => UI.esc(String(v.payee).toUpperCase()) },
      { h:'Bookings', k:v => UI.int((v.bookings||[]).length), cls:'num' },
      { h:'Mode', k:v => UI.tag(v.method, v.method === 'Cash' ? 'ok' : 'sea') },
      { h:'Reference', k:v => UI.esc(v.ref || '—') },
      { h:'Amount', k:v => `<b>${UI.peso(v.amount)}</b>`, cls:'num' },
      /* Voiding is the admin's. Registration raises remittances and reads them
         back; unwinding one puts money back on the payables list and takes an
         entry off the books, which is not a button to leave on the counter. */
      { h:'', k:v => wasVoided(v)
          ? UI.tag('Void','muted')
          : `<button class="btn btn-ghost btn-xs" data-act="view-voucher" data-id="${v.id}">View</button>`
            + (canApprove()
                ? ` <button class="btn btn-ghost btn-xs" data-act="void-voucher" data-id="${v.id}">Void</button>`
                : ''), w:canApprove() ? '150px' : '80px' },
    ], paid, { empty:filtered
        ? 'No voucher was issued in this window.'
        : 'No remittance voucher has been issued yet.' }),
      { flush:true, sub:`By date issued · ${span}` })}
  `;
};

/* Pay one center. Every outstanding booking is on the voucher by default; the
   office can leave some off when it is settling only part of a statement. */
function centerVoucherForm(center){
  const key = String(center || '').toUpperCase();
  const { from } = payablesFilter();
  const group = payablesByCenter(from).find(c => c.center.toUpperCase() === key);
  if(!group){ UI.toast('Nothing outstanding for that center.', 'bad'); return; }
  /* What the date filter is holding back. The office is looking at a
     filtered screen; it should not have to guess that the voucher is
     filtered too, or how much it is leaving behind. */
  const whole = payablesByCenter().find(c => c.center.toUpperCase() === key) || group;
  const hidden = whole.rows.length - group.rows.length;

  /* Remitting is what the trainee has paid, capped at what the seat still owes.
     A seat nobody has paid for cannot go on a voucher at all — there is no money
     to send — so it is shown and locked rather than hidden, because the debt is
     still real and the office should see why it cannot pay it yet. */
  const ready = r => r.remittable > 0.004;
  /* Every cell was padded 4px 0 — no space between columns at all — so a
     discount and the amount owed beside it ran together as "500.005,500.00",
     and a dash for no discount read as a minus sign on the number after it.
     The office checks this against the centre's own statement line by line,
     which is what the row number is for. */
  const row = (r,i) => `
    <tr data-start="${UI.esc(r.e.start || '')}" data-end="${UI.esc(r.e.end || r.e.start || '')}"
        class="${ready(r) ? '' : 'locked'}">
      <td class="vch-n">${i + 1}</td>
      <td class="vch-name"><label class="vch-pick">
        <input type="checkbox" name="pick${i}" value="${r.e.id}" ${ready(r) ? 'checked' : 'disabled'}>
        <b>${UI.esc(name(T(r.e.traineeId)))}</b></label></td>
      <td class="vch-course">${UI.esc((CRS(r.e.courseId)||{}).title || '—')}</td>
      <td class="nowrap">${r.e.start
        ? UI.dateRange(r.e.start, r.e.end) : '<span class="muted">—</span>'}</td>
      <td class="num">${r.collected ? UI.num(r.collected) : '<span class="muted">—</span>'}</td>
      <td class="num">${r.discount ? UI.num(r.discount) : '<span class="muted">—</span>'}</td>
      <td class="num">${UI.num(r.payable)}</td>
      <td class="num">${ready(r)
        ? `<b>${UI.num(r.remittable)}</b>`
        : '<span class="muted nowrap">nothing collected</span>'}</td>
    </tr>`;

  UI.modal({
    title:`Pay ${center.toUpperCase()}`,
    sub:`${group.rows.length} booking(s) · ${UI.peso(group.payable)} outstanding · ${UI.peso(group.remittable)} collected`,
    widest:true,
    body:`
      ${hidden > 0 ? `<div class="note warn">The date filter is hiding ${UI.int(hidden)}
        other outstanding booking(s) for ${UI.esc(key)}, worth
        ${UI.peso(ACC.r2(whole.payable - group.payable))}. They are not on this voucher.
        Clear the dates first if this should settle everything.</div>` : ''}
      ${group.remittable > 0.004 ? '' : `<div class="note warn">Nothing has been collected
        against these bookings yet, so there is nothing to remit. Take the trainees'
        payments first — the voucher pays what has actually come in.</div>`}

      <!-- A centre with thirty outstanding seats is thirty boxes to go through
           by hand, and the office pays them a run at a time: this week's
           trainings, last month's. Narrowing by training date leaves the
           handful that are actually being settled, and the rest go back in
           when the dates are cleared. -->
      <div class="toolbar" style="margin-bottom:8px">
        <label class="muted" style="font-size:12px">Training from</label>
        <input type="date" id="vFrom">
        <label class="muted" style="font-size:12px">to</label>
        <input type="date" id="vTo">
        <button type="button" class="btn btn-ghost btn-xs" id="vAll">All dates</button>
        <button type="button" class="btn btn-ghost btn-xs" id="vTickAll">Tick all shown</button>
        <button type="button" class="btn btn-ghost btn-xs" id="vTickNone">Untick all</button>
        <span class="muted" id="vCount"></span>
      </div>
      <div class="table-wrap">
        <table class="vch">
          <thead><tr>
            <th class="vch-n">#</th>
            <th>Trainee name</th><th>Course</th><th>Training date</th>
            <th class="num">Paid (₱)</th><th class="num">Discount (₱)</th>
            <th class="num">Owed (₱)</th><th class="num">Remitting (₱)</th>
          </tr></thead>
          <tbody>${group.rows.map(row).join('')}</tbody>
        </table>
      </div>
      <!-- Said in a line each. At three lines apiece they took the height the
           eleventh booking needed, and the office scrolled to reach the row it
           was looking for past an explanation it had already read. -->
      ${group.discount > 0.004 ? `<div class="note">${UI.peso(group.discount)} of discount is
        <b>not taken off</b> what we remit — the centre is owed the full fee, and it comes out
        of our rebate.</div>` : ''}
      ${group.receivable ? `<div class="note warn">${UI.peso(group.receivable)} of rebate is
        <b>not deducted</b> — ${UI.esc(center.toUpperCase())} owes it back separately, so it is
        left out of this voucher.</div>` : ''}
      <div class="hr"></div>
      ${UI.row(UI.f.select('method','Paid from', ACC.methodNames()[0], ACC.methodNames()),
               UI.f.text('ref','Reference no.','',{ ph:'cheque or transaction no.' }))}
      ${UI.f.text('particulars','Particulars','', { ph:'e.g. August endorsements' })}
      <div class="hr"></div>
      <div id="voucherTotal"></div>`,
    submitLabel:'Post voucher',
    onSubmit: fd => {
      /* A booking hidden by the date filter is one nobody looked at, so it is
         not on the voucher whatever its box happens to say. Ticks are only
         honoured for rows that were on screen to be ticked. */
      const picked = group.rows.filter((r,i) => {
        const box = document.getElementsByName('pick' + i)[0];
        const tr = box && box.closest('tr');
        if(tr && tr.style.display === 'none') return false;
        return fd['pick'+i] && r.remittable > 0.004;
      });
      if(!picked.length){ UI.toast('Choose at least one booking with money collected against it.', 'bad'); return false; }
      const amount = ACC.r2(picked.reduce((s,r) => s + r.remittable, 0));
      if(ACC.needsRef(fd.method) && !String(fd.ref||'').trim()){
        UI.toast(`${fd.method} needs its reference number.`, 'bad'); return false;
      }

      const v = {
        id:DB.uid('exp'), no:DB.nextNo('voucher','DV'), kind:'remittance',
        state:'Pending', raisedBy:SESSION.name,
        date:DB.today(), payee:center,
        /* Booked to the payable, not to an expense: the cost was recognised
           when the seat was taken. */
        account:'2000',
        particulars:(fd.particulars || `Remittance To ${center}`).trim(),
        method:fd.method, ref:String(fd.ref||'').trim(),
        amount, bookings:picked.map(r => r.e.id),
        /* What each booking is being paid on this voucher. A seat the trainee
           has only part-paid contributes only that part, so the document prints
           what actually left rather than what the seat costs. */
        lines:picked.map(r => ({ id:r.e.id, amount:r.remittable })),
      };
      D().expenses.push(v);
      /* Committed straight away so a second voucher cannot be raised for the
         same money while this one waits. A booking only closes once the whole
         seat has been sent; part-paid seats stay on the list for the rest.
         Nothing has posted yet: approval does that. */
      picked.forEach(r => {
        r.e.centerPaid = ACC.r2((r.e.centerPaid || 0) + r.remittable);
        if(r.e.centerPaid >= r.fee - 0.004){ r.e.remitNo = v.no; r.e.remitDate = v.date; }
      });

      DB.activity('Raised remittance', `${v.no} · ${center} · ${UI.peso(amount)}`);
      DB.save();
      UI.toast(`Voucher ${v.no} raised — waiting for approval.`);
      render();
      voucherModal(v);
      return false;   // voucherModal has replaced the dialog
    }
  });

  const form = document.getElementById('mForm');
  const rowEl = i => { const b = form['pick'+i]; return b && b.closest('tr'); };
  const shown = i => { const tr = rowEl(i); return !!tr && tr.style.display !== 'none'; };
  const ticked = (r,i) => shown(i) && form['pick'+i] && form['pick'+i].checked;

  /* Hidden rows are out of the voucher whether or not their box is ticked, so
     the filter is a real narrowing rather than a change of view. Their ticks
     are left alone — clearing the dates brings them back exactly as they
     were. */
  const applyDates = () => {
    const a = document.getElementById('vFrom').value;
    const b = document.getElementById('vTo').value;
    let on = 0;
    group.rows.forEach((r, i) => {
      const tr = rowEl(i);
      if(!tr) return;
      const st = tr.dataset.start || '', en = tr.dataset.end || st;
      const keep = (!a && !b) || (!!st && (!a || en >= a) && (!b || st <= b));
      tr.style.display = keep ? '' : 'none';
      if(keep) on++;
    });
    const c = document.getElementById('vCount');
    if(c) c.textContent = (a || b)
      ? `${on} of ${group.rows.length} booking(s) shown`
      : `${group.rows.length} booking(s)`;
    total();
  };

  const tickShown = on => {
    group.rows.forEach((r, i) => {
      const box = form['pick'+i];
      if(box && !box.disabled && shown(i)) box.checked = on;
    });
    total();
  };

  ['vFrom','vTo'].forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.onchange = applyDates; el.oninput = applyDates; }
  });
  document.getElementById('vAll').onclick = () => {
    document.getElementById('vFrom').value = '';
    document.getElementById('vTo').value = '';
    applyDates();
  };
  document.getElementById('vTickAll').onclick  = () => tickShown(true);
  document.getElementById('vTickNone').onclick = () => tickShown(false);

  const total = () => {
    const sum = group.rows.reduce((s,r,i) => s + (ticked(r,i) ? r.remittable : 0), 0);
    const n = group.rows.filter(ticked).length;
    document.getElementById('voucherTotal').innerHTML = `
      <div style="display:flex;justify-content:flex-end">
        <table style="width:320px">
          <tr><td>Bookings on this voucher</td><td class="num">${UI.int(n)}</td></tr>
          <tr><td style="font-weight:700;border-top:2px solid var(--border-strong)">Amount to remit</td>
              <td class="num" style="font-weight:700;font-size:15px;border-top:2px solid var(--border-strong)">${UI.peso(ACC.r2(sum))}</td></tr>
        </table>
      </div>`;
  };
  form.addEventListener('change', total);
  applyDates();
}

/* Two copies of one document on a single A4 — original for the party we are
   paying or billing, duplicate for the file. Only the first shows on screen;
   the print stylesheet reveals the second and sizes both to half a sheet. */
function twoUp(inner){
  const copy = label => `
    <section class="doc-copy"><span class="copy-mark">${label}</span>${inner}</section>`;
  return `<div class="doc2">
    ${copy('ORIGINAL')}${copy('DUPLICATE')}
    <p class="copy-note">Prints as two copies on one A4 — original above, duplicate below the cut line.</p>
  </div>`;
}

/* The voucher itself, printable — a training center is going to want a copy. */
/* ---------- unwinding a remittance ----------
   A voucher is written against particular bookings and marks them as covered so
   nobody remits the same seat twice. Undoing one has to give those seats back,
   or they vanish from the payables list while still being owed — the centre
   would simply never be paid again for them and nothing on any screen would
   say so.

   Nothing is deleted. The entry is reversed beside the original, because a
   voucher a centre may already be holding a copy of is not a thing to erase
   from our side. */
/* The server allows three states on a voucher and only three: Pending,
   Approved, Rejected. I wrote a fourth, "Voided", and every save after that was
   refused — new row for relation "expenses" violates check constraint
   "expenses_state_check" — which stopped the office saving anything at all.

   A voided voucher and a rejected one both end at the same place: the document
   does not stand and nothing is owed on it. What separates them is whether
   money ever moved, and the journal already knows that — a voucher approved and
   then voided has a posting and a reversal against it; one rejected before
   approval has neither. So the state is Rejected, as the server requires, and
   which of the two it was is read off the books rather than stored twice. */
const VOID_NOTE = 'Voided after approval';
const wasVoided = v => !!v && v.state === 'Rejected'
  && (String(v.decisionNote || '').indexOf(VOID_NOTE) === 0
      || D().journal.some(j => j.refId === v.id));
const voucherState = v => !v ? '\u2014' : wasVoided(v) ? 'Void' : (v.state || 'Approved');

function voidVoucher(v, reason){
  if(!v){ UI.toast('That voucher is gone.', 'bad'); return false; }
  if(wasVoided(v)){ UI.toast('That voucher is already void.', 'bad'); return false; }
  if(v.state === 'Rejected'){ UI.toast('That voucher was rejected — nothing was posted on it.', 'bad'); return false; }
  if(v.state === 'Pending'){
    UI.toast('That voucher has not been approved yet — reject it instead.', 'bad'); return false;
  }

  (v.bookings || []).forEach(id => {
    const e = ENR(id);
    if(!e) return;
    const l = (v.lines || []).find(x => x.id === id);
    const back = l ? l.amount : (e.centerPayable != null ? e.centerPayable : e.fee);
    e.centerPaid = ACC.r2(Math.max(0, (e.centerPaid || 0) - back));
    if(e.remitNo === v.no){ delete e.remitNo; delete e.remitDate; }
  });

  ACC.reverse(v.id, reason || 'Voucher voided');
  /* Carried on state rather than on a flag of its own. Every field here already
     has a column on the server; a new one would need a migration applied by
     hand before anybody could save anything at all — and "Voided" is what state
     is for, alongside Pending, Approved and Rejected. It also drops the voucher
     out of every total that counts approved money as spent, which is most of
     what voiding it means. */
  v.state = 'Rejected';
  v.decidedBy = SESSION.name;
  v.decidedOn = DB.today();
  v.decisionNote = `${VOID_NOTE}\u2014 ${reason || ''}`.replace('\u2014 ', '\u2014 ').trim();
  return true;
}

function voidVoucherAsk(id){
  const v = D().expenses.find(x => x.id === id);
  if(!v) return;
  if(!canApprove()){ UI.toast('Only an admin can void a voucher.', 'bad'); return; }
  UI.confirm(`Void ${v.no}?`, fd => {
    const reason = String(fd.reason || '').trim();
    if(!reason){ UI.toast('Say why it is being voided — a void with no reason is a gap in the file.', 'bad'); return; }
    if(!voidVoucher(v, reason)) return;
    DB.save();
    DB.activity('Voided a remittance voucher', v.no + ' — ' + reason);
    UI.toast(`${v.no} voided. ${UI.peso(v.amount)} is back on the payables list.`);
    refresh();
  }, { danger:true, reason:true, yes:'Void the voucher',
       detail:'The entry is reversed rather than erased, and the bookings it covered go back on the payables list as still owed.' });
}

/* ---------- the voucher for an ordinary disbursement ----------
   A remittance to a training centre already prints; anything else the office
   pays for — the rent, the ads, the courier — did not, so the only record of it
   was a row on a screen. A voucher is the thing the payee signs and the thing
   that goes in the folder, and every disbursement needs one.

   Two copies on one A4 like the rest of them: the original for the file, the
   duplicate for whoever took the money. */
function expenseVoucherModal(v){
  if(!v){ UI.toast('That voucher is gone.', 'bad'); return; }
  const co = D().company;
  const voided = wasVoided(v);

  /* A document somebody is handed and signs for, so it is bordered, compact and
     carries the mark \u2014 the same family as the acknowledgement receipt, because
     the two leave the same office on the same day. */
  const chargedTo = (() => {
    if(!v.account) return '\u2014';
    const nm = ACC.acct(v.account).name;
    /* An account with no name on file falls back to its own code, and a voucher
       reading "5110 5110" looks like a fault in the document. */
    return `<span class="mono">${UI.esc(v.account)}</span>`
      + (nm && nm !== v.account ? ' ' + UI.esc(nm) : '');
  })();

  const sheet = `
    <div class="doc" style="padding:0;background:transparent">
     <div class="dv">
      <div class="dv-head">
        <img src="${LOGO}" alt="">
        <div class="dv-co">
          <h2>${UI.esc(co.name)}</h2>
          ${co.address ? `<div class="l">${ICO.pin}<span>${UI.esc(co.address)}</span></div>` : ''}
          ${contactLines().map((x, n) =>
            `<div class="l">${n ? ICO.mail : ICO.phone}<span>${UI.esc(x)}</span></div>`).join('')}
          ${co.tradeName ? `<div class="l" style="opacity:.75">${UI.esc(co.tradeName)}</div>` : ''}
        </div>
        <div class="dv-badge">
          <div class="b">DISBURSEMENT VOUCHER</div>
          <div class="n">${UI.esc(v.no)}</div>
          <div class="m">Date issued : ${UI.date(v.date)}</div>
          ${v.ref ? `<div class="m">Reference : <span class="mono">${UI.esc(v.ref)}</span></div>` : ''}
          ${voided ? '<div style="margin-top:6px">' + UI.tag('VOID','bad') + '</div>' : ''}
          ${v.state === 'Pending'
            ? '<div style="margin-top:6px">' + UI.tag('Awaiting approval','warn') + '</div>' : ''}
        </div>
      </div>

      <div class="dv-fields"><table>
        <tr><td class="k">Pay To</td><td><b>${UI.esc(v.payee || '\u2014')}</b></td></tr>
        <tr><td class="k">Charged To</td><td>${chargedTo}</td></tr>
        <tr><td class="k">Amount In Words</td><td><b>${UI.esc(amountInWords(v.amount))}</b></td></tr>
      </table></div>

      <div class="dv-lines"><table>
        <thead><tr><th style="text-align:left">DESCRIPTION</th>
          <th class="num">AMOUNT (\u20b1)</th></tr></thead>
        <tbody>
          <tr><td>${UI.esc(v.particulars || '\u2014')}</td>
              <td class="num">${UI.num(v.amount)}</td></tr>
          <tr class="total"><td>TOTAL DISBURSED</td>
              <td class="num">${UI.peso(v.amount)}</td></tr>
        </tbody>
      </table></div>

      <div class="dv-fields" style="margin-top:12px"><table>
        <tr><td class="k">Mode Of Payment</td><td>${UI.esc(v.method || '\u2014')}</td></tr>
        <tr><td class="k">Reference No.</td>
            <td>${v.ref ? `<span class="mono">${UI.esc(v.ref)}</span>` : '\u2014'}</td></tr>
      </table></div>

      <div class="dv-foot">
        <p class="dv-note">Received the sum stated above in full settlement of the
          particulars described.${v.state === 'Approved' && v.approvedBy
            ? ` Approved by ${UI.esc(v.approvedBy)} on ${UI.date(v.approvedOn)}.` : ''}</p>
        <div class="dv-sign">Received By ${UI.esc(String(v.payee || '').toUpperCase())}</div>
        ${v.raisedBy ? `<p class="dv-note" style="text-align:center;margin-top:8px">Prepared by
          ${UI.esc(v.raisedBy)}.</p>` : ''}
        <div class="dv-tag">Sailing Towards<br>Better Opportunities.</div>
      </div>
     </div>
    </div>`;

  UI.modal({
    title:`Voucher ${v.no}`,
    sub:`${UI.esc(v.payee || '')} \u00b7 ${UI.peso(v.amount)}${voided ? ' \u00b7 VOID' : ''}`,
    wide:true, hideSubmit:true,
    footExtra:`<button type="button" class="btn btn-primary" id="printExpense">Print / PDF</button>`,
    body: twoUp(sheet),
  });
  document.getElementById('printExpense').onclick = () =>
    UI.printDoc(`${v.no} \u2014 Disbursement Voucher`);
}

function voucherModal(v){
  const bookings = (v.bookings || []).map(id => ENR(id)).filter(Boolean);
  const co = D().company;
  /* What this voucher pays on each booking. Vouchers raised before part
     payments existed have no lines, and paid the seat in full. */
  const lineFor = e => {
    const l = (v.lines || []).find(x => x.id === e.id);
    return l ? l.amount : (e.centerPayable != null ? e.centerPayable : e.fee);
  };

  const sheet = `
    <div class="doc">
      <div class="doc-head">
        ${docCompany()}
        <div class="doc-title">
          <div class="t">DISBURSEMENT VOUCHER</div>
          <div class="n">${UI.esc(v.no)}</div>
          ${wasVoided(v) ? '<div style="margin-top:5px">' + UI.tag('VOID','bad') + '</div>' : ''}
          <div class="muted" style="font-size:12px">${UI.date(v.date)}</div>
        </div>
      </div>
      <dl class="def">
        <dt>Pay To</dt><dd><b>${UI.esc(String(v.payee).toUpperCase())}</b></dd>
        <dt>Particulars</dt><dd>${UI.esc(v.particulars)}</dd>
        <dt>Paid From</dt><dd>${UI.esc(v.method)}${v.ref ? ` · Ref ${UI.esc(v.ref)}` : ''}</dd>
        <dt>Amount In Words</dt><dd>${UI.esc(amountInWords(v.amount))}</dd>
      </dl>
      ${UI.table([
        { h:'Trainee', k:e => UI.esc(name(T(e.traineeId))) },
        { h:'Course', k:e => UI.esc((CRS(e.courseId)||{}).title || '—') },
        { h:'Training', k:e => e.start ? UI.dateRange(e.start, e.end) : '—' },
        { h:'Amount', k:e => UI.num(lineFor(e)), cls:'num' },
      ], bookings, { empty:'No bookings recorded on this voucher.' })}
      <div class="doc-total">
        <table>
          <tr class="grand"><td>TOTAL REMITTED</td><td class="num">${UI.peso(v.amount)}</td></tr>
        </table>
      </div>
      <div class="doc-sign">
        <div>Prepared By</div>
        <div>Received By ${UI.esc(String(v.payee).toUpperCase())}</div>
      </div>
    </div>`;

  UI.modal({
    title:`Voucher ${v.no}`,
    sub:`${String(v.payee).toUpperCase()} · ${UI.peso(v.amount)}`
      + (wasVoided(v) ? ' · VOID' : ''),
    wide:true,
    hideSubmit:true,
    footExtra:`${!wasVoided(v) && v.state === 'Approved' && canApprove()
        ? `<button type="button" class="btn btn-danger" id="voidVoucher">Void voucher</button>` : ''}
      <button type="button" class="btn btn-primary" id="printVoucher">Print / PDF</button>`,
    body: twoUp(sheet),
  });
  document.getElementById('printVoucher').onclick = () =>
    UI.printDoc(`${v.no} — Disbursement Voucher`);
  const vv = document.getElementById('voidVoucher');
  if(vv) vv.onclick = () => { UI.close(); voidVoucherAsk(v.id); };
}

/* ---------- payroll ----------
   Salaries run through the same voucher machinery as any other money out —
   raised pending, approved by an admin, posted on approval — but they are kept
   on their own screen because the amounts are nobody else's business. The
   totals still reach the daily report: what left the account left the account,
   and a report that quietly omits a payment is worse than one that shows it. */
const PAYROLL_ACCOUNT = '5200';

VIEWS.payroll = () => {
  const rows = D().expenses.filter(v => v.account === PAYROLL_ACCOUNT)
    .sort((a,b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
  const paid = ACC.r2(rows.filter(v => v.state === 'Approved').reduce((s,v) => s + v.amount, 0));
  const waiting = ACC.r2(rows.filter(v => v.state === 'Pending').reduce((s,v) => s + v.amount, 0));

  return `
    ${UI.card('Payroll', UI.table([
      { h:'Voucher No.', k:v => `<b class="mono">${UI.esc(v.no)}</b>`, w:'135px' },
      { h:'Date', k:v => UI.date(v.date), w:'115px' },
      { h:'Paid to', k:v => UI.esc(v.payee) },
      { h:'Particulars', k:v => UI.esc(v.particulars || '—') },
      { h:'Mode', k:v => UI.tag(v.method, v.method === 'Cash' ? 'ok' : 'sea') },
      { h:'Amount', k:v => `<b>${UI.peso(v.amount)}</b>`, cls:'num' },
      { h:'State', k:v => UI.statusTag(v.state) },
    ], rows, { empty:'No payroll has been raised yet.' }), {
      flush:true,
      sub:'Only an admin can open this screen. The totals still appear on the daily report.',
      actions:'<button class="btn btn-primary btn-xs" data-act="new-payroll">+ Record payroll</button>',
    })}`;
};

function payrollForm(){
  UI.modal({
    title:'Payroll', sub:'Raised as pending — posts once an admin approves it',
    body:`
      ${UI.row(UI.f.text('payee','Paid to', 'Payroll', { req:true }),
               UI.f.date('date','Date', DB.today(), { req:true }))}
      ${UI.f.text('particulars','Particulars','',{ req:true, ph:'e.g. August 1–15 salaries' })}
      ${UI.row(UI.f.num('amount','Amount (₱)','',{ req:true, min:0.01 }),
               UI.f.select('method','Paid from', ACC.methodNames()[0], ACC.methodNames()))}
      <div class="note warn">Nothing posts yet. On approval this debits Salary / Wages
        and credits whichever cash account the mode names. The amount reaches the
        daily report on the day it is approved; the payee and the particulars stay
        on this screen.</div>`,
    submitLabel:'Raise payroll',
    onSubmit: fd => {
      const amount = ACC.r2(fd.amount);
      if(amount <= 0){ UI.toast('Enter an amount greater than zero.', 'bad'); return false; }
      const v = { id:DB.uid('exp'), no:DB.nextNo('voucher','DV'), kind:'payroll',
                  date:fd.date || DB.today(), payee:String(fd.payee||'Payroll').trim(),
                  account:PAYROLL_ACCOUNT, particulars:String(fd.particulars||'').trim(),
                  amount, method:fd.method, state:'Pending', raisedBy:SESSION.name };
      D().expenses.push(v);
      DB.activity('Raised payroll', v.no);
      UI.toast(`Voucher ${v.no} raised — waiting for approval.`);
      refresh();
    }
  });
}

/* ---------- bank reconciliation ----------
   Cash is counted; everything else is a claim. A GCash or bank reference typed
   at the counter is the only thing tying a receipt to money that actually
   arrived, and until somebody sets it beside the statement it is a number
   somebody typed — possibly the right one, possibly the previous customer's,
   possibly nothing at all.

   So this is the two jobs that finding out consists of. It totals what the
   books say arrived by each method, which is the figure to compare against the
   statement; and it lists every reference behind that figure so each can be
   ticked off. What is ticked is kept on the tender itself, which already
   travels to the server, so a reconciliation done once stays done and does not
   have to be repeated on the other machine. */
function bankLines(from, to){
  const out = [];
  D().payments.forEach(p => {
    if(p.voided || p.date < from || p.date > to) return;
    const list = p.tenders && p.tenders.length
      ? p.tenders : [{ method:p.method, ref:p.ref, amount:p.amount }];
    list.forEach((t, i) => {
      /* Cash has nothing to match against and no reference to check. Asking
         somebody to tick it off a bank statement it was never on is how a
         reconciliation stops being done at all. */
      if(!ACC.needsRef(t.method)) return;
      out.push({ p, t, i, key:`${p.id}:${i}` });
    });
  });
  return out.sort((a,b) => a.p.date.localeCompare(b.p.date) || String(a.p.no).localeCompare(String(b.p.no)));
}

/* The same reference on two different receipts is either one payment banked
   twice or a number copied from the row above, and both are worth stopping on.

   Twice on the SAME receipt is neither: one GCash transfer settling three
   trainings is split across three rows by design, and every one of them
   carries the reference of the transfer it came from. Flagging that would
   train the office to ignore the flag. */
function refClashes(lines){
  const seen = {};
  lines.forEach(l => {
    const ref = String(l.t.ref || '').trim().toLowerCase();
    if(!ref) return;
    const k = l.t.method + '|' + ref;
    (seen[k] || (seen[k] = new Set())).add(receiptNo(l.p));
  });
  const bad = new Set();
  Object.keys(seen).forEach(k => { if(seen[k].size > 1) bad.add(k); });
  return l => {
    const ref = String(l.t.ref || '').trim().toLowerCase();
    return !!ref && bad.has(l.t.method + '|' + ref);
  };
}

VIEWS.reconcile = () => {
  const from = state.q.recFrom || firstOfMonth();
  const to   = state.q.recTo   || DB.today();
  const only = state.q.recOnly || '';          /* '', 'open', 'flagged' */
  const meth = state.q.recMethod || '';

  const all = bankLines(from, to);
  const clashes = refClashes(all);
  const flagged = l => clashes(l) || !String(l.t.ref || '').trim();

  const lines = all.filter(l =>
    (!meth || l.t.method === meth)
    && (only !== 'open' || !l.t.cleared)
    && (only !== 'flagged' || flagged(l)));

  /* What the books say arrived by each method — the figure to hold the
     statement against — and how much of it has been agreed so far. */
  const byMethod = {};
  all.forEach(l => {
    const m = byMethod[l.t.method] || (byMethod[l.t.method] = { total:0, cleared:0, n:0, open:0 });
    m.total = ACC.r2(m.total + l.t.amount);
    m.n++;
    if(l.t.cleared) m.cleared = ACC.r2(m.cleared + l.t.amount);
    else m.open = ACC.r2(m.open + l.t.amount);
  });

  const problems = all.filter(flagged);
  const openTotal = ACC.r2(all.filter(l => !l.t.cleared).reduce((s,l) => s + l.t.amount, 0));

  return `
    <div class="toolbar" style="margin-bottom:8px">
      <label class="muted" style="font-size:12px">From</label>
      <input type="date" data-q="recFrom" value="${from}">
      <label class="muted" style="font-size:12px">To</label>
      <input type="date" data-q="recTo" value="${to}">
      <select data-q="recMethod" style="min-width:150px">
        <option value="">All methods</option>
        ${Object.keys(byMethod).sort().map(m =>
          `<option value="${UI.esc(m)}" ${m === meth ? 'selected' : ''}>${UI.esc(m)}</option>`).join('')}
      </select>
      <select data-q="recOnly" style="min-width:190px">
        <option value="">Everything</option>
        <option value="open" ${only === 'open' ? 'selected' : ''}>Not yet matched</option>
        <option value="flagged" ${only === 'flagged' ? 'selected' : ''}>Needs looking at</option>
      </select>
      <span class="muted">${lines.length} of ${all.length} line(s)</span>
    </div>

    <div class="kpi-row" style="margin-bottom:16px">
      ${Object.keys(byMethod).sort().map(m => UI.kpi(m, UI.peso(byMethod[m].total),
          byMethod[m].open
            ? `${UI.peso(byMethod[m].open)} not yet matched`
            : `all ${byMethod[m].n} matched`,
          byMethod[m].open ? 'warn' : 'ok')).join('')
        || UI.kpi('Nothing to reconcile', '—', 'no bank or e-wallet receipts in this period', '')}
    </div>

    ${problems.length ? `<div class="note bad">
      <b>${problems.length} line(s) need looking at.</b>
      A reference on two different receipts is either one payment banked twice or
      a number copied from the row above; a missing one cannot be matched at all.
      ${only === 'flagged' ? '' : ' Choose <b>Needs looking at</b> above to see only those.'}
    </div>` : ''}

    ${UI.card('Against The Statement', UI.table([
      { h:'Date', k:l => UI.date(l.p.date), w:'110px' },
      { h:'Receipt', k:l => `<b class="mono">${UI.esc(receiptNo(l.p))}</b>`, w:'135px' },
      { h:'From', k:l => UI.esc(name(T(l.p.traineeId))) },
      { h:'Bill', k:l => { const i = INV(l.p.invoiceId);
          return i ? `<span class="mono">${UI.esc(i.no)}</span>` : '<span class="muted">—</span>'; }, w:'135px' },
      { h:'Method', k:l => UI.tag(l.t.method, 'sea'), w:'100px' },
      { h:'Reference', k:l => {
          const ref = String(l.t.ref || '').trim();
          if(!ref) return '<span class="neg">none entered</span>';
          return `<span class="mono">${UI.esc(ref)}</span>`
            + (clashes(l) ? '<br><span class="neg" style="font-size:11px">also on another receipt</span>' : ''); } },
      { h:'Amount', k:l => `<b>${UI.num(l.t.amount)}</b>`, cls:'num', w:'110px' },
      { h:'Matched', k:l => l.t.cleared
          ? `${UI.date(l.t.cleared)}<br><span class="muted" style="font-size:11px">${UI.esc(l.t.clearedBy || '')}</span>`
          : '<span class="muted">—</span>', cls:'center', w:'130px' },
      { h:'', k:l => can('payments')
          ? `<button class="btn ${l.t.cleared ? 'btn-ghost' : 'btn-accent'} btn-xs"
               data-act="match-tender" data-id="${l.key}">${l.t.cleared ? 'Unmatch' : 'Matched'}</button>`
          : '', w:'110px' },
    ], lines, { empty:only || meth
        ? 'Nothing here with those filters.'
        : 'No bank or e-wallet receipts in this period — cash needs no reconciling.' }),
      { flush:true,
        sub:`${UI.peso(openTotal)} still to agree against the statement`
            + (problems.length ? ` · ${problems.length} needing attention` : '') })}`;
};

/* Ticking a line off is a fact about a bank statement somebody is holding, so
   it carries who said so and when. It is kept on the tender rather than in a
   table of its own, which means it reaches the other desk with the receipt it
   belongs to and needs nothing new on the server. */
function matchTender(key, on){
  const [payId, idx] = String(key).split(':');
  const p = PAY(payId);
  if(!p){ UI.toast('That receipt is gone.', 'bad'); return; }
  const list = p.tenders && p.tenders.length ? p.tenders : null;
  if(!list || !list[idx]){ UI.toast('That line is gone.', 'bad'); return; }
  if(on){
    list[idx].cleared = DB.today();
    list[idx].clearedBy = SESSION.name;
  }else{
    delete list[idx].cleared;
    delete list[idx].clearedBy;
  }
  DB.save();
  DB.activity(on ? 'Matched a receipt to the statement' : 'Unmatched a receipt',
    `${receiptNo(p)} · ${list[idx].method} ${list[idx].ref || 'no ref'}`);
  refresh();
}

/* ---------- approvals ----------
   Nothing that takes money out of the business posts itself. A voucher, a
   remittance to a training center and a refund are all written as pending, and
   the journal entry is made the moment somebody approves them. That way the
   books never show cash leaving on the strength of an unapproved document, and
   the daily report can be trusted as a record of what actually moved.

   Approving is an admin job. Whoever raised it cannot approve it — the point of
   the step is that a second pair of eyes sees the money before it goes. */
/* Seeing the queue and deciding it are different jobs. Accounting keeps the
   tab — they are the ones chasing what is held up — but the decision that
   releases money belongs to the admin and to nobody else. */
const canApprove = () => !!(SESSION && ['admin','owner'].includes(SESSION.role));

const MONEY_OUT = [
  { key:'expenses', label:'Disbursement', post:v => ACC.postExpense(v) },
  { key:'refunds',  label:'Refund',       post:r => ACC.postRefund(r) },
];

/* Split three ways, because each kind is decided on a different screen. A
   remittance belongs to Center Payables, where the admin can see the bookings
   it settles; a disbursement to Disbursements; a refund to Refunds. */
function pendingRemittances(){
  return D().expenses.filter(v => v.state === 'Pending' && v.kind === 'remittance')
    .map(v => ({ ...v, _kind:'expenses' }))
    .sort((a,b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
}
function pendingExpenses(){
  return D().expenses.filter(v => v.state === 'Pending' && v.kind !== 'remittance')
    .map(v => ({ ...v, _kind:'expenses' }))
    .sort((a,b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
}
function pendingRefunds(){
  return D().refunds.filter(r => r.state === 'Pending')
    .map(r => ({ ...r, _kind:'refunds' }))
    .sort((a,b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
}

/* Approvals used to be a screen of its own, listing money out of three
   different places at once. It is now shown on the screen each document came
   from: the admin decides in front of the thing being decided, rather than in
   a list of numbers away from it. The rule behind the button has not moved —
   approveDoc still refuses anybody who is not an admin, and still refuses a
   self-approval while somebody else could sign instead. */
function approvalPanel(pend, opts){
  opts = opts || {};
  if(!pend.length) return '';
  return UI.card(opts.title || 'Waiting For Approval', UI.table([
    { h:'Document', k:d => `<b class="mono">${UI.esc(d.no)}</b>`, w:'135px' },
    { h:'Raised', k:d => `${UI.date(d.date)}<br>
        <span class="muted" style="font-size:11.5px">${UI.esc(d.raisedBy || '—')}</span>` },
    { h:'Pay to', k:d => UI.esc(d.payee || (d.traineeId ? name(T(d.traineeId)) : '—')) },
    { h:'Particulars', k:d => UI.esc(d.particulars || d.reason || '—') },
    { h:'Mode', k:d => UI.tag(d.method, d.method === 'Cash' ? 'ok' : 'sea') },
    { h:'Amount', k:d => `<b>${UI.num(d.amount)}</b>`, cls:'num' },
    { h:'', k:d => canApprove()
        ? `<button class="btn btn-accent btn-xs" data-act="approve-doc" data-id="${d._kind}:${d.id}">Approve</button>
           <button class="btn btn-ghost btn-xs" data-act="reject-doc" data-id="${d._kind}:${d.id}">Reject</button>`
        : '<span class="muted">the admin decides</span>', w:'170px' },
  ], pend), { flush:true,
      sub:opts.sub || 'Not on the books until an admin signs it off' })
    + '<div style="height:18px"></div>';
}

const pendingMoneyOut = () => [
  ...D().expenses.filter(v => v.state === 'Pending').map(v => ({ ...v, _kind:'expenses' })),
  ...D().refunds.filter(r => r.state === 'Pending').map(r => ({ ...r, _kind:'refunds' })),
].sort((a,b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));

function approveDoc(kind, id, ok, note){
  const rec = D()[kind].find(x => x.id === id);
  if(!rec) return;
  if(rec.state !== 'Pending'){ UI.toast('That document has already been decided.', 'bad'); return; }
  if(!canApprove()){ UI.toast('Only an admin can approve money going out.', 'bad'); return; }
  /* Two pairs of eyes where there are two pairs to be had. A one-admin office
     would otherwise be unable to approve anything it raised, so the rule only
     bites when somebody else could actually do it — and self-approval is
     stamped as such either way, so the audit trail says what happened. */
  const selfApproving = rec.raisedBy && SESSION && rec.raisedBy === SESSION.name;

  if(!ok){
    rec.state = 'Rejected';
    /* Give the bookings back. They are marked as covered when the voucher is
       raised so nobody can raise a second one for the same seats; a rejected
       voucher never pays anything, so the debt has to reappear on the payables
       list rather than vanish with the document. */
    if(kind === 'expenses' && rec.kind === 'remittance'){
      (rec.bookings || []).forEach(id => {
        const e = ENR(id);
        if(!e) return;
        const l = (rec.lines || []).find(x => x.id === id);
        const back = l ? l.amount : (e.centerPayable != null ? e.centerPayable : e.fee);
        e.centerPaid = ACC.r2(Math.max(0, (e.centerPaid || 0) - back));
        if(e.remitNo === rec.no){ delete e.remitNo; delete e.remitDate; }
      });
    }
    rec.decidedBy = SESSION.name; rec.decidedOn = DB.today(); rec.decisionNote = note || '';
    DB.activity('Rejected ' + rec.no, note || '');
    UI.toast(`${rec.no} rejected — nothing was posted.`);
    refresh();
    return;
  }

  /* Posting happens here, not when the document was written. The entry carries
     the approval date, because that is the day the money moved. */
  rec.date = DB.today();
  const handler = MONEY_OUT.find(m => m.key === kind);
  if(kind === 'expenses' && rec.kind === 'remittance'){
    ACC.postCenterRemittance({ date:rec.date, memo:`Remittance — ${rec.payee} · ${rec.no}`,
                               refNo:rec.no, refId:rec.id, amount:rec.amount, method:rec.method });
  }else{
    handler.post(rec);
  }
  rec.state = 'Approved';
  rec.approvedBy = SESSION.name; rec.approvedOn = DB.today();
  rec.selfApproved = !!selfApproving;
  DB.activity('Approved ' + rec.no, UI.peso(rec.amount));
  UI.toast(`${rec.no} approved and posted — ${UI.peso(rec.amount)}`);
  refresh();
}

VIEWS.approvals = () => {
  /* Everything on this page is somebody else's decision unless you are the one
     making it. The nav already hides it; this is the same rule for anybody who
     typed the address. */
  if(!canApprove()) return UI.card('Approvals',
    '<div class="empty"><span class="big">⚓</span>These are the admin\'s decisions to make.</div>');

  const pend = pendingMoneyOut();
  const decided = [
    ...D().expenses.filter(v => v.state && v.state !== 'Pending').map(v => ({ ...v, _kind:'expenses' })),
    ...D().refunds.filter(r => r.state && r.state !== 'Pending').map(r => ({ ...r, _kind:'refunds' })),
  ].sort((a,b) => String(b.approvedOn || b.decidedOn || b.date).localeCompare(String(a.approvedOn || a.decidedOn || a.date)))
   .slice(0, 15);

  const kindOf = d => d._kind === 'refunds' ? 'Refund'
    : d.kind === 'remittance' ? 'Center remittance' : 'Disbursement';

  /* No tiles. Three of them counted the queue that is printed directly
     underneath, which is the one page where a summary of the list adds nothing
     the list does not already say more precisely. */
  return `
    ${changePanel(pendingChanges())}

    ${UI.card('Waiting For Approval', UI.table([
      { h:'Document', k:d => `<b class="mono">${UI.esc(d.no)}</b><br>
          <span class="muted" style="font-size:11.5px">${UI.esc(kindOf(d))}</span>` },
      { h:'Raised', k:d => `${UI.date(d.date)}<br>
          <span class="muted" style="font-size:11.5px">${UI.esc(d.raisedBy || '—')}</span>` },
      { h:'Pay to', k:d => UI.esc(d.payee || (d.traineeId ? name(T(d.traineeId)) : '—')) },
      { h:'Particulars', k:d => UI.esc(d.particulars || d.reason || '—') },
      { h:'Mode', k:d => UI.tag(d.method, d.method === 'Cash' ? 'ok' : 'sea') },
      { h:'Amount', k:d => `<b>${UI.num(d.amount)}</b>`, cls:'num' },
      { h:'', k:d => canApprove()
          ? `<button class="btn btn-accent btn-xs" data-act="approve-doc" data-id="${d._kind}:${d.id}">Approve</button>
             <button class="btn btn-ghost btn-xs" data-act="reject-doc" data-id="${d._kind}:${d.id}">Reject</button>`
          : '<span class="muted">the admin decides</span>', w:'170px' },
    ], pend, { empty:'Nothing is waiting — every voucher and refund has been decided.' }), { flush:true })}

    <div style="height:18px"></div>
    ${UI.card('Recently Decided', UI.table([
      { h:'Document', k:d => `<span class="mono">${UI.esc(d.no)}</span>` },
      { h:'Type', k:d => UI.esc(kindOf(d)) },
      { h:'Pay to', k:d => UI.esc(d.payee || (d.traineeId ? name(T(d.traineeId)) : '—')) },
      { h:'Decided', k:d => UI.date(d.approvedOn || d.decidedOn || d.date) },
      { h:'By', k:d => `${UI.esc(d.approvedBy || d.decidedBy || '—')}` +
          (d.selfApproved ? ' <span class="muted" style="font-size:11px">(raised it too)</span>' : '') },
      { h:'Result', k:d => UI.statusTag(d.state) },
      { h:'Amount', k:d => UI.num(d.amount), cls:'num' },
    ], decided, { empty:'Nothing decided yet.' }), { flush:true })}
  `;
};

/* ---------- refunds ---------- */
VIEWS.refunds = () => {
  const rows = D().refunds.slice().sort((a,b) => b.date.localeCompare(a.date));
  const held = D().trainees
    .map(t => ({ t, credit:ACC.creditBalance(t.id) }))
    .filter(x => x.credit > 0.004)
    .sort((a,b) => b.credit - a.credit);

  return `
    <div class="toolbar">
      <span class="muted">${rows.length} refund(s) on file</span>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="new-refund">+ Refund a trainee</button>
    </div>

    ${approvalPanel(pendingRefunds(), { title:'Refunds Waiting For Approval',
        sub:'Nothing goes back to the trainee until an admin signs it off' })}

    ${held.length ? UI.card('Money We Are Holding That Is Not Ours', UI.table([
      { h:'Trainee', k:x => `<b>${UI.esc(name(x.t))}</b> <span class="muted">${UI.esc(x.t.no)}</span>` },
      { h:'Mobile', k:x => UI.esc(x.t.mobile || '—') },
      { h:'Credit', k:x => `<b>${UI.num(x.credit)}</b>`, cls:'num' },
      { h:'', k:x => `<button class="btn btn-accent btn-xs" data-act="refund-trainee" data-id="${x.t.id}">Refund</button>`, w:'110px' },
    ], held), { flush:true,
        sub:'Paid to us on bookings that were cancelled' }) : ''}

    <div style="height:18px"></div>
    ${UI.card('Refunds', UI.table([
      { h:'No.', k:r => `<b class="mono">${UI.esc(r.no)}</b>`, w:'130px' },
      { h:'Date', k:r => UI.date(r.date), w:'115px' },
      { h:'Trainee', k:r => UI.esc(name(T(r.traineeId))) },
      { h:'Reason', k:r => UI.esc(r.reason || '—') },
      { h:'Mode', k:r => UI.tag(r.method, r.method === 'Cash' ? 'ok' : 'sea') },
      { h:'Status', k:r => UI.statusTag(r.state) },
      { h:'Amount', k:r => `<b>${UI.num(r.amount)}</b>`, cls:'num' },
    ], rows, { empty:'No refund has been raised.' }), { flush:true })}
  `;
};

function refundForm(traineeId){
  const roster = D().trainees.slice().sort((a,b) => a.last.localeCompare(b.last));
  UI.modal({
    title:'Refund a trainee', sub:'Raised as pending — an admin approves before any money moves',
    wide:true,
    body:`
      ${UI.f.select('traineeId','Trainee', traineeId || '', roster.map(t => {
          const f = ACC.refundable(t.id);
          return { v:t.id, l:`${name(t)} — ${t.no}${f.total > 0 ? ` · ${UI.peso(f.total)} refundable` : ''}` };
        }), { req:true, blank:'— select trainee —' })}
      <div class="note" id="creditNote"></div>
      ${UI.row(UI.f.num('amount','Amount to refund (₱)','',{ req:true, min:0.01 }),
               UI.f.select('method','Refund by', ACC.methodNames()[0], ACC.methodNames()))}
      ${UI.f.text('ref','Reference no.','',{ ph:'transaction no. where the mode has one' })}
      ${UI.f.text('reason','Reason','',{ req:true, ph:'e.g. booking cancelled by the center' })}
      <div class="note warn">Nothing is posted now. The refund appears in the daily
        report only once an admin has approved it.</div>`,
    submitLabel:'Raise refund',
    onSubmit: fd => {
      const t = T(fd.traineeId);
      if(!t){ UI.toast('Select a trainee.', 'bad'); return false; }
      const amount = ACC.r2(fd.amount);
      if(amount <= 0){ UI.toast('Enter an amount greater than zero.', 'bad'); return false; }
      const f = ACC.refundable(t.id);
      if(amount - f.total > 0.004){
        UI.toast(`Only ${UI.peso(f.total)} can be refunded to ${name(t)}.`, 'bad'); return false;
      }
      if(!String(fd.reason||'').trim()){
        UI.toast('Say what the refund is for — an admin has to approve it on that.', 'bad'); return false;
      }
      if(ACC.needsRef(fd.method) && !String(fd.ref||'').trim()){
        UI.toast(`${fd.method} needs its reference number.`, 'bad'); return false;
      }
      D().seq.refund = (D().seq.refund || 0) + 1;
      const r = {
        id:DB.uid('ref'), no:`RF-${new Date().getFullYear()}-${String(D().seq.refund).padStart(4,'0')}`,
        date:DB.today(), traineeId:t.id, amount,
        /* Which pocket it comes out of, decided when it is raised so the
           approver sees the same split that will be posted. */
        ...ACC.splitRefund(t.id, amount),
        method:fd.method, ref:String(fd.ref||'').trim(), reason:String(fd.reason||'').trim(),
        state:'Pending', raisedBy:SESSION.name,
      };
      D().refunds.push(r);
      DB.activity('Raised refund', `${r.no} · ${name(t)} · ${UI.peso(amount)}`);
      UI.toast(`${r.no} raised — waiting for approval.`);
      refresh();
    }
  });

  const form = document.getElementById('mForm');
  const showCredit = () => {
    const t = T(form.traineeId.value);
    const box = document.getElementById('creditNote');
    if(!t){ box.textContent = 'Pick the trainee to see what we are holding for them.'; return; }
    const f = ACC.refundable(t.id);
    const parts = [];
    if(f.credit)   parts.push(`<b>${UI.peso(f.credit)}</b> paid on a booking that was cancelled`);
    if(f.overpaid) parts.push(`<b>${UI.peso(f.overpaid)}</b> handed over above the bill`);
    box.innerHTML = f.total > 0
      ? `${UI.peso(f.total)} can go back to ${UI.esc(name(t))}: ${parts.join(', and ')}.
         ${f.overpaid ? 'The overpayment was booked as income, so refunding it takes that income off again — an admin approves before anything moves.' : ''}`
      : `<b>Nothing can be refunded to ${UI.esc(name(t))}.</b> They have not paid over the odds,
         and nothing they paid for has been cancelled — cancelling a booking reverses the bill
         and leaves what they paid refundable.`;
  };
  form.addEventListener('change', showCredit);
  showCredit();
}

/* ---------- Daily report ----------
   One day on one page, and the rule for what appears on it is simple: money
   that actually moved. Collections and the entries the system posts for itself
   are on it as soon as they happen; a disbursement, a remittance or a refund
   appears only once an admin has approved it, because until then no cash has
   left and the ledger holds nothing.

   What is still waiting is shown at the bottom, clearly outside the totals, so
   the day is not read as complete when three vouchers are sitting unsigned. */
/* What the drawer held, counted by hand, against what the books say it should
   have held. The system can only ever compute the second — a till that is two
   hundred pesos short is a fact about the room, not about the arithmetic, and
   the difference between the two figures is the only reason to count at all. */
const cashCountFor = on => (D().cashCounts || []).find(c => c.date === on) || null;

/* The last count taken before this day, whenever that was. The office does not
   count on a Sunday, so "yesterday" is not a rule that survives contact with a
   week. */
function lastCountedClosingBefore(on){
  const rows = (D().cashCounts || [])
    .filter(c => c.date < on && c.closing != null && c.closing !== '')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return rows.length ? { date:rows[0].date, amount:ACC.r2(Number(rows[0].closing)) } : null;
}

function cashCountRows(on, openingBalance, cashIn, cashOut){
  const c = cashCountFor(on);

  /* What the drawer should hold is measured from what was actually in it, not
     from what the books carried forward.

     The books' figure is the arithmetic of every receipt and voucher ever
     posted; the drawer is a physical thing that has had money taken out of it
     for a courier and a jeepney fare that nobody wrote a voucher for. Starting
     the day from the books meant the difference between them was reported fresh
     every morning as though it had just appeared — a drawer that was two
     hundred short on Monday was two hundred short again on Tuesday, and again
     on Wednesday, and the real Tuesday shortfall was invisible underneath it.

     Counting from the last count makes the day's difference the day's own. The
     books' figure is still shown, because the gap between the two is worth
     seeing; it is just no longer what the day is measured against. */
  const carried = lastCountedClosingBefore(on);
  const openedWith = c && c.opening != null && c.opening !== ''
    ? ACC.r2(Number(c.opening))
    : (carried ? carried.amount : null);
  const base = openedWith != null ? openedWith : ACC.r2(openingBalance);
  const expected = ACC.r2(base + cashIn - cashOut);
  const counted = c && c.closing != null && c.closing !== '' ? ACC.r2(Number(c.closing)) : null;
  return {
    count:c,
    opening: openedWith,
    openingFrom: (c && c.opening != null && c.opening !== '') ? 'counted this morning'
      : carried ? `carried from the count on ${UI.date(carried.date)}`
      : 'no earlier count \u2014 measured against the books',
    openingBooks:ACC.r2(openingBalance),
    cashIn, cashOut, expected, counted,
    over: counted == null ? null : ACC.r2(counted - expected),
  };
}

function cashCountForm(on){
  const c = cashCountFor(on);
  /* The person who counts the drawer is the person at it, so the front desk
     records it. What they cannot do is record it twice: a count that can be
     revised after the fact is not a count, it is a second opinion, and the
     whole reason to write down what was actually there is that it can be set
     against what the books say should have been. The admin can still correct
     one, because somebody has to be able to fix a typo. */
  if(c && !canApprove())
    return UI.toast('The count for ' + UI.date(on) + ' has been recorded. Ask the admin to change it.', 'bad');
  if(!c && !can('daily'))
    return UI.toast('You cannot record the cash count.', 'bad');
  /* Opens with what was left in the drawer last time it was counted, so the
     usual morning is a glance and a Save rather than a figure to look up. It
     is still a box: the drawer is what it is, and if it does not match, what
     is in it is the truth and the number to write down. */
  const carried = lastCountedClosingBefore(on);
  const draft = c || { date:on,
                       opening:carried ? carried.amount : '',
                       closing:'', note:'' };
  UI.modal({
    title:'Cash count — ' + UI.date(on),
    sub:'What was actually in the drawer',
    body:`
      ${UI.row(UI.f.num('opening','Opening (counted)', draft.opening, { min:0, step:'0.01',
                 hint:carried
                   ? `left in the drawer on ${UI.date(carried.date)} — ${UI.peso(carried.amount)}`
                   : 'in the drawer before the first receipt' }),
               UI.f.num('closing','Closing (counted)', draft.closing, { min:0, step:'0.01',
                 hint:'after the last one' }))}
      ${UI.f.area('note','Note', draft.note || '')}
      <div class="note">Leave a box empty if it has not been counted yet. The system works out
        what the drawer <i>should</i> hold; this is what it actually held, and the difference
        is what the day is short or over.</div>`,
    submitLabel:'Save the count',
    onSubmit: fd => {
      const num = v => String(v).trim() === '' ? '' : ACC.r2(Number(v));
      const rec = D().cashCounts.find(x => x.date === on);
      const next = { date:on, opening:num(fd.opening), closing:num(fd.closing),
                     note:(fd.note || '').trim(), countedBy:(SESSION && SESSION.name) || '' };
      if(rec) Object.assign(rec, next); else D().cashCounts.push(next);
      DB.activity('Recorded the cash count', UI.date(on));
      DB.save();
      UI.toast('Cash count saved.');
      refresh();
    }
  });
}

VIEWS.daily = () => {
  const d = D();
  const on = state.q.day || DB.today();
  const isToday = on === DB.today();
  const CH = ACC.methodNames();

  const tally = () => { const o = {}; CH.forEach(m => o[m] = 0); return o; };
  const put = (o, method, amt) => {
    const m = CH.includes(method) ? method : CH[CH.length - 1];
    o[m] = ACC.r2(o[m] + amt);
  };

  /* ---- in ---- */
  const receipts = d.payments.filter(p => !p.voided && p.date === on);
  const inBy = tally();
  receipts.forEach(p => (p.tenders && p.tenders.length ? p.tenders : [{ method:p.method, amount:p.amount }])
    .forEach(t => put(inBy, t.method, t.amount)));
  /* A rebate banked from a center is cash through the same window as a trainee's
     payment. Leaving it out understated the day and made the drawer disagree
     with the report. */
  const rebatesIn = d.enrollments.filter(e => e.rebateReceivedOn === on && (e.rebateReceivable || 0) > 0);
  rebatesIn.forEach(e => put(inBy, e.rebateMethod, ACC.r2(e.rebateReceivable)));
  const totalIn = ACC.r2(Object.values(inBy).reduce((s,v) => s + v, 0));

  /* ---- out, approved only ---- */
  const approvedOn = x => x.state === 'Approved' && (x.approvedOn || x.date) === on;
  const vouchers = d.expenses.filter(v => approvedOn(v) && v.kind !== 'remittance');
  /* Payroll left the account like anything else, so it is in every total on this
     page. Who was paid and what for is on the Payroll screen, which is the
     admin's — so for everyone else the individual runs collapse into one line.
     The total still reconciles with the rows above it; it just does not name
     anybody. */
  const payrollRows = vouchers.filter(v => v.account === PAYROLL_ACCOUNT);
  const otherOut = canApprove() ? vouchers : [
    ...vouchers.filter(v => v.account !== PAYROLL_ACCOUNT),
    ...(payrollRows.length ? [{ no:'—', payee:'—', account:PAYROLL_ACCOUNT, _masked:true,
        amount:ACC.r2(payrollRows.reduce((t,v) => t + v.amount, 0)) }] : []),
  ];
  const remits   = d.expenses.filter(v => approvedOn(v) && v.kind === 'remittance');
  const refunds  = d.refunds.filter(approvedOn);

  const outBy = tally();
  [...vouchers, ...remits, ...refunds].forEach(x => put(outBy, x.method, x.amount));
  const totalOut = ACC.r2(Object.values(outBy).reduce((s,v) => s + v, 0));

  const sum = list => ACC.r2(list.reduce((s,x) => s + x.amount, 0));

  /* ---- what the system posted for itself ---- */
  const sysTypes = { Invoice:'Bookings billed', Booking:'Owed to training centers' };
  const system = d.journal.filter(j => j.date === on && !j.voided && sysTypes[j.refType]);
  const systemBy = {};
  system.forEach(j => {
    const k = sysTypes[j.refType];
    systemBy[k] = { label:k, count:(systemBy[k]?.count || 0) + 1,
                    amount:ACC.r2((systemBy[k]?.amount || 0) + j.debit) };
  });

  /* ---- cash position as of that day ---- */
  const tb = ACC.trialBalance(on);
  const bal = code => { const r = tb.rows.find(x => x.code === code); return r ? r.balance : 0; };

  const pend = pendingMoneyOut();

  const channelRows = CH.map(m => ({ label:m, inAmt:inBy[m], outAmt:outBy[m],
                                     net:ACC.r2(inBy[m] - outBy[m]) }));

  return `
    <div class="toolbar" style="margin-bottom:16px">
      <label class="fld" style="margin:0">
        <span>Report for</span>
        <input type="date" data-q="day" value="${on}" max="${DB.today()}">
      </label>
      <span class="muted">${isToday ? 'Today' : UI.date(on)}</span>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" onclick="UI.print()">Print</button>
    </div>

    <div class="grid g4" style="margin-bottom:18px">
      ${UI.kpi('Received', UI.peso(totalIn),
               `${receipts.length} payment(s)${rebatesIn.length ? ` · ${rebatesIn.length} rebate(s)` : ''}`, 'ok')}
      ${UI.kpi('Paid out', UI.peso(totalOut),
               `${vouchers.length + remits.length + refunds.length} approved document(s)`, totalOut ? 'warn' : '')}
      ${UI.kpi('Net movement', UI.peso(ACC.r2(totalIn - totalOut)),
               totalIn >= totalOut ? 'more in than out' : 'more out than in', totalIn >= totalOut ? '' : 'bad')}
      ${/* The drawer, and only the drawer. What is in a bank or a wallet is not
            cash on hand, and listing those balances beside it invited the two to
            be read as one number when counting the till. The line underneath is
            the day's cash takings, which is what the count is checked against. */
        UI.kpi('Cash on hand', UI.peso(bal(ACC.methods()[0].account)),
               `${UI.peso(ACC.r2(inBy[ACC.methods()[0].name] || 0))} taken in cash today`, '')}
    </div>

    ${(() => {
      /* The drawer at the start of the day is the drawer at the end of the one
         before, which the ledger already knows. */
      const cashAcct = ACC.methods()[0].account;
      const prev = new Date(on + 'T00:00:00'); prev.setDate(prev.getDate() - 1);
      const yesterday = prev.toISOString().slice(0, 10);
      const ytb = ACC.trialBalance(yesterday);
      const openingBooks = (ytb.rows.find(r => r.code === cashAcct) || { balance:0 }).balance;
      const cashIn  = ACC.r2(inBy[ACC.methods()[0].name] || 0);
      const cashOut = ACC.r2(outBy[ACC.methods()[0].name] || 0);
      const c = cashCountRows(on, openingBooks, cashIn, cashOut);
      const money = v => v == null ? '<span class="muted">not counted</span>' : UI.num(v);

      /* The opening the day is measured against comes first, because it is the
         one the closing figure is built on. The books' number stays underneath
         it as a reference: the gap between what the drawer has actually carried
         and what every posted receipt says it should is worth seeing, but it is
         history, not this morning's problem. */
      /* Four lines, as the office asked for. The books' carried figure and the
         day's receipts came off: the first is history that was being reported
         as though it were today's problem, and the second is on the Received
         tile at the top of this same screen.

         The receipts are still in the arithmetic — the closing figure is
         opening plus what came in less what went out — they are simply not
         repeated here. */
      const rows = [
        { k:`Opening — ${c.openingFrom}`,               v:money(c.opening), strong:true },
        { k:'Cash received today',                      v:UI.num(c.cashIn), muted:true },
        { k:'Cash — Expense',                           v:'(' + UI.num(c.cashOut) + ')', muted:true },
        { k:'Closing — what the drawer should hold',    v:UI.num(c.expected), strong:true },
        { k:'Closing — counted in the drawer',          v:money(c.counted) },
      ];
      const variance = c.over == null ? '' :
        `<div class="note ${Math.abs(c.over) < 0.005 ? 'ok' : 'bad'}" style="margin:12px 0 0">
           ${Math.abs(c.over) < 0.005
             ? '<b>The drawer balances.</b> Counted and expected agree to the peso.'
             : '<b>' + UI.peso(Math.abs(c.over)) + (c.over > 0 ? ' over' : ' short') + '.</b> '
               + 'The drawer holds ' + (c.over > 0 ? 'more' : 'less') + ' than the day\'s receipts and '
               + 'payments account for. Worth finding before tomorrow.'}
         </div>`;

      return UI.card('Cash On Hand', `<table class="tbl"><tbody>
          ${rows.map(r => `<tr>
            <td${r.muted ? ' class="muted"' : (r.strong ? ' style="font-weight:600"' : '')}>${r.k}</td>
            <td class="num"${r.strong ? ' style="font-weight:600"' : ''}>${r.v}</td></tr>`).join('')}
        </tbody></table>${variance}
        ${c.count && c.count.note ? `<div class="note" style="margin-top:10px">${UI.esc(c.count.note)}</div>` : ''}
        ${c.count && c.count.countedBy ? `<p class="muted" style="margin:8px 0 0;font-size:11.5px">
           Counted by ${UI.esc(c.count.countedBy)}</p>` : ''}`,
        { flush:true,
          sub:'Counted by hand, against what the day\'s receipts and payments say it should be',
          /* The person who counts the drawer is the person standing at it.

             The button was shown to the admin alone, so the desk — the only
             one who can see the money at the end of the day — had no way to
             record what was in it, and the count ended up typed by somebody
             being told a figure over the phone. That is not a count of
             anything.

             So the desk records it. What the desk cannot do is record it
             twice: a count that can be revised after the fact is a second
             opinion, and the whole reason for writing down what was actually
             there is that it can be set against what the books say should have
             been. The admin can still change one, because somebody has to be
             able to fix a mistyped figure and the discrepancy is escalated to
             them anyway.

             Both halves are the table's own policies on the server — insert
             for any of the staff, update for an admin. This is the courtesy of
             not offering a button that would be refused. */
          actions:(() => {
            const btn = label => `<button class="btn btn-ghost btn-xs"
                data-act="cash-count" data-id="${on}">${label}</button>`;
            if(!c.count)
              return can('daily') ? btn('Record the count')
                : '<span class="muted" style="font-size:11.5px">not counted yet</span>';
            return canApprove() ? btn('Edit the count')
              : '<span class="muted" style="font-size:11.5px">counted · only the admin can change it</span>';
          })() })
        + '<div style="height:18px"></div>';
    })()}

    ${UI.card('Money By Channel', UI.table([
      { h:'Channel', k:r => `<b>${UI.esc(r.label)}</b>` },
      { h:'In', k:r => UI.num(r.inAmt), cls:'num' },
      { h:'Out', k:r => UI.num(r.outAmt), cls:'num' },
      { h:'Net', k:r => UI.num(r.net), cls:'num' },
    ], channelRows, { foot:['TOTAL', UI.num(totalIn), UI.num(totalOut), UI.num(ACC.r2(totalIn - totalOut))] }),
      { flush:true })}

    <div style="height:18px"></div>
    <div class="grid g2">
      ${UI.card('Collections', UI.table([
        { h:'Ref no.', k:p => `<span class="mono">${UI.esc(receiptNo(p))}</span>` },
        { h:'From', k:p => UI.esc(name(T(p.traineeId))) },
        { h:'Mode', k:p => UI.esc(p.method) },
        { h:'Amount', k:p => UI.num(p.amount), cls:'num' },
      ], receipts, { empty:'Nothing collected on this date.',
          foot:['','','TOTAL', UI.num(sum(receipts))] }), { flush:true })}

      ${UI.card('Rebates Collected', UI.table([
        { h:'Training center', k:e => UI.esc(String(e.center || '').toUpperCase()) },
        { h:'Trainee', k:e => UI.esc(name(T(e.traineeId))) },
        { h:'Mode', k:e => UI.tag(e.rebateMethod || '—', e.rebateMethod === 'Cash' ? 'ok' : 'sea') },
        { h:'Amount', k:e => UI.num(e.rebateReceivable), cls:'num' },
      ], rebatesIn, { empty:'No rebate came in on this date.',
        foot:rebatesIn.length ? ['TOTAL','','', UI.num(ACC.r2(rebatesIn.reduce((s,e) => s + e.rebateReceivable, 0)))] : null }),
        { flush:true, sub:'paid back by the centers' })}

      ${UI.card('Refunds', UI.table([
        { h:'No.', k:r => `<span class="mono">${UI.esc(r.no)}</span>` },
        { h:'To', k:r => UI.esc(name(T(r.traineeId))) },
        { h:'Reason', k:r => UI.esc(r.reason || '—') },
        { h:'Amount', k:r => UI.num(r.amount), cls:'num' },
      ], refunds, { empty:'No refund approved on this date.',
          foot:['','','TOTAL', UI.num(sum(refunds))] }),
        { flush:true, sub:'approved and paid' })}
    </div>

    <div style="height:18px"></div>
    <div class="grid g2">
      ${UI.card('Paid To Training Centers', UI.table([
        { h:'Voucher', k:v => `<span class="mono">${UI.esc(v.no)}</span>` },
        { h:'Center', k:v => UI.esc(String(v.payee).toUpperCase()) },
        { h:'Bookings', k:v => UI.int((v.bookings||[]).length), cls:'num' },
        { h:'Amount', k:v => UI.num(v.amount), cls:'num' },
      ], remits, { empty:'No center was paid on this date.',
          foot:['','','TOTAL', UI.num(sum(remits))] }), { flush:true })}

      ${UI.card('Other Disbursements', UI.table([
        { h:'Voucher', k:v => `<span class="mono">${UI.esc(v.no)}</span>` },
        { h:'Payee', k:v => v._masked ? '<span class="muted">not shown</span>' : UI.esc(v.payee || '—') },
        { h:'Category', k:v => UI.esc(ACC.acct(v.account).name) },
        { h:'Amount', k:v => UI.num(v.amount), cls:'num' },
      ], otherOut, { empty:'No other disbursement on this date.',
          foot:['','','TOTAL', UI.num(sum(vouchers))] }), { flush:true,
          sub:otherOut.some(v => v._masked) ? 'Payroll is counted but not itemised' : '' })}
    </div>

    <div style="height:18px"></div>
    ${UI.card('Posted By The System', UI.table([
      { h:'What', k:r => `<b>${UI.esc(r.label)}</b>` },
      { h:'Entries', k:r => UI.int(r.count), cls:'num' },
      { h:'Amount', k:r => UI.num(r.amount), cls:'num' },
    ], Object.values(systemBy), { empty:'The system posted nothing on this date.' }),
      { flush:true, sub:'Raised automatically when a booking was encoded — no approval needed, no cash moved' })}

    ${pend.length ? `
      <div style="height:18px"></div>
      ${UI.card('Waiting For Approval — Not In The Totals Above', UI.table([
        { h:'Document', k:p => `<span class="mono">${UI.esc(receiptNo(p))}</span>` },
        { h:'Raised', k:p => `${UI.date(p.date)} · ${UI.esc(p.raisedBy || '—')}` },
        { h:'Pay to', k:p => UI.esc(p.payee || (p.traineeId ? name(T(p.traineeId)) : '—')) },
        { h:'Amount', k:p => UI.num(p.amount), cls:'num' },
      ], pend), { flush:true,
          actions:can('approvals') ? '<a class="btn btn-accent btn-xs" href="#/approvals">Review</a>' : '' })}` : ''}
  `;
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
    return nav + UI.card('Chart Of Accounts — Balances As Of ' + UI.date(DB.today()), UI.table([
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
          <td>${UI.esc(ACC.acct(l.account).name)}</td>
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
        ${UI.kpi('Total Collections', UI.peso(col.total), `${col.rows.length} payment(s)`, 'ok')}
        ${UI.kpi('Cash', UI.peso(col.byMethod['Cash']||0), 'Received at the window', '')}
        ${UI.kpi('Non-cash', UI.peso(ACC.r2(col.total-(col.byMethod['Cash']||0))), 'Bank, GCash, cheque', 'sea')}
      </div>` +
      UI.table([
        { h:'Ref no.', k:p => `<b class="mono">${UI.esc(receiptNo(p))}</b>`, w:'130px' },
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
    /* Counted off the bookings rather than off the invoice, because one
       invoice can now carry three courses and attributing all of its revenue to
       whichever one happened to be first would quietly hand the takings to the
       wrong course — on the report that decides which courses are worth
       running. Each booking brings its own fee and its own share of what has
       been collected against the bill it sits on. */
    const inWin = new Set(D().invoices
      .filter(i => !i.voided && i.date >= from && i.date <= to).map(i => i.id));
    D().enrollments.forEach(e => {
      if(!e.invoiceId || !inWin.has(e.invoiceId)) return;
      const i = INV(e.invoiceId);
      const c = CRS(e.courseId);
      const key = c ? c.code : 'Other';
      const m = map[key] || (map[key] = { code:key, title:c ? c.title : 'Unclassified',
                                          count:0, gross:0, net:0, collected:0 });
      const fee = ACC.r2((e.fee || 0) - (e.discount || 0));
      const share = i && i.total > 0 ? fee / i.total : 0;
      m.count++;
      m.gross = ACC.r2(m.gross + fee);
      m.collected = ACC.r2(m.collected + (i ? (i.paid || 0) * share : 0));
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
      ${UI.card('By Company', UI.barChart(Object.entries(byAgency).map(([l,v]) => ({ label:l, value:v })).sort((a,b) => b.value - a.value)))}
      ${UI.card('By Month', UI.barChart(Object.entries(byMonth).sort().map(([l,v]) => ({ label:l, value:v }))))}
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
      ${UI.card('Company Profile', `
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
        ${UI.card('People', UI.table([
          { h:'Name', k:u => `<b>${UI.esc(u.name)}</b><br><span class="muted" style="font-size:11.5px">${UI.esc(u.email || 'no email on file')}</span>` },
          { h:'Role', k:u => UI.tag(DB.roleName(u.role), 'info') },
          { h:'Modules', k:u => `<span class="muted">${DB.PERMS[u.role].length} of ${Object.keys(TITLES).length}</span>` },
          { h:'Account', k:u => u.signedUp
              ? (u.active === false ? UI.tag('no access','bad') : UI.tag('signed up','ok'))
              : UI.tag('not yet signed up','warn') },
          { h:'', k:u => `<button class="btn btn-ghost btn-xs" data-act="edit-user" data-id="${UI.esc(u.email)}">Edit</button>`, w:'70px' },
        ], rosterRows(), { empty:'Nobody on the roster yet.' }), { flush:true,
            actions:'<button class="btn btn-primary btn-xs" data-act="new-user">+ Add a person</button>',
            sub:'Passwords belong to Supabase — this is who may open the system, and as what' })}

        ${UI.card('Modes Of Payment', UI.table([
          { h:'Mode', k:m => `<b>${UI.esc(m.name)}</b>` },
          { h:'Posts to', k:m => { const a = ACC.acct(m.account);
              return `<span class="mono">${UI.esc(m.account)}</span> ${UI.esc(a.name || '')}`; } },
          { h:'Reference', k:m => m.ref ? UI.tag('required','warn') : '<span class="muted">not asked</span>' },
        ], ACC.methods(), { empty:'No modes configured.' }), { flush:true,
            actions:'<button class="btn btn-ghost btn-xs" data-act="edit-methods">Edit modes</button>',
            sub:'Offered at the collection window' })}

        ${UI.card('Dropdown Lists', UI.table([
          { h:'List', k:l => `<b>${UI.esc(l.label)}</b>` },
          { h:'Where it is used', k:l => `<span class="muted">${UI.esc(l.where)}</span>` },
          { h:'Options', k:l => UI.int(DB.list(l.key).length), cls:'num' },
          { h:'', k:l => `<button class="btn btn-ghost btn-xs" data-act="edit-list"
                data-id="${l.key}">Edit</button>`, w:'70px' },
        ], DB.LIST_DEFS), { flush:true,
            sub:'What each dropdown offers — type your own options' })}

        ${UI.card('Expense Categories', UI.table([
          { h:'Category', k:'name' },
        ], d.accounts.filter(a => a.type === 'Expense').sort((a,b) => a.code.localeCompare(b.code)),
          { empty:'No expense category yet.' }), { flush:true,
            actions:'<button class="btn btn-ghost btn-xs" data-act="edit-categories">Edit categories</button>',
            sub:'What a disbursement can be charged to' })}

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
          ${(() => {
            const broken = DB.salvaged(), kept = DB.snapshots();
            const when = s => s.when ? UI.date(s.when.toISOString().slice(0,10)) : 'an earlier session';
            let out = '';
            /* A store that would not parse is a fault worth interrupting for. */
            if(broken.length) out += `<div class="note bad" style="margin:14px 0 10px">
              <b>${broken.length} unreadable store${broken.length > 1 ? 's' : ''}.</b>
              Records this browser could not read back were kept rather than written over.
              Send the file to whoever maintains the system.
              ${broken.map(s => `<div style="margin-top:8px"><button class="btn btn-ghost btn-xs"
                 data-act="salvage" data-id="${UI.esc(s.key)}">Download ${UI.esc(s.kb)} KB from
                 ${when(s)}</button></div>`).join('')}</div>`;
            /* Everything else is routine, so it says so quietly and offers the
               most recent one rather than a wall of identical buttons. */
            if(kept.length) out += `<div class="note" style="margin:14px 0 10px">
              <b>Safety copy.</b> This browser keeps a copy of its records from just before it
              last connected to the server — ${kept.length === 1 ? 'one' : 'the last ' + Math.min(kept.length, 3)},
              oldest first cleared automatically. Nothing is wrong; it is there in case something is.
              <div style="margin-top:8px"><button class="btn btn-ghost btn-xs"
                 data-act="salvage" data-id="${UI.esc(kept[0].key)}">Download the latest
                 (${UI.esc(kept[0].kb)} KB, ${when(kept[0])})</button></div></div>`;
            return out;
          })()}
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
      ${UI.row(UI.f.select('suffix','Suffix', t.suffix, ['', ...DB.listWith('suffix', t.suffix || [])]),
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
      ${UI.row(UI.f.text('rank','Rank / position', t.rank, { ph:'e.g. Able Seaman',
                          attr:'list="rankList"' }),
               UI.f.text('agency','Company', t.agency, { hint:'manning agency or employer',
                          attr:'class="caps"' }))}
      ${H('In case of emergency')}
      ${UI.row(UI.f.text('emergencyName','Contact person', t.emergencyName),
               UI.f.text('emergencyRelation','Relationship', t.emergencyRelation,
                          { ph:'e.g. Spouse', attr:'list="relationList"' }),
               UI.f.text('emergencyMobile','Contact number', t.emergencyMobile))}
      ${UI.f.area('remarks','Remarks', t.remarks)}
      <datalist id="rankList">${DB.list('ranks').map(r => `<option value="${UI.esc(r)}">`).join('')}</datalist>
      <datalist id="relationList">${DB.list('relations').map(r => `<option value="${UI.esc(r)}">`).join('')}</datalist>`,
    submitLabel: isNew ? 'Register trainee' : 'Save changes',
    onSubmit: fd => {
      if(isNew){
        /* A seafarer already on file, being registered a second time.
           This is where the office's duplicates came from. The public form has
           always merged a returning seafarer onto their existing record — the
           server does it, by SRN — but this form pushed a new one whatever was
           typed into it, so a walk-in who had been here before came away with a
           second trainee number. Two files means his courses on one and his
           balance on the other, and neither screen shows both.

           The check is on the SRN alone. matchTrainee also matches on name and
           birthdate, which is right for the portal's best guess and too eager
           here: two seafarers can share a name, and refusing to register a real
           second person is worse than the duplicate this is preventing. */
        const srn = String(fd.srn || '').trim();
        const hit = srn && D().trainees.find(x =>
          String(x.srn || '').trim().toUpperCase() === srn.toUpperCase());
        if(hit){
          /* A tick late. UI.confirm closes its own dialog after the handler
             returns, and it would take the profile down with it. */
          UI.confirm(`That SRN is already on file.`, () => setTimeout(() => traineeProfile(hit), 0), {
            title:'Already registered',
            yes:'Open that record',
            detail:`${srn} belongs to ${name(hit)} (${hit.no}`
              + (hit.registered ? `, registered ${UI.date(hit.registered)}` : '')
              + `). Book the course onto that record rather than making a second one.`,
          });
          return false;
        }

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

/* One boxed group of facts: a heading that sits on the border, then a row per
   fact. Rows carry their own icon so the card is scannable down the left edge
   without reading a word of it. */
function factCard(title, headIcon, rows){
  return `<section class="fact-card">
    <h4 class="fact-head"><span class="bub">${headIcon}</span>${UI.esc(title)}</h4>
    <div class="fact-rows" style="--rows:${Math.ceil(rows.length / 2)}">
      ${rows.map(([ico, k, v]) => `<div class="fact-row">
        ${ico}<span class="fact-k">${UI.esc(k)}</span><span class="fact-v">${v}</span>
      </div>`).join('')}
    </div>
  </section>`;
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
               <button type="button" class="btn btn-ghost" id="chargeHere">Book a charge</button>
               <button type="button" class="btn btn-accent" id="enrollHere">Book a course</button>`,
    body: `
      <div class="facts">
        ${factCard('PERSONAL INFORMATION', ICO.user, [
          [ICO.card,  'Trainee no.', `<span class="mono">${UI.esc(t.no||'—')}</span>`],
          [ICO.doc,   'SRN',         `<span class="mono"><b>${UI.esc(t.srn||'—')}</b></span>`],
          [ICO.cake,  'Birthday',    UI.date(t.birth)],
          [ICO.pin,   'Birthplace',  UI.esc(t.birthPlace||'—')],
          [ICO.rank,  'Rank',        UI.esc(t.rank||'—')],
          [ICO.build, 'Company',     UI.esc(t.agency||'—')],
          [ICO.pen,   'Signed up on',UI.date(t.registered)],
        ])}
        ${factCard('CONTACT INFORMATION', ICO.phone, [
            [ICO.phone, 'Mobile number', t.mobile
              ? `<a href="tel:${UI.esc(String(t.mobile).replace(/[^+0-9]/g,''))}">${UI.esc(t.mobile)}</a>`
              : '<span class="muted">—</span>'],
            [ICO.mail,  'Email', t.email
              ? `<a href="mailto:${UI.esc(t.email)}">${UI.esc(t.email)}</a>`
              : '<span class="muted">—</span>'],
            [ICO.fb,    'Facebook',     shortLink(t.facebook, 'Facebook profile')],
            [ICO.home,  'Home address', UI.esc(t.address||'—')],
          [ICO.chat,  'Messenger',    shortLink(t.messenger, 'Open in Messenger')],
        ])}
        ${factCard('EMERGENCY CONTACT', ICO.alert, [
            [ICO.user,  'Who to call in an emergency',
              UI.esc(t.emergencyName||'—')
              + (t.emergencyRelation ? ` <span class="muted">(${UI.esc(t.emergencyRelation)})</span>` : '')],
          [ICO.phone, 'Phone number', t.emergencyMobile
            ? `<a class="mono" href="tel:${UI.esc(String(t.emergencyMobile).replace(/[^+0-9]/g,''))}">${UI.esc(t.emergencyMobile)}</a>`
            : '<span class="muted">—</span>'],
        ])}
      </div>
      ${copyRow('COPY DETAILS')}
      <div class="hr"></div>
      <div class="kpi-row" style="margin-bottom:16px">
        ${UI.kpi('Courses booked', UI.int(enr.length),
                 enr.length ? 'with us so far' : 'none yet', '')}
        ${UI.kpi('Total charged', UI.peso(invs.filter(i=>!i.voided).reduce((s,i)=>s+i.total,0)),
                 `${pays.length} payment(s) received`, 'sea')}
        ${UI.kpi('Still to pay', UI.peso(bal),
                 bal > 0 ? 'not yet settled' : 'fully paid', bal > 0 ? 'bad' : 'ok')}
      </div>
      <h4 style="margin:0 0 8px;font-size:13px">Courses Booked</h4>
      ${UI.table([
        { h:'Course', k:e => UI.esc(CRS(e.courseId)?.title || '—') },
        { h:'Training center', k:e => UI.esc(e.center || '—') },
        { h:'When', k:e => e.start ? UI.dateRange(e.start, e.end) : '—' },
        { h:'Booking', k:e => UI.statusTag(e.status) },
        /* What this one training still owes — its own share of the day's
           bill, not the bill's whole balance repeated down the column.

           A booking with no bill behind it used to stop at "not billed", which
           is true and useless: the fee is agreed and the column read as though
           the seat cost nothing. So it carries the price either way, greyed to
           say it is not owed yet.

           There is no button to raise it here. Billing follows the booking:
           enrolling raises the bill, and confirming a seat off Pending raises
           it then. A second way in, pressed from a list, is a bill raised on a
           day nobody chose and money landing in the wrong day's report. */
        { h:'Paid?', k:e => { const due = bookingBalance(e);
            if(due != null) return due > 0.004 ? `<span class="neg">${UI.peso(due)} left</span>` : 'Paid';
            /* Pending as well as Open Schedule. Pending bills nothing — the
               centre has not agreed the seat — but the price is settled and
               the office is asked it across the counter. */
            if(e.status !== 'Void' && ACC.r2(e.fee || 0) > 0.004)
              return `<span class="muted">${UI.peso(wouldBill(e))}</span>`;
            return '<span class="muted">not billed</span>'; } },
        /* One request at a time per booking. Two people asking for different
           dates on the same seat is a queue where whichever is signed second
           silently wins, so the second is refused while the first is open. */
        { h:'', k:e => {
            if(e.status === 'Void') return '<span class="muted" style="font-size:11.5px">voided</span>';
            const held = pendingChangeFor(e.id);
            return held
              ? `<span class="muted" style="font-size:11.5px">${UI.esc(held.no)} awaiting the admin</span>`
              : `<button class="btn btn-ghost btn-xs" data-act="change-booking" data-id="${e.id}">Edit</button>
                 <button class="btn btn-ghost btn-xs" data-act="void-booking" data-id="${e.id}">Void</button>`;
          }, w:'190px' },
      ], enr, { empty:'No courses booked yet.' })}
      <div class="hr"></div>
      <h4 style="margin:0 0 8px;font-size:13px">Bills And Payments</h4>
      ${UI.table([
        { h:'Bill no.', k:i => `<span class="mono">${UI.esc(i.no)}</span>` },
        { h:'Date', k:i => UI.date(i.date) },
        { h:'Charged', k:i => UI.num(i.total), cls:'num' },
        { h:'Paid', k:i => UI.num(i.paid||0), cls:'num' },
        { h:'Left to pay', k:i => i.voided ? '—' : UI.num(ACC.balanceOf(i)), cls:'num' },
        { h:'Status', k:i => UI.statusTag(invStatus(i)) },
      ], invs, { empty:'Nothing billed yet.' })}`
  });
  wireCopy(() => endorsementText(t));
  document.getElementById('editTrainee').onclick = () => traineeForm(t);
  document.getElementById('enrollHere').onclick = () => enrollmentForm(null, t.id);
  document.getElementById('chargeHere').onclick = () => enrollmentForm(null, t.id, { chargeOnly:true });
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
        ${DB.listWith('delivery', c.modes || []).map((m,i) => `<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;background:var(--surface-2);border:1px solid var(--border);padding:6px 10px;border-radius:7px;cursor:pointer">
            <input type="checkbox" name="mode${i}" style="width:auto;margin:0"
                   ${(c.modes||[]).includes(m) ? 'checked' : ''}> ${UI.esc(m.toUpperCase())}</label>`).join('')}
      </div>

      <div class="hr"></div>
      <h4 style="margin:0 0 8px;font-size:13px">Where It Runs, And What It Costs</h4>
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
/* One list of three hundred lines, every one of them reading COURSE — CENTER,
   was one list to scroll and the wrong half to scroll it by: the desk knows
   which center it is sending somebody to before it knows which course. So the
   center is asked first and the courses narrow to it.

   A course with no center on file still has to be reachable. Filtering on a
   field some rows leave blank is how a row quietly stops existing, so blanks
   get a bucket of their own and sort to the bottom rather than disappearing.

   Shared, because the booking form and the change-request form have to offer
   the same catalogue. Two copies of this would drift, and the day they drifted
   the desk would be able to book a course it could not afterwards correct. */
const NO_CENTER = '— no training center on file —';
const centerOf = c => String(c.center || '').trim() || NO_CENTER;

function coursePickers(){
  const active = D().courses;
  /* Which course-at-center pairs appear more than once, so only those labels
     have to carry the delivery. */
  const seenPair = {}, sameTwice = new Set();
  active.forEach(c => { const k = c.title + '@' + c.center;
    if(seenPair[k]) sameTwice.add(k); else seenPair[k] = 1; });

  /* Inside one center the center's name is redundant, so the label is the
     course — except where that center runs the same course two ways at two
     prices, which without the delivery reads as the same line twice. */
  const labelOf = c => c.title
    + (sameTwice.has(c.title + '@' + c.center) ? ` · ${c.modes.join(' + ')}` : '');

  return {
    labelOf,
    CENTERS:[...new Set(active.map(centerOf))].sort((a, b) =>
      a === NO_CENTER ? 1 : b === NO_CENTER ? -1 : a.localeCompare(b)),
    coursesAt:ctr => active.filter(c => centerOf(c) === ctr)
      .sort((a, b) => labelOf(a).localeCompare(labelOf(b))),
  };
}

/* ---------- correcting a booking ----------
   The desk gets these wrong in the ordinary way — the trainee moves to another
   center, the center moves the date, a seat asked for is not yet confirmed. It
   could not be corrected at all before, so it was corrected by booking a second
   seat and leaving the first, which bills twice and remits twice.

   It is not simply editable either. The booking is what the center is endorsed
   against and what the trainee was billed for, so a change to it goes through
   the same gate the money does: registration raises it, an admin signs it. */
const BOOKING_STATES = ['On Process', 'Enrolled', 'Open Schedule'];

const CHANGE_FIELDS = [
  { k:'center',   h:'Training center', show:v => v || '—' },
  { k:'courseId', h:'Course',          show:v => (CRS(v) || {}).title || '—' },
  { k:'start',    h:'Starts',          show:v => v ? UI.date(v) : '—' },
  { k:'end',      h:'Ends',            show:v => v ? UI.date(v) : '—' },
  { k:'status',   h:'Booking',         show:v => v || '—' },
];

const same = (a, b) => String(a == null ? '' : a) === String(b == null ? '' : b);
const changeLines = ch => CHANGE_FIELDS
  .filter(f => !same(ch.was[f.k], ch.to[f.k]))
  .map(f => `${f.h}: ${f.show(ch.was[f.k])} → <b>${f.show(ch.to[f.k])}</b>`);

const pendingChanges = () => D().changes.filter(c => c.state === 'Pending')
  .sort((a, b) => a.date.localeCompare(b.date));
const pendingChangeFor = id =>
  D().changes.find(c => c.state === 'Pending' && c.enrollmentId === id);

/* What was billed against what the new course costs. The booking is corrected
   here; the bill is not, because reissuing an invoice somebody has already paid
   against is not a thing to do behind an admin's back. So it is said out loud
   instead, and the desk decides. */
function feeGap(ch){
  if(same(ch.was.courseId, ch.to.courseId)) return null;
  const now = CRS(ch.to.courseId);
  if(!now) return null;
  const e = ENR(ch.enrollmentId);
  const was = e ? ACC.r2(e.fee || 0) : 0;
  const next = ACC.r2(now.amount || 0);
  return same(was, next) ? null : { was, next };
}

/* ---------- a booking encoded twice ----------
   It happens the ordinary way: the desk enrolls, nothing on the screen visibly
   moves, and it enrolls again. The second booking bills the trainee a second
   time and puts the office down a second remittance for a seat nobody sat in,
   and until now the only way out was to leave both standing.

   Nothing is deleted. The booking stays on file marked Void and the entries it
   made are reversed beside them, because a record that vanishes takes the
   reason it was wrong with it — and the second copy is exactly the thing
   somebody will ask about a month later. */
function canVoidBooking(e){
  if(!e) return 'That booking is no longer on file.';
  if(e.status === 'Void') return 'That booking is already void.';
  /* Money has already gone to the center for this seat. Reversing our side of
     it here would say the debt never existed while the cash plainly left. */
  if(e.remitNo || (e.centerPaid || 0) > 0)
    return 'The center has already been remitted for this seat — settle it with them first.';
  /* What has been paid against this training, not against the bill it shares.

     It read the whole invoice, so one paid training on a shared bill locked
     every other training on it — including a double-encoded one nobody had
     paid a peso towards, which is precisely the one that needs removing. */
  const inv = invOf(e.id);
  if(inv && !inv.voided && (ACC.recomputeInvoice(inv), bookingPaid(e)) > 0.004)
    return 'This booking has payments against it. Void the receipts first, then the booking.';
  return '';
}

function voidEnrollment(e, reason){
  const why = canVoidBooking(e);
  if(why){ UI.toast(why, 'bad'); return false; }
  const inv = invOf(e.id);
  if(inv && !inv.voided){
    /* A day's bookings share one bill, so voiding the document because one
       training came off it would take the others with it — and their receipts
       with them. A booking that shares its bill is taken off it instead; only
       a bill that carries nothing else is voided whole.

       Bills raised before the lines carried their booking cannot be split, so
       they are still voided entire; there is nothing else to do with them. */
    if(!ACC.removeFromInvoice(inv, e.id, reason || 'Booking voided')){
      inv.voided = true; inv.status = 'Void';
      ACC.reverse(inv.id, reason || 'Booking voided');
    }
  }
  /* The debt to the centre was posted the moment the seat was booked, not when
     the trainee paid, so it has to come off too or the payables list keeps
     asking to remit for a booking that no longer exists. */
  ACC.reverse(e.id, reason || 'Booking voided');
  e.status = 'Void';
  return true;
}

/* Registration raises it, the admin does it. Same document either way — what
   differs is only whether it needs a second signature, and for the admin there
   is nobody above them to ask. */
function voidBooking(e){
  if(!e) return;
  const why = canVoidBooking(e);
  if(why){ UI.toast(why, 'bad'); return; }
  if(pendingChangeFor(e.id)){
    UI.toast('A change to this booking is already waiting for the admin.', 'bad'); return;
  }
  const direct = canApprove();

  UI.confirm(direct ? `Void ${e.no}?` : `Ask the admin to void ${e.no}?`, fd => {
    const reason = String(fd.reason || '').trim();
    if(!reason){ UI.toast('Say why it is being voided — a void with no reason is a gap in the file.', 'bad'); return; }

    if(direct){
      if(!voidEnrollment(e, reason)) return;
      DB.save();
      DB.activity('Voided a booking', e.no + ' — ' + reason);
      UI.toast(`${e.no} voided. The bill against it was reversed.`);
    }else{
      const was = {}; CHANGE_FIELDS.forEach(f => { was[f.k] = e[f.k]; });
      D().changes.push({
        id:DB.uid('chg'), no:DB.nextNo('change','CHG'), kind:'void',
        enrollmentId:e.id, traineeId:e.traineeId,
        date:DB.today(), raisedBy:SESSION.name,
        was, to:{ ...was, status:'Void' }, reason, state:'Pending',
      });
      DB.save();
      DB.activity('Asked to void a booking', e.no);
      UI.toast(`Sent for approval — ${e.no} and its bill stay as they are until an admin signs it.`);
    }
    refresh();
  }, { danger:true, reason:true,
       yes:direct ? 'Void the booking' : 'Send for approval',
       detail:direct
         ? 'Nothing is deleted. The booking stays on file marked void, and the bill raised against it is reversed rather than erased.'
         : 'Nothing changes yet. The booking and its bill stay exactly as they are until the admin signs it off.' });
}

/* ---------- cancelling a rebate ----------
   Two things wear the word, and which one it is depends on where the money has
   got to.

   A rebate already received is cancelled by reversing the receipt: the cash
   goes back out of the account it came into and the centre owes it again. A
   rebate not yet received is written off — the centre is not going to pay it,
   the income booked when the seat was sold was wrong, and the receivable comes
   off the books rather than sitting on the chase list forever.

   Both take money off the books, so both go through the admin. Registration
   raises it; the admin signs it; and the admin, having nobody to ask, does it
   on the spot. */
function canCancelRebate(e){
  if(!e) return 'That booking is no longer on file.';
  if(!(e.rebate > 0)) return 'There is no rebate on that booking.';
  if(e.deduct && e.remitNo)
    return 'That rebate was kept from a remittance that has already gone out \u2014 void the voucher instead.';
  return '';
}

function cancelRebate(e, reason){
  const why = canCancelRebate(e);
  if(why){ UI.toast(why, 'bad'); return false; }
  const amount = ACC.r2(e.rebate || 0);
  const memo = `Rebate cancelled \u2014 ${e.no}${reason ? ' (' + reason + ')' : ''}`;

  /* The reversing entry is written out here rather than handed to ACC.reverse.
     reverse() takes everything posted against a reference, and a booking's
     reference carries the debt to the centre as well as the rebate \u2014 so
     asking it to undo the rebate would undo what we owe the centre with it. */
  if(e.rebateReceivedOn){
    /* The money came in. It goes back out of the account it came into, and the
       centre owes it again. */
    ACC.post({ date:DB.today(), memo, refType:'Rebate', refNo:e.no, refId:e.id,
      lines:[{ account:'1250', debit:amount, credit:0 },
             { account:ACC.cashAccount(e.rebateMethod), debit:0, credit:amount }] });
    delete e.rebateReceivedOn; delete e.rebateMethod;
    delete e.rebateRef; delete e.rebateReceivedBy;
  }
  if((e.rebateReceivable || 0) > 0){
    /* It never came in and now it will not. The income booked when the seat was
       sold was wrong, so it comes off, and so does the receivable. */
    ACC.post({ date:DB.today(), memo, refType:'Rebate', refNo:e.no, refId:e.id,
      lines:[{ account:'4200', debit:ACC.r2(e.rebateReceivable), credit:0 },
             { account:'1250', debit:0, credit:ACC.r2(e.rebateReceivable) }] });
  }

  /* A rebate kept back from a remittance never appeared as income or as a
     receivable — it appeared as a smaller debt to the centre. So cancelling one
     is not a reversal of anything; it is the debt going back up to the whole
     fee, which is what we now have to remit. Leaving the payable where it was
     would have the office send the centre short and never find out why. */
  if(e.deduct && !e.remitNo && amount > 0){
    ACC.post({ date:DB.today(), memo, refType:'Booking', refNo:e.no, refId:e.id,
      lines:[{ account:'5050', debit:amount, credit:0 },
             { account:'2000', debit:0, credit:amount }] });
    e.centerPayable = ACC.r2((e.centerPayable != null ? e.centerPayable : e.fee) + amount);
  }

  /* Nothing new is written on the booking. There is no column on the server for
     a cancelled flag, and inventing one is how a save starts failing for
     everybody \u2014 the rebate simply stops being a rebate, which is what
     cancelling it means. The journal and the activity log carry what it was. */
  e.rebateReceivable = 0;
  e.rebate = 0;
  return true;
}

function cancelRebateAsk(enrId){
  const e = ENR(enrId);
  if(!e) return;
  const why = canCancelRebate(e);
  if(why){ UI.toast(why, 'bad'); return; }
  if(pendingChangeFor(e.id)){
    UI.toast('A change to this booking is already waiting for the admin.', 'bad'); return;
  }
  const direct = canApprove();
  const banked = !!e.rebateReceivedOn;

  UI.confirm(direct ? `Cancel the ${UI.peso(e.rebate)} rebate on ${e.no}?`
                    : `Ask the admin to cancel the ${UI.peso(e.rebate)} rebate on ${e.no}?`, fd => {
    const reason = String(fd.reason || '').trim();
    if(!reason){ UI.toast('Say why it is being cancelled — it takes money off the books.', 'bad'); return; }

    if(direct){
      if(!cancelRebate(e, reason)) return;
      DB.save();
      DB.activity('Cancelled a rebate', `${e.no} · ${UI.peso(e.rebate)} — ${reason}`);
      UI.toast(banked
        ? `Rebate cancelled — ${UI.peso(e.rebate)} has gone back out of the account it came into.`
        : `Rebate cancelled — ${UI.peso(e.rebate)} is off the list of what centres owe us.`);
    }else{
      const was = {}; CHANGE_FIELDS.forEach(f => { was[f.k] = e[f.k]; });
      D().changes.push({
        id:DB.uid('chg'), no:DB.nextNo('change','CHG'), kind:'rebate-cancel',
        enrollmentId:e.id, traineeId:e.traineeId,
        date:DB.today(), raisedBy:SESSION.name,
        was, to:{ ...was }, reason, state:'Pending',
      });
      DB.save();
      DB.activity('Asked to cancel a rebate', e.no);
      UI.toast(`Sent for approval — the rebate stays as it is until an admin signs it.`);
    }
    refresh();
  }, { danger:true, reason:true,
       yes:direct ? 'Cancel the rebate' : 'Send for approval',
       detail:direct
         ? (banked
             ? 'The receipt is reversed: the money goes back out of the account it arrived in, and the centre owes it again.'
             : e.deduct
               ? 'This rebate was being kept back from what we remit, so cancelling it means the centre is owed the full fee. What we have to remit goes up by this amount.'
               : 'The income booked when the seat was sold is reversed and the amount comes off what centres owe us.')
         : 'Nothing changes yet. The rebate stays exactly as it is until the admin signs it off.' });
}

function bookingChangeForm(e){
  if(!e) return;
  if(e.status === 'Void'){ UI.toast('That booking is void — there is nothing left to change.', 'bad'); return; }
  const held = pendingChangeFor(e.id);
  if(held){
    UI.toast('A change to this booking is already waiting for the admin.', 'bad');
    return;
  }
  const { CENTERS, labelOf, coursesAt } = coursePickers();
  const t = T(e.traineeId);

  /* The three the office asked for — plus whatever this booking already is, if
     it is something else. A dropdown that cannot express the current value is a
     dropdown that silently changes it the moment anything else is edited. */
  const states = BOOKING_STATES.includes(e.status)
    ? BOOKING_STATES : BOOKING_STATES.concat(e.status || []);

  const startCenter = centerOf({ center:e.center });

  /* The admin is not asking anybody. Same form, same record, same reason
     written down — what differs is only whether it waits, and for the admin
     there is nobody it could be waiting on. */
  const direct = canApprove();

  UI.modal({
    title:direct ? 'Change this booking' : 'Request a change to this booking',
    sub:direct
      ? `${e.no} · ${name(t)}`
      : `${e.no} · ${name(t)} — an admin has to approve it before it takes effect`,
    wide:true,
    submitLabel:direct ? 'Save the change' : 'Send for approval',
    body:`
      ${UI.row(
        UI.f.select('center','Training center', startCenter, CENTERS.map(c => ({ v:c, l:c })),
          { req:true }),
        UI.f.select('courseId','Course', e.courseId, [], { req:true }))}
      ${UI.row(UI.f.date('start','Training starts', e.start || '', {}),
               UI.f.date('end','Training ends', e.end || '', {}))}
      ${UI.f.select('status','Booking', e.status, states.map(s => ({ v:s, l:s })), { req:true })}
      ${UI.f.area('reason','Why is it changing?', '',
        { req:true, ph:'e.g. the center moved the run to the following week' })}
      <div class="note" id="chgNote" style="margin:10px 0 0"></div>`,
    onSubmit: fd => {
      /* Still required of the admin. Nobody approves it, but somebody reads it
         a month later wondering why the dates moved, and by then the reason is
         the only part nobody can reconstruct. */
      if(!fd.reason || !String(fd.reason).trim()){
        UI.toast(direct
          ? 'Say why it is changing — it goes on the record.'
          : 'Say why it is changing — the admin approves the reason, not just the dates.', 'bad');
        return false;
      }
      if(fd.end && fd.start && fd.end < fd.start){
        UI.toast('The end date cannot fall before the start date.', 'bad'); return false;
      }
      /* Confirming a schedule is exactly this form: pick the status that has
         dates and put them in. So the dates are demanded by the status rather
         than always, and a booking still waiting on the centre can be changed
         without inventing them. */
      if(!['Pending','Open Schedule'].includes(fd.status) && !fd.start){
        UI.toast('A booking that is not Pending or Open Schedule needs its training dates.', 'bad');
        return false;
      }
      const to = { center:fd.center === NO_CENTER ? '' : fd.center, courseId:fd.courseId,
                   start:fd.start, end:fd.end, status:fd.status };
      const was = {}; CHANGE_FIELDS.forEach(f => { was[f.k] = e[f.k]; });
      if(CHANGE_FIELDS.every(f => same(was[f.k], to[f.k]))){
        UI.toast('Nothing on the booking is different — there is nothing to approve.', 'bad');
        return false;
      }
      const rec = {
        id:DB.uid('chg'), no:DB.nextNo('change','CHG'), kind:'edit',
        enrollmentId:e.id, traineeId:e.traineeId,
        date:DB.today(), raisedBy:SESSION.name,
        was, to, reason:String(fd.reason).trim(), state:'Pending',
      };
      D().changes.push(rec);

      /* The admin's own change goes straight through the same door it would
         have queued at. Writing the request first and approving it in the next
         breath is deliberate: the booking is corrected by exactly one piece of
         code, so the drift check and the warning about the bill apply to the
         admin as much as to anybody, and the file shows what was changed and
         why rather than a booking that silently reads differently today. */
      if(direct){
        approveChange(rec.id, true);
        return;
      }
      DB.save();
      DB.activity('Asked to change a booking', e.no);
      UI.toast(`Sent for approval — ${e.no} stays as it is until an admin signs it.`);
      refresh();
    },
  });

  const form = document.getElementById('mForm');
  const fillCourses = () => {
    const list = coursesAt(form.center.value);
    form.courseId.innerHTML = '<option value="">— select course —</option>'
      + list.map(c => `<option value="${UI.esc(c.id)}" ${c.id === e.courseId ? 'selected' : ''}>${UI.esc(labelOf(c))}</option>`).join('');
    note();
  };
  /* Said in front of the person raising it, not discovered by the admin later:
     a different course is usually a different price, and the bill already sent
     does not move on its own. */
  const note = () => {
    const c = CRS(form.courseId.value);
    const box = document.getElementById('chgNote');
    if(!c || c.id === e.courseId){ box.textContent = ''; box.style.display = 'none'; return; }
    box.style.display = '';
    const was = ACC.r2(e.fee || 0), next = ACC.r2(c.amount || 0);
    box.innerHTML = same(was, next)
      ? `${UI.esc(c.title)} costs the same ${UI.peso(next)} — the bill does not change.`
      : `<b>The bill will not follow this by itself.</b> ${UI.esc(c.title)} is on the price list at
         ${UI.peso(next)}; this booking was billed ${UI.peso(was)}. Approving the change corrects the
         booking only — someone has to revise or reissue the bill.`;
  };
  form.center.onchange = fillCourses;
  form.courseId.onchange = note;
  fillCourses();
}

function changePanel(rows, opts){
  opts = opts || {};
  if(!rows.length) return '';
  return UI.card(opts.title || 'Booking Changes Waiting For Approval', UI.table([
    { h:'Request', k:c => `<b class="mono">${UI.esc(c.no)}</b><br>
        <span class="muted" style="font-size:11.5px">${UI.esc((ENR(c.enrollmentId)||{}).no || '—')}</span>`, w:'135px' },
    { h:'Trainee', k:c => UI.esc(name(T(c.traineeId))) },
    { h:'What changes', k:c => c.kind === 'invoice-void'
        ? `<b class="neg">Void the Payment Invoice</b><br>
           <span class="muted" style="font-size:11.5px">${UI.esc((INV(c.to && c.to.invoiceId)||{}).no || '')}
             · ${UI.peso((INV(c.to && c.to.invoiceId)||{}).total || 0)}</span>`
        : c.kind === 'rebate-cancel'
        ? `<b class="neg">Cancel the rebate</b><br>
           <span class="muted" style="font-size:11.5px">${(() => { const e = ENR(c.enrollmentId);
             return e ? `${UI.peso(e.rebate || 0)} from ${UI.esc(e.center || 'the centre')}` : ''; })()}</span>`
        : c.kind === 'void'
        ? `<b class="neg">Void the whole booking</b><br>
           <span class="muted" style="font-size:11.5px">the bill raised against it is reversed too</span>`
        : (changeLines(c).join('<br>') || '<span class="muted">nothing</span>') },
    { h:'Why', k:c => UI.esc(c.reason || '—') },
    { h:'Asked by', k:c => `${UI.esc(c.raisedBy || '—')}<br>
        <span class="muted" style="font-size:11.5px">${UI.date(c.date)}</span>` },
    { h:'', k:c => {
        const gap = feeGap(c);
        const warn = gap
          ? `<div class="muted" style="font-size:11.5px;margin-bottom:4px">billed ${UI.peso(gap.was)},
             price list says ${UI.peso(gap.next)} — the bill is not changed</div>` : '';
        return warn + (canApprove()
          ? `<button class="btn btn-accent btn-xs" data-act="approve-change" data-id="${c.id}">Approve</button>
             <button class="btn btn-ghost btn-xs" data-act="reject-change" data-id="${c.id}">Reject</button>`
          : '<span class="muted">the admin decides</span>'); }, w:'210px' },
  ], rows), { flush:true,
      sub:opts.sub || 'The booking stays exactly as it is until one of these is signed' })
    + '<div style="height:18px"></div>';
}

/* There is no countersignature. An admin's own hand is the signature here, on
   their own documents as much as on anybody else's — which is the office the
   owner actually runs, with one admin in it.

   The control that remains is the record rather than the block: a document
   approved by the person who raised it is stamped selfApproved and reads that
   way on the Recently Decided list, so the audit trail still says plainly who
   did both halves. What is gone is the refusal, which in a one-admin office
   protected nothing and stopped everything.

   Written down because it is a real loosening and not an oversight: the usual
   reason to separate raising from approving is that money leaves on a single
   person's say-so, and here it now does. */

function approveChange(id, ok, note){
  const ch = D().changes.find(x => x.id === id);
  if(!ch) return;
  if(ch.state !== 'Pending'){ UI.toast('That request has already been decided.', 'bad'); return; }
  if(!canApprove()){ UI.toast('Only an admin can approve a change to a booking.', 'bad'); return; }

  const e = ENR(ch.enrollmentId);
  if(!e){ UI.toast('That booking is no longer on file.', 'bad'); return; }

  const selfApproving = ch.raisedBy && SESSION && ch.raisedBy === SESSION.name;

  if(!ok){
    ch.state = 'Rejected';
    ch.decidedBy = SESSION.name; ch.decidedOn = DB.today(); ch.decisionNote = note || '';
    DB.save();
    DB.activity('Rejected a booking change', e.no);
    UI.toast(`Rejected — ${e.no} is unchanged.`);
    refresh();
    return;
  }

  /* Raised against a booking that has moved since. Writing the request on top
     of it now would quietly undo whatever happened in between, and the person
     who did that would never be told. */
  const drifted = CHANGE_FIELDS.filter(f => !same(e[f.k], ch.was[f.k]));
  if(drifted.length){
    UI.toast('This booking has changed since the request was raised ('
      + drifted.map(f => f.h.toLowerCase()).join(', ')
      + '). Reject it and raise it again against how it stands now.', 'bad');
    return;
  }

  const gap = feeGap(ch);
  let billed = null;
  if(ch.kind === 'invoice-void'){
    const inv = INV(ch.to && ch.to.invoiceId);
    if(!inv){ UI.toast('That bill is no longer on file.', 'bad'); return; }
    if((inv.paid || 0) > 0){
      UI.toast('That bill has been paid since the request was raised — void the receipts first.', 'bad');
      return;
    }
    if(!voidInvoice(inv, ch.reason)){ UI.toast('That bill is already void.', 'bad'); return; }
  }else if(ch.kind === 'rebate-cancel'){
    /* Checked again on approval, not only when raised: the rebate may have been
       received, or remitted, in the meantime. */
    if(!cancelRebate(e, ch.reason)) return;
  }else if(ch.kind === 'void'){
    /* The guards are checked again here, not only when it was raised: a receipt
       may have been taken against the booking in the meantime, and voiding it
       then would leave money collected against nothing. */
    if(!voidEnrollment(e, ch.reason)) return;
  }else{
    CHANGE_FIELDS.forEach(f => { e[f.k] = ch.to[f.k]; });
    /* Pending is the one state that bills nothing — a seat asked for and not
       yet agreed. This form is where the centre's answer is recorded, so it is
       also the moment the seat becomes chargeable. Left to itself the booking
       would read Enrolled with no bill against it for good.

       A failure here does not undo the change: the dates and the status are
       right either way, and the bill can still be raised from the trainee's
       own list. */
    if(billableUnbilled(e)){
      try{ billed = APPS.billBooking(e); }
      catch(err){ UI.toast('Changed, but not billed: ' + err.message, 'warn'); }
    }
  }
  ch.state = 'Approved';
  ch.approvedBy = SESSION.name; ch.approvedOn = DB.today();
  ch.selfApproved = !!selfApproving;
  DB.save();
  DB.activity('Approved a booking change',
    e.no + ' · ' + changeLines(ch).join('; ').replace(/<\/?b>/g, ''));
  UI.toast(ch.kind === 'invoice-void'
    ? `${(INV(ch.to && ch.to.invoiceId) || {}).no || 'The bill'} voided and reversed.`
    : ch.kind === 'rebate-cancel'
    ? `Rebate on ${e.no} cancelled.`
    : ch.kind === 'void'
    ? `${e.no} voided. The bill against it was reversed.`
    : gap
      ? `${e.no} updated. The bill still reads ${UI.peso(gap.was)} — revise it if it should say ${UI.peso(gap.next)}.`
      : billed
      ? `${e.no} updated and billed on ${billed.no} — ${UI.peso(wouldBill(e))} now collectable.`
      : `${e.no} updated.`, gap ? 'warn' : '');
  refresh();
}

/* A booking the office takes no training fee on.

   Some seats are arranged without the fee passing through us at all — the
   trainee settles the course with the centre, or it is covered by their
   company, and what we charge for is the medical, the stamp, the courier. The
   booking still has to exist: the centre is endorsed against it, it appears on
   the day's list, and the trainee's record has to show they were sent.

   So it is the same form with the fee taken out rather than a second kind of
   booking. The course and the dates are recorded exactly as they always are;
   the fee is nil and never shown, and the bill is the charges. */
function enrollmentForm(existing, presetTrainee, opts){
  const chargeOnly = !!(opts && opts.chargeOnly);
  const roster = D().trainees.slice().sort((a,b) => a.last.localeCompare(b.last));
  if(!roster.length){ UI.toast('Register the trainee first — the registry is empty.', 'bad'); return; }
  const active = D().courses;
  /* Which course-at-center pairs appear more than once, so only those labels
     have to carry the delivery. */
  const seenPair = {}, sameTwice = new Set();
  active.forEach(c => { const k = c.title + '@' + c.center;
    if(seenPair[k]) sameTwice.add(k); else seenPair[k] = 1; });

  const { CENTERS, labelOf, coursesAt } = coursePickers();

  const body = `
    ${UI.f.select('traineeId','Trainee', presetTrainee || '', roster
        /* Name and SRN. The SRN is what the seafarer quotes and what every
           center asks for, and it settles the case of two people sharing a
           name — booking the wrong one is not a mistake anybody catches until
           the center turns them away. A record with no SRN yet falls back to
           its trainee number so the line is never ambiguous. */
        .map(t => ({ v:t.id, l:`${name(t)} — ${t.srn || t.no}` })),
        { req:true, blank:'— search or select trainee —' })}
    <p class="p-note-inline muted" style="margin:-6px 0 12px;font-size:12px">
      Not on the list? <a href="#" data-act="new-trainee-here">Register a new trainee</a> first.</p>

    <h4 style="margin:0 0 8px;font-size:13px">Course And Training Date</h4>
    ${UI.row(
      UI.f.select('centerPick','Training center', '', CENTERS.map(c => ({ v:c, l:c })),
        { req:true, blank:'— select training center —' }),
      UI.f.select('courseId','Course', '', [],
        { req:true, blank:'— choose the training center first —' }))}
    <!-- Where the booking stands, and whether it can have dates yet. A seat
         asked for before the centre has said when it runs has no date to give,
         and inventing one puts a trainee on the day's list who is not coming. -->
    ${UI.f.select('status','Booking', 'Enrolled',
        ['Enrolled', 'On Process', 'Open Schedule', 'Pending'], { req:true })}
    ${UI.row(UI.f.date('start','Training starts', DB.today(), {}),
             UI.f.date('end','Training ends', '', {
               hint:'filled from the course length — change it if the run is longer' }))}
    <div class="note" id="endsNote" style="margin:-4px 0 14px"></div>
    ${chargeOnly
      ? `<input type="hidden" name="fee" value="0">
         <div class="note">No training fee on this booking. The course and the dates are
           recorded as usual and the centre is endorsed against them — what the trainee
           is billed for is the charges below.</div>`
      : UI.f.num('fee','Fee (₱)', '0', { req:true, min:0, ro:true,
          hint:'from the price list — the admin sets it on the course' })}

    <!-- Charges are what Book a charge exists for. On Book a course they were a
         row of tick boxes nobody ticked, sitting between the fee and the
         discount on the form the office fills in twenty times a day. A
         rescheduling fee is not part of booking a seat; it is charged when
         something goes wrong afterwards, which is its own booking. -->
    ${chargeOnly ? `
    <div class="hr"></div>
    <h4 style="margin:0 0 8px;font-size:13px">Charges</h4>
    <div class="chips" id="addonBox" style="margin-bottom:12px">
${addons().map((a,i) => `
        <div class="addon-row">
          <label style="display:flex;gap:6px;align-items:center;cursor:pointer">
            <input type="checkbox" name="addon${i}" ${'value="' + i + '"'} > ${UI.esc(a.desc)}</label>
          <input type="number" name="addonAmt${i}" class="a-amt" step="0.01" min="0"
            value="${ACC.r2(a.price).toFixed(2)}" disabled>
        </div>`).join('')}
    </div>` : ''}
    <div class="hr"></div>
    ${UI.row(UI.f.num('discount','Discount (₱)','0',{ min:0 }),
             UI.f.text('discountNote','Reason for discount','',{ ph:'e.g. agency package rate' }))}
    ${UI.f.area('remarks','Remarks','')}
    <div class="hr"></div>
    <div id="summary"></div>`;

  UI.modal({
    title:chargeOnly ? 'Book a charge' : 'Encode enrollment',
    sub:chargeOnly ? 'The course and the dates, billed for the charges only'
                   : 'Booking and billing in one step',
    wide:true, body,
    submitLabel:'Enroll trainee',
    onSubmit: fd => {
      const trainee = T(fd.traineeId);
      if(!trainee){ UI.toast('Select a trainee.', 'bad'); return false; }
      /* The price list is the default; what is billed is what was typed. */
      const chosen = addons()
        .map((a,i) => ({ ...a, price:ACC.r2(fd['addonAmt'+i] != null ? fd['addonAmt'+i] : a.price) }))
        .filter((a,i) => fd['addon'+i]);
      /* A charge booking with no charge on it bills nothing at all, which is a
         booking nobody will ever be asked to pay for and a bill of zero sitting
         in the ledger. Say so here rather than letting it through. */
      if(chargeOnly && !chosen.length){
        UI.toast('Tick at least one charge — that is what this booking bills for.', 'bad');
        return false;
      }
      try{
        const out = APPS.enroll(trainee, {
          /* The center comes from the course entry — one course at one center
             is one row on the price list. */
          courseId:fd.courseId, start:fd.start, end:endsOn,
          fee:fd.fee, mode:fd.status || 'Enrolled', charges:chosen,
          discount:fd.discount, discountNote:fd.discountNote, remarks:fd.remarks,
          by:SESSION.name,
        });
        refresh();
        /* Booking and paying are one conversation across the counter. The
           office used to enroll here, read a toast, and then go and find the
           same trainee again in Collections to take the money they were already
           holding — and a booking with several trainings on it meant doing that
           once and picking the trainings apart by hand.

           So the collection window is offered on the bill just raised, with
           every training on it already listed and priced. Declining it costs
           one click and nothing is lost: the bill stands and can be collected
           whenever. */
        if(out.invoice){
          /* A tick late, like everywhere else this modal opens another: the
             enrollment form closes itself after this handler returns, and it
             would take the offer with it. */
          setTimeout(() => UI.confirm(`Enrolled ${out.enrollment.no} — ${out.invoice.no} for ${UI.peso(out.invoice.total)}.`
            + ' Record the payment now?',
            () => setTimeout(() => paymentForm(out.invoice), 0),
            { title:'Enrolled', yes:'Record the payment',
              detail:'Every training on this bill is listed in the collection window with its '
                   + 'own amount. Close this instead if they are not paying yet — the bill stands.' }), 0);
        }else{
          UI.toast(`${out.enrollment.no} recorded as ${out.enrollment.status} — nothing billed yet.`);
        }
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
  form.end.onchange = () => { form.end.dataset.touched = '1'; fillEnd(); };

  /* Pending and Open Schedule are the two that have no date yet. The boxes are
     emptied and closed rather than left open and ignored, because a date typed
     into a booking that has none is the one that reaches the day's list. */
  const DATELESS = ['Pending', 'Open Schedule'];
  const syncDates = () => {
    const off = DATELESS.includes(form.status.value);
    [form.start, form.end].forEach(b => {
      b.disabled = off;
      b.required = !off;
      if(off) b.value = '';
    });
    if(!off && !form.start.value) form.start.value = DB.today();
    recalc();
  };
  form.status.onchange = syncDates;

  /* The course box is filled from whichever center is showing, and emptied
     when none is. It starts disabled rather than empty-and-clickable: an
     enabled box with nothing in it reads as a catalogue that failed to load. */
  const fillCourses = () => {
    const ctr = form.centerPick.value;
    const list = ctr ? coursesAt(ctr) : [];
    form.courseId.innerHTML =
      `<option value="">${ctr ? '— select course —' : '— choose the training center first —'}</option>`
      + list.map(c => `<option value="${UI.esc(c.id)}">${UI.esc(labelOf(c))}</option>`).join('');
    form.courseId.disabled = !ctr;
  };
  form.centerPick.onchange = () => { fillCourses(); form.courseId.onchange(); };
  fillCourses();

  form.courseId.onchange = () => {
    const c = CRS(form.courseId.value);
    /* Changing the center clears the course under it, and the fee has to go
       with it. Leaving the last course's price sitting in the box is how a
       booking gets billed at another center's rate. */
    if(!c || chargeOnly){ form.fee.value = chargeOnly ? '0' : '0.00'; fillEnd(); recalc(); return; }
    /* The trainee pays the course amount. The rebate is settled between us
       and the center and never reaches this figure. */
    /* Always the list price. The desk does not negotiate here — a different
       figure is a change to the course, which is the admin's screen. A discount
       on this one booking is what the discount field below is for. */
    form.fee.value = ACC.r2(c.amount || 0).toFixed(2);
    fillEnd();
    recalc();
  };

  /* Typing the start date is the common case, so fill the end date from the
     course length and let the desk overrule it. */
  /* The end date fills itself from the course length and can then be typed
     over, because a run does not always take the days the price list says. It
     is a real field rather than a derived note because the payment reminder
     keys off it — a date nobody can correct is a date that sends the wrong
     reminder. */
  let endsOn = '';
  const fillEnd = (force) => {
    const c = CRS(form.courseId.value);
    const box = document.getElementById('endsNote');
    /* Nothing to work out when the booking has no dates yet. recalc() calls
       this on every keystroke, so without the guard it wrote "Pick the course
       and the start date" back over the line saying there are none. */
    if(DATELESS.includes(form.status.value)){
      endsOn = '';
      if(box) box.innerHTML = 'No dates yet — the centre has not said when this runs. '
        + 'Set them from the booking once it is scheduled.';
      return;
    }
    if(!c || !form.start.value){ endsOn = form.end.value || ''; box.textContent = 'Pick the course and the start date.'; return; }
    const days = Math.ceil(c.days || 1);
    const x = new Date(form.start.value); x.setDate(x.getDate() + days - 1);
    const suggested = x.toISOString().slice(0,10);
    if(force || !form.end.value || !form.end.dataset.touched) form.end.value = suggested;
    if(form.end.value < form.start.value) form.end.value = form.start.value;
    endsOn = form.end.value;
    const asExpected = endsOn === suggested;
    box.innerHTML = `Runs <b>${UI.dateRange(form.start.value, endsOn)}</b>`
      + (asExpected
          ? ` — ${days} training day(s)` + (c.duration
              ? ' from the course length on the price list.'
              : '. This course has no length on the price list, so one day is assumed.')
          : ` — the price list says ${days} day(s), so this run has been extended by hand.`);
  };

  const recalc = () => {
    fillEnd();
    const items = [{ qty:1, price:form.fee.value }];
    addons().forEach((a,i) => {
      const on = form['addon'+i] && form['addon'+i].checked;
      if(form['addonAmt'+i]) form['addonAmt'+i].disabled = !on;
      if(on) items.push({ qty:1, price:form['addonAmt'+i] ? form['addonAmt'+i].value : a.price });
    });
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
  syncDates();
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
      <!-- Money is taken for the training, not billed for separately.

           This said "Bill this booking" and opened a second invoice form of its
           own — with a row of charges on it, which is what Book a charge is for.
           Worse, a bill raised that way posted no payable, so the centre was
           owed nothing for a seat we had just charged the trainee for, and its
           line carried no booking, so the money could never be split per
           training on a shared bill.

           There is one way a bill is raised now, and this is the door to it:
           the collection window raises it as it writes the receipt. -->
      ${billableUnbilled(e) || (inv && ACC.balanceOf(inv) > 0.004)
        ? `<button type="button" class="btn btn-brass" id="payIt">Record payment</button>` : ''}
      ${inv ? `<button type="button" class="btn btn-ghost" id="openInv">Open bill</button>` : ''}
      ${e.status !== 'Cancelled' ? `<button type="button" class="btn btn-danger" id="cancelEnr">Cancel booking</button>` : ''}`,
    body: `
      <dl class="def def-tight">
        <dt>Trainee</dt><dd><b>${UI.esc(name(t))}</b></dd>
        <dt>Trainee no.</dt><dd class="mono">${UI.esc(t?.no || '—')}</dd>
        <dt>Training center</dt><dd>${UI.esc(e.center || '—')}</dd>
        <dt>Scheduled date</dt><dd>${e.start ? UI.dateRange(e.start, e.end) : '—'}
          <span class="muted">· ${UI.statusTag(e.status)}</span></dd>
      </dl>
      ${e.remarks ? `<div class="note">${UI.esc(e.remarks)}</div>` : ''}
      ${copyRow('COPY DETAILS')}

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
          { h:'Ref no.', k:p => `<span class="mono">${UI.esc(receiptNo(p))}</span>` },
          { h:'Date', k:p => UI.date(p.date) },
          { h:'Mode', k:'method' },
          { h:'Reference', k:p => UI.esc(p.ref||'—') },
          { h:'Amount', k:p => UI.num(p.amount), cls:'num' },
        ], receipts)}` : '')
      : `<div class="note warn">Not billed yet — nothing is on the books for this booking.</div>`}`
  });

  const on = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };
  /* A tick late: this modal closes itself when a button in its footer opens
     another, and would take the collection window with it. */
  on('payIt', () => setTimeout(() =>
    paymentForm(inv || null, { traineeId:e.traineeId, enrollmentId:e.id }), 0));
  wireCopy(() => endorsementText(t, e));
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

/* One place a bill is taken off, so the admin's own click and the approval of
   somebody else's request do exactly the same thing. */
function voidInvoice(inv, reason){
  if(!inv || inv.voided) return false;
  inv.voided = true; inv.status = 'Void';
  ACC.reverse(inv.id, reason || 'Voided');
  return true;
}

/* Whether this bill can have a training taken off it.

   The admin only, on a live bill that still carries more than one training and
   whose lines say which training each belongs to. Bills raised before the lines
   carried their booking cannot be split at all, and a bill down to one training
   is a document to void rather than a line to remove. */
function canRemoveLines(inv){
  if(!inv || inv.voided || !canApprove()) return false;
  const marked = (inv.items || []).filter(i => i.enrId);
  return marked.length > 1 && new Set(marked.map(i => i.enrId)).size > 1;
}

/* Taking it off. */
function dropInvoiceLine(inv, enrId){
  const e = ENR(enrId);
  if(!e){ UI.toast('That booking is no longer on file.', 'bad'); return; }
  if(!canRemoveLines(inv)){
    UI.toast('This bill has only one training left — void the bill instead.', 'bad');
    return;
  }
  const c = CRS(e.courseId);
  /* Money the cashier put against this training by name. It was received and it
     is not in question; what is in question is the training. So it stays on the
     bill and settles what is left of it, rather than being voided and retaken. */
  const named = D().payments.filter(p => !p.voided && p.enrollmentId === e.id);
  const namedSum = ACC.r2(named.reduce((s, p) => s + ACC.r2(p.amount), 0));

  UI.confirm(`Take ${UI.esc((c && c.title) || 'this training')} off ${inv.no}?`, fd => {
    const reason = String(fd.reason || '').trim();
    if(!reason){
      UI.toast('Say why it is coming off — a removal with no reason is a gap in the file.', 'bad');
      return;
    }
    if(!ACC.removeFromInvoice(inv, e.id, reason)){
      UI.toast('That line could not be taken off. Void the bill instead.', 'bad');
      return;
    }
    /* The receipts are untouched as documents. They stop naming a training that
       no longer exists, which puts them back in the pool the remaining
       trainings are settled from, oldest first. */
    named.forEach(p => { p.enrollmentId = ''; });
    /* The booking itself goes, and the centre stops being owed for it. */
    ACC.reverse(e.id, reason);
    e.status = 'Void';
    e.invoiceId = '';
    ACC.recomputeInvoice(inv);
    DB.save();
    DB.activity('Took a training off a bill', `${e.no} off ${inv.no} — ${reason}`);
    UI.toast(`${e.no} taken off ${inv.no}. It now asks for ${UI.peso(inv.total)}.`);
    render();
    /* The document the office is looking at, as it now reads. */
    setTimeout(() => invoiceModal(inv), 0);
  }, { danger:true, reason:true, yes:'Take it off the bill',
       detail:(namedSum > 0.004
         ? `${UI.peso(namedSum)} was received against this training. The receipt stands — that `
           + 'money stays on the bill and settles what is left of it. '
         : '')
         + 'The booking is voided, the centre stops being owed for it, and the bill is '
         + 'recomputed. Nothing is deleted.' });
}

function invoiceModal(inv){
  ACC.recomputeInvoice(inv);
  const t = T(inv.traineeId);
  /* Every booking this bill covers, not just the one it was opened with. A
     document that named one training while charging for three would be the
     first thing a trainee queried, and rightly.

     What it charges for is the test, not what points at it. A voided booking
     keeps its invoiceId — that is how the file records which bill it once sat
     on — so listing by that alone put a double-encoded training back in the
     header of a document that no longer charges a peso for it: three
     enrollment numbers and three training dates above two lines. The bill says
     what it is for, and that is its own items. */
  /* Bills raised before the lines carried their booking cannot be matched that
     way, so those still list every booking pointing at them; there is nothing
     else to go on. */
  const marked = (inv.items || []).some(i => i.enrId);
  const bookings = D().enrollments
    .filter(x => x.invoiceId === inv.id
      && x.status !== 'Void'
      && (!marked || (inv.items || []).some(i => i.enrId === x.id)))
    .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
  const only = bookings.length === 1 ? bookings[0] : null;
  const co = D().company, bal = ACC.balanceOf(inv);
  const pays = D().payments.filter(p => p.invoiceId === inv.id && !p.voided);

  UI.modal({
    title:'Payment Invoice', sub:inv.no, wide:true, hideSubmit:true,
    footExtra:`
      ${!inv.voided && bal > 0.004 && can('payments') ? `<button type="button" class="btn btn-accent" id="payNow">Record payment</button>` : ''}
      ${!inv.voided && can('invoices') ? `<button type="button" class="btn btn-danger" id="voidInv">Void</button>` : ''}
      <button type="button" class="btn btn-primary" onclick="UI.print()">Print</button>`,
    body: twoUp(`<div class="doc">
      <div class="doc-head">
        ${docCompany()}
        <div class="doc-title">
          <div class="t">PAYMENT INVOICE</div>
          <div class="n">${UI.esc(inv.no)}</div>
          <div class="muted" style="font-size:12px">${UI.date(inv.date)}</div>
          <div style="margin-top:5px">${UI.statusTag(invStatus(inv))}</div>
        </div>
      </div>
      <div class="grid g2">
        <dl class="def">
          <dt>Billed To</dt><dd><b>${UI.esc(name(t))}</b></dd>
          <dt>Trainee No.</dt><dd class="mono">${UI.esc(t?.no||'—')}</dd>
          <dt>SRN</dt><dd class="mono">${UI.esc(t?.srn||'—')}</dd>
          <dt>Agency</dt><dd>${UI.esc(t?.agency||'—')}</dd>
        </dl>
        <dl class="def">
          ${only
            ? `<dt>Enrollment</dt><dd class="mono">${UI.esc(only.no)}</dd>
               <dt>Course</dt><dd>${UI.esc((CRS(only.courseId)||{}).title || '—')}</dd>
               <dt>Training Date</dt><dd>${only.start ? UI.dateRange(only.start, only.end) : '—'}</dd>`
            : `<dt>Enrollments</dt><dd class="mono">${bookings.length
                  ? bookings.map(b => UI.esc(b.no)).join('<br>') : '—'}</dd>
               <dt>Training Dates</dt><dd>${bookings.length
                  ? bookings.map(b => b.start ? UI.dateRange(b.start, b.end) : '—').join('<br>') : '—'}</dd>`}
          <dt>Terms</dt><dd>${UI.esc(inv.terms||'—')}</dd>
        </dl>
      </div>
      ${UI.table([
        /* The discount under the training it was given on. One "Less: Discount"
           at the foot of a bill carrying six trainings tells nobody which of
           them was discounted, which is the line a trainee queries and the
           office then cannot answer from the document it handed over. */
        { h:'Particulars', k:i => UI.esc(i.desc) + (i.discount > 0
            ? `<div class="muted" style="font-size:11px">less discount${
                 i.discountNote ? ' — ' + UI.esc(i.discountNote) : ''} (${UI.num(i.discount)})</div>`
            : '') },
        { h:'Account', k:i => `<span class="mono muted">${UI.esc(i.account)}</span>` },
        { h:'Qty', k:'qty', cls:'num', w:'60px' },
        { h:'Unit Price', k:i => UI.num(i.price), cls:'num' },
        { h:'Amount', k:i => UI.num(i.amount), cls:'num' },
        /* Taking one training off the bill.

           A training encoded twice used to mean voiding every receipt on the
           bill and writing them again, because the only way off was voiding
           the booking and the booking refused while the bill had money on it.
           The admin can take the line off here instead: the booking is voided,
           its line comes off, the bill recomputes, and money named against that
           training moves to the rest of the bill rather than being unpicked.

           Only where there is something left afterwards — a bill down to its
           last training is voided as a document, which is what the Void button
           beside it does. */
        ...(canRemoveLines(inv) ? [{ h:'', w:'96px', k:i => i.enrId
            ? `<button type="button" class="btn btn-ghost btn-xs"
                 data-act="drop-line" data-id="${UI.esc(i.enrId)}">Remove</button>`
            : '' }] : []),
      ], inv.items)}
      <div class="doc-total"><table>
        <tr><td>Gross Charges</td><td class="num">${UI.num(inv.subtotal)}</td></tr>
        ${inv.discount ? `<tr><td>Less: Discount</td><td class="num">(${UI.num(inv.discount)})</td></tr>` : ''}
        <tr class="grand"><td>TOTAL AMOUNT DUE</td><td class="num">${UI.peso(inv.total)}</td></tr>
        <tr><td>Payments Received</td><td class="num">(${UI.num(inv.paid||0)})</td></tr>
        <tr class="grand"><td>BALANCE</td><td class="num">${UI.peso(bal)}</td></tr>
      </table></div>
      ${pays.length ? `<div class="hr"></div><h4 style="margin:0 0 6px;font-size:13px">Payments Applied</h4>
        ${UI.table([
          { h:'Ref No.', k:p => `<span class="mono">${UI.esc(receiptNo(p))}</span>` },
          { h:'Date', k:p => UI.date(p.date) },
          { h:'Mode', k:'method' },
          { h:'Reference', k:p => UI.esc(p.ref||'—') },
          { h:'Amount', k:p => UI.num(p.amount), cls:'num' },
        ], pays)}` : ''}
      ${inv.voided ? '<div class="note bad" style="margin-top:14px"><b>This invoice has been voided.</b> A reversing journal entry was posted.</div>' : ''}
      <div class="doc-sign"><div>Prepared By</div><div>Received By / Trainee</div></div>
      <p class="muted" style="font-size:11px;margin-top:18px">This document is computer-generated. TIN ${UI.esc(co.tin)}.</p>
    </div>`)
  });
  const on = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };
  on('payNow', () => paymentForm(inv));
  /* Registration raises it, the admin does it. A Payment Invoice is the
     document the trainee was given and the receivable the books are carrying,
     so taking one off is not a thing to do at the counter unattended. */
  const directVoid = canApprove();
  on('voidInv', () => UI.confirm(
    directVoid ? 'Void this invoice?' : 'Ask the admin to void this invoice?', fd => {
      const reason = String(fd.reason || '').trim();
      if((inv.paid||0) > 0){ UI.toast('Void the receipts first — this invoice has payments applied.', 'bad'); return; }
      if(!reason){ UI.toast('Say why it is being voided — it takes a receivable off the books.', 'bad'); return; }

      if(!directVoid){
        const bk = D().enrollments.find(x => x.invoiceId === inv.id);
        if(!bk){ UI.toast('That bill has no booking to raise the request against.', 'bad'); return; }
        if(pendingChangeFor(bk.id)){
          UI.toast('A change to that booking is already waiting for the admin.', 'bad'); return;
        }
        const was = {}; CHANGE_FIELDS.forEach(f => { was[f.k] = bk[f.k]; });
        D().changes.push({
          id:DB.uid('chg'), no:DB.nextNo('change','CHG'), kind:'invoice-void',
          enrollmentId:bk.id, traineeId:inv.traineeId,
          date:DB.today(), raisedBy:SESSION.name,
          /* The bill rides inside to_state, which is jsonb and already has a
             column. A top-level invoiceId would need one of its own, and a
             field with no column is a save that fails for the whole office. */
          was, to:{ ...was, invoiceId:inv.id }, reason, state:'Pending',
        });
        DB.save();
        DB.activity('Asked to void an invoice', inv.no);
        UI.toast(`Sent for approval — ${inv.no} stays as it is until an admin signs it.`);
        UI.close(); refresh();
        return;
      }

      voidInvoice(inv, reason);
      DB.save();
      DB.activity('Voided invoice', inv.no + ' — ' + reason);
      UI.toast('Invoice voided and reversed.');
      refresh();
    }, { danger:true, reason:true,
         yes:directVoid ? 'Void invoice' : 'Send for approval',
         detail:directVoid
           ? 'The original entry stays in the journal and a mirror-image reversing entry is posted beside it.'
           : 'Nothing changes yet. The invoice stands until the admin signs it off.' }));
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
/* The collection window.

   A trainee who books three courses gets three bills and pays for them in one
   go, because that is one person at one counter handing over one amount. The
   window used to take that money against a single bill — the only "split" it
   knew was a split of *tender*, cash and GCash on one invoice, which is a
   different thing wearing the same word. So a payment covering three trainings
   was recorded against one of them, the other two stayed outstanding, and the
   trainee had a receipt that did not say what they had actually paid for.

   Money is now put against bills, plural. The tenders say how it arrived; the
   allocations say what it settles; the two have to agree before anything is
   written. One receipt number covers the lot, because one document was handed
   over the counter. */
/* opts = { traineeId, enrollmentId } — who to open on when there is no bill to
   open on, and which training to tick. A booking with no invoice behind it has
   no invoice to pass, and without this the window opened on whichever trainee
   sorted first and the cashier had to find their way back. */
function paymentForm(inv, opts = {}){
  const openFor = tid => D().invoices.map(i => (ACC.recomputeInvoice(i), i))
    .filter(i => !i.voided && ACC.balanceOf(i) > 0.004 && (!tid || i.traineeId === tid))
    .sort((a,b) => a.date.localeCompare(b.date));

  /* Seats booked but never billed — an Open Schedule taken before the billing
     rule changed, or one whose bill was voided. The trainee is at the counter
     paying for it, and the window used to have nothing to offer them: no bill,
     so no line, so no way to take the money. They are listed here and the bill
     is raised as the money is taken. */
  const unbilledFor = tid => D().enrollments
    .filter(e => billableUnbilled(e) && (!tid || e.traineeId === tid))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  const anyOpen = openFor(null);
  const anyUnbilled = unbilledFor(null);
  if(!inv && !anyOpen.length && !anyUnbilled.length){
    UI.toast('Nothing outstanding — every training is settled.', 'bad'); return; }

  /* One trainee per receipt. A document covering two people is a document
     neither of them can be handed. */
  const owing = [...new Set([...anyOpen.map(i => i.traineeId),
                             ...anyUnbilled.map(e => e.traineeId)])]
    .map(id => ({ id, t:T(id) })).filter(x => x.t)
    .map(({ id, t }) => {
      const billed = ACC.r2(openFor(id).reduce((s, i) => s + ACC.balanceOf(i), 0));
      const booked = ACC.r2(unbilledFor(id).reduce((s, e) => s + wouldBill(e), 0));
      const n = openFor(id).length + unbilledFor(id).length;
      return { v:id, l:`${name(t)} — ${UI.peso(ACC.r2(billed + booked))} outstanding`
                        + ` · ${n} training(s)` };
    })
    .sort((a,b) => a.l.localeCompare(b.l));

  const who0 = inv ? inv.traineeId : (opts.traineeId || (owing[0] ? owing[0].v : ''));
  const bal = inv ? ACC.balanceOf(inv) : 0;
  const MODES = ACC.methodNames();

  /* Every open bill for one trainee, with the course it paid for spelled out —
     "INV-2026-0015" tells the cashier nothing about which training it was. */
  /* One line per training, not one per bill.

     A day's bookings share an invoice, which is right for the document the
     trainee is handed and wrong for the window where money is put against
     things: it left the cashier one box for six trainings joined by plus signs,
     and no way to say the trainee had paid for the medical but not the
     refresher.

     So the list is the trainings. Each has its own share of the bill, its own
     remaining balance, and its own box. What is written afterwards is still one
     payment per invoice — the books record money against a bill — but which
     trainings it settles is now the cashier's to say rather than the
     arithmetic's to guess. */
  const payLines = tid => {
    const out = [];
    openFor(tid).forEach(i => {
      const bookings = bookingsOn(i);
      if(!bookings.length){
        /* A bill from before the lines carried their booking. Handled whole,
           because guessing which of its trainings an old payment was for is
           worse than not splitting it. */
        out.push({ key:i.id, inv:i, e:null,
                   title:billCourses(i).join(' + ') || 'no course on file',
                   sub:`${i.no} · billed ${UI.peso(i.total)}`,
                   left:ACC.balanceOf(i) });
        return;
      }
      bookings.forEach(e => {
        const left = bookingLeft(e);
        if(left <= 0.004) return;      /* this training is settled */
        const c = CRS(e.courseId);
        out.push({ key:e.id, inv:i, e,
                   title:(c ? c.title : 'no course on file')
                         + (e.center ? ` — ${e.center}` : ''),
                   sub:`${i.no} · ${e.no} · billed ${UI.peso(bookingShare(e))}`,
                   left });
      });
    });
    /* And the seats with no bill behind them. They carry no invoice, so the
       line says so; ticking one raises the bill when the payment is written. */
    unbilledFor(tid).forEach(e => {
      const c = CRS(e.courseId);
      out.push({ key:e.id, inv:null, e,
                 title:(c ? c.title : 'no course on file')
                       + (e.center ? ` — ${e.center}` : ''),
                 sub:`${e.no} · ${e.status} · not billed yet — the bill is raised with this receipt`,
                 left:wouldBill(e) });
    });
    return out;
  };

  const billRows = tid => {
    const list = payLines(tid);
    if(!list.length) return '<p class="muted" style="margin:0">Nothing outstanding for them.</p>';
    return list.map(r => {
      const on = r.key === opts.enrollmentId
                 || !!(inv && r.inv && r.inv.id === inv.id
                       && list.filter(x => x.inv && x.inv.id === inv.id).length === 1)
                 || list.length === 1;
      return `<div class="bill-row${on ? ' on' : ''}" data-bill="${r.key}">
        <label class="bill-pick">
          <input type="checkbox" name="pick_${r.key}" ${on ? 'checked' : ''}>
          <span><b>${UI.esc(r.title)}</b><br>
            <span class="muted" style="font-size:11.5px">${UI.esc(r.sub)}
              · still to pay <b>${UI.peso(r.left)}</b></span></span>
        </label>
        <div class="bill-amt">
          <div class="lbl">Amount</div>
          <input type="number" name="amt_${r.key}" class="b-amt" step="0.01" min="0"
                 placeholder="0.00" ${on ? `value="${r.left.toFixed(2)}"` : 'disabled'}>
        </div>
      </div>`;
    }).join('');
  };
  const line = i => `
    <div class="tender-row" data-row="${i}">
      <select name="m${i}" class="t-mode">${MODES.map(m => `<option value="${m}">${m}</option>`).join('')}</select>
      <input type="number" name="a${i}" step="0.01" min="0" placeholder="Amount" class="t-amt">
      <input type="text" name="r${i}" placeholder="Reference no." class="t-ref">
    </div>`;

  UI.modal({
    title:'Record collection',
    sub: inv ? `Against ${inv.no} · balance ${UI.peso(bal)}` : 'Record a payment',
    wide:true,
    body: `
    <div class="pay-shell">
      <aside class="pay-side">
        <div>
          <h5>Customer</h5>
          <div class="who" id="sideWho">${UI.esc(name(T(who0)))}</div>
          <div class="srn" id="sideSrn">${UI.esc(T(who0)?.srn || T(who0)?.no || '')}</div>
        </div>
        <div>
          <h5>Owing now</h5>
          <div class="big" id="sideOwed">—</div>
        </div>
        <div>
          <h5>Across their bills</h5>
          <div class="sum" id="sideSum"></div>
        </div>
      </aside>

      <div class="pay-main">
        <!-- Two facts about the receipt itself, before anything about what it
             settles: who handed the money over, and when. The date was at the
             foot of the form next to the notes, which is where a cashier looks
             last and often not at all — and a receipt dated the day it was
             typed puts yesterday's takings into today's report while leaving
             yesterday short, against a drawer that was counted on yesterday's
             figure. -->
        ${UI.row(
          inv
            ? `<input type="hidden" name="who" value="${inv.traineeId}">
               <label class="fld"><span>Trainee</span>
                 <input value="${UI.esc(name(T(inv.traineeId)))}" readonly></label>`
            : UI.f.select('who','Trainee', who0, owing, { req:true }),
          UI.f.date('paidOn','Date received', DB.today(),
            { req:true, attr:`max="${DB.today()}"`,
              hint:'the day it was handed over, not the day it is typed' }))}

        <h4 style="margin:${inv ? '0' : '10px'} 0 2px;font-size:13px">What This Money Settles</h4>
        <p class="muted" style="margin:0 0 8px;font-size:12px">
          Tick every training this payment covers and put the amount against each.
          One receipt covers the lot, and what goes against each training is
          recorded against that training — so paying for one course out of three
          leaves the other two owing.</p>
        <div id="bills">${billRows(who0)}</div>

        <div class="hr"></div>
        <h4 style="margin:0 0 4px;font-size:13px">How It Was Paid</h4>
        <p class="muted" style="margin:0 0 10px;font-size:12px">
          What was actually handed over. One line per mode — GCash and Bank need the
          reference number that appears on the statement.</p>
        <div id="tenders">${line(0)}</div>
        <div id="payWarn"></div>

        <div class="hr"></div>
        ${UI.f.text('note','Notes','', {})}
      </div>
    </div>`,
    submitLabel:'Record payment',
    onSubmit: fd => {
      const tid = inv ? inv.traineeId : fd.who;
      if(!tid){ UI.toast('Select the trainee.', 'bad'); return false; }

      if(!ticked().length){
        UI.toast('Tick the training this payment is for.', 'bad');
        return false;
      }

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
      if(amt <= 0){ UI.toast('Enter an amount greater than zero.', 'bad'); return false; }

      /* Exactly what the screen was showing, read once here — what is posted is
         what the cashier was looking at when they pressed the button. */
      const bills = allocation().filter(b => b.amount > 0.004);
      if(!bills.length){
        UI.toast('Put an amount against at least one training.', 'bad'); return false;
      }

      /* The amounts are typed now, so they can disagree with the money, and one
         of them being wrong is exactly the mistake worth catching before it is
         written. Cash that does not equal what it was put against is a drawer
         that will not count at the end of the day, in either direction. */
      const put = ACC.r2(bills.reduce((s, b) => s + b.amount, 0));
      if(Math.abs(amt - put) > 0.004){
        UI.toast(`${UI.peso(amt)} was received but ${UI.peso(put)} is going against trainings.`
          + ' The two have to be the same money.', 'bad');
        return false;
      }

      const note = String(fd.note || '').trim();

      /* One document. The trainee handed over one sum, so the number is taken
         once and every row making up that receipt carries it — and each bill
         still gets its own row, because that is what makes its balance right. */
      /* The day the money came in, which is not always the day somebody had
         time to type it. A receipt dated when it was entered puts yesterday's
         takings into today's report and leaves yesterday short — and the drawer
         was counted on yesterday's figure. */
      const paidOn = String(fd.paidOn || '').trim() || DB.today();
      if(paidOn > DB.today()){
        UI.toast('That date is in the future — money cannot have been received yet.', 'bad');
        return false;
      }

      /* A seat that was never billed is billed now, dated the day the money
         came in. The receivable and the receipt are then the same day's
         business — a bill dated today against money received last week would
         put revenue in one report and its collection in another.

         The centre's payable posts with it, so a seat paid for at the counter
         owes the centre from the same moment. If it cannot be billed nothing is
         written at all: half a receipt is worse than none. */
      for(const b of bills){
        if(b.inv) continue;
        try{ b.inv = APPS.billBooking(b.line.e, { date:paidOn }); }
        catch(err){
          UI.toast(`${b.line.e.no} could not be billed: ${err.message}`, 'bad');
          return false;
        }
        if(!b.inv){
          UI.toast(`${b.line.e.no} is still ${b.line.e.status} — confirm the seat before`
            + ' taking money for it.', 'bad');
          return false;
        }
      }

      const no = DB.nextNo('receipt','OR');
      const queue = tenders.map(t => ({ ...t, left:t.amount }));
      const made = bills.map((b, n) => {
        const p = ACC.buildPayment({ no:n ? `${no}/${n + 1}` : no,
                                     invoiceId:b.inv.id,
                                     enrollmentId:b.line && b.line.e ? b.line.e.id : '',
                                     traineeId:tid,
                                     date:paidOn, tenders:ACC.drawTenders(queue, b.amount),
                                     note });
        D().payments.push(p);
        ACC.postPayment(p, b.inv);
        return p;
      });
      DB.activity('Recorded payment',
        `${no} vs ${[...new Set(bills.map(b => b.inv.no))].join(', ')}`);
      DB.save();
      UI.toast(`OR ${no} issued for ${UI.peso(amt)}`
        + (bills.length > 1 ? ` across ${bills.length} trainings` : ''));
      render();
      receiptModal(made[0]);
      return false; // receiptModal already replaced the dialog
    }
  });

  const form = document.getElementById('mForm');
  const whoNow = () => inv ? inv.traineeId : (form.who ? form.who.value : '');

  /* The lines on screen, rebuilt from the store each time so a payment just
     recorded is reflected without the window being reopened. */
  const lines = () => payLines(whoNow());
  const ticked = () => lines()
    .filter(r => form['pick_' + r.key] && form['pick_' + r.key].checked);

  /* What is being put against trainings, as typed. */
  const putNow = () => ACC.r2(allocation().reduce((s, a) => s + a.amount, 0));
  /* What the ticked trainings are asking for. */
  const dueNow = () => ACC.r2(ticked().reduce((s, r) => s + r.left, 0));

  /* What is going against each training, as typed. Nothing is spread and
     nothing is inferred: three courses paid in one go is three amounts the
     cashier decides with the trainee in front of them, and a rule that lays one
     sum down in booking order would be the system deciding it instead.

     Over the balance on a training is allowed and stays where it was put — the
     bill is the charge, this is the money, and the excess is that trainee's
     credit. */
  const allocation = () => ticked().map(r => {
    const box = form && form['amt_' + r.key];
    const amount = ACC.r2((box && box.value) || 0);
    return { line:r, inv:r.inv, owed:r.left, amount,
             short:ACC.r2(Math.max(0, r.left - amount)),
             over:amount - r.left > 0.004 ? ACC.r2(amount - r.left) : 0 };
  });

  /* Ticking a training opens its box and fills in what is owed on it, which is
     the usual answer. Untick and the box closes and empties, because an amount
     against a training nobody is paying for is the one that goes unnoticed.
     What has been typed is never replaced. */
  const syncBills = () => {
    lines().forEach(r => {
      const pick = form['pick_' + r.key];
      const box = form['amt_' + r.key];
      const row = form.querySelector(`.bill-row[data-bill="${r.key}"]`);
      if(!pick || !box || !row) return;
      row.classList.toggle('on', pick.checked);
      if(!pick.checked){
        box.disabled = true;
        box.value = '';
      }else if(box.disabled){
        box.disabled = false;
        box.value = r.left.toFixed(2);
      }
    });
    sidePanel();
  };

  /* The left panel is read back to the person at the counter, so it says what
     they owe in total and what this receipt is about to settle of it. */
  const sidePanel = () => {
    const t = T(whoNow());
    const bills = lines();
    const owed = ACC.r2(bills.reduce((s, r) => s + r.left, 0));
    /* What this payment actually settles, which is the money handed over and
       not the total of whatever happens to be ticked. Reading dueNow() here had
       the panel announce a part payment as clearing the lot — the one figure on
       the screen the cashier reads back across the counter, and it was the
       figure that was wrong. */
    const now = putNow();
    const set = (id, v) => { const el = document.getElementById(id); if(el) el.innerHTML = v; };
    set('sideWho', UI.esc(name(t)));
    set('sideSrn', UI.esc((t && (t.srn || t.no)) || ''));
    set('sideOwed', UI.peso(owed));
    set('sideSum', `
      <div><span>Trainings owing</span><span>${UI.int(bills.length)}</span></div>
      <div><span>Total outstanding</span><span>${UI.peso(owed)}</span></div>
      <div><span>Settling now</span><span>${UI.peso(now)}</span></div>
      <div class="tot"><span>Left after this</span><span>${UI.peso(ACC.r2(Math.max(0, owed - now)))}</span></div>`);
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
    syncBills();
    const put = putNow(), amt = tendered();
    const n = ticked().length;
    const box = document.getElementById('payWarn');
    /* Two figures the cashier owns: what went against each training, and what
       came across the counter. They have to be the same money, and where they
       are not the difference is said rather than the two numbers being left to
       subtract in somebody's head. */
    box.innerHTML = !n
      ? `<div class="note warn">Tick the training this payment is for.</div>`
      : !amt && !put
        ? `<div class="note">Put the amount against each training, and how it was paid.</div>`
      : Math.abs(amt - put) <= 0.004
        ? `<div class="note"><b>${UI.peso(amt)} received</b>, all of it against
            ${n === 1 ? 'one training' : `${n} trainings`}. One receipt covers
            ${n === 1 ? 'it' : 'them'}.</div>`
      : amt > put
        ? `<div class="note warn"><b>${UI.peso(ACC.r2(amt - put))} of what was received is not
            against a training yet.</b> Raise one of the amounts, or tick another training.</div>`
        : `<div class="note warn"><b>${UI.peso(ACC.r2(put - amt))} more is going against trainings
            than was received.</b> Lower one of the amounts, or add how the rest was paid.</div>`;
  };

  /* One tender line, and no buttons over the bill list. Ticking a training and
     typing what goes against it is the whole of the window now.

     What this gives up, said plainly so it can be asked for back: a receipt
     cannot be part cash and part GCash any more. The machinery underneath still
     handles several tenders — the reconciliation screen reads them, and a
     receipt that has them prints them — so restoring the line is one button,
     not a rebuild. */
  const setFirst = v => { form.a0.value = v.toFixed(2);
    for(let i = 1; i < 6; i++){ if(form['a'+i]) form['a'+i].value = ''; } warn(); };

  /* The tender follows the amounts until somebody types in it. Ticking a
     second training raises the total handed over, which is right nine times in
     ten and is never allowed to overwrite a figure the cashier put there. */
  const suggest = () => { if(!form.a0.dataset.touched) setFirst(putNow()); else warn(); };
  form.addEventListener('input', ev => {
    if(ev.target === form.a0) form.a0.dataset.touched = '1';
    /* Typing an amount against a training moves the total handed over with it,
       so the ordinary case — three courses, three figures, that is what was
       paid — needs nothing typed twice. It stops following the moment the
       cashier puts a figure in the tender themselves, because then the two
       really are different numbers and the difference is theirs to explain. */
    else if(ev.target && ev.target.classList
            && ev.target.classList.contains('b-amt')
            && !form.a0.dataset.touched){
      setFirst(putNow());
      return;
    }
    warn();
  });
  form.addEventListener('change', ev => {
    /* Changing the trainee rebuilds the list under them, so the old ticks go
       with it — they belonged to somebody else's trainings. */
    if(!inv && ev.target === form.who){
      document.getElementById('bills').innerHTML = billRows(form.who.value);
      delete form.a0.dataset.touched;
      if(form.note) form.note.value = '';
      syncBills();
      suggest();
      return;
    }
    if(ev.target && /^pick_/.test(ev.target.name || '')){ syncBills(); suggest(); return; }
    warn();
  });
  syncBills();
  setFirst(inv ? bal : putNow());
}

function receiptModal(p){
  const t = T(p.traineeId), co = D().company;

  /* A collection covering three trainings is three rows in the books and one
     piece of paper across the counter. The rows are what make each bill's
     balance right; this is the paper, so it gathers everything issued under the
     same number rather than showing whichever row happened to be opened. */
  const parts = D().payments.filter(x => sameReceipt(x, p));
  const total = ACC.r2(parts.reduce((s, x) => s + x.amount, 0));
  const words = amountInWords(total);
  const settles = parts.map(x => {
    const i = INV(x.invoiceId);
    const e = i && ENR(i.enrollmentId), c = e && CRS(e.courseId);
    return { pay:x, inv:i, course:c ? c.title : 'Training Fees', center:e ? e.center : '' };
  });
  /* Every tender across the whole receipt, gathered by how it arrived. The
     rows split cash three ways because that is how it was applied to the bills;
     the person handed over cash once, and a receipt listing "Cash" twice reads
     like they paid twice. The split is in the table underneath, where it says
     what it is. */
  const allTenders = Object.values(parts
    .flatMap(x => (x.tenders && x.tenders.length ? x.tenders
                                                 : [{ method:x.method, ref:x.ref, amount:x.amount }]))
    .reduce((acc, t) => {
      const k = t.method + '|' + (t.ref || '');
      if(!acc[k]) acc[k] = { method:t.method, ref:t.ref, amount:0 };
      acc[k].amount = ACC.r2(acc[k].amount + t.amount);
      return acc;
    }, {}));

  UI.modal({
    title:'Acknowledgement Receipt', sub:UI.date(p.date), hideSubmit:true, wide:true,
    footExtra:`${!p.voided && can('payments') ? `<button type="button" class="btn btn-danger" id="voidPay">Void payment</button>` : ''}
               <button type="button" class="btn btn-primary"
                 onclick="UI.printDoc('${UI.esc(receiptNo(p))} — Acknowledgement Receipt')">Print / PDF</button>`,
    /* The one piece of paper a seafarer walks out with, and keeps. It carried
       the same plain header as an internal voucher — right for something that
       stays in a drawer, thin for a document shown to a manning agency two
       years later. */
    body: `<div class="doc ar" style="padding:0">
      <div class="ar-band">
        <img src="${LOGO}" alt="">
        <div class="ar-rule"></div>
        <div class="ar-co">
          <h2>${UI.esc(co.name)}</h2>
          ${co.address ? `<div class="l">${ICO.pin}<span>${UI.esc(co.address)}</span></div>` : ''}
          ${contactLines().map((x, n) =>
            `<div class="l">${n ? ICO.mail : ICO.phone}<span>${UI.esc(x)}</span></div>`).join('')}
          ${co.tradeName ? `<div class="by">${UI.esc(co.tradeName)}</div>` : ''}
        </div>
        <div class="ar-title">
          <div class="t">ACKNOWLEDGEMENT<br>RECEIPT</div>
          <div class="u"></div>
          ${p.voided ? '<div style="margin-top:9px">' + UI.tag('VOID','bad') + '</div>' : ''}
        </div>
      </div>

      <div class="ar-meta"><table>
        <tr><td class="k">${ICO.doc} Receipt No.</td>
            <td class="v mono">${UI.esc(receiptNo(p))}</td></tr>
        <tr><td class="k">${ICO.cal} Date</td>
            <td class="v">${UI.date(p.date)}</td></tr>
      </table></div>

      <div class="ar-body">
        <section class="ar-panel">
          <h4>RECEIPT DETAILS</h4>
          <dl>
            <dt>${ICO.user} Received From</dt>
            <dd><b>${UI.esc(name(t))}</b>${t?.no ? ` · <span class="mono">${UI.esc(t.no)}</span>` : ''}</dd>
            <dt>${ICO.pin} Address</dt><dd>${UI.esc(t?.address || '—')}</dd>
            <dt>${ICO.peso} The Sum Of</dt><dd><b>${UI.esc(words)}</b></dd>
            <dt>${ICO.doc} In Payment Of</dt><dd>${settles.map(s =>
              `${UI.esc(s.course)}${s.center ? ' <span class="muted">— ' + UI.esc(s.center) + '</span>' : ''}`
              + `${s.inv ? '<br>Bill <span class="mono">' + UI.esc(s.inv.no) + '</span>' : ''}`).join('<br>')}</dd>
            <dt>${ICO.build} Mode Of Payment</dt><dd>${allTenders
              .map(t => `<b>${UI.esc(t.method)}</b>${t.ref ? ' · Ref ' + UI.esc(t.ref) : ''} — ${UI.num(t.amount)}`)
              .join('<br>')}</dd>
          </dl>
        </section>

        <section class="ar-panel ar-sum">
          <h4>PAYMENT SUMMARY</h4>
          <table>
            <tr><td>Amount Received</td><td class="num">${UI.num(total)}</td></tr>
            ${settles.length === 1 && settles[0].inv ? (() => {
              const inv = settles[0].inv;
              ACC.recomputeInvoice(inv);
              /* What came in over the bill is the office's business, not
                 something to hand the trainee a claim on. The receipt states
                 the money received and that the bill is settled, and stops. */
              return `<tr><td>Invoice Total</td><td class="num">${UI.num(inv.total)}</td></tr>
                <tr><td>Total Paid To Date</td><td class="num">${UI.num(inv.paid||0)}</td></tr>
                <tr class="grand"><td>REMAINING BALANCE</td>
                  <td class="num">${UI.peso(ACC.balanceOf(inv))}</td></tr>`;
            })() : `<tr class="grand"><td>TOTAL RECEIVED</td>
                      <td class="num">${UI.peso(total)}</td></tr>`}
          </table>
        </section>
      </div>

      ${settles.length > 1 ? `
      <div class="ar-applied">
      <table style="width:100%">
        <thead><tr><th>Applied To</th><th>Bill</th><th class="num">Amount</th>
          <th class="num">Balance After</th></tr></thead>
        <tbody>${settles.map(s => {
          if(s.inv) ACC.recomputeInvoice(s.inv);
          return `<tr><td>${UI.esc(s.course)}</td>
            <td><span class="mono">${UI.esc(s.inv ? s.inv.no : '—')}</span></td>
            <td class="num">${UI.num(s.pay.amount)}</td>
            <td class="num">${s.inv ? UI.num(ACC.balanceOf(s.inv)) : '—'}</td></tr>`;
        }).join('')}</tbody>
      </table></div>` : ''}

      <div class="ar-sign">
        <div class="s">Cashier</div>
        <div class="v"></div>
        <div class="s">Received the Above Amount</div>
      </div>
      <p class="ar-note">Valid only when the corresponding payment has cleared.
        Computer-generated. The official receipt for the training itself is issued
        by the training center.</p>
    </div>`
  });
  const vb = document.getElementById('voidPay');
  /* The whole document goes, not the row that happened to be open. Voiding one
     part of a receipt covering three trainings would leave the trainee holding
     paper for money the books say they still owe. */
  if(vb) vb.onclick = () => UI.confirm('Void this acknowledgement receipt?', fd => {
      parts.forEach(x => {
        x.voided = true;
        ACC.reverse(x.id, fd.reason || 'Receipt voided');
        const i = INV(x.invoiceId);
        if(i) ACC.recomputeInvoice(i);
      });
      DB.activity('Voided payment', receiptNo(p) + (fd.reason ? ' — ' + fd.reason : ''));
      DB.save();
      UI.toast(parts.length > 1
        ? `Receipt voided across ${parts.length} trainings; the balances have been restored.`
        : 'Receipt voided; the balance has been restored.');
      refresh();
    }, { danger:true, reason:true, yes:'Void receipt',
         detail:'A reversing entry is posted and the amount returns to the trainee\'s outstanding balance.' });
}

/* Capitalises each word and leaves the rest of it alone, so an acronym already
   in capitals — SRN, TIN — survives. Hyphenated numbers get both halves:
   Twenty-Five. */
const titleCase = s => String(s || '')
  .replace(/[A-Za-z][A-Za-z']*/g, w => w.charAt(0).toUpperCase() + w.slice(1));

/* Spelled-out amount for the face of a document, written in title case the way
   it is written on a cheque. */
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
  return titleCase(`${s} pesos${cents ? ' and ' + under1000(cents) + ' centavos' : ''} only`);
}

/* ----- expenses & journal ----- */
function expenseForm(){
  /* The system accounts are left out. Training Center Fees is charged when a
     booking is made and settled from Payables — a hand-written voucher against
     it would post the cost of a seat twice. */
  /* Payroll is not on this list. What the office pays its people is raised on
     the Payroll screen, which only an admin can open — a salary that anybody at
     the counter can read is a salary the whole office knows by lunchtime. */
  const exp = D().accounts.filter(a =>
    a.type === 'Expense' && !DB.SYSTEM_ACCOUNTS.includes(a.code) && a.code !== PAYROLL_ACCOUNT);
  UI.modal({
    title:'Disbursement voucher', sub:'Records the expense and credits cash automatically',
    body: `
      ${UI.row(UI.f.text('payee','Payee', '', { req:true }), UI.f.date('date','Date', DB.today(), { req:true }))}
      ${UI.f.select('account','Expense account','5100', exp.map(a => ({ v:a.code, l:a.name })), { req:true })}
      ${UI.f.text('particulars','Particulars','',{ req:true, ph:'What was this for?' })}
      ${UI.row(UI.f.num('amount','Amount (₱)','',{ req:true, min:0.01 }),
               UI.f.select('method','Paid from', ACC.methodNames()[0], ACC.methodNames()))}
      <div class="note warn">Nothing posts yet. On approval this debits the expense
        account and credits whichever cash account the mode names.</div>`,
    submitLabel:'Raise voucher',
    onSubmit: fd => {
      const v = { id:DB.uid('exp'), no:DB.nextNo('voucher','DV'), ...fd, amount:ACC.r2(fd.amount),
                  state:'Pending', raisedBy:SESSION.name };
      D().expenses.push(v);
      DB.activity('Raised disbursement', v.no);
      UI.toast(`Voucher ${v.no} raised — waiting for approval.`);
      refresh();
    }
  });
}

function journalForm(){
  const opts = D().accounts.map(a => ({ v:a.code, l:a.name }));
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
/* Who may open this system, and how they come to have a password.

   An admin puts an email address on the roster and tells the person to sign up
   with it; Supabase takes the password, and the moment the account exists a
   trigger gives it the staff row and the role the roster promised. Nobody here
   chooses somebody else's password, and no password is stored anywhere this
   code can reach — which is what the old form did, in clear text, in a file the
   website served to anyone who asked for it. */
/* Changing your own password, which until now meant asking an admin to open
   the accounts screen and read everybody's out of a list.

   Supabase takes the new one straight from the browser. It does not pass
   through this office's records on the way, and once it is set nobody here can
   read it back — not the admin, not this code. The only thing anyone else can
   do is send a reset link to the address it belongs to. */
function myPasswordForm(){
  if(!CLOUD.signedIn()) return UI.toast('Sign in first.', 'bad');

  UI.modal({
    title:'Change my password',
    sub:(SESSION && SESSION.email) || '',
    body:`
      ${UI.row(UI.f.text('next','New password', '',
                 { req:true, type:'password', attr:'autocomplete="new-password"',
                   hint:'at least 8 characters' }),
               UI.f.text('again','Type it again', '',
                 { req:true, type:'password', attr:'autocomplete="new-password"' }))}
      <div class="note">Changed everywhere, on every machine, straight away. Nobody in the
        office can read it afterwards — if you forget it, an admin sends you a reset link.</div>`,
    submitLabel:'Change it',
    onSubmit: fd => {
      const next = String(fd.next || '');
      if(next.length < 8){ UI.toast('Use at least 8 characters.', 'bad'); return false; }
      if(next !== String(fd.again || '')){ UI.toast('The two new passwords are not the same.', 'bad'); return false; }
      CLOUD.updatePassword(next)
        .then(() => { DB.activity('Changed own password'); DB.save();
                      UI.toast('Password changed.'); })
        .catch(e => UI.toast('That did not change: ' + e.message, 'bad'));
    }
  });
}

function rosterRows(){
  const staff = D().users || [];
  const roster = D().roster || [];
  const byEmail = {};
  roster.forEach(r => { byEmail[String(r.email).toLowerCase()] = { ...r, signedUp:false }; });
  staff.forEach(s => {
    const k = String(s.email || '').toLowerCase();
    byEmail[k] = { ...(byEmail[k] || {}), email:s.email, name:s.name, role:s.role,
                   initials:s.initials, signedUp:true, active:s.active, id:s.id };
  });
  return Object.values(byEmail).sort((a,b) => String(a.name).localeCompare(String(b.name)));
}

async function saveRoster(entry, wasEmail){
  await CLOUD.upsert('roster', [{ email:String(entry.email).trim().toLowerCase(),
    name:entry.name, role:entry.role, initials:entry.initials }]);
  if(wasEmail && wasEmail !== entry.email) await CLOUD.remove('roster', [wasEmail], 'email');
  /* Somebody who has already signed in keeps their auth account; what changes
     is the row that says what they may open. */
  const staff = (D().users || []).find(u => String(u.email||'').toLowerCase() === String(wasEmail||entry.email).toLowerCase());
  if(staff){
    await CLOUD.rest(`staff?id=eq.${encodeURIComponent(staff.id)}`, {
      method:'PATCH', headers:{ 'Prefer':'return=minimal' },
      body:{ name:entry.name, role:entry.role, initials:entry.initials,
             email:String(entry.email).trim().toLowerCase() },
    });
  }
  await DB.refreshFromCloud();
}

function userForm(entry){
  const isNew = !entry;
  const e = entry || { name:'', email:'', role:'frontdesk', initials:'', signedUp:false };
  const wasEmail = isNew ? '' : String(e.email || '').toLowerCase();
  const roles = Object.keys(DB.PERMS).map(r => ({ v:r, l:`${DB.roleName(r)} — ${DB.PERMS[r].length} module(s)` }));

  UI.modal({
    title: isNew ? 'Add a person' : 'Edit — ' + e.name,
    sub: isNew ? 'They choose their own password when they sign up' : '',
    wide:true,
    body:`
      ${UI.row(UI.f.text('name','Full name', e.name, { req:true, ph:'e.g. Maria Santos' }),
               UI.f.text('email','Email address', e.email, { req:true, type:'email',
                          hint:'this is what they sign in with', ph:'name@example.com' }))}
      ${UI.row(UI.f.select('role','Role', e.role, roles, { req:true }),
               UI.f.text('initials','Initials', e.initials,
                         { hint:'shown on the avatar — blank fills itself in', ph:'MS' }))}
      <div class="note">
        <b>${UI.esc(DB.roleName(e.role || 'frontdesk'))}</b> can open:
        <span id="roleMods">${DB.PERMS[e.role] ? DB.PERMS[e.role].map(m => (TITLES[m]||[m])[0]).join(' · ') : ''}</span>
      </div>
      ${e.signedUp
        ? `<div class="note ok">This person has an account and has signed in. Changing the role here
             changes what they can open the next time they load the page.
             <div style="margin-top:9px">
               <button type="button" class="btn btn-ghost btn-xs" id="resetPass">Send a password reset email</button>
             </div></div>`
        : `<div class="note warn">No account yet. Nobody here sets somebody else's password —
             ask <b>${UI.esc(e.email || 'them')}</b> to sign up with exactly this address and choose
             their own. The moment they do, this role is waiting for them.</div>`}
      ${isNew ? '' : `<div class="hr"></div>
        <button type="button" class="btn btn-danger btn-sm" id="delUser">Remove this person</button>`}`,
    submitLabel: isNew ? 'Add to the roster' : 'Save changes',
    onSubmit: fd => {
      const name = (fd.name || '').trim();
      const email = (fd.email || '').trim().toLowerCase();
      if(!name) { UI.toast('A name is required.', 'bad'); return false; }
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
        UI.toast('That email address does not look right.', 'bad'); return false;
      }
      const clash = rosterRows().find(x => String(x.email).toLowerCase() === email && email !== wasEmail);
      if(clash){ UI.toast(`${clash.name} already uses that address.`, 'bad'); return false; }

      const initials = (fd.initials || '').trim().toUpperCase()
        || name.split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase();

      saveRoster({ name, email, role:fd.role, initials }, wasEmail)
        .then(() => {
          DB.activity(isNew ? 'Added to the roster' : 'Updated a role', name);
          UI.toast(isNew
            ? `${name} added — they can sign up with ${email} now.`
            : 'Saved.');
          refresh();
        })
        .catch(err => UI.toast('That did not save: ' + err.message, 'bad'));
    }
  });

  /* Show what the chosen role can actually reach, as it is chosen. */
  const form = document.getElementById('mForm');
  form.role.onchange = () => {
    document.getElementById('roleMods').textContent =
      (DB.PERMS[form.role.value] || []).map(m => (TITLES[m]||[m])[0]).join(' · ');
  };

  const reset = document.getElementById('resetPass');
  if(reset) reset.onclick = () => {
    CLOUD.resetPassword(e.email)
      .then(() => UI.toast(`A reset link is on its way to ${e.email}.`))
      .catch(err => UI.toast('The email did not go: ' + err.message, 'bad'));
  };

  const del = document.getElementById('delUser');
  if(del) del.onclick = () => {
    if(SESSION && String(SESSION.email||'').toLowerCase() === wasEmail)
      return UI.toast('You cannot remove the account you are signed in with.', 'bad');
    const admins = rosterRows().filter(x => (DB.PERMS[x.role] || []).includes('settings'));
    if(admins.length === 1 && String(admins[0].email).toLowerCase() === wasEmail)
      return UI.toast('This is the only account that can administer — make another one first.', 'bad');
    UI.confirm(`Remove ${e.name}?`, () => {
      /* Off the roster, and the staff row deactivated. The auth account itself
         is not deleted from here: that is Supabase's to own, and a system that
         can silently destroy somebody's login from a settings screen is a
         system one misclick from locking the office out. */
      CLOUD.remove('roster', [wasEmail], 'email')
        .then(() => e.id
          ? CLOUD.rest(`staff?id=eq.${encodeURIComponent(e.id)}`,
              { method:'PATCH', headers:{ 'Prefer':'return=minimal' }, body:{ active:false } })
          : null)
        .then(() => DB.refreshFromCloud())
        .then(() => {
          DB.activity('Removed from the roster', e.name);
          UI.close(); UI.toast('Removed — they can no longer open the system.'); refresh();
        })
        .catch(err => UI.toast('That did not save: ' + err.message, 'bad'));
    }, { danger:true, yes:'Remove them',
         detail:'Their receipts and entries stay in the ledger — only the access goes. Their sign-in still exists in Supabase; it simply opens nothing here.' });
  };
}

/* Modes of payment. Each one needs an account to post to, or the cash figures
   stop meaning anything, so the account is a dropdown of real asset accounts
   rather than a free-text box. */
/* Expense categories — the 5xxx accounts a voucher can be charged to. The admin
   adds and renames them; deleting one is refused if anything was ever posted to
   it, because a voucher pointing at an account that no longer exists is a hole
   in the ledger. Training Center Fees cannot be removed at all: the system
   posts to it itself every time a seat is booked. */
function categoriesForm(){
  const cats = D().accounts.filter(a => a.type === 'Expense')
    .sort((a,b) => a.code.localeCompare(b.code));
  const used = code => D().journal.some(j => j.lines.some(l => l.account === code));
  const locked = code => DB.SYSTEM_ACCOUNTS.includes(code);

  UI.modal({
    title:'Expense categories', sub:'What a disbursement voucher can be charged to', wide:true,
    hideSubmit:true,
    footExtra:`<button type="button" class="btn btn-primary" id="addCat">+ Add category</button>`,
    body:`
      ${UI.table([
        { h:'Category', k:'name' },
        { h:'Vouchers', k:a => UI.int(D().expenses.filter(v => v.account === a.code).length), cls:'num' },
        { h:'Posted', k:a => { const t = D().journal.reduce((s,j) =>
              s + j.lines.filter(l => l.account === a.code).reduce((x,l) => x + l.debit - l.credit, 0), 0);
            return t ? UI.num(ACC.r2(t)) : '<span class="muted">—</span>'; }, cls:'num' },
        { h:'', k:a => `
            <button class="btn btn-ghost btn-xs" data-cat-edit="${a.code}">Rename</button>
            ${locked(a.code)
              ? '<span class="muted" style="font-size:11px">system</span>'
              : `<button class="btn btn-ghost btn-xs" data-cat-del="${a.code}">Delete</button>`}`, w:'150px' },
      ], cats, { empty:'No expense category yet.' })}
      <div class="note">A category with anything posted to it cannot be deleted — the
        ledger would be left pointing at nothing. Rename it instead.</div>`,
  });

  const root = document.getElementById('modalRoot');

  root.querySelectorAll('[data-cat-edit]').forEach(b => b.onclick = () => {
    const a = D().accounts.find(x => x.code === b.dataset.catEdit);
    UI.modal({
      title:'Rename category', sub:a.code,
      body:UI.f.text('name','Category name', a.name, { req:true }),
      submitLabel:'Save',
      onSubmit: fd => {
        const nm = (fd.name || '').trim();
        if(!nm){ UI.toast('Give the category a name.', 'bad'); return false; }
        a.name = nm;
        DB.activity('Renamed expense category', `${a.code} — ${nm}`);
        UI.toast('Category renamed.');
        DB.save(); render();
        setTimeout(categoriesForm, 0);
      }
    });
  });

  root.querySelectorAll('[data-cat-del]').forEach(b => b.onclick = () => {
    const code = b.dataset.catDel;
    const a = D().accounts.find(x => x.code === code);
    if(used(code)) return UI.toast(`${a.name} has entries posted to it and cannot be deleted.`, 'bad');
    UI.confirm(`Delete ${a.name}?`, () => {
      D().accounts = D().accounts.filter(x => x.code !== code);
      DB.activity('Deleted expense category', `${code} — ${a.name}`);
      DB.save(); UI.toast('Category deleted.'); render();
      setTimeout(categoriesForm, 0);
    }, { danger:true, yes:'Delete category',
         detail:'Nothing has been posted to it, so no entry is affected.' });
  });

  document.getElementById('addCat').onclick = () => {
    /* Next free code in the expense range, so the admin does not have to know
       the numbering scheme to add "Transport". */
    const taken = new Set(D().accounts.map(x => x.code));
    let next = 5100;
    while(taken.has(String(next)) && next < 5999) next += 10;
    UI.modal({
      title:'Add expense category',
      body:`
        ${UI.f.text('name','Category name', '', { req:true, ph:'e.g. Transport and delivery' })}
        <input type="hidden" name="code" value="${next}">
        <div class="note">Charged as an expense when a voucher naming it is approved.</div>`,
      submitLabel:'Add category',
      onSubmit: fd => {
        const code = String(fd.code || '').trim(), nm = (fd.name || '').trim();
        if(!/^5\d{3}$/.test(code)){ UI.toast('Use a code between 5000 and 5999.', 'bad'); return false; }
        if(taken.has(code)){ UI.toast(`${code} is already in the chart of accounts.`, 'bad'); return false; }
        if(!nm){ UI.toast('Give the category a name.', 'bad'); return false; }
        D().accounts.push({ code, name:nm, type:'Expense', nature:'debit' });
        D().accounts.sort((x,y) => x.code.localeCompare(y.code));
        DB.activity('Added expense category', `${code} — ${nm}`);
        DB.save(); UI.toast('Category added.'); render();
        setTimeout(categoriesForm, 0);
      }
    });
  };
}

/* One option per line, because these lists run to twenty-odd entries and a
   fixed number of boxes is the reason nobody could add the twenty-third. */
function listForm(key){
  const def = DB.LIST_DEFS.find(l => l.key === key);
  if(!def) return;
  UI.modal({
    title:def.label, sub:def.where, wide:true,
    body:`<div class="list-edit">${UI.f.area('items','One option per line', DB.list(key).join('\n'))}</div>
      <div class="note">They appear in the order you write them. Anything already saved on a
        record stays as it is — this changes what is offered from here on, not what has
        already been encoded.</div>`,
    submitLabel:'Save list',
    footExtra:`<button type="button" class="btn btn-ghost" data-act="reset-list"
                 data-id="${key}">Reset to default</button>`,
    onSubmit: fd => {
      const next = String(fd.items || '').split('\n').map(s => s.trim()).filter(Boolean);
      if(!next.length){ UI.toast('Keep at least one option, or reset it to the default.', 'bad'); return false; }
      const seen = new Set();
      const dupe = next.find(v => { const k = v.toLowerCase();
        if(seen.has(k)) return true; seen.add(k); return false; });
      if(dupe){ UI.toast(`"${dupe}" is on the list twice.`, 'bad'); return false; }
      D().company.lists = { ...(D().company.lists || {}), [key]:next };
      DB.activity('Updated list — ' + def.label, next.length + ' option(s)');
      UI.toast(`${def.label} updated — ${next.length} option(s).`);
      refresh();
    }
  });
}

function methodsForm(){
  const list = ACC.methods();
  const assets = D().accounts.filter(a => a.type === 'Asset')
    .map(a => ({ v:a.code, l:a.name }));
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
    'enr-today':     () => { state.q.enrDay = DB.today(); render(); },
    'enr-any':       () => { state.q.enrDay = ''; render(); },
    'view-enrollment':() => enrollmentModal(ENR(id)),
    'view-invoice':  () => invoiceModal(INV(id)),
    'new-payment':   () => paymentForm(null),
    'view-receipt':  () => receiptModal(PAY(id)),
    'receive-rebate':() => { ev.stopPropagation(); rebateReceiveForm(id); },
    'cancel-rebate': () => { ev.stopPropagation(); cancelRebateAsk(id); },
    'match-tender':  () => { ev.stopPropagation();
                       const [pid, i] = String(id).split(':');
                       const p = PAY(pid);
                       const t = p && p.tenders && p.tenders[i];
                       matchTender(id, !(t && t.cleared)); },
    'remind-pay':    () => { ev.stopPropagation(); reminderModal(id); },
    'new-expense':   () => expenseForm(),
    'new-payroll':   () => payrollForm(),
    'new-refund':    () => refundForm(),
    'refund-trainee':() => { ev.stopPropagation(); refundForm(id); },
    'approve-doc':   () => { const [k,i] = id.split(':');
                       UI.confirm('Approve this document?', () => approveDoc(k, i, true),
                         { yes:'Approve and post',
                           detail:'The journal entry is made now, dated today. This is the point at which the money counts as having left.' }); },
    'reject-doc':    () => { const [k,i] = id.split(':');
                       UI.confirm('Reject this document?', fd => approveDoc(k, i, false, fd.reason),
                         { danger:true, reason:true, yes:'Reject',
                           detail:'Nothing is posted. The document stays on file marked rejected.' }); },
    'change-booking':() => { ev.stopPropagation(); bookingChangeForm(ENR(id)); },
    'drop-line':     () => { ev.stopPropagation();
                       const e = ENR(id);
                       dropInvoiceLine(INV(e && e.invoiceId), id); },
    'void-booking':  () => { ev.stopPropagation(); voidBooking(ENR(id)); },
    'approve-change':() => UI.confirm('Approve this change to the booking?',
                       () => approveChange(id, true),
                       { yes:'Approve the change',
                         detail:'The booking is corrected now. Any bill already raised against it is not touched.' }),
    'reject-change': () => UI.confirm('Reject this change?', fd => approveChange(id, false, fd.reason),
                       { danger:true, reason:true, yes:'Reject',
                         detail:'The booking stays exactly as it is. The request stays on file marked rejected.' }),
    'pay-center':    () => centerVoucherForm(id),
    'paya-only':     () => { state.q.payaCenter = id; render(); },
    'payables-all':  () => { state.q.payaCenter = state.q.payaFrom = ''; render(); },
    'view-voucher':  () => voucherModal(D().expenses.find(v => v.id === id)),
    'view-expense':  () => expenseVoucherModal(D().expenses.find(v => v.id === id)),
    'void-voucher':  () => { ev.stopPropagation(); voidVoucherAsk(id); },
    'new-journal':   () => journalForm(),
    'edit-addons':   () => addonsForm(),
    'edit-methods':  () => methodsForm(),
    'edit-list':     () => listForm(id),
    'reset-list':    () => { const co = D().company;
                        if(co.lists) delete co.lists[id];
                        DB.save(); DB.activity('Reset list to default');
                        UI.toast('Reset to the built-in list.');
                        UI.close();
                        refresh(); },
    'edit-categories':() => categoriesForm(),
    'cash-count':    () => cashCountForm(id),
    'my-password':   () => myPasswordForm(),
    'new-user':      () => userForm(),
    'edit-user':     () => userForm(rosterRows().find(u => String(u.email).toLowerCase() === String(id).toLowerCase())),
    'ledger-tab':    () => { location.hash = '#/ledger/' + id; },
    'rep-tab':       () => { location.hash = '#/reports/' + id; },
    'acct-ledger':   () => { state.q.acct = id; location.hash = '#/ledger/account'; },
    'print':         () => UI.print(),
    'backup':        () => { DB.exportJSON(); UI.toast('Backup downloaded.'); },
    'restore':       () => document.getElementById('restoreFile').click(),
    'salvage':       () => { DB.downloadSalvaged(id)
                        ? UI.toast('Downloaded. Keep the file — it is the only copy.')
                        : UI.toast('That copy is no longer in this browser.', 'bad'); },
    /* Reset rather than blank. Wiping used to leave a store with no courses in
       it, which is not a fresh start — it is a system that cannot take a
       booking until somebody types 341 prices back in. */
    'wipe':          () => UI.confirm('Erase every record in this system?', () => {
                        DB.reset(true); UI.toast('All records erased. The price list is intact.');
                        location.hash = '#/dashboard'; render();
                      }, { danger:true, yes:'Erase everything',
                           detail:'Trainees, bookings, bills, receipts, vouchers and the entire journal will be deleted. The course price list, the chart of accounts, the staff accounts and the company profile stay. Download a backup first — this cannot be undone.' }),
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
  /* A date input fires input as each segment is typed, so the value is already
     stored by the time it loses focus. Re-rendering again on blur would swap
     the button out from under a mouse that is already pressing it, and the
     click would land on nothing — click reaches the nearest common ancestor of
     mousedown and mouseup, and the element it started on no longer exists. */
  if(state.q[el.dataset.q] === el.value) return;
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

document.getElementById('logoutBtn').onclick = async () => {
  const s = DB.cloudStatus();
  if(s.on && s.pending){
    if(!confirm('There is work that has not reached the server yet. Sign out anyway and risk losing it?')) return;
  }
  /* Reloading used to be the whole of signing out, which on a shared desk left
     the next person one refresh away from being you. */
  try{ await CLOUD.signOut(); }catch(e){}
  DB.disconnect();
  location.reload();
};
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
initSaveState();
initIdleTimeout();
initBuildWatch();
