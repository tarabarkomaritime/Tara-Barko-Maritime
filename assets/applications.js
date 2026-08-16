/* applications.js — the registration bridge.

   The public portal writes a registration; the internal system reads it. Both
   sides load this file, so the rules live in exactly one place: the portal
   cannot write a record the staff screens do not understand, and the staff
   cannot record an enrollment the portal's tracker would misreport.

   There is no approval queue. A public registration creates the seafarer's
   master record straight away — the registrar finds them by searching Trainees
   and encodes an enrollment against a course and a date agreed with them. A
   seafarer registering a second time updates the record they already have
   rather than being turned away as a duplicate: coming back for another course
   is the normal case, not an error.

   Money lives here too (`enroll`), next to the record it bills, so the whole
   chain — trainee, enrollment, invoice, journal entry — is one transaction that
   can be exercised in the test harness without a browser. */

const APPS = (() => {

  const D = () => DB.get();
  const t = s => String(s ?? '').trim();

  /* ---------- reference codes ----------
     Six characters the seafarer can read over the phone: no O/0, no I/1/L. */
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function refCode(){
    let code;
    do{
      code = Array.from({ length:6 },
        () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
    }while(D().applications.some(a => a.ref === code));
    return code;
  }

  const course = id => D().courses.find(c => c.id === id);

  /* ---------- the registration form ----------
     Field order mirrors the order the applicant fills them in, which is the
     order the registrar reads them back: identity, personal, contact,
     employment, emergency. No course and no date — those are agreed with the
     Registrar and encoded by staff. */
  const REQUIRED = [
    'srn',
    'last','first',
    'birth','birthPlace',
    'mobile','email','address','facebook',
    'rank','agency',
    'emergencyName','emergencyMobile',
  ];

  const LABELS = {
    srn:'SRN', last:'Last Name', first:'First Name', middle:'Middle Name', suffix:'Suffix',
    sex:'Sex', birth:'Date of Birth', birthPlace:'Place of Birth',
    mobile:'Mobile Number', email:'Email Address', address:'Home Address',
    facebook:'Facebook Profile Link', messenger:'Messenger / Meta Chat Link',
    rank:'Rank / Position', agency:'Company',
    emergencyName:'Emergency Contact Person', emergencyRelation:'Relationship',
    emergencyMobile:'Emergency Contact Number',
  };

  function validate(p){
    const errors = [];
    REQUIRED.forEach(f => { if(!t(p[f])) errors.push(f); });

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

    /* The Registrar has to open these to reply, so a name typed where a link
       belongs is a dead end. Checked loosely — a bare username is fine, a
       sentence is not. */
    const linkish = v => /^\S+$/.test(t(v)) && t(v).length >= 3;
    if(p.facebook  && !linkish(p.facebook))  errors.push('facebook');
    if(p.messenger && !linkish(p.messenger)) errors.push('messenger');

    /* Deliberately no duplicate rule. A seafarer who already registered may
       register again for another course; the record is updated, not rejected. */
    return errors;
  }

  /* ---------- master record ----------
     Seafarers come back for refreshers, so most people registering already
     exist. Matching on SRN first, then name + birthdate, avoids a second master
     record whose invoices and certificates would live under a different number. */
  function matchTrainee(p){
    const reg = D().trainees;
    const srn = t(p.srn).toUpperCase();
    if(srn){
      const bySrn = reg.find(x => t(x.srn).toUpperCase() === srn);
      if(bySrn) return { trainee:bySrn, on:'SRN' };
    }
    const byName = reg.find(x =>
      x.last.toLowerCase()  === t(p.last).toLowerCase() &&
      x.first.toLowerCase() === t(p.first).toLowerCase() &&
      (!p.birth || !x.birth || x.birth === p.birth));
    return byName ? { trainee:byName, on:'name and birthdate' } : null;
  }

  /* Create the seafarer's file, or refresh the one we have. The existing record
     keeps its identity and its number; what the seafarer just typed is fresher
     for anything we use to reach them. */
  const FRESHER = ['mobile','email','address','facebook','messenger','rank','agency',
                   'emergencyName','emergencyRelation','emergencyMobile'];
  const FILL_IF_BLANK = ['srn','middle','suffix','sex','birth','birthPlace'];

  function upsertTrainee(p, source){
    const hit = matchTrainee(p);
    if(hit){
      FRESHER.forEach(f => { if(t(p[f])) hit.trainee[f] = t(p[f]); });
      FILL_IF_BLANK.forEach(f => { if(t(p[f]) && !t(hit.trainee[f])) hit.trainee[f] = t(p[f]); });
      return { trainee:hit.trainee, reused:true, matchedOn:hit.on };
    }
    const trainee = {
      id:DB.uid('trn'), no:DB.nextNo('trainee','TRN'),
      srn:t(p.srn).toUpperCase(),
      last:t(p.last), first:t(p.first), middle:t(p.middle), suffix:t(p.suffix),
      sex:p.sex || 'M', birth:p.birth || '', birthPlace:t(p.birthPlace),
      sirb:'', passport:'',          // recorded by staff from the originals
      rank:t(p.rank), agency:t(p.agency),
      mobile:t(p.mobile), email:t(p.email).toLowerCase(), address:t(p.address),
      facebook:t(p.facebook), messenger:t(p.messenger),
      emergencyName:t(p.emergencyName), emergencyRelation:t(p.emergencyRelation),
      emergencyMobile:t(p.emergencyMobile),
      registered:DB.today(),
      source:source || 'Encoded at the desk',
      remarks:'',
    };
    D().trainees.push(trainee);
    return { trainee, reused:false, matchedOn:'' };
  }

  /* ---------- public registration ---------- */
  function submit(p){
    DB.reload();                      // another tab may have written since this page loaded
    const errors = validate(p);
    if(errors.length){ const e = new Error('Validation failed'); e.errors = errors; throw e; }

    const now = new Date().toISOString();
    const { trainee, reused } = upsertTrainee(p, 'Public portal');

    /* The registration row is kept even though there is no queue to work: it is
       the record of what this person agreed to and when. The terms carry a
       no-refund and a limited-liability clause, both only enforceable if the
       exact wording accepted can be identified later — hence the version stamp
       rather than a bare boolean. */
    const reg = {
      id:DB.uid('app'),
      no:DB.nextNo('application','REG'),
      ref:refCode(),
      submitted:DB.today(),
      channel:'Public Portal',
      status:'Registered',
      traineeId:trainee.id,
      srn:trainee.srn, last:trainee.last, first:trainee.first,
      termsVersion:t(p.termsVersion),
      termsAccepted:Array.isArray(p.termsAccepted) ? p.termsAccepted.slice() : [],
      termsAcceptedAt:now,
      history:[{ ts:now, status:'Registered', by:'Public Portal',
                 note:`Registered online · terms ${t(p.termsVersion) || 'not recorded'} accepted` }],
    };
    D().applications.push(reg);
    DB.activity(reused ? 'Public registration (existing seafarer)' : 'Public registration', reg.no);
    DB.save();

    return { ...reg, trainee, reused };
  }

  /* ---------- enrollment ----------
     Encoded by staff against a course and a date they agreed with the trainee.
     There is no schedule to pick from and no seat count: every enrollment is
     its own booking at its own price, which is what brokering seats at partner
     centers actually is.

     opts = { courseId, start, end, center, room, instructor, fee, by,
              mode:'Enrolled'|'Reserved', charges:[{desc,account,price}],
              discount, discountNote } */
  function enroll(trainee, opts = {}){
    if(!trainee) throw new Error('Choose the trainee to enroll.');
    const c = course(opts.courseId);
    if(!c) throw new Error('Choose the course to enroll them in.');
    if(!opts.start) throw new Error('Set the training date.');

    const fee = ACC.r2(opts.fee);
    if(!(fee >= 0)) throw new Error('Enter the agreed fee.');
    if(opts.end && opts.end < opts.start) throw new Error('The end date cannot fall before the start date.');

    const mode = opts.mode === 'Reserved' ? 'Reserved' : 'Enrolled';
    const discount = ACC.r2(opts.discount || 0);

    const enr = {
      id:DB.uid('enr'), no:DB.nextNo('enrollment','ENR'),
      traineeId:trainee.id, courseId:c.id,
      /* The booking itself: where, when and for how much. */
      /* The center belongs to the course entry — the price list is one row per
         course at one center — so it only has to be passed in to override it. */
      center:t(opts.center) || t(c.center), room:t(opts.room), instructor:t(opts.instructor),
      start:opts.start, end:opts.end || opts.start,
      date:DB.today(), status:mode, result:'',
      fee, discount, discountNote:t(opts.discountNote),
      certificateNo:'', remarks:t(opts.remarks),
    };
    D().enrollments.push(enr);

    /* What the center is owed for this seat, and how the rebate is settled.
       Taken from the course entry the booking names — that entry is the price
       list row for this course at this center. */
    const rebate = opts.rebate != null ? ACC.r2(opts.rebate) : ACC.r2(c.rebate || 0);
    const deduct = opts.deduct != null ? !!opts.deduct : !!c.deduct;
    enr.rebate = rebate;
    enr.deduct = deduct;

    /* Billing, only when the booking is confirmed. A reservation is not receivable. */
    let inv = null;
    if(mode === 'Enrolled'){
      const items = [
        { desc:`${c.title}${enr.center ? ' — ' + enr.center : ''}`, account:'4000', qty:1, price:fee },
        ...(opts.charges || []).map(a => ({ desc:a.desc, account:a.account || '4100', qty:1, price:a.price })),
      ];
      inv = ACC.buildInvoice({ enrollmentId:enr.id, traineeId:trainee.id, date:enr.date, items, discount });
      D().invoices.push(inv);
      ACC.postInvoice(inv);
      enr.invoiceId = inv.id;

      /* The debt to the center exists from the moment the seat is booked, not
         when the trainee finishes paying — so it posts here, alongside the bill. */
      if(fee > 0){
        const s = ACC.postCenterPayable({
          date:enr.date,
          memo:`${c.title}${enr.center ? ' — ' + enr.center : ''} · ${enr.no}`,
          refNo:enr.no, refId:enr.id, fee, rebate, deduct,
        });
        enr.centerPayable = s.payable;
        enr.rebateReceivable = s.receivable;
      }
    }

    DB.activity('Enrolled trainee', `${trainee.no} → ${enr.no}`);
    DB.save();
    return { trainee, enrollment:enr, invoice:inv };
  }

  /* Register and enroll in one step — the walk-in at the counter, who is not
     going to fill in the public form first. */
  function encode(p, opts = {}){
    const errors = validate(p);
    if(errors.length){ const e = new Error('Validation failed'); e.errors = errors; throw e; }
    const { trainee, reused, matchedOn } = upsertTrainee(p, opts.source || 'Encoded at the desk');
    const out = enroll(trainee, opts);
    return { ...out, reused, matchedOn };
  }

  /* ---------- tracking ----------
     Looked up by SRN and last name. A seafarer knows their SRN by heart and can
     lose a printed slip, so this is the pair they can always produce. Neither
     half alone is enough: the SRN is not secret, and the surname keeps one
     seafarer out of another's file. */
  function findTrainee(srn, surname){
    const r = t(srn).toUpperCase(), s = t(surname).toLowerCase();
    if(!r || !s) return null;
    return D().trainees.find(x =>
      t(x.srn).toUpperCase() === r && t(x.last).toLowerCase() === s) || null;
  }

  /* Every enrollment on that file, newest booking first. A returning seafarer
     has several, and the portal lists them all. */
  const enrollmentsFor = traineeId => D().enrollments
    .filter(e => e.traineeId === traineeId)
    .sort((a,b) => String(b.start||'').localeCompare(String(a.start||'')) || b.no.localeCompare(a.no));

  function track(srn, surname){
    const trainee = findTrainee(srn, surname);
    if(!trainee) return null;
    return { trainee, enrollments:enrollmentsFor(trainee.id),
             registrations:D().applications.filter(a => a.traineeId === trainee.id) };
  }

  const registrationsFor = traineeId => D().applications.filter(a => a.traineeId === traineeId);

  /* "Dela Cruz Jr., Juan M." — surname first, suffix attached to it, middle
     initialled. Works for registrations and trainees alike; both carry the same
     name fields. */
  const forName = a => a
    ? `${a.last}${a.suffix ? ' ' + a.suffix : ''}, ${a.first}${a.middle ? ' ' + a.middle[0] + '.' : ''}`
    : '—';

  return {
    REQUIRED, LABELS,
    refCode, validate, submit, encode, enroll,
    matchTrainee, upsertTrainee,
    track, findTrainee, enrollmentsFor, registrationsFor,
    forName, course,
  };
})();

if(typeof module !== 'undefined') module.exports = { APPS };
