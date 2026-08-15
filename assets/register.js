/* register.js — the Tara Barko Maritime public registration portal.

   Two navigation tabs only: Courses and Enroll Now. Track Enrollment lives
   inside Enroll Now as a sub-tab, because tracking is part of the registration
   journey rather than a separate destination — an applicant looking for it has
   already registered, and looks where they registered.

   Routes
     #/courses            catalogue and open schedules (the landing view)
     #/enroll             the three-step application wizard
     #/enroll/track       track an existing application by reference code

   Shares db.js, ui.js, accounting.js and applications.js with the internal
   system, so an application submitted here is the same record the registrar
   opens in Admissions — no import step, no re-keying. */

const esc  = UI.esc, peso = UI.peso;
const CO   = () => DB.get().company;

const P = {
  view:'courses', tab:'apply', step:1,
  draft:{}, errors:[], result:null,
  tracked:null, trackRef:'', trackSurname:'', trackError:'', q:'',
};

const courseOf = id => DB.get().courses.find(c => c.id === id);

/* ================= COURSES ================= */
function viewCourses(){
  const d = DB.get();
  const q = (P.q || '').toLowerCase();
  const open = APPS.openBatches();
  const courses = d.courses.filter(c => c.active &&
    (!q || [c.code, c.title, c.mode].join(' ').toLowerCase().includes(q)));

  return `
    <section class="p-hero">
      <div class="p-hero-text">
        <span class="p-eyebrow">MARINA &amp; STCW accredited</span>
        <h1>Train with Tara Barko Maritime.</h1>
        <p>Basic safety, advanced safety, medical, security and simulator courses for
           Filipino seafarers. Reserve your seat online, keep your reference code, and
           settle the fee at our office — no need to queue just to apply.</p>
        <div class="p-hero-acts">
          <a class="btn btn-accent btn-lg" href="#/enroll">Enroll now</a>
          <a class="btn btn-onblue btn-lg" href="#/enroll/track">Track my enrollment</a>
        </div>
      </div>
      <div class="p-hero-stats">
        <div><b>${d.courses.filter(c => c.active).length}</b><span>accredited courses</span></div>
        <div><b>${open.length}</b><span>open schedules</span></div>
        <div><b>${open.reduce((s,b) => s + APPS.seatsTaken(b).free, 0)}</b><span>seats available</span></div>
      </div>
    </section>

    <div class="p-sec-head">
      <h2>Open schedules</h2>
      <p>${open.length ? 'Seats shown are already net of applications waiting for approval.'
                       : 'No batch is accepting online registration right now.'}</p>
    </div>
    ${open.length ? open.map(b => {
      const c = courseOf(b.courseId), s = APPS.seatsTaken(b), low = s.free <= 3;
      return `
        <div class="p-sched">
          <div class="p-when">${esc(c.title)}
            <small>${UI.dateRange(b.start,b.end)} &middot; ${esc(b.center)} &middot; ${esc(b.room)}</small></div>
          <span class="p-flex"></span>
          <div class="p-seats">Seats left <b class="${low?'low':''}">${s.free}</b> of ${b.capacity}</div>
          <div class="p-seats p-seats-fee"><b>${peso(b.fee)}</b></div>
          <a class="btn btn-accent btn-sm" href="#/enroll?batch=${b.id}">Enroll</a>
        </div>`;
    }).join('') : `<div class="empty"><span class="big">&#9875;</span>
        Please check back soon, or call the registrar at ${esc(CO().contact)}.</div>`}

    <div class="p-sec-head">
      <h2>Course catalogue</h2>
      <p>${d.courses.filter(c => c.active).length} accredited courses. Fees depend on the
         training center and the schedule &mdash; ask the registrar for a quotation.</p>
    </div>
    <div class="toolbar" style="margin-bottom:14px">
      <input type="search" id="cq" value="${esc(P.q||'')}"
             placeholder="Search course title or code…" style="min-width:300px">
      <span class="muted">${courses.length} course(s)</span>
    </div>
    <div class="p-cat">
      ${courses.map(c => `
        <div class="p-cat-row">
          <div class="p-cat-title">${esc(c.title)}${c.mode ? ` <span class="p-mode">${esc(c.mode)}</span>` : ''}</div>
          <div class="p-cat-dur">${esc(c.duration || 'Duration to be confirmed')}${c.note ? ` <span class="p-mode">${esc(c.note)}</span>` : ''}</div>
        </div>`).join('') || `<div class="empty">No course matches that search.</div>`}
    </div>`;
}

/* ================= ENROLL NOW ================= */
/* Two sub-tabs. Tracking is part of registration, not a separate destination. */
function viewEnroll(){
  const seg = `
    <div class="p-seg" role="tablist">
      <a class="p-seg-btn ${P.tab==='apply'?'on':''}" href="#/enroll"       role="tab">New Enrollment</a>
      <a class="p-seg-btn ${P.tab==='track'?'on':''}" href="#/enroll/track" role="tab">Track Enrollment</a>
    </div>`;

  const body = P.tab === 'track' ? paneTrack()
             : P.result ? paneDone()
             : `${stepBar()}<div class="p-panel">${[stepSchedule, stepDetails, stepReview][P.step-1]()}</div>`;

  return `<div class="p-narrow">
    <div class="p-sec-head p-sec-center">
      <h2>${P.tab === 'track' ? 'Track your enrollment' : 'Enroll now'}</h2>
      <p>${P.tab === 'track'
            ? 'Enter the reference code from your acknowledgement slip.'
            : 'Three steps. It takes about four minutes.'}</p>
    </div>
    ${seg}
    ${body}
  </div>`;
}

/* ----- wizard chrome ----- */
const STEPS = ['Choose a schedule','Your details','Review and submit'];

function stepBar(){
  return `<div class="p-steps">${STEPS.map((s,i) => {
    const n = i + 1;
    return `<div class="p-step ${P.step===n?'on':''} ${P.step>n?'done':''}">
      <span class="n">${P.step>n?'&#10003;':n}</span><span class="l">${esc(s)}</span></div>`;
  }).join('')}</div>`;
}

const bad = f => P.errors.includes(f) ? 'bad' : '';
const req = `<span class="p-req">*</span>`;

/* ----- step 1 · schedule ----- */
function stepSchedule(){
  const open = APPS.openBatches();
  if(!open.length){
    return `<h2>Choose a schedule</h2>
      <p class="p-lead">Online registration is temporarily closed.</p>
      <div class="empty"><span class="big">&#9875;</span>
        No batch is accepting applications at the moment. Please call
        ${esc(CO().contact)} for the next schedule.</div>`;
  }

  const byCategory = {};
  open.forEach(b => {
    const c = courseOf(b.courseId);
    (byCategory[b.center] = byCategory[b.center] || []).push(b);
  });

  return `
    <h2>Choose a schedule</h2>
    <p class="p-lead">Select the batch you want to join.</p>
    ${P.errors.includes('batchId') ? `<div class="note warn">Please select a schedule to continue.</div>` : ''}
    ${Object.entries(byCategory).map(([cat, list]) => `
      <h4 class="p-group">${esc(cat)}</h4>
      ${list.map(b => {
        const c = courseOf(b.courseId), s = APPS.seatsTaken(b), low = s.free <= 3;
        const on = P.draft.batchId === b.id;
        return `
          <label class="p-sched p-pick ${on?'chosen':''}">
            <input type="radio" name="batchId" value="${b.id}" ${on?'checked':''}>
            <div class="p-when">${esc(c.title)}
              <small>${UI.dateRange(b.start,b.end)} &middot; ${esc(c.duration || '')} &middot; ${esc(b.room)}</small></div>
            <span class="p-flex"></span>
            <div class="p-seats">Seats left <b class="${low?'low':''}">${s.free}</b> of ${b.capacity}</div>
            <div class="p-seats p-seats-fee"><b>${peso(b.fee)}</b></div>
          </label>`;
      }).join('')}
    `).join('')}
    <div class="p-acts">
      <a class="btn btn-ghost" href="#/courses">&larr; Back to courses</a>
      <button class="btn btn-accent" id="next1">Continue &rarr;</button>
    </div>`;
}

/* ----- step 2 · details ----- */
function stepDetails(){
  const d = P.draft, b = APPS.batch(d.batchId), c = courseOf(b.courseId);
  const agencies = [...new Set(DB.get().trainees.map(t => t.agency).filter(Boolean))].sort();
  const ranks = ['Master','Chief Mate','2nd Officer','3rd Officer','Deck Cadet','Bosun',
    'Able Seaman','Ordinary Seaman','Chief Engineer','2nd Engineer','3rd Engineer',
    '4th Engineer','Engine Cadet','Oiler','Fitter','Electrician','Pumpman','Chief Cook',
    'Messman','Steward','Laundryman','Radio Officer'];

  const F = (n, label, opts = {}) => {
    const v = esc(d[n] || '');
    const attrs = `name="${n}" value="${v}" ${opts.req?'required':''} ${opts.attr||''}
                   placeholder="${esc(opts.ph||'')}" ${opts.list?`list="${opts.list}"`:''}`;
    return `<label class="fld ${bad(n)}">
      <span>${esc(label)} ${opts.req?req:''} ${opts.hint?`<small>${esc(opts.hint)}</small>`:''}</span>
      <input type="${opts.type||'text'}" ${attrs}></label>`;
  };

  return `
    <h2>Your details</h2>
    <p class="p-lead">Applying for <b>${esc(c.title)}</b>,
       ${UI.dateRange(b.start,b.end)} at ${esc(b.center)}. Fields marked ${req} are required.</p>
    ${P.errors.length ? `<div class="note warn">
       <b>Please check the highlighted fields.</b>
       ${[...new Set(P.errors)].map(e => APPS.LABELS[e]).filter(Boolean).slice(0,6).join(' &middot; ')}
     </div>` : ''}

    <form id="detailForm" autocomplete="on">

      <h4 class="p-group">Seafarer identity</h4>
      ${F('srn','SRN', { req:true, hint:'Seafarer Registration Number', ph:'e.g. SRN-123456' })}
      <div class="grid g2">
        ${F('last','Last name',   { req:true, attr:'autocomplete="family-name"' })}
        ${F('first','First name', { req:true, attr:'autocomplete="given-name"' })}
      </div>
      <div class="grid g2">
        ${F('middle','Middle name', { attr:'autocomplete="additional-name"' })}
        <label class="fld"><span>Suffix <small>if any</small></span>
          <select name="suffix">
            ${['','Jr.','Sr.','II','III','IV','V'].map(s =>
              `<option value="${s}" ${d.suffix===s?'selected':''}>${s || '— none —'}</option>`).join('')}
          </select></label>
      </div>

      <h4 class="p-group">Personal information</h4>
      <div class="grid g3">
        <label class="fld"><span>Sex</span>
          <select name="sex">
            <option value="M" ${d.sex!=='F'?'selected':''}>Male</option>
            <option value="F" ${d.sex==='F'?'selected':''}>Female</option>
          </select></label>
        ${F('birth','Date of birth', { req:true, type:'date', attr:`max="${DB.today()}"` })}
        ${F('birthPlace','Place of birth', { req:true, ph:'City / municipality, province' })}
      </div>
      <div class="grid g2">
        ${F('sirb','SIRB number', { hint:'optional' })}
        ${F('passport','Passport number', { hint:'optional' })}
      </div>

      <h4 class="p-group">Contact details</h4>
      <div class="grid g2">
        ${F('mobile','Mobile number', { req:true, type:'tel', ph:'09XX XXX XXXX', attr:'autocomplete="tel"' })}
        ${F('email','Email address',  { req:true, type:'email', attr:'autocomplete="email"' })}
      </div>
      ${F('address','Home address', { req:true, ph:'House/unit, street, barangay, city, province',
                                      attr:'autocomplete="street-address"' })}

      <h4 class="p-group">Employment</h4>
      <div class="grid g2">
        ${F('rank','Rank / position', { req:true, list:'rankList', ph:'e.g. Able Seaman' })}
        ${F('agency','Company', { req:true, list:'agencyList',
                                  hint:'manning agency or employer', ph:'Direct hire / walk-in' })}
      </div>
      <label class="fld"><span>Who is paying the training fee?</span>
        <select name="payer">
          <option value="Self-paid"     ${d.payer!=='Agency-billed'?'selected':''}>I will pay for it myself</option>
          <option value="Agency-billed" ${d.payer==='Agency-billed'?'selected':''}>My company will pay</option>
        </select></label>
      <datalist id="rankList">${ranks.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
      <datalist id="agencyList">${agencies.map(a => `<option value="${esc(a)}">`).join('')}</datalist>

      <h4 class="p-group">In case of emergency</h4>
      <p class="p-note-inline">Required before you may join any practical or sea-survival exercise.</p>
      <div class="grid g3">
        ${F('emergencyName','Contact person', { req:true, ph:'Full name' })}
        ${F('emergencyRelation','Relationship', { ph:'e.g. Spouse, Parent' })}
        ${F('emergencyMobile','Contact number', { req:true, type:'tel', ph:'09XX XXX XXXX' })}
      </div>

      <h4 class="p-group">Anything else?</h4>
      <label class="fld"><span>Notes for the registrar <small>optional</small></span>
        <textarea name="remarks" placeholder="Dietary needs, medical conditions, preferred contact time…">${esc(d.remarks||'')}</textarea></label>
    </form>

    <div class="p-acts">
      <button class="btn btn-ghost" id="back2">&larr; Back</button>
      <button class="btn btn-accent" id="next2">Review &rarr;</button>
    </div>`;
}

/* ----- step 3 · review ----- */
function stepReview(){
  const d = P.draft, b = APPS.batch(d.batchId), c = courseOf(b.courseId);
  const t = ACC.computeInvoice([{ qty:1, price:b.fee }], 0);
  const L = (k,v) => `<dt>${esc(k)}</dt><dd>${v || '<span class="muted">Not provided</span>'}</dd>`;
  const full = `${d.last}${d.suffix ? ' ' + d.suffix : ''}, ${d.first} ${d.middle || ''}`.trim();

  return `
    <h2>Review and submit</h2>
    <p class="p-lead">Check your details carefully. After submitting, changes have to go
       through the registrar.</p>

    <div class="note">
      <b>${esc(c.title)}</b><br>
      ${UI.dateRange(b.start,b.end)} &middot; ${esc(c.duration || '')} &middot;
      ${esc(b.center)} &middot; ${esc(b.room)} &middot; Instructor ${esc(b.instructor)}
    </div>

    <h4 class="p-group">Seafarer identity</h4>
    <div class="p-review">
      <dl class="def">${L('SRN', `<span class="mono">${esc(d.srn)}</span>`)}${L('Name', esc(full))}</dl>
      <dl class="def">${L('SIRB', `<span class="mono">${esc(d.sirb||'')}</span>`)}${L('Passport', `<span class="mono">${esc(d.passport||'')}</span>`)}</dl>
    </div>

    <h4 class="p-group">Personal and contact</h4>
    <div class="p-review">
      <dl class="def">
        ${L('Sex', d.sex==='F'?'Female':'Male')}
        ${L('Date of birth', UI.date(d.birth))}
        ${L('Place of birth', esc(d.birthPlace))}
      </dl>
      <dl class="def">
        ${L('Mobile', esc(d.mobile))}
        ${L('Email', esc(d.email))}
        ${L('Address', esc(d.address))}
      </dl>
    </div>

    <h4 class="p-group">Employment and emergency contact</h4>
    <div class="p-review">
      <dl class="def">
        ${L('Rank / position', esc(d.rank))}
        ${L('Company', esc(d.agency))}
        ${L('Fee billed to', esc(d.payer || 'Self-paid'))}
      </dl>
      <dl class="def">
        ${L('Contact person', esc(d.emergencyName))}
        ${L('Relationship', esc(d.emergencyRelation))}
        ${L('Contact number', esc(d.emergencyMobile))}
      </dl>
    </div>
    ${d.remarks ? `<dl class="def">${L('Notes', esc(d.remarks))}</dl>` : ''}

    <div class="hr"></div>
    <div class="p-total">
      <table>
        <tr><td>Published course fee</td><td class="num">${UI.num(t.subtotal)}</td></tr>
        <tr><td>VAT-able amount</td><td class="num">${UI.num(t.net)}</td></tr>
        <tr><td>VAT (${CO().vatRate}%)</td><td class="num">${UI.num(t.vat)}</td></tr>
        <tr class="p-total-row"><td>Estimated amount due</td><td class="num">${peso(t.total)}</td></tr>
      </table>
    </div>
    <div class="note warn">
      This is an <b>estimate of the course fee only</b>. Training kits, assessment fees, ID
      processing and insurance are added by the registrar when your enrollment is confirmed.
      Your official invoice is issued at that point &mdash; not now.
      <b>No payment is collected through this website.</b>
    </div>

    ${P.errors.includes('duplicate') ? `<div class="note bad">You already have an application waiting for this batch. Track it instead using your reference code.</div>` : ''}
    ${P.errors.includes('batchFull') ? `<div class="note bad">The last seat on this batch was taken while you were filling in the form. Please go back and choose another schedule.</div>` : ''}

    <label class="p-consent">
      <input type="checkbox" id="consent">
      <span>I certify that the information above is true and correct, and I allow
        ${esc(CO().name)} to process it for enrollment, billing and regulatory reporting.</span>
    </label>

    <div class="p-acts">
      <button class="btn btn-ghost" id="back3">&larr; Back</button>
      <button class="btn btn-accent" id="submitApp">Submit enrollment</button>
    </div>`;
}

/* ----- confirmation ----- */
function paneDone(){
  const a = P.result, b = APPS.batch(a.batchId), c = courseOf(a.courseId);
  return `
    <div class="p-panel p-center">
      <div class="p-ok-mark">&#10003;</div>
      <h2>Enrollment submitted</h2>
      <p class="p-lead">Keep the reference code below. You will need it, with your last name,
         to track your enrollment.</p>
      <div class="p-ref">${esc(a.ref)}</div>
      <p class="muted p-appno">Application no. <span class="mono">${esc(a.no)}</span></p>
    </div>

    <div class="p-slip" id="slip">
      <div class="p-slip-head">
        <img src="assets/logo.svg" alt="" class="p-slip-logo">
        <div class="p-slip-org">
          <div class="p-slip-name">${esc(CO().name)}</div>
          <div class="muted">${esc(CO().address)}</div>
          <div class="muted">${esc(CO().accreditation)}</div>
        </div>
        <div class="p-slip-no">
          <div class="p-slip-kind">ACKNOWLEDGEMENT</div>
          <div class="mono p-slip-num">${esc(a.no)}</div>
          <div class="muted">${UI.date(a.submitted)}</div>
        </div>
      </div>
      <div class="p-review">
        <dl class="def">
          <dt>Applicant</dt><dd><b>${esc(APPS.forName(a))}</b></dd>
          <dt>SRN</dt><dd class="mono">${esc(a.srn)}</dd>
          <dt>Rank / position</dt><dd>${esc(a.rank)}</dd>
          <dt>Company</dt><dd>${esc(a.agency)}</dd>
          <dt>Mobile</dt><dd>${esc(a.mobile)}</dd>
        </dl>
        <dl class="def">
          <dt>Course</dt><dd><b>${esc(c.title)}</b></dd>
          <dt>Schedule</dt><dd>${UI.dateRange(b.start,b.end)}</dd>
          <dt>Venue</dt><dd>${esc(b.room)}</dd>
          <dt>Reference code</dt><dd class="mono"><b>${esc(a.ref)}</b></dd>
          <dt>Status</dt><dd>${UI.statusTag('Submitted')}</dd>
        </dl>
      </div>
      <div class="note p-slip-note">
        <b>What happens next.</b> The registrar reviews your enrollment, usually within one
        working day. You will be called on the mobile number above to confirm your seat and
        settle the fee. Bring this slip and your original SIRB, passport and SRN on your first
        training day. <b>This slip is not an official receipt.</b>
      </div>
    </div>

    <div class="p-acts no-print">
      <a class="btn btn-ghost" href="#/enroll/track">Track this enrollment</a>
      <div class="p-acts-right">
        <button class="btn btn-ghost" id="printSlip">Print slip</button>
        <button class="btn btn-accent" id="another">Enroll in another course</button>
      </div>
    </div>`;
}

/* ----- track sub-tab ----- */
const STAGE_ORDER = ['Submitted','Under Review','Approved','Enrolled'];

function paneTrack(){
  const a = P.tracked;
  return `
    <div class="p-panel">
      <form id="trackForm">
        <div class="grid g2">
          <label class="fld"><span>Reference code</span>
            <input name="ref" value="${esc(P.trackRef||'')}" maxlength="6"
                   placeholder="e.g. K7QX2M" class="p-refin" required></label>
          <label class="fld"><span>Last name</span>
            <input name="surname" value="${esc(P.trackSurname||'')}"
                   placeholder="As written on your application" required></label>
        </div>
        <button class="btn btn-accent" type="submit">Check status</button>
      </form>
      ${P.trackError ? `<div class="note bad p-track-err">${esc(P.trackError)}</div>` : ''}
    </div>
    ${a ? trackResult(a) : `
      <div class="p-hint">
        Your reference code is the six-character code printed on the acknowledgement slip you
        received when you enrolled. Lost it? Call the registrar at ${esc(CO().contact)}.
      </div>`}`;
}

function trackResult(a){
  const b = APPS.batch(a.batchId), c = courseOf(a.courseId);
  const reached = STAGE_ORDER.indexOf(a.status);
  const closed = a.status === 'Rejected' || a.status === 'Withdrawn';

  const stages = STAGE_ORDER.map((s,i) => {
    const evt = a.history.find(h => h.status === s);
    const hit = evt || (reached >= 0 && i <= reached);
    return `<li class="${hit?'hit':''}">
      <div class="t-what">${esc(s)}</div>
      <div class="t-when">${evt ? UI.date(evt.ts.slice(0,10)) : 'Pending'}</div>
      ${evt && evt.note ? `<div class="t-note">${esc(evt.note)}</div>` : ''}
    </li>`;
  }).join('');

  const closedRow = `<li class="hit closed">
      <div class="t-what">${esc(a.status)}</div>
      <div class="t-when">${UI.date(a.decidedOn)}</div>
      ${a.reason ? `<div class="t-note">${esc(a.reason)}</div>` : ''}</li>`;

  return `
    <div class="p-panel p-track-res">
      <div class="p-track-head">
        <div>
          <h2>${esc(APPS.forName(a))}</h2>
          <p class="p-lead"><span class="mono">${esc(a.no)}</span> &middot;
             submitted ${UI.date(a.submitted)} &middot; ${APPS.ageDays(a)} day(s) ago</p>
        </div>
        <div>${UI.statusTag(a.status)}</div>
      </div>
      <div class="hr"></div>
      <dl class="def">
        <dt>Course</dt><dd><b>${esc(c.title)}</b></dd>
        <dt>Schedule</dt><dd>${UI.dateRange(b.start,b.end)} &middot; ${esc(b.center)} &middot; ${esc(b.room)}</dd>
        <dt>SRN</dt><dd class="mono">${esc(a.srn)}</dd>
      </dl>
      <div class="hr"></div>
      <h4 class="p-group">Progress</h4>
      <ul class="p-time">${closed ? closedRow : stages}</ul>
      ${a.status === 'Enrolled'
        ? `<div class="note ok p-flush"><b>You are enrolled.</b> Your official invoice and
             receipt are handled at the cashier's window. Bring your original documents on the
             first training day.</div>`
        : a.status === 'Rejected'
        ? `<div class="note bad p-flush">Please contact the registrar at ${esc(CO().contact)}
             if you would like to re-apply.</div>`
        : closed ? ''
        : `<div class="note p-flush">The registrar will call you on <b>${esc(a.mobile)}</b>
             once a decision is made. Enrollments are normally reviewed within one working
             day.</div>`}
    </div>`;
}

/* ================= ROUTER ================= */
function parseHash(){
  const raw = location.hash.replace(/^#\/?/, '') || 'courses';
  const [path, query] = raw.split('?');
  const parts = path.split('/');
  return { view:parts[0] || 'courses', sub:parts[1] || '', params:new URLSearchParams(query || '') };
}

function render(){
  const { view, sub, params } = parseHash();
  P.view = (view === 'enroll') ? 'enroll' : 'courses';

  if(P.view === 'enroll'){
    P.tab = sub === 'track' ? 'track' : 'apply';
    if(P.tab === 'apply' && params.get('batch')){
      P.draft.batchId = params.get('batch');
      P.result = null;
    }
    if(P.tab === 'track' && params.get('ref')) P.trackRef = params.get('ref');
  }

  document.querySelectorAll('[data-p]').forEach(a =>
    a.classList.toggle('active', a.dataset.p === P.view));

  document.getElementById('pView').innerHTML =
    P.view === 'enroll' ? viewEnroll() : viewCourses();

  wire();
  window.scrollTo(0,0);
}

/* Capture step 2 without validating, so Back never loses typing. */
function captureDetails(){
  const form = document.getElementById('detailForm');
  if(form) Object.assign(P.draft, Object.fromEntries(new FormData(form).entries()));
}

function wire(){
  const on = (id, ev, fn) => { const el = document.getElementById(id); if(el) el[ev] = fn; };

  document.querySelectorAll('input[name="batchId"]').forEach(r => r.onchange = () => {
    P.draft.batchId = r.value; P.errors = []; render();
  });
  on('next1','onclick', () => {
    if(!P.draft.batchId){ P.errors = ['batchId']; return render(); }
    P.errors = []; P.step = 2; render();
  });

  on('back2','onclick', () => { captureDetails(); P.step = 1; P.errors = []; render(); });
  on('next2','onclick', () => {
    captureDetails();
    P.errors = APPS.validate(P.draft).filter(e => e !== 'duplicate' && e !== 'batchFull');
    if(P.errors.length){
      render();
      const first = document.querySelector('.fld.bad input');
      if(first) first.focus();
      return;
    }
    P.step = 3; render();
  });

  on('back3','onclick', () => { P.step = 2; P.errors = []; render(); });
  on('submitApp','onclick', () => {
    if(!document.getElementById('consent').checked)
      return UI.toast('Please tick the certification box before submitting.', 'bad');
    try{
      P.result = APPS.submit(P.draft);
      P.errors = [];
      UI.toast('Enrollment submitted — reference ' + P.result.ref);
      render();
    }catch(e){
      P.errors = e.errors || [];
      if(!P.errors.length) UI.toast(e.message, 'bad');
      render();
    }
  });

  on('printSlip','onclick', () => window.print());
  on('another','onclick', () => {
    /* Keep who they are, drop what they enrolled in. */
    const keep = { ...P.result };
    ['id','no','ref','submitted','channel','status','courseId','batchId',
     'traineeId','enrollmentId','decidedBy','decidedOn','reason','history','remarks']
      .forEach(k => delete keep[k]);
    P.result = null; P.draft = keep; P.step = 1; P.errors = [];
    location.hash = '#/enroll';
    render();
  });

  const cq = document.getElementById('cq');
  if(cq) cq.oninput = () => {
    P.q = cq.value;
    const pos = cq.selectionStart;
    render();
    const again = document.getElementById('cq');
    if(again){ again.focus(); try{ again.setSelectionRange(pos,pos); }catch(e){} }
  };

  const tf = document.getElementById('trackForm');
  if(tf) tf.onsubmit = e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(tf).entries());
    P.trackRef = fd.ref; P.trackSurname = fd.surname;
    DB.reload();
    const hit = APPS.track(fd.ref, fd.surname);
    P.tracked = hit;
    P.trackError = hit ? '' :
      'We could not find an enrollment with that reference code and last name. Check the code on your slip, or call the registrar for help.';
    render();
  };
}

/* ---------- boot ---------- */
function fillFooter(){
  const c = CO();
  const set = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
  set('fName', c.name); set('fAddr', c.address); set('fContact', c.contact);
  set('fAcc', c.accreditation); set('fTin', 'TIN ' + c.tin);
}

window.addEventListener('hashchange', render);
/* The registrar's tab changed the shared store — reflect it. */
window.addEventListener('storage', e => { if(e.key === 'tbm_is_v1'){ DB.reload(); render(); } });

DB.load();
fillFooter();
render();
