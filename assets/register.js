/* register.js — the Tara Barko Maritime public registration portal.

   Two navigation tabs only: Courses and Enroll Now. Track Enrollment lives
   inside Enroll Now as a sub-tab, because tracking is part of the registration
   journey rather than a separate destination — an applicant looking for it has
   already registered, and looks where they registered.

   The public site shows no schedules at all. An applicant chooses a course; the
   registrar places them on a dated run at a partner center when approving, and
   that choice sets the fee.

   Routes
     #/courses            the paginated course catalogue (the landing view)
     #/enroll             the three-step enrollment wizard
     #/enroll/track       track an existing enrollment by reference code

   Shares db.js, ui.js, accounting.js and applications.js with the internal
   system, so an application submitted here is the same record the registrar
   opens in Admissions — no import step, no re-keying. */

const esc  = UI.esc, peso = UI.peso;
const CO   = () => DB.get().company;

const P = {
  view:'courses', tab:'apply', step:1,
  draft:{}, errors:[], result:null,
  tracked:null, trackOthers:[], trackSrn:'', trackSurname:'', trackError:'',
  q:'', page:1, cq:'',
};

/* Catalogue paging. The full catalogue is a couple of hundred courses — too many
   for one scroll, and too much to send down a mobile connection at the pier. */
const PER_PAGE = 15;
const MAX_PAGE_BUTTONS = 15;   // beyond this the pager windows around the current page

const courseOf = id => DB.get().courses.find(c => c.id === id);

/* Where the applicant sends their screenshot. Named if the office has filled it
   in under Settings, otherwise the generic phrase — better a vague instruction
   than a confident pointer to a page that does not exist. */
const pageName = () => {
  const p = (CO().page || '').trim();
  return p ? `<b>${esc(p)}</b>` : 'our page';
};

/* A course may be delivered several ways — face to face, blended, distance
   learning. They are one course, so they share one row and wear their modes. */
const modeTags = c => (c.modes || [])
  .map(m => `<span class="p-mode">${esc(m)}</span>`).join('');

/* The generated catalogue is already alphabetical, but a course added by hand in
   the internal system would land at the end — so sort here rather than trust it. */
const byTitle = (a,b) => a.title.localeCompare(b.title, 'en', { sensitivity:'base', numeric:true });

/* Page numbers to render: all of them while they fit, otherwise a window around
   the current page with the first and last always reachable. */
function pageNumbers(current, total){
  /* Window only when it actually saves room. Collapsing one or two numbers behind
     an ellipsis costs the reader a click and saves nothing. */
  if(total <= MAX_PAGE_BUTTONS + 2) return Array.from({ length:total }, (_,i) => i + 1);
  const span = MAX_PAGE_BUTTONS - 2;                     // leave room for first and last
  let from = Math.max(2, current - Math.floor(span / 2));
  let to   = Math.min(total - 1, from + span - 1);
  from = Math.max(2, to - span + 1);
  const out = [1];
  if(from > 2) out.push('…');
  for(let i = from; i <= to; i++) out.push(i);
  if(to < total - 1) out.push('…');
  out.push(total);
  return out;
}

function pager(page, pages){
  if(pages <= 1) return '';
  const btn = (label, target, opts = {}) =>
    opts.gap ? `<span class="p-pager-gap">…</span>`
      : `<button type="button" class="p-page-btn ${opts.on?'on':''}"
           ${opts.disabled?'disabled':''} data-page="${target}">${label}</button>`;

  return `<div class="p-pager" role="navigation" aria-label="Catalogue pages">
    ${btn('&larr; Prev', page - 1, { disabled:page === 1 })}
    ${pageNumbers(page, pages).map(n =>
      n === '…' ? btn('', 0, { gap:true }) : btn(n, n, { on:n === page })).join('')}
    ${btn('Next &rarr;', page + 1, { disabled:page === pages })}
  </div>`;
}

/* ================= COURSES ================= */
function viewCourses(){
  const d = DB.get();
  const q = (P.q || '').toLowerCase();
  const active = d.courses.filter(c => c.active);
  const courses = active
    .filter(c => !q || [c.code, c.title, ...(c.modes||[])].join(' ').toLowerCase().includes(q))
    .sort(byTitle);

  const pages = Math.max(1, Math.ceil(courses.length / PER_PAGE));
  const page  = Math.min(Math.max(1, P.page), pages);      // clamp after a search shrinks the list
  const from  = (page - 1) * PER_PAGE;
  const shown = courses.slice(from, from + PER_PAGE);

  return `
    <section class="p-hero">
      <div class="p-hero-text">
        <span class="p-eyebrow">Training &amp; assessment endorsement</span>
        <h1>Enroll with TB Maritime.</h1>
        <p>Basic safety, advanced safety, medical, security and simulator courses for
           Filipino seafarers, delivered at MARINA and STCW accredited partner training
           centers. Tell us which course you need &mdash; we will find you a seat and confirm
           the schedule and the fee with you.</p>
        <div class="p-hero-acts">
          <a class="btn btn-accent btn-lg" href="#/enroll">Enroll now</a>
          <a class="btn btn-onblue btn-lg" href="#/enroll/track">Track my enrollment</a>
        </div>
      </div>
      <div class="p-hero-stats">
        <div><b>${active.length}</b><span>accredited courses</span></div>
        <div><b>1</b><span>working day to reply</span></div>
      </div>
    </section>

    <div class="p-sec-head">
      <h2>Course catalogue</h2>
      <p>${active.length} accredited courses. Fees and dates depend on the training center
         &mdash; the Registrar confirms both when your enrollment is approved.</p>
    </div>
    <div class="toolbar" style="margin-bottom:14px">
      <input type="search" id="cq" value="${esc(P.q||'')}"
             placeholder="Search course title or code…" style="min-width:300px">
      <span class="muted">${courses.length
        ? `Showing ${from + 1}–${Math.min(from + PER_PAGE, courses.length)} of ${courses.length}
           course(s)${pages > 1 ? ` &middot; page ${page} of ${pages}` : ''}`
        : 'No matches'}</span>
    </div>
    ${shown.length ? `
      <div class="p-cat">
        ${shown.map(c => `
          <div class="p-cat-row">
            <div class="p-cat-title">${esc(c.title)} ${modeTags(c)}</div>
            <div class="p-cat-dur">${esc(c.duration || 'Duration to be confirmed')}${c.note ? ` <span class="p-mode">${esc(c.note)}</span>` : ''}</div>
          </div>`).join('')}
      </div>
      ${pager(page, pages)}`
    : `<div class="empty">No course matches &ldquo;${esc(P.q)}&rdquo;.</div>`}

    <div class="p-more">
      <b>Other courses may be available.</b>
      This list covers the courses we book most often. If you need one that is not here,
      contact TB Maritime &mdash; we work with several accredited training centers and can
      usually arrange it.
      <span class="p-more-contact">${esc(CO().contact)}</span>
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
             : `${stepBar()}<div class="p-panel">${[stepCourse, stepDetails, stepReview][P.step-1]()}</div>`;

  return `<div class="p-narrow">
    <div class="p-sec-head p-sec-center">
      <h2>${P.tab === 'track' ? 'Track your enrollment' : 'Enroll now'}</h2>
      <p>${P.tab === 'track'
            ? 'Enter your SRN and last name.'
            : 'Three steps. It takes about four minutes.'}</p>
    </div>
    ${seg}
    ${body}
  </div>`;
}

/* ----- wizard chrome ----- */
const STEPS = ['Choose a course','Your details','Review and submit'];

function stepBar(){
  return `<div class="p-steps">${STEPS.map((s,i) => {
    const n = i + 1;
    return `<div class="p-step ${P.step===n?'on':''} ${P.step>n?'done':''}">
      <span class="n">${P.step>n?'&#10003;':n}</span><span class="l">${esc(s)}</span></div>`;
  }).join('')}</div>`;
}

const bad = f => P.errors.includes(f) ? 'bad' : '';
const req = `<span class="p-req">*</span>`;

/* ----- step 1 · course ----- */
/* 239 courses, so this is a search box rather than a list of radio buttons. The
   applicant picks the course; the registrar picks the dated run at a partner
   center, because which centers have seats free is not public information. */
function stepCourse(){
  const q = (P.cq || '').toLowerCase().trim();
  const active = DB.get().courses.filter(c => c.active);
  const chosen = P.draft.courseId ? courseOf(P.draft.courseId) : null;

  const matches = !q ? [] : active
    .filter(c => [c.code, c.title, ...(c.modes||[])].join(' ').toLowerCase().includes(q))
    .slice(0, 40);

  return `
    <h2>Choose a course</h2>
    <p class="p-lead">Search for the course you need. We will confirm the schedule, the
       training center and the fee when we call you.</p>
    ${P.errors.includes('courseId') ? `<div class="note warn">Please choose a course to continue.</div>` : ''}

    ${chosen ? `
      <div class="p-chosen">
        <div>
          <span class="p-chosen-lbl">Selected course</span>
          <b>${esc(chosen.title)}</b> ${modeTags(chosen)}
          <small>${esc(chosen.duration || 'Duration to be confirmed')}</small>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="clearCourse">Change</button>
      </div>` : ''}

    <label class="fld"><span>Search the catalogue</span>
      <input type="search" id="courseQ" value="${esc(P.cq||'')}"
             placeholder="e.g. Basic Training, AFF, medical, watchkeeping…"></label>

    ${q ? (matches.length ? `
      <div class="p-cat p-cat-pick">
        ${matches.map(c => `
          <button type="button" class="p-cat-row p-cat-btn ${P.draft.courseId === c.id ? 'on' : ''}" data-course="${c.id}">
            <span class="p-cat-title">${esc(c.title)} ${modeTags(c)}</span>
            <span class="p-cat-dur">${esc(c.duration || '—')}</span>
          </button>`).join('')}
      </div>
      ${matches.length === 40 ? `<p class="p-hint">Showing the first 40 matches — keep typing to narrow it down.</p>` : ''}`
      : `<div class="empty">No course matches &ldquo;${esc(P.cq)}&rdquo;. Try a shorter word, or call
           the Registrar at ${esc(CO().contact)}.</div>`)
      : `<p class="p-hint">Start typing to search all
           ${active.length} accredited courses.</p>`}

    <div class="p-acts">
      <a class="btn btn-ghost" href="#/courses">&larr; Back to courses</a>
      <button class="btn btn-accent" id="next1">Continue &rarr;</button>
    </div>`;
}

/* ----- step 2 · details ----- */
function stepDetails(){
  const d = P.draft, c = courseOf(d.courseId);
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
    <p class="p-lead">Enrolling in <b>${esc(c.title)}</b>
       (${esc(c.duration || 'duration to be confirmed')}). Fields marked ${req} are required.</p>
    ${P.errors.length ? `<div class="note warn">
       <b>Please check the highlighted fields.</b>
       ${[...new Set(P.errors)].map(e => APPS.LABELS[e]).filter(Boolean).slice(0,6).join(' &middot; ')}
     </div>` : ''}

    <form id="detailForm" autocomplete="on">

      <h4 class="p-group">Seafarer Identity</h4>
      ${F('srn','SRN', { req:true, hint:'Seafarer Registration Number', ph:'e.g. SRN-123456' })}
      <div class="grid g2">
        ${F('last','Last Name',   { req:true, attr:'autocomplete="family-name"' })}
        ${F('first','First Name', { req:true, attr:'autocomplete="given-name"' })}
      </div>
      <div class="grid g2">
        ${F('middle','Middle Name', { attr:'autocomplete="additional-name"' })}
        <label class="fld"><span>Suffix <small>if any</small></span>
          <select name="suffix">
            ${['','Jr.','Sr.','II','III','IV','V'].map(s =>
              `<option value="${s}" ${d.suffix===s?'selected':''}>${s || '— none —'}</option>`).join('')}
          </select></label>
      </div>

      <h4 class="p-group">Personal Information</h4>
      <div class="grid g3">
        <label class="fld"><span>Sex</span>
          <select name="sex">
            <option value="M" ${d.sex!=='F'?'selected':''}>Male</option>
            <option value="F" ${d.sex==='F'?'selected':''}>Female</option>
          </select></label>
        ${F('birth','Date of Birth', { req:true, type:'date', attr:`max="${DB.today()}"` })}
        ${F('birthPlace','Place of Birth', { req:true, ph:'City / municipality, province' })}
      </div>
      <h4 class="p-group">Contact Details</h4>
      <div class="grid g2">
        ${F('mobile','Mobile Number', { req:true, type:'tel', ph:'09XX XXX XXXX', attr:'autocomplete="tel"' })}
        ${F('email','Email Address',  { req:true, type:'email', attr:'autocomplete="email"' })}
      </div>
      ${F('address','Home Address', { req:true, ph:'House/unit, street, barangay, city, province',
                                      attr:'autocomplete="street-address"' })}
      <p class="p-note-inline">The Registrar replies on Facebook, so give us a link we can
         open &mdash; not just your display name.</p>
      <div class="grid g2">
        ${F('facebook','Facebook Profile Link', { req:true,
             ph:'facebook.com/your.profile' })}
        ${F('messenger','Messenger / Meta Chat Link', { hint:'optional',
             ph:'m.me/your.profile' })}
      </div>

      <h4 class="p-group">Employment</h4>
      <div class="grid g2">
        ${F('rank','Rank / Position', { req:true, list:'rankList', ph:'e.g. Able Seaman' })}
        ${F('agency','Company', { req:true, list:'agencyList',
                                  hint:'manning agency or employer', ph:'Direct hire / walk-in' })}
      </div>
      <datalist id="rankList">${ranks.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
      <datalist id="agencyList">${agencies.map(a => `<option value="${esc(a)}">`).join('')}</datalist>

      <h4 class="p-group">In Case of Emergency</h4>
      <p class="p-note-inline">Required before you may join any practical or sea-survival exercise.</p>
      <div class="grid g3">
        ${F('emergencyName','Contact Person', { req:true, ph:'Full name' })}
        ${F('emergencyRelation','Relationship', { ph:'e.g. Spouse, Parent' })}
        ${F('emergencyMobile','Contact Number', { req:true, type:'tel', ph:'09XX XXX XXXX' })}
      </div>
    </form>

    <div class="p-acts">
      <button class="btn btn-ghost" id="back2">&larr; Back</button>
      <button class="btn btn-accent" id="next2">Review &rarr;</button>
    </div>`;
}

/* ----- step 3 · review ----- */
function stepReview(){
  const d = P.draft, c = courseOf(d.courseId);
  const L = (k,v) => `<dt>${esc(k)}</dt><dd>${v || '<span class="muted">Not provided</span>'}</dd>`;
  const full = `${d.last}${d.suffix ? ' ' + d.suffix : ''}, ${d.first} ${d.middle || ''}`.trim();

  return `
    <h2>Review and submit</h2>
    <p class="p-lead">Check your details carefully. After submitting, changes have to go
       through the Registrar.</p>

    <div class="note">
      <b>${esc(c.title)}</b>${(c.modes||[]).length ? ` &middot; ${esc(c.modes.join(' / '))}` : ''}<br>
      ${esc(c.duration || 'Duration to be confirmed')}
    </div>

    <h4 class="p-group">Seafarer Identity</h4>
    <div class="p-review">
      <dl class="def">${L('SRN', `<span class="mono">${esc(d.srn)}</span>`)}</dl>
      <dl class="def">${L('Name', esc(full))}</dl>
    </div>

    <h4 class="p-group">Personal and Contact</h4>
    <div class="p-review">
      <dl class="def">
        ${L('Sex', d.sex==='F'?'Female':'Male')}
        ${L('Date of Birth', UI.date(d.birth))}
        ${L('Place of Birth', esc(d.birthPlace))}
      </dl>
      <dl class="def">
        ${L('Mobile', esc(d.mobile))}
        ${L('Email', esc(d.email))}
        ${L('Address', esc(d.address))}
        ${L('Facebook', esc(d.facebook))}
        ${L('Messenger', esc(d.messenger))}
      </dl>
    </div>

    <h4 class="p-group">Employment and Emergency Contact</h4>
    <div class="p-review">
      <dl class="def">
        ${L('Rank / Position', esc(d.rank))}
        ${L('Company', esc(d.agency))}
      </dl>
      <dl class="def">
        ${L('Contact Person', esc(d.emergencyName))}
        ${L('Relationship', esc(d.emergencyRelation))}
        ${L('Contact Number', esc(d.emergencyMobile))}
      </dl>
    </div>

    <div class="hr"></div>
    <div class="note warn">
      <b>No fee is shown or collected here.</b> The training fee depends on which partner
      center and which dates we can place you on. The Registrar will contact you on your
      Facebook account within one working day with the schedule and the exact amount, and
      your official invoice is issued at that point.
    </div>

    ${P.errors.includes('duplicate') ? `<div class="note bad">You already have an enrollment waiting for this course. Track it instead using your reference code.</div>` : ''}

    ${termsPanel()}

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

/* ----- terms and conditions -----
   Rendered from assets/terms.js so the wording lives somewhere a non-programmer
   can find it. The panel scrolls rather than pushing the tick boxes off-screen:
   an applicant who cannot see what they are agreeing to has not agreed to it. */
function termsPanel(){
  const sec = s => `
    <div class="p-terms-sec">
      <h5><span class="p-terms-n">${s.n}.</span>${esc(s.heading)}</h5>
      ${(s.body || []).map(p => `<p>${esc(p.replace(/\s+/g,' ').trim())}</p>`).join('')}
      ${(s.bullets || []).length
        ? `<ul>${s.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    </div>`;

  return `
    <div class="p-terms">
      <div class="p-terms-head">
        <h4>${esc(TERMS.title)}</h4>
        <span class="p-terms-ver">Version ${esc(TERMS.version)}</span>
      </div>
      <div class="p-terms-body" id="termsBody" tabindex="0">
        ${TERMS.sections.map(sec).join('')}
      </div>
    </div>

    <div class="p-agree ${P.errors.includes('terms') ? 'bad' : ''}">
      <p class="p-agree-lead">${esc(TERMS.agreementLead)} <span class="p-req">*</span></p>
      ${TERMS.agreements.map(a => `
        <label class="p-agree-box">
          <input type="checkbox" id="${a.id}" data-agree>
          <span>${esc(a.label)}</span>
        </label>`).join('')}
    </div>`;
}

/* ----- confirmation ----- */
function paneDone(){
  const a = P.result, c = courseOf(a.courseId);
  return `
    <div class="p-panel p-center">
      <div class="p-ok-mark">&#10003;</div>
      <h2>Enrollment submitted</h2>
      <p class="p-lead">Track your enrollment any time with your <b>SRN</b> and your
         <b>last name</b>.</p>
      <div class="p-ref">${esc(a.srn)}</div>
      <p class="muted p-appno">Reference <span class="mono">${esc(a.ref)}</span> &middot;
         application no. <span class="mono">${esc(a.no)}</span></p>
    </div>

    <div class="p-slip" id="slip">
      <div class="p-slip-head">
        <img src="assets/logo.svg" alt="" class="p-slip-logo">
        <div class="p-slip-org">
          <div class="p-slip-name">${esc(CO().name)}</div>
          <div class="muted">${esc(CO().address)}</div>
          <div class="muted">${esc(CO().contact)}</div>
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
          <dt>Facebook</dt><dd>${esc(a.facebook)}</dd>
        </dl>
        <dl class="def">
          <dt>Course</dt><dd><b>${esc(c.title)}</b></dd>
          <dt>Duration</dt><dd>${esc(c.duration || 'To be confirmed')}</dd>
          <dt>Schedule</dt><dd><span class="muted">To be assigned by the Registrar</span></dd>
          <dt>Reference code</dt><dd class="mono"><b>${esc(a.ref)}</b></dd>
          <dt>Status</dt><dd>${UI.statusTag('Submitted')}</dd>
        </dl>
      </div>
      <div class="note p-slip-note">
        <b>What happens next.</b> Take a screenshot of this confirmation and send it to
        ${pageName()}. The Registrar will check your enrollment details and enroll you
        in the course you selected, then contact you on your Facebook account. Enrollments
        submitted outside our office hours are processed on the following business day.
        <b>This does not serve as your official receipt.</b>
      </div>
    </div>

    <div class="p-acts no-print">
      <a class="btn btn-ghost" href="#/enroll/track?srn=${encodeURIComponent(a.srn)}">Track this enrollment</a>
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
  const others = P.trackOthers || [];
  return `
    <div class="p-panel">
      <form id="trackForm">
        <div class="grid g2">
          <label class="fld"><span>SRN</span>
            <input name="srn" value="${esc(P.trackSrn||'')}"
                   placeholder="e.g. SRN-123456" class="p-caps" required></label>
          <label class="fld"><span>LAST NAME</span>
            <input name="surname" value="${esc(P.trackSurname||'')}"
                   placeholder="As written on your enrollment" class="p-caps" required></label>
        </div>
        <button class="btn btn-accent" type="submit">Check status</button>
      </form>
      ${P.trackError ? `<div class="note bad p-track-err">${esc(P.trackError)}</div>` : ''}
    </div>
    ${a ? trackResult(a) + (others.length ? otherEnrollments(others) : '') : `
      <div class="p-hint">
        Enter the SRN you used when you enrolled, together with your last name.
        Need help? Call the Registrar at ${esc(CO().contact)}.
      </div>`}`;
}

/* A returning seafarer has one enrollment per course under the same SRN. The
   newest is shown in full; the rest are listed so none of them silently vanish. */
function otherEnrollments(list){
  return `
    <div class="p-panel p-others">
      <h4 class="p-group">Your other enrollments</h4>
      ${list.map(o => {
        const c = courseOf(o.courseId);
        return `<div class="p-other-row">
          <div>
            <b>${esc(c ? c.title : '—')}</b>
            <small>${esc(o.no)} &middot; submitted ${UI.date(o.submitted)}</small>
          </div>
          <span class="p-flex"></span>
          ${UI.statusTag(o.status)}
        </div>`;
      }).join('')}
    </div>`;
}

function trackResult(a){
  const b = a.batchId ? APPS.batch(a.batchId) : null;   // assigned only at approval
  const c = courseOf(a.courseId);
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
        <dt>Duration</dt><dd>${esc(c.duration || 'To be confirmed')}</dd>
        <dt>Schedule</dt><dd>${b
          ? `${UI.dateRange(b.start,b.end)} &middot; ${esc(b.center)} &middot; ${esc(b.room)}`
          : '<span class="muted">Not yet assigned — the Registrar will confirm your dates</span>'}</dd>
        <dt>SRN</dt><dd class="mono">${esc(a.srn)}</dd>
      </dl>
      <div class="hr"></div>
      <h4 class="p-group">Progress</h4>
      <ul class="p-time">${closed ? closedRow : stages}</ul>
      ${a.status === 'Enrolled'
        ? `<div class="note ok p-flush"><b>You are enrolled.</b> The Registrar will
             confirm your schedule, training center and fee on your Facebook account. Your
             training center will tell you what to bring on the first day.</div>`
        : a.status === 'Rejected'
        ? `<div class="note bad p-flush">Please contact the Registrar at ${esc(CO().contact)}
             if you would like to re-apply.</div>`
        : closed ? ''
        : `<div class="note p-flush">If you have not already, send a screenshot of your
             submitted enrollment to ${pageName()} &mdash; the Registrar checks your
             details from there, then contacts you on your Facebook account with the
             schedule, the training center and the fee. Enrollments submitted outside our
             office hours are processed on the following business day.</div>`}
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
    if(P.tab === 'apply' && params.get('course')){
      P.draft.courseId = params.get('course');
      P.result = null;
    }
    if(P.tab === 'track' && params.get('srn')) P.trackSrn = params.get('srn');
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

  /* step 1 — course search and selection */
  const cqi = document.getElementById('courseQ');
  if(cqi) cqi.oninput = () => {
    P.cq = cqi.value;
    const pos = cqi.selectionStart;
    render();
    const again = document.getElementById('courseQ');
    if(again){ again.focus(); try{ again.setSelectionRange(pos,pos); }catch(e){} }
  };
  document.querySelectorAll('[data-course]').forEach(btn => btn.onclick = () => {
    P.draft.courseId = btn.dataset.course; P.errors = []; render();
  });
  on('clearCourse','onclick', () => { P.draft.courseId = ''; render(); });
  on('next1','onclick', () => {
    if(!P.draft.courseId){ P.errors = ['courseId']; return render(); }
    P.errors = []; P.step = 2; render();
  });

  on('back2','onclick', () => { captureDetails(); P.step = 1; P.errors = []; render(); });
  on('next2','onclick', () => {
    captureDetails();
    P.errors = APPS.validate(P.draft).filter(e => e !== 'duplicate');
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
    /* Every box is a separate statement the applicant is making, so each is
       checked separately and the message names the one that is missing. */
    const unticked = TERMS.agreements.filter(a => !document.getElementById(a.id)?.checked);
    if(unticked.length){
      P.errors = ['terms'];
      render();
      const first = document.getElementById(unticked[0].id);
      if(first){ first.focus(); first.closest('.p-agree')?.scrollIntoView({ block:'center' }); }
      UI.toast(unticked.length === TERMS.agreements.length
        ? 'Please accept the terms and conditions before submitting.'
        : `Please also tick “${unticked[0].label}”.`, 'bad');
      return;
    }
    if(!document.getElementById('consent').checked)
      return UI.toast('Please tick the certification box before submitting.', 'bad');

    try{
      P.result = APPS.submit({
        ...P.draft,
        termsVersion:TERMS.version,
        termsAccepted:TERMS.agreements.map(a => a.label),
      });
      P.errors = [];
      UI.toast('Enrollment submitted — reference ' + P.result.ref);
      render();
    }catch(e){
      P.errors = e.errors || [];
      if(!P.errors.length) UI.toast(e.message, 'bad');
      render();
    }
  });

  /* Ticking clears the highlight straight away rather than waiting for a
     re-render, so the form stops looking wrong the moment it stops being wrong. */
  document.querySelectorAll('[data-agree]').forEach(b => b.onchange = () => {
    if(TERMS.agreements.every(a => document.getElementById(a.id)?.checked))
      document.querySelector('.p-agree')?.classList.remove('bad');
  });

  on('printSlip','onclick', () => window.print());
  on('another','onclick', () => {
    /* Keep who they are, drop what they enrolled in. */
    const keep = { ...P.result };
    ['id','no','ref','submitted','channel','status','courseId','batchId',
     'traineeId','enrollmentId','decidedBy','decidedOn','reason','history','remarks']
      .forEach(k => delete keep[k]);
    P.result = null; P.draft = keep; P.step = 1; P.errors = []; P.cq = '';
    location.hash = '#/enroll';
    render();
  });

  const cq = document.getElementById('cq');
  if(cq) cq.oninput = () => {
    P.q = cq.value;
    P.page = 1;                       // a new search starts at the beginning
    const pos = cq.selectionStart;
    render();
    const again = document.getElementById('cq');
    if(again){ again.focus(); try{ again.setSelectionRange(pos,pos); }catch(e){} }
  };

  /* Catalogue paging. Scroll back to the top of the list rather than the top of
     the page — the reader's eye is already at the pager. */
  document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => {
    P.page = Number(b.dataset.page);
    render();
    const list = document.querySelector('.p-cat');
    if(list) list.scrollIntoView({ block:'start' });
  });

  const tf = document.getElementById('trackForm');
  if(tf) tf.onsubmit = e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(tf).entries());
    P.trackSrn = fd.srn; P.trackSurname = fd.surname;
    DB.reload();
    const all = APPS.trackAll(fd.srn, fd.surname);
    P.tracked = all[0] || null;
    P.trackOthers = all.slice(1);
    P.trackError = all.length ? '' :
      'We could not find an enrollment with that SRN and last name. Check your SRN, or call the Registrar for help.';
    render();
  };
}

/* ---------- boot ---------- */
function fillFooter(){
  const c = CO();
  const set = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
  set('fName', c.name); set('fAddr', c.address); set('fContact', c.contact);
  /* Office hours are one line per row, edited as free text in Settings. */
  const hours = document.getElementById('fHours');
  if(hours) hours.innerHTML = String(c.hours || '')
    .split('\n').filter(Boolean).map(l => `<div>${esc(l)}</div>`).join('');
}

window.addEventListener('hashchange', render);
/* The registrar's tab changed the shared store — reflect it. */
window.addEventListener('storage', e => { if(e.key === 'tbm_is_v1'){ DB.reload(); render(); } });

DB.load();
fillFooter();
render();
