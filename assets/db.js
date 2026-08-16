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
    { code:'1020', name:'GCash Wallet',             type:'Asset',     nature:'debit'  },
    { code:'1200', name:'Accounts Receivable',     type:'Asset',     nature:'debit'  },
    { code:'1250', name:'Rebates Receivable',      type:'Asset',     nature:'debit'  },
    { code:'2000', name:'Payable to Training Centers', type:'Liability', nature:'credit' },
    { code:'2200', name:'Unearned Training Fees',  type:'Liability', nature:'credit' },
    { code:'3000', name:"Owner's Equity",          type:'Equity',    nature:'credit' },
    { code:'4000', name:'Training Fees Revenue',   type:'Revenue',   nature:'credit' },
    { code:'4100', name:'Assessment & Other Fees', type:'Revenue',   nature:'credit' },
    { code:'4200', name:'Rebate Income',           type:'Revenue',   nature:'credit' },
    { code:'4900', name:'Discounts Given',         type:'Revenue',   nature:'debit'  }, // contra-revenue
    { code:'5000', name:'Instructor Fees',         type:'Expense',   nature:'debit'  },
    { code:'5050', name:'Training Center Fees',    type:'Expense',   nature:'debit'  },
    { code:'5100', name:'Training Materials',      type:'Expense',   nature:'debit'  },
    { code:'5200', name:'Rent & Utilities',        type:'Expense',   nature:'debit'  },
    { code:'5300', name:'Salaries & Wages',        type:'Expense',   nature:'debit'  },
    { code:'5400', name:'Regulatory & Permits',    type:'Expense',   nature:'debit'  },
    { code:'5900', name:'Miscellaneous Expense',   type:'Expense',   nature:'debit'  },
  ];

  /* Accounts are maintained by the admin in Settings. `code` is the sign-in
     password. It is stored in clear text because this build has no server to
     hash against and no session to protect — anyone who can open the browser's
     local storage can read every record anyway. Moving the store to a backend
     is what makes these worth hashing; until then the password is a way of
     keeping the wrong desk out of the wrong screen, not a security boundary. */
  const USERS = [
    { id:'u1', name:'Kyla Esguerra',   role:'admin',      code:'admin',      initials:'KE', email:'' },
    { id:'u2', name:'Jocelyn Eala',    role:'frontdesk',  code:'registrar',  initials:'JE', email:'' },
    { id:'u3', name:'Accounting',      role:'accounting', code:'accounting', initials:'AC', email:'' },
  ];

  /* Which modules each role may open. Admin sees everything. */
  const PERMS = {
    admin:      ['dashboard','trainees','courses','enrollments','invoices','payments','expenses','ledger','reports','settings'],
    /* One person covers registration and the cash window at this office, so the
       two jobs are one role rather than two accounts to sign in and out of. */
    frontdesk:  ['dashboard','trainees','courses','enrollments','invoices','payments','reports'],
    registrar:  ['dashboard','trainees','courses','enrollments','invoices','reports'],
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
    /* Modes of payment the cashier may accept, and where each one's money
       lands. Maintained by the admin in Settings. */
    methods:[
      { name:'Cash',  account:'1000', ref:false },
      { name:'GCash', account:'1020', ref:true  },
      { name:'Bank',  account:'1010', ref:true  },
    ],
    /* Chargeable items offered as tick-boxes when billing a booking. The three
       here come out of the terms and conditions. */
    addons:[
      { desc:'Rescheduling fee',  account:'4100', price:500 },
      { desc:'Make-up class fee', account:'4100', price:800 },
      { desc:'Cancellation fee',  account:'4100', price:500 },
    ],
    fiscalYear:new Date().getFullYear(),
  };

  /* ---------- delivery ----------
     Four ways a course is delivered, and no others. The price matrix the
     catalogue was imported from used its own spellings and mixed in things that
     are not a delivery at all, so everything is folded into this list on the way
     in — once at seed time, once on migration — and the course form only offers
     these four.

     "Blended" is not one of them. It means part in a classroom and part not, so
     it maps to both of the deliveries it is made of rather than being dropped.
     "With/without accommodation" is a boarding arrangement, not a delivery, and
     moves to the course's options. */
  const DELIVERY = ['Face-to-Face','Module','Distance Learning','Non-Appearance'];

  const DELIVERY_ALIAS = {
    'face to face':['Face-to-Face'], 'face-to-face':['Face-to-Face'], 'f2f':['Face-to-Face'],
    'module':['Module'], 'modular':['Module'],
    'distance learning':['Distance Learning'], 'distance-learning':['Distance Learning'],
    'online':['Distance Learning'], 'distance':['Distance Learning'],
    'non-appearance':['Non-Appearance'], 'non appearance':['Non-Appearance'],
    'nonappearance':['Non-Appearance'], 'no appearance':['Non-Appearance'],
    'blended':['Face-to-Face','Distance Learning'],
  };
  const isBoarding = v => /accommodation/i.test(String(v));

  /* Returns { modes, options } — never an empty modes list, because a course
     with no recorded delivery is delivered face to face, the house default. */
  function normalizeDelivery(raw){
    const out = [], options = [];
    (raw || []).forEach(v => {
      const t = String(v || '').trim();
      if(!t) return;
      if(isBoarding(t)){ options.push(t); return; }
      const mapped = DELIVERY_ALIAS[t.toLowerCase()] || (DELIVERY.includes(t) ? [t] : null);
      if(mapped) mapped.forEach(m => { if(!out.includes(m)) out.push(m); });
    });
    return { modes: out.length ? out : ['Face-to-Face'],
             options: [...new Set(options)] };
  }

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
      seq:{ trainee:0, course:0, enrollment:0, invoice:0, receipt:0, voucher:0, journal:0, application:0 },
      applications:[],
      trainees:[], courses:[], enrollments:[],
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

    /* ---- schedules folded into enrollments ----
       A batch used to hold the course, the dates, the partner center and the
       fee, and an enrollment pointed at one. Enrollments now carry those four
       fields themselves, booked per trainee. Copy them across before the
       batches go, or every historical enrollment loses its course and price. */
    if(Array.isArray(d.batches)){
      const byId = Object.fromEntries(d.batches.map(b => [b.id, b]));
      (d.enrollments || []).forEach(e => {
        const b = byId[e.batchId];
        if(!b) return;
        if(!e.courseId) e.courseId = b.courseId;
        if(e.center == null) e.center = b.center;
        if(e.start  == null) e.start  = b.start;
        if(e.end    == null) e.end    = b.end;
        if(e.room   == null) e.room   = b.room;
        if(e.instructor == null) e.instructor = b.instructor;
        if(e.fee == null) e.fee = b.fee;
        delete e.batchId;
      });
      delete d.batches;
    }
    (d.applications || []).forEach(a => { delete a.batchId; });
    delete d.seq.batch;

    /* Modes of payment and charges became editable lists; a store written
       before that has neither, and the cashier would open an empty dropdown. */
    if(!Array.isArray(d.company.methods) || !d.company.methods.length){
      d.company.methods = DEFAULT_COMPANY.methods.map(m => ({ ...m }));
    }
    if(!Array.isArray(d.company.addons) || !d.company.addons.length){
      d.company.addons = DEFAULT_COMPANY.addons.map(a => ({ ...a }));
    }
    /* Every account needs an email and a password to be maintainable. */
    (d.users || []).forEach(u => {
      if(u.email == null) u.email = '';
      if(!u.code) u.code = u.role || 'staff';
      if(!u.initials) u.initials = String(u.name||'?').split(/s+/).map(w => w[0]).join('').slice(0,2).toUpperCase();
    });

    /* Delivery was free text and carried values that are not a delivery. Fold
       every stored course onto the four allowed ones. */
    (d.courses || []).forEach(c => {
      const { modes, options } = normalizeDelivery([...(c.modes || []), c.note, ...(c.options || [])].filter(Boolean));
      c.modes = modes;
      if(options.length) c.options = options;
      delete c.note;
      /* Courses no longer carry a status. One is either on the price list or it
         is deleted from it. */
      delete c.active;
      if(c.amount == null) c.amount = 0;
      if(c.rebate == null) c.rebate = 0;
      if(c.deduct == null) c.deduct = false;
      if(c.center == null) c.center = '';
    });

    /* ---- no VAT, no other taxes ---- */
    delete d.company.vatRate;
    delete d.company.vatInclusive;

    /* GCash is reconciled against a GCash statement, so it needs its own
       account. Stores created before that will have posted GCash into Cash in
       Bank; those entries stay where they are — rewriting posted journal lines
       would falsify a closed period. New collections land in 1020. */
    d.accounts = d.accounts || [];
    if(!d.accounts.some(a => a.code === '1020')){
      const at = d.accounts.findIndex(a => a.code === '1200');
      const row = { code:'1020', name:'GCash Wallet', type:'Asset', nature:'debit' };
      at >= 0 ? d.accounts.splice(at, 0, row) : d.accounts.push(row);
    }
    /* Endorsing a trainee creates a debt to the training center, and a rebate
       the center either nets off that debt or settles separately. Older stores
       have nowhere to post either. */
    COA.filter(a => ['1250','2000','4200','5050'].includes(a.code)).forEach(a => {
      if(!d.accounts.some(x => x.code === a.code)) d.accounts.push({ ...a });
    });
    d.accounts.sort((a,b) => a.code.localeCompare(b.code));

    /* A receipt may now be settled in several tenders. One-mode receipts get a
       single tender so every reader can assume the array is there. */
    (d.payments || []).forEach(p => {
      if(!Array.isArray(p.tenders) || !p.tenders.length){
        p.tenders = [{ method:p.method || 'Cash', ref:p.ref || '', amount:p.amount }];
      }
    });
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
    /* The masterlist is the office price matrix, one entry per course at a
       training center, carrying that center's fee and rebate. The same course at
       two centers is two entries at two prices — which is the business. */
    data.courses = COURSE_CATALOGUE.map(c => {
      const { modes, options } = normalizeDelivery([...(c.modes || []), ...(c.options || [])]);
      return {
        id:uid('crs'),
        code:c.code, title:c.title,
        days:c.days ?? null, duration:c.duration || '',
        modes, options,
        center:c.center || '',
        amount:r2(c.amount || 0),
        rebate:r2(c.rebate || 0),
        /* Whether the rebate comes off what the trainee pays. The matrix does not
           say, and getting it wrong changes a price, so it starts as "do not
           deduct" and the office sets it per course. */
        deduct:false,
      };
    });
    data.seq.course = data.courses.length;

    /* Several centers run the same course at different prices, so the seeded
       bookings name both. */
    const crs = (t, center) => data.courses.find(c =>
      c.title.toUpperCase() === t.toUpperCase() &&
      (!center || c.center.toUpperCase() === center.toUpperCase()))
      || data.courses.find(c => c.title.toUpperCase() === t.toUpperCase());
    const dOff = n => { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
    const end  = (s,days) => { const d = new Date(s); d.setDate(d.getDate()+days-1); return d.toISOString().slice(0,10); };
    /* Trainees register shortly before a batch opens — and never in the future, so the
       seeded ledger, the ageing report and the as-of trial balance all agree. */
    const before = (date,n) => { const d = new Date(date); d.setDate(d.getDate()-n); const s = d.toISOString().slice(0,10); return s > today() ? today() : s; };
    const after  = (date,n) => { const d = new Date(date); d.setDate(d.getDate()+n); const s = d.toISOString().slice(0,10); return s > today() ? today() : s; };

    /* A booking is a dated run of one course at one partner center, at the price
       agreed for it. There is no seat inventory and no shared schedule: the
       registrar books each trainee individually, so these rows exist only to
       give the seeded enrollments somewhere realistic to have been booked. */
    const RUNS = [
      ['BASIC TRAINING',              -30, 'Nautical Options',  'Pool / Rm 201', 'Capt. R. Villanueva',  5500],
      ['SSO - SHIP SECURITY OFFICER', -18, 'PNTC',              'Rm 305',        'Capt. M. Delos Reyes', 2700],
      ['MEFA - MEDICAL FIRST AID',     -6, 'Altitude Maritime', 'Rm 202',        'Dr. L. Sarmiento',     1600],
      ['BASIC TRAINING',               -2, 'Fareast',           'Pool / Rm 201', 'Capt. R. Villanueva',  6500],
      ['AFF',                           1, 'Nautical Options',  'Fire Ground',   'CE J. Bautista',       4200],
      ['SCRB',                          2, 'Altitude Maritime', 'Pool / Rm 204', 'Capt. R. Villanueva',  3600],
      ['DECK WATCHKEEPING',            15, 'PNTC',              'Simulator A',   'Capt. A. Ocampo',      3700],
      ['SATSDSD',                      21, 'Great Seas',        'Rm 305',        'Capt. M. Delos Reyes',  700],
      ['MECA - MEDICAL CARE',          28, 'Fareast',           'Rm 306',        'Dr. L. Sarmiento',     4400],
    ].map(([title, off, center, room, instr, fee]) => {
      const c = crs(title, center);
      /* The seed names real catalogue entries. If one stops matching, the import
         renamed it — fail loudly rather than seeding a half-empty demo. */
      if(!c) throw new Error(`seed: no catalogue entry titled "${title}" — check tools/import-courses.js output`);
      const start = dOff(off);
      return { course:c, start, end:end(start, Math.ceil(c.days || 1)), center, room, instructor:instr, fee };
    });

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
      const b = RUNS[bi], t = data.trainees[ti], c = b.course;
      const discount = (i % 7 === 0) ? r2(b.fee * 0.10) : 0;   // occasional company discount
      const regDate = before(b.start, 4 + (i % 9));
      data.seq.enrollment++;
      const enr = {
        id:uid('enr'),
        no:`ENR-${new Date().getFullYear()}-${String(data.seq.enrollment).padStart(4,'0')}`,
        traineeId:t.id, courseId:c.id,
        center:b.center, start:b.start, end:b.end, room:b.room, instructor:b.instructor,
        date: regDate, status, result,
        fee:b.fee, discount, discountNote: discount ? 'Company package rate' : '',
        certificateNo: result === 'Passed' ? `TBM-${c.code}-${String(9000+i)}` : '',
        remarks:'',
      };
      data.enrollments.push(enr);

      // Reservations are not yet billed — matches how a registrar actually works.
      if(status === 'Reserved') return;

      const items = [{ desc:`${c.title} — ${b.center}`, account:'4000', qty:1, price:b.fee }];
      if(i % 3 === 0) items.push({ desc:'Course manual / workbook', account:'4100', qty:1, price:350 });

      const inv = ACC.buildInvoice({ enrollmentId:enr.id, traineeId:t.id, date:enr.date, items, discount });
      data.invoices.push(inv);
      ACC.postInvoice(inv);
      enr.invoiceId = inv.id;

      // Payment behaviour: most pay in full, some partially, a few not at all.
      const mode = i % 5;
      if(mode !== 4){
        const amt = mode === 3 ? r2(inv.total * 0.5) : inv.total;
        const p = ACC.buildPayment({ invoiceId:inv.id, traineeId:t.id, date:after(enr.date, i % 5),
          amount:amt, method:['Cash','GCash','Bank','Cash'][i%4],
          ref:['','GC-' + (700000+i*37),'BT-' + (880000+i*53),''][i%4] });
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
    EX(dOff(-28),'Capt. R. Villanueva','5000',12000,'Instructor honorarium — BASIC TRAINING run','Bank');
    EX(dOff(-26),'Seatech Supplies Inc.','5100',5450,'Lifejackets, flares and training consumables','Cash');
    EX(dOff(-25),'Kalaw Realty Corp.','5200',22000,'Office and training room rent','Bank');
    EX(dOff(-20),'Payroll','5300',18000,'Administrative staff salaries','Bank');
    EX(dOff(-15),'City of Manila','5400',6500,'Business permit and licence renewal','Cash');
    EX(dOff(-9), 'Dr. L. Sarmiento','5000',8000,'Instructor honorarium — MEFA run','Bank');
    EX(dOff(-4), 'Meralco / Maynilad','5200',4800,'Electricity and water','Bank');

    /* People who registered on the public portal and have not been booked on
       anything yet. There is no approval queue any more: a public registration
       creates the seafarer's master record straight away, and the registrar
       finds them by searching Trainees and encodes an enrollment. */
    const PLACES = ['Navotas, Metro Manila','Lucena City, Quezon','Dumaguete City, Negros Oriental',
                    'Tacloban City, Leyte','Iloilo City, Iloilo'];
    const KIN = [['Marilou','Spouse'],['Rosario','Mother'],['Editha','Spouse'],
                 ['Ligaya','Sister'],['Corazon','Mother']];

    const WALKUP = (i, [fn,ln,mn,sfx,sex,rank,agency], daysAgo) => {
      const [kin, rel] = KIN[i % KIN.length];
      const handle = `${fn.split(' ')[0].toLowerCase()}.${ln.toLowerCase().replace(/s+/g,'')}`;
      data.seq.trainee++;
      data.trainees.push({
        id:uid('trn'),
        no:`TRN-${new Date().getFullYear()}-${String(data.seq.trainee).padStart(4,'0')}`,
        srn:`SRN-${400000 + daysAgo*311}`,
        last:ln, first:fn, middle:mn, suffix:sfx,
        sex, birth:`199${daysAgo%10}-0${(daysAgo%9)+1}-1${daysAgo%9}`,
        birthPlace:PLACES[i % PLACES.length],
        sirb:'', passport:'',
        rank, agency,
        mobile:`0917${String(2000000 + daysAgo*13579).slice(0,7)}`,
        email:`${handle}@mail.com`,
        facebook:`facebook.com/${handle}`,
        messenger:i % 2 ? `m.me/${handle}` : '',
        address:PLACES[i % PLACES.length],
        emergencyName:`${kin} ${ln}`, emergencyRelation:rel,
        emergencyMobile:`0918${String(3000000 + daysAgo*24680).slice(0,7)}`,
        registered:dOff(-daysAgo),
        source:'Public portal',
        remarks:'',
      });
    };
    WALKUP(0, ['Dante','Herrera','Cruz','Jr.','M','Able Seaman','Magsaysay Maritime Corp.'],   2);
    WALKUP(1, ['Melchor','Bagtas','Reyes','','M','2nd Officer','Anglo-Eastern Crew Mgmt'],     3);
    WALKUP(2, ['Ivy Rose','Del Rosario','Santos','','F','Messman','Direct Hire / Walk-in'],    5);
    WALKUP(3, ['Warren','Ocampo','Lim','III','M','Bosun','Wallem Maritime Services'],          6);
    WALKUP(4, ['Elmer','Bacani','Torres','','M','Radio Officer','Scanmar Maritime Services'],  8);

    activity('Seeded demo data','');
  }

  return { load, reload, save, get, reset, nextNo, exportJSON, importJSON, activity, uid, r2, today,
           PERMS, blank, DELIVERY, normalizeDelivery };
})();
