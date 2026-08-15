/* register.js — the public registration portal.

   Four screens behind a hash router: home, course catalogue, the three-step
   application wizard, and the reference-code tracker. It shares db.js, ui.js and
   applications.js with the internal system, so an application submitted here is the
   same record the registrar opens in Admissions — no import step, no re-keying. */

const esc  = UI.esc, peso = UI.peso;
const CO   = () => DB.get().company;
const P    = { view:'home', step:1, draft:{}, errors:[], result:null, tracked:null, trackError:'' };

/* ---------- shared bits ---------- */
const courseOf = id => DB.get().courses.find(c => c.id === id);

function batchLine(b){
  const c = courseOf(b.courseId), s = APPS.seatsTaken(b);
  const low = s.free <= 3;
  return { c, s, low };
}

const backLink = (href, label) =>
  `<a class="btn btn-ghost btn-sm" href="${href}">&larr; ${esc(label)}</a>`;

/* ================= HOME ================= */
function viewHome(){
  const open = APPS.openBatches();
  const cats = [...new Set(DB.get().courses.filter(c => c.active).map(c => c.category))];

  return `
    <section class="p-hero">
      <h1>Train with a MARINA-accredited center.</h1>
      <p>Reserve a seat in any of our STCW basic, advanced, medical, security and
         simulator courses. Fill in the form once, keep your reference code, and our
         registrar will confirm your slot &mdash; no need to queue at the office to apply.</p>
      <div class="p-hero-acts">
        <a class="btn btn-accent" href="#/apply">Register for a course</a>
        <a class="btn btn-ghost" href="#/courses" style="background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.3)">View schedules</a>
      </div>
    </section>

    <div class="p-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      ${[['1','Choose your schedule','Pick a course and an open batch. Seats already claimed by other applicants are deducted live.'],
         ['2','Submit your details','Your SRN, SIRB and passport details go straight into your training record once approved.'],
         ['3','Keep your reference','You get a six-character code. Use it here to follow your application through to enrollment.']]
        .map(([n,h,t]) => `
        <div class="p-course">
          <div class="p-code">STEP ${n}</div>
          <h3>${esc(h)}</h3>
          <p class="muted" style="margin:0;font-size:12.5px">${esc(t)}</p>
        </div>`).join('')}
    </div>

    <div class="p-sec-head">
      <h2>Next open schedules</h2>
      <p>${open.length ? `${open.length} batch(es) currently accepting applications across ${cats.length} course categories.`
                       : 'No batches are open for online registration right now.'}</p>
    </div>
    ${open.length ? open.slice(0,5).map(b => {
      const { c, s, low } = batchLine(b);
      return `
        <div class="p-sched">
          <div class="p-when">${esc(c.code)} &mdash; ${esc(c.title)}
            <small>${UI.dateRange(b.start,b.end)} &middot; ${c.days} day(s) &middot; ${esc(b.room)}</small></div>
          <div class="p-seats">Seats left <b class="${low?'low':''}">${s.free}</b> of ${b.capacity}</div>
          <div class="p-seats">Fee <b style="color:var(--navy-800)">${peso(c.fee)}</b></div>
          <span class="spacer" style="flex:1"></span>
          <a class="btn btn-primary btn-sm" href="#/apply?batch=${b.id}">Apply for this batch</a>
        </div>`;
    }).join('') : `<div class="empty"><span class="big">&#9875;</span>Please check back soon, or call the registrar for the next schedule.</div>`}
  `;
}

/* ================= COURSES ================= */
function viewCourses(){
  const d = DB.get();
  const q = (P.q || '').toLowerCase();
  const courses = d.courses.filter(c => c.active &&
    (!q || [c.code,c.title,c.regulation,c.category].join(' ').toLowerCase().includes(q)));

  return `
    <div class="p-sec-head">
      <h2>Accredited courses and open schedules</h2>
      <p>Published rates are VAT-inclusive. Batches close once the last seat is claimed.</p>
    </div>
    <div class="toolbar" style="margin-bottom:16px">
      <input type="search" id="cq" value="${esc(P.q||'')}" placeholder="Search course, code or STCW reference…" style="min-width:280px">
      <span class="muted">${courses.length} course(s)</span>
    </div>
    <div class="p-grid">
      ${courses.map(c => {
        const bs = APPS.openBatches().filter(b => b.courseId === c.id);
        return `
        <div class="p-course">
          <div class="p-code">${esc(c.code)} &middot; ${esc(c.category)}</div>
          <h3>${esc(c.title)}</h3>
          <div class="p-reg">${esc(c.regulation)}</div>
          <div class="p-meta"><span>${c.days} training day(s)</span><span>${c.capacity} seats / batch</span></div>
          <div class="p-fee">${peso(c.fee)}<small>VAT-inclusive published rate</small></div>
          ${bs.length
            ? `<div style="font-size:12px;color:var(--ok);font-weight:600">${bs.length} open schedule(s)</div>
               <a class="btn btn-primary btn-sm" href="#/apply?batch=${bs[0].id}">Register</a>`
            : `<div style="font-size:12px;color:var(--muted)">No open schedule &mdash; call the registrar</div>`}
        </div>`;
      }).join('') || `<div class="empty">No course matches that search.</div>`}
    </div>
  `;
}

/* ================= WIZARD ================= */
const STEPS = ['Choose a schedule','Your details','Review and submit'];

function stepBar(){
  return `<div class="p-steps">${STEPS.map((s,i) => {
    const n = i + 1;
    return `<div class="p-step ${P.step===n?'on':''} ${P.step>n?'done':''}">
      <span class="n">${P.step>n?'&#10003;':n}</span>${esc(s)}</div>`;
  }).join('')}</div>`;
}

const err = f => P.errors.includes(f) ? 'bad' : '';

function viewApply(){
  if(P.result) return viewDone();
  return `<div class="p-narrow" style="margin:0 auto">
    ${stepBar()}
    <div class="p-panel">${[stepSchedule, stepDetails, stepReview][P.step-1]()}</div>
  </div>`;
}

/* ----- step 1 ----- */
function stepSchedule(){
  const open = APPS.openBatches();
  if(!open.length){
    return `<h2>Choose a schedule</h2>
      <p class="p-lead">Registration is temporarily closed.</p>
      <div class="empty"><span class="big">&#9875;</span>
        No batch is accepting online applications at the moment. Please call
        ${esc(CO().contact)} for the next schedule.</div>`;
  }

  const byCategory = {};
  open.forEach(b => {
    const c = courseOf(b.courseId);
    (byCategory[c.category] = byCategory[c.category] || []).push(b);
  });

  return `
    <h2>Choose a schedule</h2>
    <p class="p-lead">Select the batch you want to join. Seats shown are already net of
       applications waiting for approval.</p>
    ${P.errors.includes('batchId') ? `<div class="note warn">Please select a schedule to continue.</div>` : ''}
    ${Object.entries(byCategory).map(([cat, list]) => `
      <h4 style="margin:18px 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">${esc(cat)}</h4>
      ${list.map(b => {
        const { c, s, low } = batchLine(b);
        const on = P.draft.batchId === b.id;
        return `
          <label class="p-sched ${on?'chosen':''}" style="cursor:pointer">
            <input type="radio" name="batchId" value="${b.id}" ${on?'checked':''} style="width:auto;margin:0;flex:none">
            <div class="p-when">${esc(c.code)} &mdash; ${esc(c.title)}
              <small>${UI.dateRange(b.start,b.end)} &middot; ${esc(b.room)} &middot; ${esc(b.instructor)}</small></div>
            <span class="spacer" style="flex:1"></span>
            <div class="p-seats">Seats left <b class="${low?'low':''}">${s.free}</b> of ${b.capacity}</div>
            <div class="p-seats" style="min-width:auto"><b style="color:var(--navy-800)">${peso(c.fee)}</b></div>
          </label>`;
      }).join('')}
    `).join('')}
    <div class="p-acts">
      <a class="btn btn-ghost" href="#/courses">&larr; Back to courses</a>
      <button class="btn btn-primary" id="next1">Continue to my details &rarr;</button>
    </div>`;
}

/* ----- step 2 ----- */
function stepDetails(){
  const d = P.draft, b = APPS.batch(d.batchId), c = courseOf(b.courseId);
  const agencies = [...new Set(DB.get().trainees.map(t => t.agency).filter(Boolean))].sort();

  return `
    <h2>Your details</h2>
    <p class="p-lead">Applying for <b>${esc(c.code)} &mdash; ${esc(c.title)}</b>,
       ${UI.dateRange(b.start,b.end)}. Fields marked <span class="p-req">*</span> are required.</p>
    ${P.errors.length ? `<div class="note warn">Please complete the highlighted fields before continuing.</div>` : ''}
    <form id="detailForm" autocomplete="on">
      <h4 style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Personal information</h4>
      <div class="grid g3">
        <label class="fld ${err('last')}"><span>Surname <span class="p-req">*</span></span>
          <input name="last" value="${esc(d.last||'')}" required autocomplete="family-name"></label>
        <label class="fld ${err('first')}"><span>First name <span class="p-req">*</span></span>
          <input name="first" value="${esc(d.first||'')}" required autocomplete="given-name"></label>
        <label class="fld"><span>Middle name</span>
          <input name="middle" value="${esc(d.middle||'')}" autocomplete="additional-name"></label>
      </div>
      <div class="grid g3">
        <label class="fld"><span>Sex</span>
          <select name="sex">
            <option value="M" ${d.sex!=='F'?'selected':''}>Male</option>
            <option value="F" ${d.sex==='F'?'selected':''}>Female</option>
          </select></label>
        <label class="fld ${err('birth')}"><span>Date of birth <span class="p-req">*</span></span>
          <input type="date" name="birth" value="${esc(d.birth||'')}" max="${DB.today()}" required></label>
        <label class="fld ${err('rank')}"><span>Rank / position <span class="p-req">*</span></span>
          <input name="rank" value="${esc(d.rank||'')}" placeholder="e.g. Able Seaman" required></label>
      </div>

      <div class="hr"></div>
      <h4 style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Seafarer documents</h4>
      <p class="muted" style="margin:-4px 0 12px;font-size:12px">Leave blank if you do not have one yet &mdash;
         the registrar will ask for it before the first training day.</p>
      <div class="grid g3">
        <label class="fld"><span>SRN <small>Seafarer Registration No.</small></span>
          <input name="srn" value="${esc(d.srn||'')}"></label>
        <label class="fld"><span>SIRB No.</span>
          <input name="sirb" value="${esc(d.sirb||'')}"></label>
        <label class="fld"><span>Passport No.</span>
          <input name="passport" value="${esc(d.passport||'')}"></label>
      </div>

      <div class="hr"></div>
      <h4 style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Contact and billing</h4>
      <div class="grid g2">
        <label class="fld ${err('mobile')}"><span>Mobile no. <span class="p-req">*</span></span>
          <input name="mobile" value="${esc(d.mobile||'')}" placeholder="09XX XXX XXXX" required autocomplete="tel"></label>
        <label class="fld ${err('email')}"><span>Email address</span>
          <input type="email" name="email" value="${esc(d.email||'')}" autocomplete="email"></label>
      </div>
      <label class="fld"><span>Home address</span>
        <input name="address" value="${esc(d.address||'')}" autocomplete="street-address"></label>
      <div class="grid g2">
        <label class="fld"><span>Manning agency <small>if any</small></span>
          <input name="agency" list="agencyList" value="${esc(d.agency||'')}" placeholder="Direct hire / walk-in">
          <datalist id="agencyList">${agencies.map(a => `<option value="${esc(a)}">`).join('')}</datalist></label>
        <label class="fld"><span>Who is paying the training fee?</span>
          <select name="payer">
            <option value="Self-paid"     ${d.payer!=='Agency-billed'?'selected':''}>I will pay for it myself</option>
            <option value="Agency-billed" ${d.payer==='Agency-billed'?'selected':''}>My manning agency will pay</option>
          </select></label>
      </div>
      <label class="fld"><span>Anything the registrar should know?</span>
        <textarea name="remarks" placeholder="Optional — dietary needs, medical conditions, preferred contact time…">${esc(d.remarks||'')}</textarea></label>
    </form>
    <div class="p-acts">
      <button class="btn btn-ghost" id="back2">&larr; Back</button>
      <button class="btn btn-primary" id="next2">Review my application &rarr;</button>
    </div>`;
}

/* ----- step 3 ----- */
function stepReview(){
  const d = P.draft, b = APPS.batch(d.batchId), c = courseOf(b.courseId);
  const t = ACC.computeInvoice([{ qty:1, price:c.fee }], 0);

  const line = (k,v) => `<dt>${esc(k)}</dt><dd>${v || '<span class="muted">Not provided</span>'}</dd>`;

  return `
    <h2>Review and submit</h2>
    <p class="p-lead">Check your details carefully. Once submitted, changes have to go
       through the registrar.</p>

    <div class="note">
      <b>${esc(c.code)} &mdash; ${esc(c.title)}</b><br>
      ${UI.dateRange(b.start,b.end)} &middot; ${c.days} training day(s) &middot; ${esc(b.room)} &middot; Instructor ${esc(b.instructor)}
    </div>

    <div class="p-review">
      <dl class="def">
        ${line('Name', esc(`${d.last}, ${d.first} ${d.middle||''}`.trim()))}
        ${line('Sex / Birthdate', `${d.sex==='F'?'Female':'Male'} &middot; ${UI.date(d.birth)}`)}
        ${line('Rank / position', esc(d.rank))}
        ${line('Manning agency', esc(d.agency))}
        ${line('Fee to be billed to', esc(d.payer||'Self-paid'))}
      </dl>
      <dl class="def">
        ${line('SRN', `<span class="mono">${esc(d.srn||'')}</span>`)}
        ${line('SIRB', `<span class="mono">${esc(d.sirb||'')}</span>`)}
        ${line('Passport', `<span class="mono">${esc(d.passport||'')}</span>`)}
        ${line('Mobile', esc(d.mobile))}
        ${line('Email', esc(d.email))}
      </dl>
    </div>
    ${d.address ? `<dl class="def">${line('Address', esc(d.address))}</dl>` : ''}
    ${d.remarks ? `<dl class="def">${line('Remarks', esc(d.remarks))}</dl>` : ''}

    <div class="hr"></div>
    <div style="display:flex;justify-content:flex-end">
      <table style="width:340px">
        <tr><td>Published course fee</td><td class="num">${UI.num(t.subtotal)}</td></tr>
        <tr><td>VAT-able amount</td><td class="num">${UI.num(t.net)}</td></tr>
        <tr><td>VAT (${CO().vatRate}%)</td><td class="num">${UI.num(t.vat)}</td></tr>
        <tr><td style="font-weight:700;border-top:2px solid var(--border-strong)">Estimated amount due</td>
            <td class="num" style="font-weight:700;font-size:15px;border-top:2px solid var(--border-strong)">${peso(t.total)}</td></tr>
      </table>
    </div>
    <div class="note warn" style="margin-top:14px">
      This is an <b>estimate of the course fee only</b>. Training kits, assessment fees,
      ID processing and insurance are added by the registrar when your enrollment is
      confirmed. Your official invoice is issued at that point &mdash; not now. No payment
      is collected through this website.
    </div>

    ${P.errors.includes('duplicate') ? `<div class="note bad">You already have an application waiting for this batch. Track it instead using your reference code.</div>` : ''}
    ${P.errors.includes('batchFull') ? `<div class="note bad">The last seat on this batch was taken while you were filling in the form. Please go back and pick another schedule.</div>` : ''}

    <label style="display:flex;gap:9px;align-items:flex-start;margin-top:16px;font-size:12.5px;cursor:pointer">
      <input type="checkbox" id="consent" style="width:auto;margin:2px 0 0;flex:none">
      <span>I certify that the information above is true and correct, and I allow
        ${esc(CO().name)} to process it for enrollment, billing and regulatory reporting.</span>
    </label>

    <div class="p-acts">
      <button class="btn btn-ghost" id="back3">&larr; Back</button>
      <button class="btn btn-accent" id="submitApp">Submit application</button>
    </div>`;
}

/* ----- confirmation ----- */
function viewDone(){
  const a = P.result, b = APPS.batch(a.batchId), c = courseOf(a.courseId);
  return `<div class="p-narrow" style="margin:0 auto">
    <div class="p-panel" style="text-align:center;margin-bottom:18px">
      <div class="p-ok-mark">&#10003;</div>
      <h2 style="margin:0 0 6px">Application received</h2>
      <p class="p-lead" style="margin:0">Keep the reference code below. You will need it,
         together with your surname, to check your status.</p>
      <div style="margin:20px 0 6px"><span class="p-ref">${esc(a.ref)}</span></div>
      <p class="muted" style="font-size:12px;margin:0">Application no. <span class="mono">${esc(a.no)}</span></p>
    </div>

    <div class="p-slip" id="slip">
      <div class="p-slip-head">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--navy-800)">${esc(CO().name)}</div>
          <div class="muted" style="font-size:12px">${esc(CO().address)}</div>
          <div class="muted" style="font-size:12px">${esc(CO().accreditation)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;letter-spacing:.14em;color:var(--muted)">ACKNOWLEDGEMENT</div>
          <div class="mono" style="font-size:15px;font-weight:700">${esc(a.no)}</div>
          <div class="muted" style="font-size:12px">${UI.date(a.submitted)}</div>
        </div>
      </div>
      <div class="p-review">
        <dl class="def">
          <dt>Applicant</dt><dd><b>${esc(APPS.forName(a))}</b></dd>
          <dt>Rank / position</dt><dd>${esc(a.rank)}</dd>
          <dt>Manning agency</dt><dd>${esc(a.agency || 'Direct hire / walk-in')}</dd>
          <dt>Mobile</dt><dd>${esc(a.mobile)}</dd>
        </dl>
        <dl class="def">
          <dt>Course</dt><dd><b>${esc(c.code)}</b> &mdash; ${esc(c.title)}</dd>
          <dt>Schedule</dt><dd>${UI.dateRange(b.start,b.end)}</dd>
          <dt>Reference code</dt><dd class="mono"><b>${esc(a.ref)}</b></dd>
          <dt>Status</dt><dd>${UI.statusTag('Submitted')}</dd>
        </dl>
      </div>
      <div class="note" style="margin-top:14px;margin-bottom:0">
        <b>What happens next.</b> The registrar reviews your application, usually within
        one working day. You will be contacted on the mobile number above to confirm your
        seat and settle the fee. Bring this slip and your original SIRB, passport and SRN
        on your first training day. <b>This slip is not an official receipt.</b>
      </div>
    </div>

    <div class="p-acts no-print">
      <a class="btn btn-ghost" href="#/track?ref=${encodeURIComponent(a.ref)}">Track this application</a>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" id="printSlip">Print slip</button>
        <button class="btn btn-primary" id="another">Register another course</button>
      </div>
    </div>
  </div>`;
}

/* ================= TRACKER ================= */
const STAGE_ORDER = ['Submitted','Under Review','Approved','Enrolled'];

function viewTrack(){
  const a = P.tracked;
  return `<div class="p-narrow" style="margin:0 auto">
    <div class="p-panel">
      <h2>Track your application</h2>
      <p class="p-lead">Enter the six-character reference code from your acknowledgement
         slip, together with your surname.</p>
      <form id="trackForm">
        <div class="grid g2">
          <label class="fld"><span>Reference code</span>
            <input name="ref" value="${esc(P.trackRef||'')}" maxlength="6" placeholder="e.g. K7QX2M"
                   style="text-transform:uppercase;font-family:var(--mono);letter-spacing:.14em" required></label>
          <label class="fld"><span>Surname</span>
            <input name="surname" value="${esc(P.trackSurname||'')}" placeholder="As written on your application" required></label>
        </div>
        <button class="btn btn-primary" type="submit">Check status</button>
      </form>
      ${P.trackError ? `<div class="note bad" style="margin-top:16px">${esc(P.trackError)}</div>` : ''}
    </div>
    ${a ? trackResult(a) : ''}
  </div>`;
}

function trackResult(a){
  const b = APPS.batch(a.batchId), c = courseOf(a.courseId);
  const reached = STAGE_ORDER.indexOf(a.status);

  const stages = STAGE_ORDER.map((s,i) => {
    const evt = a.history.find(h => h.status === s);
    const hit = evt || (reached >= 0 && i <= reached);
    return `<li class="${hit?'hit':''}">
      <div class="t-what">${esc(s)}</div>
      <div class="t-when">${evt ? UI.date(evt.ts.slice(0,10)) : 'Pending'}</div>
      ${evt && evt.note ? `<div class="t-note">${esc(evt.note)}</div>` : ''}
    </li>`;
  }).join('');

  const closed = a.status === 'Rejected' || a.status === 'Withdrawn';
  const closedNote = closed
    ? `<li class="hit"><div class="t-what" style="color:var(--bad)">${esc(a.status)}</div>
         <div class="t-when">${UI.date(a.decidedOn)}</div>
         ${a.reason ? `<div class="t-note">${esc(a.reason)}</div>` : ''}</li>`
    : '';

  return `
    <div class="p-panel" style="margin-top:18px">
      <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start">
        <div>
          <h2 style="margin:0">${esc(APPS.forName(a))}</h2>
          <p class="p-lead" style="margin:4px 0 0">
            <span class="mono">${esc(a.no)}</span> &middot; submitted ${UI.date(a.submitted)}
            &middot; ${APPS.ageDays(a)} day(s) ago</p>
        </div>
        <div>${UI.statusTag(a.status)}</div>
      </div>
      <div class="hr"></div>
      <dl class="def">
        <dt>Course</dt><dd><b>${esc(c.code)}</b> &mdash; ${esc(c.title)}</dd>
        <dt>Schedule</dt><dd>${UI.dateRange(b.start,b.end)} &middot; ${esc(b.room)}</dd>
      </dl>
      <div class="hr"></div>
      <h4 style="margin:0 0 14px;font-size:13px">Progress</h4>
      <ul class="p-time">${closed ? closedNote : stages}</ul>
      ${a.status === 'Enrolled'
        ? `<div class="note ok" style="margin-bottom:0"><b>You are enrolled.</b> Your official
             invoice and receipt are handled at the cashier's window. Bring your original
             documents on the first training day.</div>`
        : a.status === 'Rejected'
        ? `<div class="note bad" style="margin-bottom:0">Please contact the registrar at
             ${esc(CO().contact)} if you would like to re-apply.</div>`
        : closed ? ''
        : `<div class="note" style="margin-bottom:0">The registrar will call you on
             <b>${esc(a.mobile)}</b> once a decision is made. Applications are normally
             reviewed within one working day.</div>`}
    </div>`;
}

/* ================= ROUTER ================= */
function parseHash(){
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, query] = raw.split('?');
  const params = new URLSearchParams(query || '');
  return { path:path || 'home', params };
}

function render(){
  const { path, params } = parseHash();
  const known = ['home','courses','apply','track'];
  P.view = known.includes(path) ? path : 'home';

  if(P.view === 'apply' && params.get('batch')){
    P.draft.batchId = params.get('batch');
    P.result = null;
    if(P.step === 1) P.step = 1;
  }
  if(P.view === 'track' && params.get('ref')) P.trackRef = params.get('ref');

  document.querySelectorAll('[data-p]').forEach(a =>
    a.classList.toggle('active', a.dataset.p === P.view));

  document.getElementById('pView').innerHTML =
    ({ home:viewHome, courses:viewCourses, apply:viewApply, track:viewTrack })[P.view]();

  wire();
  window.scrollTo(0,0);
}

/* Collect step 2 into the draft without validating — so Back never loses typing. */
function captureDetails(){
  const form = document.getElementById('detailForm');
  if(!form) return;
  Object.assign(P.draft, Object.fromEntries(new FormData(form).entries()));
}

function wire(){
  const on = (id, ev, fn) => { const el = document.getElementById(id); if(el) el[ev] = fn; };

  /* step 1 */
  document.querySelectorAll('input[name="batchId"]').forEach(r => r.onchange = () => {
    P.draft.batchId = r.value; P.errors = []; render();
  });
  on('next1','onclick', () => {
    if(!P.draft.batchId){ P.errors = ['batchId']; return render(); }
    P.errors = []; P.step = 2; render();
  });

  /* step 2 */
  on('back2','onclick', () => { captureDetails(); P.step = 1; P.errors = []; render(); });
  on('next2','onclick', () => {
    captureDetails();
    P.errors = APPS.validate(P.draft).filter(e => e !== 'duplicate' && e !== 'batchFull');
    if(P.errors.length) return render();
    P.step = 3; render();
  });

  /* step 3 */
  on('back3','onclick', () => { P.step = 2; P.errors = []; render(); });
  on('submitApp','onclick', () => {
    if(!document.getElementById('consent').checked)
      return UI.toast('Please tick the certification box before submitting.', 'bad');
    try{
      P.result = APPS.submit(P.draft);
      P.errors = [];
      UI.toast('Application submitted — reference ' + P.result.ref);
      render();
    }catch(e){
      P.errors = e.errors || [];
      if(!P.errors.length) UI.toast(e.message, 'bad');
      render();
    }
  });

  /* confirmation */
  on('printSlip','onclick', () => window.print());
  on('another','onclick', () => {
    const keep = (({ last,first,middle,sex,birth,srn,sirb,passport,rank,agency,mobile,email,address,payer }) =>
      ({ last,first,middle,sex,birth,srn,sirb,passport,rank,agency,mobile,email,address,payer }))(P.result);
    P.result = null; P.draft = keep; P.step = 1; P.errors = [];
    location.hash = '#/apply';
    render();
  });

  /* courses search */
  const cq = document.getElementById('cq');
  if(cq) cq.oninput = () => {
    P.q = cq.value;
    const pos = cq.selectionStart;
    render();
    const again = document.getElementById('cq');
    if(again){ again.focus(); try{ again.setSelectionRange(pos,pos); }catch(e){} }
  };

  /* tracker */
  const tf = document.getElementById('trackForm');
  if(tf) tf.onsubmit = e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(tf).entries());
    P.trackRef = fd.ref; P.trackSurname = fd.surname;
    DB.reload();
    const hit = APPS.track(fd.ref, fd.surname);
    P.tracked = hit;
    P.trackError = hit ? '' :
      'We could not find an application with that reference code and surname. Check the code on your slip, or call the registrar for help.';
    render();
  };
}

/* ---------- boot ---------- */
function fillFooter(){
  const c = CO();
  document.getElementById('fName').textContent    = c.name;
  document.getElementById('fAddr').textContent    = c.address;
  document.getElementById('fContact').textContent = c.contact;
  document.getElementById('fAcc').textContent     = c.accreditation;
  document.getElementById('fTin').textContent     = 'TIN ' + c.tin;
}

window.addEventListener('hashchange', render);
/* Another tab (the registrar's) changed the shared store — refresh what we show. */
window.addEventListener('storage', e => { if(e.key === 'tbm_is_v1'){ DB.reload(); render(); } });

DB.load();
fillFooter();
render();
