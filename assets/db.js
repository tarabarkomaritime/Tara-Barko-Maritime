/* db.js — persistence layer, schema and seed data.
   Everything lives in localStorage under one key so backup/restore is a single JSON blob. */

const DB = (() => {
  const KEY = 'tbm_is_v1';
  /* Where a store that would not parse is put instead of being written over. */
  const SALVAGE = 'tbm_is_v1.unreadable.';
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
    /* Money handed over beyond what the bill asked for. Kept, and kept in its
       own line so the month's sales can be read without it. */
    { code:'4300', name:'Overpayments',            type:'Revenue',   nature:'credit' },
    { code:'4900', name:'Discounts Given',         type:'Revenue',   nature:'debit'  }, // contra-revenue
    /* 5050 is not a category anybody picks: a seat at a center is charged here
       automatically when the booking is made, and settled from the Payables
       tab. It is a system account and the voucher form leaves it out. */
    { code:'5050', name:'Training Center Fees',    type:'Expense',   nature:'debit'  },
    /* What a disbursement voucher may be charged to. The admin maintains this
       list in Settings — these four are where the office starts. */
    { code:'5100', name:'Office Supplies',         type:'Expense',   nature:'debit'  },
    { code:'5200', name:'Salary / Wages',          type:'Expense',   nature:'debit'  },
    { code:'5300', name:'Government',              type:'Expense',   nature:'debit'  },
    { code:'5400', name:'Food and Drinks',         type:'Expense',   nature:'debit'  },
  ];

  /* Accounts the system posts to itself. The admin may rename these but not
     delete them: remove one and a booking, a remittance or a refund would have
     nowhere to land. */
  const SYSTEM_ACCOUNTS = ['1000','1010','1020','1200','1250','2000','4000','4100','4200','4300','4900','5050'];


  /* Accounts are maintained by the admin in Settings. `code` is the sign-in
     password. It is stored in clear text because this build has no server to
     hash against and no session to protect — anyone who can open the browser's
     local storage can read every record anyway. Moving the store to a backend
     is what makes these worth hashing; until then the password is a way of
     keeping the wrong desk out of the wrong screen, not a security boundary. */
  const USERS = [
    /* There are no passwords here any more, and that is the point. This file is
       served to anyone who opens the site, so for as long as sign-in compared
       what was typed against a string on this list, the passwords were public —
       there was no version of that arrangement which was not.

       Supabase Auth holds them now. What is left is the office's own roster in
       the shape the screens expect, used before anybody has signed in and as
       the fallback when the network is not there. The real list is tbm.staff,
       pulled down at sign-in, and it replaces this one. */
    { id:'u1', name:'Kyla Esguerra', role:'owner',
      initials:'KE', email:'kyla.esguerra24@gmail.com' },
    { id:'u4', name:'Kate Esguerra', role:'admin',
      initials:'KA', email:'pkmesguerra.ph@gmail.com' },
    { id:'u2', name:'Jocelyn Eala',  role:'frontdesk',
      initials:'JE', email:'ealajocelyn.qaplamaritime@gmail.com' },
  ];

  /* What each role is called on screen. The key is what the code checks and
     what a stored account carries; this is what a person reads, and "frontdesk"
     is not a job anybody at this office would say they do. */
  const ROLE_LABEL = {
    owner:      'Admin & Accounting',
    admin:      'Admin',
    frontdesk:  'Registration & Cashier',
    accounting: 'Accounting',
  };
  const roleName = r => ROLE_LABEL[r] || r;

  /* Which modules each role may open. Admin sees everything. */
  const PERMS = {
    /* The admin maintains the price list and the accounts but does not work the
       journal — that is accounting's screen, and two people posting entries by
       hand into the same ledger is how a ledger stops being trustworthy. */
    /* Admin and accounting in one person. It exists because the plain admin
       role deliberately has no ledger — two people posting entries by hand into
       the same journal is how a journal stops being trustworthy — and somebody
       who does both jobs needs the one screen the other admins do not get. */
    owner:      ['dashboard','daily','trainees','courses','enrollments','invoices','payments','payables','refunds','expenses','payroll','approvals','ledger','reports','settings'],
    admin:      ['dashboard','daily','trainees','courses','enrollments','invoices','payments','payables','refunds','expenses','payroll','approvals','reports','settings'],
    /* Registration and the cash window are one job at this office — the same
       person takes the enrollment and then takes the money for it — so they are
       one role rather than two accounts to sign in and out of between a
       trainee's two sentences. There were once spare registrar and cashier
       roles as well; nobody was ever on them, and three names for one desk is
       three chances to give somebody the wrong one.
       It does not touch the course list: prices and rebates are the admin's. */
    frontdesk:  ['dashboard','daily','trainees','enrollments','invoices','payments','refunds','reports'],
    accounting: ['dashboard','daily','invoices','payments','payables','refunds','expenses','approvals','ledger','reports','settings'],
  };

  const DEFAULT_COMPANY = {
    name:'TB - MARITIME TRAINING AND ASSESSMENT ENDORSEMENT',
    address:'9th Flr. GLC Bldg., T.M. Kalaw, Ermita, Manila',
    contact:'0985 804 4310  •  tarabarkomaritime@gmail.com',
    tin:'009-482-771-000',
    /* Shown under the contact line on every document. */
    tradeName:'by QMCS',
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

  /* ---------- lists the office maintains itself ----------
     Every one of these used to be a fixed array in the source, which meant a
     rank this office actually hires for could only be added by editing
     JavaScript. They are defaults now, not the law: whatever is saved under
     company.lists wins, and the same shape as ACC.methods() so there is one
     pattern to learn rather than two.

     A value already written on a record is never taken away by editing a list.
     Removing "Bosun" stops it being offered; it does not reach back and blank
     the rank of every bosun already in the registry. */
  const LIST_DEFAULTS = {
    ranks: ['Master','Chief Mate','2nd Officer','3rd Officer','Deck Cadet','Bosun',
      'Able Seaman','Ordinary Seaman','Chief Engineer','2nd Engineer','3rd Engineer',
      '4th Engineer','Engine Cadet','Oiler','Fitter','Electrician','Pumpman','Chief Cook',
      'Messman','Steward','Laundryman','Radio Officer'],
    relations: ['Spouse','Parent','Child','Sibling','Grandparent','Relative','Friend','Guardian'],
    suffix: ['Jr.','Sr.','II','III','IV','V'],
    delivery: DELIVERY.slice(),
  };

  const LIST_DEFS = [
    { key:'ranks',     label:'Ranks / Positions', where:'Public registration and the trainee record' },
    { key:'relations', label:'Relationships',     where:'Emergency contact, on both forms' },
    { key:'suffix',    label:'Name Suffixes',     where:'Trainee record' },
    { key:'delivery',  label:'Modes Of Learning', where:'Course catalogue' },
  ];

  function list(name){
    const co = (data && data.company) || {};
    const custom = (co.lists || {})[name];
    return Array.isArray(custom) && custom.length
      ? custom.slice()
      : (LIST_DEFAULTS[name] || []).slice();
  }
  /* What to offer for a field that already holds a value: the list, plus
     anything already encoded that is no longer on it, so opening a record can
     never quietly change what it says. */
  function listWith(name, ...held){
    const seen = new Set();
    return [...list(name), ...held.flat()]
      .filter(v => v && !seen.has(String(v).toLowerCase()) && seen.add(String(v).toLowerCase()));
  }

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
  /* The course ID already carries the acronym, so the title does not need to say
     it again: next to an ID of AI, "AI - ACCIDENT INVESTIGATION" is just
     "ACCIDENT INVESTIGATION". Only stripped when the prefix really is the ID and
     something is left after it — a course called ATCT with an ID of ATCT keeps
     its name rather than becoming blank. */
  function titleWithoutCode(code, title){
    const c = String(code || '').trim(), t = String(title || '').trim();
    if(!c || !t || !t.toUpperCase().startsWith(c.toUpperCase())) return t;
    const sep = t.slice(c.length).match(/^\s*[-–—]\s*/);
    if(!sep) return t;
    const rest = t.slice(c.length + sep[0].length).trim();
    /* "AFF - R" is Advanced Fire Fighting, refresher. Strip the AFF and what is
       left is "R", which names nothing — so a remainder too short to stand on
       its own means the title was never an ID plus a description, and the whole
       name stays. "BT - PSSR" and "COOKERY - NCII" survive the cut; the
       refreshers do not get mangled. */
    return rest.length >= 3 ? rest : t;
  }

  const today = () => new Date().toISOString().slice(0,10);
  const uid   = p => p + '-' + Math.random().toString(36).slice(2,9);
  const r2    = n => Math.round((Number(n)||0) * 100) / 100;

  function blank(){
    return {
      meta:{ version:1, created:today() },
      company:{ ...DEFAULT_COMPANY },
      users:USERS.map(u => ({...u})),
      accounts:COA.map(a => ({...a})),
      seq:{ trainee:0, course:0, enrollment:0, invoice:0, receipt:0, voucher:0, refund:0, journal:0, application:0 },
      applications:[],
      trainees:[], courses:[], enrollments:[],
      invoices:[], payments:[], expenses:[], refunds:[], journal:[],
      log:[],
    };
  }

  /* Backups written before a store existed must still open. Every new top-level
     collection gets a default here rather than a version-bump migration script. */
  function migrate(d){
    d.applications = d.applications || [];
    /* Staff added since a store was written. A code the office has already
       changed is left alone — this fills gaps, it does not reset anybody: an
       upgrade that quietly restored a temporary password would be a way in that
       nobody knew was open. */
    if(Array.isArray(d.users)){
      USERS.forEach(seedUser => {
        const mine = d.users.find(u => u.id === seedUser.id);
        if(!mine){ d.users.push({ ...seedUser }); return; }
        if(!mine.email && seedUser.email) mine.email = seedUser.email;
      });
      /* Any store written before authentication moved to Supabase still has the
         passwords sitting in it in clear text. Taking them out of the source
         does nothing for the browsers that already copied them, and those are
         the machines actually sitting in the office — so they are stripped on
         the next load, wherever that store happens to be. */
      d.users.forEach(u => { delete u.code; });
    }

    /* Overpayment used to land in receivables; the account it belongs in may
       not exist in an older store. */
    if(d.accounts && !d.accounts.some(a => a.code === '4300')){
      d.accounts.push({ code:'4300', name:'Overpayments', type:'Revenue', nature:'credit' });
    }
    /* Titles used to repeat the course ID. Renaming the catalogue leaves any
       invoice line already written alone: a document says what it said when it
       was issued. */
    (d.courses || []).forEach(c => { c.title = titleWithoutCode(c.code, c.title); });
    /* The expense categories were rewritten to the four the office actually
       uses. An account with history keeps its name and its balance — renaming
       it would relabel entries that were posted under the old one — but the
       ones nothing was ever charged to are dropped so the voucher form is not
       still offering them. */
    if(d.accounts && d.journal){
      const CATS = [
        { code:'5100', name:'Office Supplies' },
        { code:'5200', name:'Salary / Wages' },
        { code:'5300', name:'Government' },
        { code:'5400', name:'Food and Drinks' },
      ];
      const posted = code => d.journal.some(j => j.lines.some(l => l.account === code));
      d.accounts = d.accounts.filter(a =>
        a.type !== 'Expense' || a.code === '5050' || posted(a.code) || CATS.some(c => c.code === a.code));
      CATS.forEach(c => {
        if(!d.accounts.some(a => a.code === c.code)){
          d.accounts.push({ code:c.code, name:c.name, type:'Expense', nature:'debit' });
        }
      });
    }
    d.expenses     = d.expenses || [];
    d.refunds      = d.refunds || [];
    if(d.seq && d.seq.refund == null) d.seq.refund = d.refunds.length;
    /* Money out now waits for an approval before it posts. Anything already in
       a store was posted the moment it was written, so it is approved by
       definition — marking it pending would un-post history. */
    (d.expenses || []).forEach(v => {
      if(!v.state){ v.state = 'Approved'; v.approvedBy = v.approvedBy || 'Migrated'; v.approvedOn = v.approvedOn || v.date; }
    });
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
    /* This used to fill a missing password in with the role name, so an account
       without one silently became signable-into as "admin" or "frontdesk". It
       was there to keep old stores openable and it long outlived that job.
       Supabase holds the passwords now; the only correct thing to do with one
       found in a browser store is take it out. */
    (d.users || []).forEach(u => {
      if(u.email == null) u.email = '';
      delete u.code;
      if(!u.initials) u.initials = String(u.name||'?').split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase();
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

  /* Reading and parsing used to share one try block, so a store that would not
     parse was treated exactly like a browser with no store at all: seed a blank
     one and save it. That save landed on top of the only copy of whatever was
     really there. Now the unreadable text is set aside under its own key first,
     where Settings can offer it back as a file, and only then does the system
     start fresh — a broken record is still a record. */
  function load(){
    let raw = null;
    try{ raw = localStorage.getItem(KEY); }catch(e){ raw = null; }
    data = null;
    if(raw){
      try{ data = JSON.parse(raw); }
      catch(e){
        try{ localStorage.setItem(SALVAGE + Date.now(), raw); }catch(_){}
      }
    }
    if(!data || !data.meta){ data = blank(); seed(); save(); }
    else {
      migrate(data);
      /* Write the migrated store back. Migrating only in memory meant a store
         was re-migrated on every single load and never actually fixed — which
         is harmless for a defaulted field and not harmless at all for taking a
         password out: it would have been stripped for the session and still
         been sitting on the disk afterwards. */
      cache();
    }
    return data;
  }

  /* Copies of stores that could not be read, newest first. */
  function salvaged(){
    const out = [];
    try{
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(k && k.indexOf(SALVAGE) === 0){
          const v = localStorage.getItem(k) || '';
          out.push({ key:k, when:new Date(Number(k.slice(SALVAGE.length)) || 0), kb:(v.length/1024).toFixed(1) });
        }
      }
    }catch(e){}
    return out.sort((a,b) => b.when - a.when);
  }
  function downloadSalvaged(key){
    const raw = localStorage.getItem(key);
    if(!raw) return false;
    const blob = new Blob([raw], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `TBM-unreadable-${key.slice(SALVAGE.length)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  }

  /* The public portal writes into the same store from a second tab. Re-reading
     before a write keeps the registrar's screen from clobbering a fresh application. */
  function reload(){ data = null; return load(); }
  /* Storage can refuse: private browsing, a full quota, or a frame with no
     origin to store against. load() already tolerated that; save() did not, so
     the very first save on a fresh store threw and took the sign-in list with
     it — an empty user picker and a Sign in button that did nothing. The
     records now live in memory instead, which keeps the session usable, and
     the office is told once that nothing is being kept. */
  /* A toast that shows once and fades was the wrong shape for this. Somebody
     encoding a day of enrollments looks up, misses four seconds of orange, and
     keeps typing into a system that is writing nothing down — and finds out at
     closing time. So the warning is a bar that stays until saving works again,
     re-asserted on every single save, and it cannot be dismissed. */
  let storageLogged = false, storageOk = true;
  function storageBanner(show){
    if(typeof document === 'undefined' || !document.body) return;
    const id = 'tbmStorageWarn';
    let el = document.getElementById(id);
    if(!show){ if(el) el.remove(); return; }
    if(el) return;
    el = document.createElement('div');
    el.id = id;
    el.setAttribute('role', 'alert');
    el.textContent = 'NOTHING IS BEING SAVED. This browser is refusing to store records, so '
      + 'anything typed now disappears when the page is closed. Stop encoding and tell the admin.';
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;'
      + 'background:#b3001b;color:#fff;text-align:center;letter-spacing:.01em;'
      + 'font:600 13px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:11px 16px;'
      + 'box-shadow:0 -2px 14px rgba(0,0,0,.28)';
    document.body.appendChild(el);
  }
  function cache(){
    try{
      localStorage.setItem(KEY, JSON.stringify(data));
      if(!storageOk){ storageOk = true; storageBanner(false); }
      return true;
    }catch(e){
      storageOk = false;
      if(!storageLogged){
        storageLogged = true;
        console.warn('Tara Barko: this browser will not let the system save.');
      }
      /* Losing the local cache while the cloud is answering is untidy, not
         fatal — the records are on the server. Saying "nothing is being saved"
         then would be a lie, and a lie that stops a day's work. */
      storageBanner(!cloudOn);
      return false;
    }
  }

  function save(){
    cache();
    schedulePush();
    return data;
  }

  function get(){ return data || load(); }

  /* ---------------------------------------------------------------- cloud
     Everything above this line still works exactly as it did: one object in
     memory, read synchronously by three thousand lines of view code that must
     not have to learn about promises. What changes is where that object comes
     from and where it goes.

     On sign-in the store is pulled from Supabase and localStorage becomes a
     cache rather than the record — it is what lets the screens paint before the
     network answers, and what survives a dropped connection. Saves still write
     to memory and to the cache immediately, then push the rows that changed a
     moment later. If that push fails the work is not lost: it is still in the
     browser, still marked dirty, and the status says so out loud rather than
     letting somebody close the laptop believing it landed. */
  let cloudOn = false, baseline = null, pushTimer = null, pushing = false, dirty = false;
  let cloudState = 'off', cloudNote = '';
  const watchers = [];
  const onCloud = fn => { watchers.push(fn); fn(cloudState, cloudNote); };
  function setState(s, note){
    cloudState = s; cloudNote = note || '';
    watchers.forEach(f => { try{ f(cloudState, cloudNote); }catch(e){} });
  }
  const cloudStatus = () => ({ on:cloudOn, state:cloudState, note:cloudNote, pending:dirty });

  /* The catalogue and the chart of accounts are what the system needs to be
     able to take a booking at all. A project with neither is not a fresh start,
     it is a system that cannot work, so the first sign-in fills them. */
  function seedShape(){
    const keep = data;
    data = blank(); seed();
    const out = { courses:data.courses, accounts:data.accounts, company:data.company, seq:data.seq };
    data = keep;
    return out;
  }

  async function connect(){
    const store = await SYNC.pull();
    const fresh = blank();
    data = { ...fresh, ...store, meta:fresh.meta };
    if(!data.company || !Object.keys(data.company).length) data.company = { ...DEFAULT_COMPANY };

    const need = seedShape();
    if(!data.courses.length)  data.courses  = need.courses;
    if(!data.accounts.length) data.accounts = need.accounts;
    if(!data.seq || !Object.keys(data.seq).length) data.seq = need.seq;
    data.seq = { ...need.seq, ...(data.seq || {}) };

    migrate(data);
    cloudOn = true;
    /* The baseline is what the server had. Anything the seed just supplied is
       deliberately not in it, so the first push uploads the catalogue. */
    baseline = SYNC.snapshot({ ...store, company:store.company, seq:store.seq });
    cache();
    setState('ready');
    schedulePush();
    return data;
  }

  function disconnect(){
    cloudOn = false; baseline = null; dirty = false;
    clearTimeout(pushTimer);
    setState('off');
  }

  function schedulePush(){
    if(!cloudOn) return;
    dirty = true;
    setState(cloudState === 'error' ? 'error' : 'dirty', cloudNote);
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { flush(); }, 700);
  }

  async function flush(){
    if(!cloudOn || pushing || !dirty) return cloudStatus();
    pushing = true; dirty = false; setState('saving');
    try{
      await SYNC.push(data, baseline);
      baseline = SYNC.snapshot(data);
      setState('ready');
    }catch(e){
      /* Put the flag back up. The rows are still in memory and still in the
         cache, so the next save — or the next retry — carries them again. */
      dirty = true;
      setState('error', e.message || 'The save did not reach the server.');
    }finally{ pushing = false; }
    return cloudStatus();
  }

  /* Somebody else's work. Only ever applied when this browser has nothing
     waiting to go up, because merging a half-pushed edit against a fresher
     server row is how one desk silently undoes another. */
  async function refreshFromCloud(){
    if(!cloudOn || dirty || pushing) return false;
    const store = await SYNC.pull();
    const fresh = blank();
    data = { ...fresh, ...store, meta:fresh.meta };
    if(!data.company || !Object.keys(data.company).length) data.company = { ...DEFAULT_COMPANY };
    migrate(data);
    baseline = SYNC.snapshot(store);
    cache();
    setState('ready');
    return true;
  }


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
        code:c.code, title:titleWithoutCode(c.code, c.title),
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

    /* The office starts empty. Everything above is what the system needs to
       work at all — the price list, the chart of accounts, the people who sign
       in, the company's own details. Everything below used to be an invented
       month of trainees, bookings, bills and receipts, and it is gone: it made
       the first screen look busy and every figure on it a lie.

       This is also what "Erase everything" now returns you to. Wiping used to
       leave a store with no courses in it, which is not a fresh start, it is a
       system that cannot take a booking. */
  }

  return { load, reload, save, get, reset, nextNo, exportJSON, importJSON, activity, uid, r2, today,
           salvaged, downloadSalvaged,
           connect, disconnect, flush, refreshFromCloud, onCloud, cloudStatus,
           PERMS, ROLE_LABEL, roleName, blank, DELIVERY, normalizeDelivery, SYSTEM_ACCOUNTS,
           list, listWith, LIST_DEFS, LIST_DEFAULTS };
})();
