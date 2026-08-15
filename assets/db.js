/* db.js — persistence layer, schema and seed data.
   Everything lives in localStorage under one key so backup/restore is a single JSON blob. */

const DB = (() => {
  const KEY = 'tbm_is_v1';
  let data = null;

  /* ---------- Chart of accounts ----------
     `nature` decides which side increases the account, and drives the trial balance. */
  const COA = [
    { code:'1000', name:'Cash on Hand',            type:'Asset',     nature:'debit'  },
    { code:'1010', name:'Cash in Bank',            type:'Asset',     nature:'debit'  },
    { code:'1200', name:'Accounts Receivable',     type:'Asset',     nature:'debit'  },
    { code:'2100', name:'Output VAT Payable',      type:'Liability', nature:'credit' },
    { code:'2200', name:'Unearned Training Fees',  type:'Liability', nature:'credit' },
    { code:'3000', name:"Owner's Equity",          type:'Equity',    nature:'credit' },
    { code:'4000', name:'Training Fees Revenue',   type:'Revenue',   nature:'credit' },
    { code:'4100', name:'Assessment & Other Fees', type:'Revenue',   nature:'credit' },
    { code:'4900', name:'Discounts Given',         type:'Revenue',   nature:'debit'  }, // contra-revenue
    { code:'5000', name:'Instructor Fees',         type:'Expense',   nature:'debit'  },
    { code:'5100', name:'Training Materials',      type:'Expense',   nature:'debit'  },
    { code:'5200', name:'Rent & Utilities',        type:'Expense',   nature:'debit'  },
    { code:'5300', name:'Salaries & Wages',        type:'Expense',   nature:'debit'  },
    { code:'5400', name:'Regulatory & Permits',    type:'Expense',   nature:'debit'  },
    { code:'5900', name:'Miscellaneous Expense',   type:'Expense',   nature:'debit'  },
  ];

  const USERS = [
    { id:'u1', name:'Kate Esguerra',   role:'admin',      code:'admin',      initials:'KE' },
    { id:'u2', name:'Registrar Desk',  role:'registrar',  code:'registrar',  initials:'RD' },
    { id:'u3', name:'Cashier Window',  role:'cashier',    code:'cashier',    initials:'CW' },
    { id:'u4', name:'Accounting Dept', role:'accounting', code:'accounting', initials:'AD' },
  ];

  /* Which modules each role may open. Admin sees everything. */
  const PERMS = {
    admin:      ['dashboard','admissions','trainees','courses','batches','enrollments','invoices','payments','expenses','ledger','reports','settings'],
    registrar:  ['dashboard','admissions','trainees','courses','batches','enrollments','invoices','reports'],
    cashier:    ['dashboard','trainees','enrollments','invoices','payments','reports'],
    accounting: ['dashboard','invoices','payments','expenses','ledger','reports','settings'],
  };

  const DEFAULT_COMPANY = {
    name:'TB - MARITIME TRAINING AND ASSESSMENT ENDORSEMENT',
    address:'9th Flr. GLC Bldg., T.M. Kalaw, Ermita, Manila',
    contact:'0985 804 4310  •  tarabarkomaritime@gmail.com',
    tin:'009-482-771-000',
    /* One line per row when displayed. Editable in Settings so the office can
       change them without a code change. */
    hours:'Monday to Friday, 8:00 AM – 5:00 PM\nSaturday, 8:00 AM – 5:00 PM',
    /* Where an applicant sends the screenshot of their submitted enrollment.
       Left blank on purpose — the acknowledgement then reads "our page" rather
       than naming somewhere that does not exist. Fill it in under Settings. */
    page:'',
    /* Documents the applicant sends in along with that screenshot, one per line.
       Listed on the acknowledgement so a single screenshot captures both the
       enrollment and what still has to follow it. Editable in Settings. */
    requirements:[
      'Basic Training Certificate / COP',
      'Any Government Valid ID',
      'Medical PEME Format',
      '2x2 Photo',
      'SRN Screenshot',
    ].join('\n'),
    vatRate:12,
    vatInclusive:true,
    fiscalYear:new Date().getFullYear(),
  };

  /* ---------- helpers ---------- */
  const today = () => new Date().toISOString().slice(0,10);
  const uid   = p => p + '-' + Math.random().toString(36).slice(2,9);
  const r2    = n => Math.round((Number(n)||0) * 100) / 100;

  function blank(){
    return {
      meta:{ version:1, created:today() },
      company:{ ...DEFAULT_COMPANY },
      users:USERS.map(u => ({...u})),
      accounts:COA.map(a => ({...a})),
      seq:{ trainee:0, course:0, batch:0, enrollment:0, invoice:0, receipt:0, voucher:0, journal:0, application:0 },
      applications:[],
      trainees:[], courses:[], batches:[], enrollments:[],
      invoices:[], payments:[], expenses:[], journal:[],
      log:[],
    };
  }

  /* Backups written before a store existed must still open. Every new top-level
     collection gets a default here rather than a version-bump migration script. */
  function migrate(d){
    d.applications = d.applications || [];
    d.expenses     = d.expenses || [];
    d.log          = d.log || [];
    d.seq          = d.seq || {};
    if(d.seq.application == null) d.seq.application = d.applications.length;
    d.company      = { ...DEFAULT_COMPANY, ...(d.company||{}) };

    /* A stored company profile normally wins over the default — it is what the
       admin typed in Settings. The exception is the placeholder identity that
       shipped with early builds: leaving it in place would print a phone number
       that reaches nobody, a wrong address, and an accreditation the company
       does not hold, on every page an applicant reads. Each is retired only when
       it still matches the placeholder exactly, so edited values survive. */
    const PLACEHOLDERS = {
      contact:'(02) 8523-4567  •  registrar@tarabarko.ph',
      name:'TARA BARKO MARITIME TRAINING & ASSESSMENT CENTER, INC.',
      address:'2nd Flr. Seafarer Bldg., Kalaw Ave., Ermita, Manila 1000',
    };
    Object.entries(PLACEHOLDERS).forEach(([field, old]) => {
      if(d.company[field] === old) d.company[field] = DEFAULT_COMPANY[field];
    });
    /* The company endorses seafarers to accredited partner centers; it does not
       hold an accreditation of its own, so the field is retired outright. */
    delete d.company.accreditation;
    return d;
  }

  /* Document numbers: PREFIX-YYYY-#### */
  function nextNo(kind, prefix){
    data.seq[kind] = (data.seq[kind] || 0) + 1;
    return `${prefix}-${new Date().getFullYear()}-${String(data.seq[kind]).padStart(4,'0')}`;
  }

  function load(){
    try{
      const raw = localStorage.getItem(KEY);
      data = raw ? JSON.parse(raw) : null;
    }catch(e){ data = null; }
    if(!data || !data.meta){ data = blank(); seed(); save(); }
    else migrate(data);
    return data;
  }

  /* The public portal writes into the same store from a second tab. Re-reading
     before a write keeps the registrar's screen from clobbering a fresh application. */
  function reload(){ data = null; return load(); }
  function save(){ localStorage.setItem(KEY, JSON.stringify(data)); return data; }
  function get(){ return data || load(); }

  function reset(withSeed){
    data = blank();
    if(withSeed) seed();
    save();
  }

  function activity(action, ref){
    data.log.unshift({ ts:new Date().toISOString(), user:(window.SESSION&&SESSION.name)||'system', action, ref:ref||'' });
    data.log = data.log.slice(0, 300);
  }

  /* ---------- backup / restore ---------- */
  function exportJSON(){
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `TBM-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function importJSON(text){
    const parsed = JSON.parse(text);
    if(!parsed.meta || !Array.isArray(parsed.trainees)) throw new Error('Not a Tara Barko backup file.');
    data = migrate(parsed);
    save();
  }

  /* ---------- seed ---------- */
  function seed(){
    /* The catalogue is generated from the internal price matrix by
       tools/import-courses.js — 239 courses, duplicates already collapsed, and
       carrying no fees or partner names. Tara Barko brokers seats at partner
       training centers, so a fee belongs to a booking at a named center, not to
       the course itself: `fee` therefore lives on the batch. */
    if(typeof COURSE_CATALOGUE === 'undefined'){
      throw new Error('assets/courses.js must be loaded before db.js — the seed builds the ' +
                      'catalogue from it. Regenerate with tools/import-courses.js if it is missing.');
    }
    data.courses = COURSE_CATALOGUE.map(c => ({
      id:uid('crs'),
      code:c.code, title:c.title,
      days:c.days ?? null, daysTo:c.daysTo, duration:c.duration,
      modes:c.modes || [], note:c.note || '',
      active:true,
    }));
    data.seq.course = data.courses.length;

    const crs = t => data.courses.find(c => c.title.toUpperCase() === t.toUpperCase());
    const dOff = n => { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
    const end  = (s,days) => { const d = new Date(s); d.setDate(d.getDate()+days-1); return d.toISOString().slice(0,10); };
    /* Trainees register shortly before a batch opens — and never in the future, so the
       seeded ledger, the ageing report and the as-of trial balance all agree. */
    const before = (date,n) => { const d = new Date(date); d.setDate(d.getDate()-n); const s = d.toISOString().slice(0,10); return s > today() ? today() : s; };
    const after  = (date,n) => { const d = new Date(date); d.setDate(d.getDate()+n); const s = d.toISOString().slice(0,10); return s > today() ? today() : s; };

    /* A batch is a booking of seats on a dated run at a named partner center, so
       it carries the fee and the capacity. Two centers running the same course in
       the same week are two batches at two prices — which is the business. */
    let bseq = 0;
    const B = (title, startOffset, center, room, instr, fee, cap, status) => {
      const c = crs(title);
      /* The seed names real catalogue entries. If one stops matching, the import
         renamed it — fail loudly rather than seeding a half-empty demo. */
      if(!c) throw new Error(`seed: no catalogue entry titled "${title}" — check tools/import-courses.js output`);
      const s = dOff(startOffset), days = c.days || 1;
      data.seq.batch++; bseq++;
      return { id:uid('bat'), no:`${c.code}-${String(data.seq.batch).padStart(3,'0')}`,
               courseId:c.id, start:s, end:end(s, Math.ceil(days)),
               center, room, instructor:instr, fee, capacity:cap, status };
    };
    data.batches = [
      B('BASIC TRAINING',              -30, 'Nautical Options',  'Pool / Rm 201', 'Capt. R. Villanueva',  5500, 30, 'Completed'),
      B('SSO - SHIP SECURITY OFFICER', -18, 'PNTC',              'Rm 305',        'Capt. M. Delos Reyes', 2700, 30, 'Completed'),
      B('MEFA - MEDICAL FIRST AID',     -6, 'Altitude Maritime', 'Rm 202',        'Dr. L. Sarmiento',     1600, 25, 'Ongoing'),
      B('BASIC TRAINING',               -2, 'Fareast',           'Pool / Rm 201', 'Capt. R. Villanueva',  6500, 30, 'Ongoing'),
      B('AFF',                           4, 'Nautical Options',  'Fire Ground',   'CE J. Bautista',       4200, 24, 'Open'),
      B('SCRB',                          9, 'Altitude Maritime', 'Pool / Rm 204', 'Capt. R. Villanueva',  3600, 20, 'Open'),
      B('DECK WATCHKEEPING',            15, 'PNTC',              'Simulator A',   'Capt. A. Ocampo',      3700, 16, 'Open'),
      B('SATSDSD',                      21, 'Great Seas',        'Rm 305',        'Capt. M. Delos Reyes',  700, 40, 'Open'),
      B('MECA - MEDICAL CARE',          28, 'Fareast',           'Rm 306',        'Dr. L. Sarmiento',     4400, 16, 'Open'),
    ].filter(Boolean);

    const names = [
      ['Juan Miguel','Dela Cruz','M','Able Seaman'], ['Ramon','Bautista','M','Oiler'],
      ['Maria Cristina','Reyes','F','Messman'],      ['Jose Antonio','Santiago','M','3rd Officer'],
      ['Ferdinand','Aquino','M','Bosun'],            ['Angelo','Mercado','M','4th Engineer'],
      ['Rowena','Villareal','F','Steward'],          ['Christian Paul','Lim','M','Deck Cadet'],
      ['Nestor','Pangilinan','M','Chief Cook'],      ['Arnel','Sarmiento','M','2nd Officer'],
      ['Grace','Manalo','F','Engine Cadet'],         ['Rodolfo','Cabrera','M','Fitter'],
      ['Emmanuel','Yap','M','3rd Engineer'],         ['Jerome','Alcantara','M','Ordinary Seaman'],
      ['Lorna','Castillo','F','Laundryman'],         ['Benjamin','Tolentino','M','Master'],
      ['Alvin','Domingo','M','Electrician'],         ['Rico','Fernandez','M','Pumpman'],
    ];
    const agencies = ['Magsaysay Maritime Corp.','Philippine Transmarine Carriers','Anglo-Eastern Crew Mgmt','Wallem Maritime Services','Direct Hire / Walk-in','Scanmar Maritime Services'];

    const TOWNS = ['Tondo, Manila','Cavite City, Cavite','Iloilo City, Iloilo',
                   'Cebu City, Cebu','Bacolod City, Negros Occidental','Zamboanga City, Zamboanga del Sur'];
    const NEXTOFKIN = ['Spouse','Mother','Father','Sister','Brother','Spouse'];

    data.trainees = names.map(([fn,ln,sex,rank],i) => {
      data.seq.trainee++;
      const y = 1978 + (i*3) % 25;
      const town = TOWNS[i%6];
      return {
        id:uid('trn'),
        no:`TRN-${new Date().getFullYear()}-${String(data.seq.trainee).padStart(4,'0')}`,
        srn:`SRN-${100000+i*137}`,
        last:ln, first:fn, middle:['Santos','Cruz','Reyes','Garcia','Lopez','Torres'][i%6],
        suffix:(i % 7 === 3) ? 'Jr.' : '',
        sex, birth:`${y}-0${(i%9)+1}-1${i%9}`, birthPlace:town,
        sirb:`B${2000000+i*911}`, passport:`P${3000000+i*733}A`,
        rank, agency:agencies[i%agencies.length],
        mobile:`09${17+(i%3)}${String(1000000+i*54321).slice(0,7)}`,
        email:`${fn.split(' ')[0].toLowerCase()}.${ln.toLowerCase()}@mail.com`,
        facebook:`facebook.com/${fn.split(' ')[0].toLowerCase()}.${ln.toLowerCase().replace(/\s+/g,'')}`,
        messenger:'',
        address:town,
        emergencyName:`${['Maria','Ana','Josefa','Elena','Teresita','Luzviminda'][i%6]} ${ln}`,
        emergencyRelation:NEXTOFKIN[i%6],
        emergencyMobile:`0919${String(4000000+i*31415).slice(0,7)}`,
        registered:dOff(-90 + i*4),
        remarks:'',
      };
    });

    /* Enrollments across the completed/ongoing/open batches, each with an invoice. */
    const enrollPlan = [
      [0,0,'Completed','Passed'],[0,1,'Completed','Passed'],[0,2,'Completed','Passed'],[0,3,'Completed','Failed'],[0,4,'Completed','Passed'],
      [1,5,'Completed','Passed'],[1,6,'Completed','Passed'],[1,7,'Completed','Passed'],
      [2,8,'Enrolled',''],[2,9,'Enrolled',''],[2,10,'Enrolled',''],[2,0,'Enrolled',''],
      [3,11,'Enrolled',''],[3,12,'Enrolled',''],[3,13,'Enrolled',''],[3,14,'Enrolled',''],[3,1,'Enrolled',''],
      [4,15,'Reserved',''],[4,16,'Enrolled',''],[4,2,'Enrolled',''],
      [5,17,'Reserved',''],[5,3,'Enrolled',''],[5,4,'Reserved',''],
      [6,5,'Enrolled',''],[6,15,'Enrolled',''],
      [7,6,'Reserved',''],[7,7,'Reserved',''],
      [8,16,'Enrolled',''],
    ];

    enrollPlan.forEach(([bi,ti,status,result],i) => {
      const b = data.batches[bi], t = data.trainees[ti], c = data.courses.find(x=>x.id===b.courseId);
      const discount = (i % 7 === 0) ? r2(b.fee * 0.10) : 0;   // occasional company discount
      const regDate = before(b.start, 4 + (i % 9));
      data.seq.enrollment++;
      const enr = {
        id:uid('enr'),
        no:`ENR-${new Date().getFullYear()}-${String(data.seq.enrollment).padStart(4,'0')}`,
        traineeId:t.id, batchId:b.id, courseId:c.id,
        date: regDate, status, result,
        fee:b.fee, discount, discountNote: discount ? 'Company package rate' : '',
        certificateNo: result === 'Passed' ? `TBM-${c.code}-${String(9000+i)}` : '',
        remarks:'',
      };
      data.enrollments.push(enr);

      // Reservations are not yet billed — matches how a registrar actually works.
      if(status === 'Reserved') return;

      const items = [{ desc:`${c.title} — ${b.center}`, account:'4000', qty:1, price:b.fee }];
      if(i % 3 === 0) items.push({ desc:'Training kit & assessment fee', account:'4100', qty:1, price:450 });

      const inv = ACC.buildInvoice({ enrollmentId:enr.id, traineeId:t.id, date:enr.date, items, discount });
      data.invoices.push(inv);
      ACC.postInvoice(inv);
      enr.invoiceId = inv.id;

      // Payment behaviour: most pay in full, some partially, a few not at all.
      const mode = i % 5;
      if(mode !== 4){
        const amt = mode === 3 ? r2(inv.total * 0.5) : inv.total;
        const p = ACC.buildPayment({ invoiceId:inv.id, traineeId:t.id, date:after(enr.date, i % 5),
          amount:amt, method:['Cash','GCash','Bank Transfer','Cash'][i%4], ref:'' });
        data.payments.push(p);
        ACC.postPayment(p, inv);
      }
    });

    /* A few operating expenses so the income statement is not revenue-only. */
    const EX = (date, payee, acct, amount, particulars, method) => {
      data.seq.voucher++;
      const v = { id:uid('exp'), no:`DV-${new Date().getFullYear()}-${String(data.seq.voucher).padStart(4,'0')}`,
                  date, payee, account:acct, amount, particulars, method };
      data.expenses.push(v);
      ACC.postExpense(v);
    };
    EX(dOff(-28),'Capt. R. Villanueva','5000',12000,'Instructor honorarium — BT batch','Bank Transfer');
    EX(dOff(-26),'Seatech Supplies Inc.','5100',5450,'Lifejackets, flares and training consumables','Cash');
    EX(dOff(-25),'Kalaw Realty Corp.','5200',22000,'Office and training room rent','Bank Transfer');
    EX(dOff(-20),'Payroll','5300',18000,'Administrative staff salaries','Bank Transfer');
    EX(dOff(-15),'City of Manila','5400',6500,'Business permit and licence renewal','Cash');
    EX(dOff(-9), 'Dr. L. Sarmiento','5000',8000,'Instructor honorarium — MEFA batch','Bank Transfer');
    EX(dOff(-4), 'Meralco / Maynilad','5200',4800,'Electricity and water','Bank Transfer');

    /* Applications waiting at the registrar's desk — these arrive from the public
       portal, so the seed puts a few in the queue at different stages. */
    const PLACES = ['Navotas, Metro Manila','Lucena City, Quezon','Dumaguete City, Negros Oriental',
                    'Tacloban City, Leyte','Iloilo City, Iloilo'];
    const KIN = [['Marilou','Spouse'],['Rosario','Mother'],['Editha','Spouse'],
                 ['Ligaya','Sister'],['Corazon','Mother']];

    const AP = (_unused, [fn,ln,mn,sfx,sex,rank,agency], daysAgo, status, extra) => {
      data.seq.application++;
      const i = data.seq.application - 1;
      const [kin, rel] = KIN[i % KIN.length];
      const app = {
        id:uid('app'),
        no:`APP-${new Date().getFullYear()}-${String(data.seq.application).padStart(4,'0')}`,
        ref:['K7QX2M','R4HB9T','P2LN6V','W8DC3Y','M5TG7J'][i] || uid('R').slice(2,8).toUpperCase(),
        submitted:dOff(-daysAgo), channel:'Public Portal', status,
        /* Applicants register their details only. The Registrar settles the
           course with them, then picks the batch — which fixes both. */
        courseId:'', batchId:'',
        srn:`SRN-${400000 + daysAgo*311}`,
        last:ln, first:fn, middle:mn, suffix:sfx,
        sex, birth:`199${daysAgo%10}-0${(daysAgo%9)+1}-1${daysAgo%9}`,
        birthPlace:PLACES[i % PLACES.length],
        mobile:`0917${String(2000000 + daysAgo*13579).slice(0,7)}`,
        email:`${fn.split(' ')[0].toLowerCase()}.${ln.toLowerCase().replace(/\s+/g,'')}@mail.com`,
        facebook:`facebook.com/${fn.split(' ')[0].toLowerCase()}.${ln.toLowerCase().replace(/\s+/g,'')}`,
        messenger:i % 2 ? `m.me/${fn.split(' ')[0].toLowerCase()}.${ln.toLowerCase().replace(/\s+/g,'')}` : '',
        address:PLACES[i % PLACES.length],
        rank, agency,
        emergencyName:`${kin} ${ln}`, emergencyRelation:rel,
        emergencyMobile:`0918${String(3000000 + daysAgo*24680).slice(0,7)}`,
        traineeId:'', enrollmentId:'', decidedBy:'', decidedOn:'', reason:'',
        history:[{ ts:dOff(-daysAgo)+'T09:00:00.000Z', status:'Submitted', by:'Public Portal', note:'Application received online' }],
        ...(extra||{}),
      };
      data.applications.push(app);
      return app;
    };
    AP(4, ['Dante','Herrera','Cruz','Jr.','M','Able Seaman','Magsaysay Maritime Corp.'],    2, 'Submitted');
    AP(6, ['Melchor','Bagtas','Reyes','','M','2nd Officer','Anglo-Eastern Crew Mgmt'],      3, 'Submitted');
    AP(7, ['Ivy Rose','Del Rosario','Santos','','F','Messman','Direct Hire / Walk-in'],     5, 'Under Review');
    AP(5, ['Warren','Ocampo','Lim','III','M','Bosun','Wallem Maritime Services'],           6, 'Under Review');
    AP(8, ['Elmer','Bacani','Torres','','M','Radio Officer','Scanmar Maritime Services'],   8, 'Rejected',
       { reason:'Incomplete SIRB details — applicant asked to re-submit.', decidedBy:'Registrar Desk', decidedOn:dOff(-7) });

    activity('Seeded demo data','');
  }

  return { load, reload, save, get, reset, nextNo, exportJSON, importJSON, activity, uid, r2, today, PERMS, blank };
})();
