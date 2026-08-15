/* applications.js — the admissions bridge.

   One application record is written by the public portal and read, decided on and
   converted by the registrar inside the internal system. Both sides load this file,
   so the lifecycle rules live in exactly one place: the portal cannot invent a
   status the registrar does not understand, and the registrar cannot convert an
   application in a way the portal's tracker would misreport.

   Lifecycle:
     Submitted ─▶ Under Review ─▶ Approved ─▶ Enrolled        (terminal, has enrollment)
                       │              │
                       └──────────────┴─▶ Rejected            (terminal, has reason)
     any non-terminal ──────────────────▶ Withdrawn           (terminal, applicant pulled out)
*/

const APPS = (() => {

  const OPEN_STATES  = ['Submitted','Under Review','Approved'];
  const FINAL_STATES = ['Enrolled','Rejected','Withdrawn'];
  const ALL_STATES   = [...OPEN_STATES, ...FINAL_STATES];

  /* What each state is allowed to become. Anything else is a bug, not a workflow. */
  const NEXT = {
    'Submitted':    ['Under Review','Approved','Rejected','Withdrawn'],
    'Under Review': ['Approved','Rejected','Withdrawn'],
    'Approved':     ['Enrolled','Rejected','Withdrawn'],
    'Enrolled':     [],
    'Rejected':     [],
    'Withdrawn':    [],
  };

  const D = () => DB.get();
  const isOpen  = a => OPEN_STATES.includes(a.status);
  const isFinal = a => FINAL_STATES.includes(a.status);

  /* ---------- reference codes ----------
     Six characters the applicant can read over the phone: no O/0, no I/1/L. */
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function refCode(){
    let code;
    do{
      code = Array.from({ length:6 },
        () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
    }while(D().applications.some(a => a.ref === code));
    return code;
  }

  /* ---------- seat accounting ----------
     A pending application is a soft claim on a seat. Counting it stops the portal
     from accepting twenty applications for the last twelve ECDIS chairs, which is
     the failure the registrar would otherwise absorb by hand. */
  function seatsTaken(batch){
    const enrolled = D().enrollments
      .filter(e => e.batchId === batch.id && ['Enrolled','Reserved','Completed'].includes(e.status)).length;
    const pending = D().applications
      .filter(a => a.batchId === batch.id && isOpen(a) && !a.enrollmentId).length;
    return { enrolled, pending, total:enrolled + pending, free:Math.max(0, batch.capacity - enrolled - pending) };
  }

  /* Batches the public may apply to: open, not yet started, and with a free seat. */
  function openBatches(){
    const today = DB.today();
    return D().batches
      .filter(b => b.status === 'Open' && b.start >= today && seatsTaken(b).free > 0)
      .sort((a,b) => a.start.localeCompare(b.start));
  }

  const course = id => D().courses.find(c => c.id === id);
  const batch  = id => D().batches.find(b => b.id === id);

  /* ---------- submission ----------
     Field order here mirrors the order the applicant fills them in, which is the
     order the registrar reads them back. Grouped: identity, personal, contact,
     employment, emergency. */
  const REQUIRED = [
    'srn',                                   // identity
    'last','first',
    'birth','birthPlace',                    // personal
    'mobile','email','address',              // contact
    'rank','agency',                         // employment ("Company" on the form)
    'emergencyName','emergencyMobile',       // emergency
    'batchId',
  ];

  /* Shown next to a highlighted field, and reused by the registrar's screen. */
  const LABELS = {
    srn:'SRN', last:'Last name', first:'First name', middle:'Middle name', suffix:'Suffix',
    sex:'Sex', birth:'Date of birth', birthPlace:'Place of birth',
    mobile:'Mobile number', email:'Email address', address:'Address',
    rank:'Rank / position', agency:'Company',
    emergencyName:'Emergency contact person', emergencyRelation:'Relationship',
    emergencyMobile:'Emergency contact number',
    sirb:'SIRB number', passport:'Passport number',
    batchId:'Schedule', batchFull:'Schedule', batchStarted:'Schedule', duplicate:'Application',
  };

  function validate(p){
    const errors = [];
    REQUIRED.forEach(f => { if(!String(p[f] || '').trim()) errors.push(f); });

    const b = batch(p.batchId);
    if(p.batchId && !b) errors.push('batchId');
    if(b && seatsTaken(b).free <= 0) errors.push('batchFull');
    if(b && b.start < DB.today()) errors.push('batchStarted');

    if(p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) errors.push('email');
    if(p.birth && p.birth >= DB.today()) errors.push('birth');

    /* Philippine mobile numbers: 11 digits starting 09, or +63 9xxxxxxxxx.
       Checked loosely — the registrar calls this number, so a wrong format is a
       real cost, but rejecting an overseas number would be worse. */
    const digits = s => String(s || '').replace(/\D/g,'');
    if(p.mobile && digits(p.mobile).length < 10) errors.push('mobile');
    if(p.emergencyMobile && digits(p.emergencyMobile).length < 10) errors.push('emergencyMobile');

    /* An emergency contact who is the applicant is not an emergency contact. */
    if(p.mobile && p.emergencyMobile && digits(p.mobile) === digits(p.emergencyMobile)){
      errors.push('emergencyMobile');
    }

    /* Same person, same batch, still pending — a double submit, not a second course. */
    if(b && D().applications.some(a =>
        a.batchId === b.id && isOpen(a) &&
        a.last.toLowerCase().trim()  === String(p.last||'').toLowerCase().trim() &&
        a.first.toLowerCase().trim() === String(p.first||'').toLowerCase().trim())){
      errors.push('duplicate');
    }
    return errors;
  }

  function submit(p){
    DB.reload();                      // another tab may have written since this page loaded
    const errors = validate(p);
    if(errors.length){ const e = new Error('Validation failed'); e.errors = errors; throw e; }

    const b = batch(p.batchId);
    const now = new Date().toISOString();
    const app = {
      id:DB.uid('app'),
      no:DB.nextNo('application','APP'),
      ref:refCode(),
      submitted:DB.today(),
      channel:'Public Portal',
      status:'Submitted',
      courseId:b.courseId, batchId:b.id,
      // identity
      srn:t(p.srn).toUpperCase(),
      last:t(p.last), first:t(p.first), middle:t(p.middle), suffix:t(p.suffix),
      // personal
      sex:p.sex || 'M', birth:p.birth || '', birthPlace:t(p.birthPlace),
      sirb:t(p.sirb), passport:t(p.passport),
      // contact
      mobile:t(p.mobile), email:t(p.email).toLowerCase(), address:t(p.address),
      // employment
      rank:t(p.rank), agency:t(p.agency),
      // emergency
      emergencyName:t(p.emergencyName), emergencyRelation:t(p.emergencyRelation),
      emergencyMobile:t(p.emergencyMobile),
      payer:p.payer || 'Self-paid',
      remarks:t(p.remarks),
      traineeId:'', enrollmentId:'', decidedBy:'', decidedOn:'', reason:'',
      history:[{ ts:now, status:'Submitted', by:'Public Portal', note:'Application received online' }],
    };
    D().applications.push(app);
    DB.activity('Public application received', app.no);
    DB.save();
    return app;
  }
  const t = s => String(s ?? '').trim();

  /* ---------- tracking ----------
     Reference code alone is not enough — it is short and printed on a slip that can
     be lost. Pairing it with the surname keeps one applicant out of another's file. */
  function track(ref, surname){
    const r = t(ref).toUpperCase(), s = t(surname).toLowerCase();
    if(!r || !s) return null;
    return D().applications.find(a =>
      a.ref === r && a.last.toLowerCase() === s) || null;
  }

  /* ---------- state changes ---------- */
  function advance(app, status, by, note){
    if(!NEXT[app.status].includes(status)){
      throw new Error(`Cannot move an application from ${app.status} to ${status}.`);
    }
    app.status = status;
    app.history.push({ ts:new Date().toISOString(), status, by:by || 'System', note:note || '' });
    if(FINAL_STATES.includes(status)){ app.decidedBy = by || 'System'; app.decidedOn = DB.today(); }
    return app;
  }

  function reject(app, reason, by){
    advance(app, 'Rejected', by, reason);
    app.reason = reason || '';
    DB.activity('Rejected application', app.no);
    return app;
  }

  function withdraw(app, reason, by){
    advance(app, 'Withdrawn', by, reason);
    app.reason = reason || '';
    DB.activity('Withdrew application', app.no);
    return app;
  }

  /* ---------- duplicate detection ----------
     Seafarers come back for refreshers, so most applicants already exist in the
     registry. Matching on SRN first, then name + birthdate, avoids a second master
     record whose invoices and certificates would live under a different number. */
  function matchTrainee(app){
    const reg = D().trainees;
    const srn = t(app.srn).toUpperCase();
    if(srn){
      const bySrn = reg.find(x => t(x.srn).toUpperCase() === srn);
      if(bySrn) return { trainee:bySrn, on:'SRN' };
    }
    const byName = reg.find(x =>
      x.last.toLowerCase()  === app.last.toLowerCase() &&
      x.first.toLowerCase() === app.first.toLowerCase() &&
      (!app.birth || !x.birth || x.birth === app.birth));
    return byName ? { trainee:byName, on:'name and birthdate' } : null;
  }

  /* ---------- conversion ----------
     Approve → enroll in one transaction: the master record, the enrollment and (when
     the registrar confirms rather than reserves) the invoice and its journal entry.
     opts = { by, mode:'Enrolled'|'Reserved', addons:[{desc,account,price}], discount, discountNote } */
  function convert(app, opts = {}){
    if(app.enrollmentId) throw new Error('This application has already been enrolled.');
    if(app.status !== 'Approved') throw new Error('Approve the application before enrolling it.');

    const b = batch(app.batchId), c = course(app.courseId);
    if(!b || !c) throw new Error('The batch this application selected no longer exists.');

    const enrolledSeats = D().enrollments
      .filter(e => e.batchId === b.id && ['Enrolled','Reserved','Completed'].includes(e.status)).length;
    if(enrolledSeats >= b.capacity) throw new Error('That batch is now full — move the applicant to another schedule.');

    const by = opts.by || 'System';

    /* 1 — master record: reuse the seafarer's existing file when we have one. */
    const hit = matchTrainee(app);
    let trainee = hit && hit.trainee;
    if(trainee){
      /* The application carries the fresher contact and next-of-kin details;
         the existing file keeps its identity and its number. */
      ['mobile','email','address','rank','agency',
       'emergencyName','emergencyRelation','emergencyMobile']
        .forEach(f => { if(app[f]) trainee[f] = app[f]; });
      ['srn','sirb','passport','suffix','birthPlace']
        .forEach(f => { if(app[f] && !trainee[f]) trainee[f] = app[f]; });
    }else{
      trainee = {
        id:DB.uid('trn'), no:DB.nextNo('trainee','TRN'),
        srn:app.srn,
        last:app.last, first:app.first, middle:app.middle, suffix:app.suffix,
        sex:app.sex, birth:app.birth, birthPlace:app.birthPlace,
        sirb:app.sirb, passport:app.passport,
        rank:app.rank, agency:app.agency,
        mobile:app.mobile, email:app.email, address:app.address,
        emergencyName:app.emergencyName, emergencyRelation:app.emergencyRelation,
        emergencyMobile:app.emergencyMobile,
        registered:DB.today(),
        remarks:`Registered through the public portal — ${app.no}`,
      };
      D().trainees.push(trainee);
    }

    /* 2 — enrollment */
    const mode = opts.mode === 'Reserved' ? 'Reserved' : 'Enrolled';
    const discount = ACC.r2(opts.discount || 0);
    const enr = {
      id:DB.uid('enr'), no:DB.nextNo('enrollment','ENR'),
      traineeId:trainee.id, batchId:b.id, courseId:c.id,
      date:DB.today(), status:mode, result:'',
      /* The fee belongs to the batch — the same course costs a different amount
         at each partner training center. */
      fee:b.fee, discount, discountNote:opts.discountNote || '',
      certificateNo:'', remarks:`From application ${app.no}`,
      applicationId:app.id,
    };
    D().enrollments.push(enr);

    /* 3 — billing, only when the seat is confirmed. A reservation is not receivable. */
    let inv = null;
    if(mode === 'Enrolled'){
      const items = [
        { desc:`${c.title} — ${b.center}`, account:'4000', qty:1, price:b.fee },
        ...(opts.addons || []).map(a => ({ desc:a.desc, account:a.account, qty:1, price:a.price })),
      ];
      inv = ACC.buildInvoice({ enrollmentId:enr.id, traineeId:trainee.id, date:enr.date, items, discount });
      D().invoices.push(inv);
      ACC.postInvoice(inv);
      enr.invoiceId = inv.id;
    }

    /* 4 — close the application against what was actually created */
    app.traineeId = trainee.id;
    app.enrollmentId = enr.id;
    advance(app, 'Enrolled', by,
      `Enrolled as ${enr.no}${inv ? ' · billed ' + inv.no : ' · reserved, not yet billed'}`);
    DB.activity('Converted application to enrollment', `${app.no} → ${enr.no}`);
    DB.save();

    return { trainee, enrollment:enr, invoice:inv, reused:!!hit, matchedOn:hit ? hit.on : '' };
  }

  /* ---------- queue helpers for the registrar's screen ---------- */
  const pending = () => D().applications.filter(a => a.status === 'Submitted' || a.status === 'Under Review');

  function counts(){
    const out = Object.fromEntries(ALL_STATES.map(s => [s, 0]));
    D().applications.forEach(a => { out[a.status] = (out[a.status] || 0) + 1; });
    return out;
  }

  const find    = id  => D().applications.find(a => a.id === id);
  const ageDays = a   => Math.floor((new Date(DB.today()) - new Date(a.submitted)) / 86400000);

  /* "Dela Cruz Jr., Juan M." — surname first, suffix attached to it, middle
     initialled. Works for applications and trainees alike; both carry the same
     name fields. */
  const forName = a => a
    ? `${a.last}${a.suffix ? ' ' + a.suffix : ''}, ${a.first}${a.middle ? ' ' + a.middle[0] + '.' : ''}`
    : '—';

  return {
    OPEN_STATES, FINAL_STATES, ALL_STATES, NEXT, REQUIRED, LABELS,
    isOpen, isFinal, refCode, seatsTaken, openBatches,
    validate, submit, track, advance, reject, withdraw,
    matchTrainee, convert, pending, counts, find, forName, ageDays,
    course, batch,
  };
})();
