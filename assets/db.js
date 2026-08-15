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
    name:'TARA BARKO MARITIME TRAINING & ASSESSMENT CENTER, INC.',
    address:'2nd Flr. Seafarer Bldg., Kalaw Ave., Ermita, Manila 1000',
    contact:'(02) 8523-4567  •  registrar@tarabarko.ph',
    tin:'009-482-771-000',
    accreditation:'MARINA-STCW Accreditation No. TBM-2024-0117',
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
    const C = (code,title,reg,days,fee,cap,cat) =>
      ({ id:uid('crs'), code, title, regulation:reg, days, fee, capacity:cap, category:cat, active:true });

    data.courses = [
      C('BT',      'Basic Training',                                  'STCW VI/1',       10, 6500,  30, 'Basic Safety'),
      C('BT-REF',  'Basic Training (Refresher)',                      'STCW VI/1 (Ref)',  3, 3500,  30, 'Refresher'),
      C('PSCRB',   'Proficiency in Survival Craft & Rescue Boats',    'STCW VI/2-1',      5, 7800,  20, 'Advanced Safety'),
      C('AFF',     'Advanced Fire Fighting',                          'STCW VI/3',        4, 6900,  24, 'Advanced Safety'),
      C('MEFA',    'Medical Emergency First Aid',                     'STCW VI/4-1',      3, 4200,  25, 'Medical'),
      C('MC',      'Medical Care on Board Ship',                      'STCW VI/4-2',      5, 7500,  20, 'Medical'),
      C('SSO',     'Ship Security Officer',                           'STCW VI/5',        3, 5500,  30, 'Security'),
      C('SDSD',    'Security Awareness w/ Designated Duties',         'STCW VI/6-2',      2, 2800,  40, 'Security'),
      C('ROC',     'Restricted Operator Certificate (GMDSS)',         'STCW IV/2',        7, 9500,  16, 'Deck'),
      C('ECDIS',   'Electronic Chart Display & Information System',   'STCW II/1',        5, 12500, 12, 'Deck'),
      C('BRM',     'Bridge Resource Management',                      'STCW II/1',        5, 11000, 16, 'Deck'),
      C('ERM',     'Engine Room Resource Management',                 'STCW III/1',       5, 11000, 16, 'Engine'),
    ];
    data.seq.course = data.courses.length;

    const crs = code => data.courses.find(c => c.code === code);
    const dOff = n => { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
    const end  = (s,days) => { const d = new Date(s); d.setDate(d.getDate()+days-1); return d.toISOString().slice(0,10); };
    /* Trainees register shortly before a batch opens — and never in the future, so the
       seeded ledger, the ageing report and the as-of trial balance all agree. */
    const before = (date,n) => { const d = new Date(date); d.setDate(d.getDate()-n); const s = d.toISOString().slice(0,10); return s > today() ? today() : s; };
    const after  = (date,n) => { const d = new Date(date); d.setDate(d.getDate()+n); const s = d.toISOString().slice(0,10); return s > today() ? today() : s; };

    const B = (code, startOffset, room, instr, status) => {
      const c = crs(code), s = dOff(startOffset);
      data.seq.batch++;
      return { id:uid('bat'), no:`${code}-${String(data.seq.batch).padStart(3,'0')}`, courseId:c.id,
               start:s, end:end(s,c.days), room, instructor:instr, capacity:c.capacity, status };
    };
    data.batches = [
      B('BT',    -30, 'Pool / Rm 201', 'Capt. R. Villanueva', 'Completed'),
      B('SSO',   -18, 'Rm 305',        'Capt. M. Delos Reyes','Completed'),
      B('MEFA',   -6, 'Rm 202',        'Dr. L. Sarmiento',    'Ongoing'),
      B('BT',     -2, 'Pool / Rm 201', 'Capt. R. Villanueva', 'Ongoing'),
      B('AFF',     4, 'Fire Ground',   'CE J. Bautista',      'Open'),
      B('PSCRB',   9, 'Pool / Rm 204', 'Capt. R. Villanueva', 'Open'),
      B('ECDIS',  15, 'Simulator A',   'Capt. A. Ocampo',     'Open'),
      B('SDSD',   21, 'Rm 305',        'Capt. M. Delos Reyes','Open'),
      B('ROC',    28, 'Rm 306',        'Mr. F. Guevarra',     'Open'),
    ];

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

    data.trainees = names.map(([fn,ln,sex,rank],i) => {
      data.seq.trainee++;
      const y = 1978 + (i*3) % 25;
      return {
        id:uid('trn'),
        no:`TRN-${new Date().getFullYear()}-${String(data.seq.trainee).padStart(4,'0')}`,
        last:ln, first:fn, middle:['Santos','Cruz','Reyes','Garcia','Lopez','Torres'][i%6],
        sex, birth:`${y}-0${(i%9)+1}-1${i%9}`,
        srn:`SRN-${100000+i*137}`, sirb:`B${2000000+i*911}`, passport:`P${3000000+i*733}A`,
        rank, agency:agencies[i%agencies.length],
        mobile:`09${17+(i%3)}${String(1000000+i*54321).slice(0,7)}`,
        email:`${fn.split(' ')[0].toLowerCase()}.${ln.toLowerCase()}@mail.com`,
        address:['Tondo, Manila','Cavite City','Iloilo City','Cebu City','Bacolod City','Zamboanga City'][i%6],
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
      const discount = (i % 7 === 0) ? r2(c.fee * 0.10) : 0;   // occasional agency discount
      const regDate = before(b.start, 4 + (i % 9));
      data.seq.enrollment++;
      const enr = {
        id:uid('enr'),
        no:`ENR-${new Date().getFullYear()}-${String(data.seq.enrollment).padStart(4,'0')}`,
        traineeId:t.id, batchId:b.id, courseId:c.id,
        date: regDate, status, result,
        fee:c.fee, discount, discountNote: discount ? 'Agency package rate' : '',
        certificateNo: result === 'Passed' ? `TBM-${c.code}-${String(9000+i)}` : '',
        remarks:'',
      };
      data.enrollments.push(enr);

      // Reservations are not yet billed — matches how a registrar actually works.
      if(status === 'Reserved') return;

      const items = [{ desc:`${c.code} — ${c.title}`, account:'4000', qty:1, price:c.fee }];
      if(['BT','PSCRB','AFF','MC'].includes(c.code)) items.push({ desc:'Training kit & assessment fee', account:'4100', qty:1, price:450 });

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
    EX(dOff(-15),'MARINA','5400',6500,'Course accreditation renewal fee','Cash');
    EX(dOff(-9), 'Dr. L. Sarmiento','5000',8000,'Instructor honorarium — MEFA batch','Bank Transfer');
    EX(dOff(-4), 'Meralco / Maynilad','5200',4800,'Electricity and water','Bank Transfer');

    /* Applications waiting at the registrar's desk — these arrive from the public
       portal, so the seed puts a few in the queue at different stages. */
    const AP = (bi, [fn,ln,mn,sex,rank,agency], daysAgo, status, extra) => {
      const b = data.batches[bi];
      data.seq.application++;
      const app = {
        id:uid('app'),
        no:`APP-${new Date().getFullYear()}-${String(data.seq.application).padStart(4,'0')}`,
        ref:['K7QX2M','R4HB9T','P2LN6V','W8DC3Y','M5TG7J'][data.seq.application-1] || uid('R').slice(2,8).toUpperCase(),
        submitted:dOff(-daysAgo), channel:'Public Portal', status,
        courseId:b.courseId, batchId:b.id,
        last:ln, first:fn, middle:mn, sex, birth:`199${daysAgo%10}-0${(daysAgo%9)+1}-1${daysAgo%9}`,
        srn:`SRN-${400000 + daysAgo*311}`, sirb:`B${5000000 + daysAgo*677}`, passport:`P${6000000 + daysAgo*419}A`,
        rank, agency,
        mobile:`0917${String(2000000 + daysAgo*13579).slice(0,7)}`,
        email:`${fn.split(' ')[0].toLowerCase()}.${ln.toLowerCase()}@mail.com`,
        address:['Navotas, Metro Manila','Lucena City','Dumaguete City','Tacloban City'][data.seq.application % 4],
        payer:agency === 'Direct Hire / Walk-in' ? 'Self-paid' : 'Agency-billed',
        remarks:'', traineeId:'', enrollmentId:'', decidedBy:'', decidedOn:'', reason:'',
        history:[{ ts:dOff(-daysAgo)+'T09:00:00.000Z', status:'Submitted', by:'Public Portal', note:'Application received online' }],
        ...(extra||{}),
      };
      data.applications.push(app);
      return app;
    };
    AP(4, ['Dante','Herrera','Cruz','M','Able Seaman','Magsaysay Maritime Corp.'],       2, 'Submitted');
    AP(6, ['Melchor','Bagtas','Reyes','M','2nd Officer','Anglo-Eastern Crew Mgmt'],      3, 'Submitted');
    AP(7, ['Ivy Rose','Del Rosario','Santos','F','Messman','Direct Hire / Walk-in'],     5, 'Under Review');
    AP(5, ['Warren','Ocampo','Lim','M','Bosun','Wallem Maritime Services'],              6, 'Under Review');
    AP(8, ['Elmer','Bacani','Torres','M','Radio Officer','Scanmar Maritime Services'],   8, 'Rejected',
       { reason:'Incomplete SIRB details — applicant asked to re-submit.', decidedBy:'Registrar Desk', decidedOn:dOff(-7) });

    activity('Seeded demo data','');
  }

  return { load, reload, save, get, reset, nextNo, exportJSON, importJSON, activity, uid, r2, today, PERMS, blank };
})();
