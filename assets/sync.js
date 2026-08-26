/* sync.js — the same records, in two shapes.

   The application thinks in one object: `trainees`, `enrollments`, `invoices`,
   camelCase throughout, everything in memory. Postgres thinks in fourteen
   tables with snake_case columns and foreign keys. This file is the whole of
   the translation between them, kept in one place so there is one thing to
   check when either side changes.

   The rule that matters most here is the one about dropping. A sync layer that
   meets a field it has no column for will, if you let it, quietly leave it
   behind — and you find out months later that no seafarer's SIRB number was
   ever saved. So every column is written down below, and a field that is not
   among them and not explicitly marked as derived stops the push with an error
   naming it. Loud and broken beats quiet and lossy. */
const SYNC = (() => {
  'use strict';

  const snake = s => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
  const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

  /* Each entry: the collection in the store, the table behind it, its key, the
     columns that exist, any name that camelCase→snake_case does not get right,
     and the fields deliberately not stored. */
  const MAP = {
    courses:{
      table:'courses', key:'id', adminOnly:true,
      cols:['id','code','title','days','duration','modes','options','center','amount','rebate','deduct'],
      blankToNull:['days'],
    },
    accounts:{
      table:'accounts', key:'code', adminOnly:true,
      cols:['code','name','type','nature'],
    },
    trainees:{
      table:'trainees', key:'id',
      cols:['id','no','srn','last','first','middle','suffix','sex','birth','birth_place','sirb',
            'passport','rank','agency','mobile','email','facebook','messenger','address',
            'emergency_name','emergency_relation','emergency_mobile','source','registered','remarks'],
      blankToNull:['birth'],
      blankToDefault:['registered'],
    },
    enrollments:{
      table:'enrollments', key:'id',
      /* `date` is the day it was encoded, which is not the day it runs — the
         column says so even though the field never did. */
      rename:{ date:'date_encoded', start:'start_on', end:'end_on' },
      cols:['id','no','trainee_id','course_id','center','room','instructor','start_on','end_on',
            'date_encoded','status','result','certificate_no','invoice_id','fee','discount',
            'discount_note','rebate','deduct','center_payable','rebate_receivable','center_paid',
            'remit_no','remit_date','rebate_received_on','rebate_method','rebate_ref',
            'rebate_received_by','remarks'],
      blankToNull:['course_id','invoice_id','start_on','end_on','remit_no','remit_date',
                   'rebate_received_on','rebate_method','rebate_ref','center_payable'],
      blankToDefault:['date_encoded'],
    },
    invoices:{
      table:'invoices', key:'id',
      /* Neither is a column, and neither should be. `paid` was a stored number
         in the browser build and it drifted the first time a receipt was
         voided; `status` is a reading of it. Both are recomputed from the
         receipts on the way in, which cannot drift. */
      derived:['paid','status'],
      cols:['id','no','enrollment_id','trainee_id','date','terms','items','subtotal','discount','total','voided'],
      blankToNull:['enrollment_id'],
      blankToDefault:['date'],
    },
    payments:{
      table:'payments', key:'id',
      cols:['id','no','invoice_id','trainee_id','date','amount','tenders','method','ref','note','voided','taken_by'],
      blankToNull:['invoice_id'],
      blankToDefault:['date'],
    },
    expenses:{
      table:'expenses', key:'id',
      cols:['id','no','kind','date','payee','account','particulars','amount','method','ref','bookings',
            'lines','state','raised_by','approved_by','approved_on','decided_by','decided_on',
            'decision_note','self_approved'],
      blankToNull:['account','approved_by','approved_on','decided_by','decided_on'],
      blankToDefault:['date'],
      defaults:{ kind:'voucher' },
    },
    refunds:{
      table:'refunds', key:'id',
      cols:['id','no','date','trainee_id','amount','from_credit','from_over','method','ref','reason',
            'state','raised_by','approved_by','approved_on','decided_by','decided_on','decision_note'],
      blankToNull:['approved_by','approved_on','decided_by','decided_on'],
      blankToDefault:['date'],
    },
    journal:{
      table:'journal', key:'id',
      cols:['id','no','date','memo','ref_type','ref_no','ref_id','lines','debit','credit','voided',
            'reversal_of','posted_by'],
      blankToNull:['reversal_of'],
    },
    /* Who did what, and when. It was the one collection with no table behind
       it, so the audit trail lived in whichever browser happened to do the
       thing — which is no audit trail at all once there are three desks.

       Append only, and keyed on the moment rather than an id, because the
       entries have never carried one. Nothing here is ever updated or deleted:
       a log you can edit is a log worth nothing. */
    log:{
      table:'activity_log', insertOnly:true,
      keyOf:r => [r.ts, r.action, r.ref || ''].join('|'),
      rename:{ ts:'at', user:'who', ref:'reference' },
      cols:['at','who','action','reference'],
      drop:['id'],
    },
    applications:{
      table:'registrations', key:'id',
      rename:{ submitted:'submitted_at' },
      cols:['id','no','ref','channel','status','srn','last','first','trainee_id','submitted_at',
            'terms_version','terms_accepted','terms_accepted_at','history','payload','handled'],
      blankToNull:['trainee_id','terms_accepted_at'],
      blankToDefault:['submitted_at'],
      defaults:{ payload:{} },
    },
  };

  /* Dates arrive from Postgres as 'YYYY-MM-DD' already; timestamps arrive with
     a time on them that the store has never carried. Trim rather than store a
     string the rest of the code cannot compare. */
  const DAY_ONLY = /^(\d{4}-\d{2}-\d{2})T/;
  const trimDay = v => (typeof v === 'string' && DAY_ONLY.test(v)) ? v.slice(0, 10) : v;

  /* ---------- one row, each way ---------- */
  function toRow(name, obj){
    const m = MAP[name];
    const out = { ...(m.defaults || {}) };
    const unknown = [];
    for(const [k, v] of Object.entries(obj)){
      if(v === undefined) continue;
      if((m.derived || []).includes(k)) continue;
      if((m.drop || []).includes(k)) continue;
      const col = (m.rename || {})[k] || snake(k);
      if(!m.cols.includes(col)){ unknown.push(`${k} → ${col}`); continue; }

      /* An empty string is not a date and it is not a foreign key. Postgres
         refuses it for both, so what the store means by '' has to be said
         explicitly — and which of the two things it means depends on the
         column, which is why these are lists and not a clever pattern.

         null: the value is genuinely absent, and saying so clears whatever was
         there before. Rejecting a remittance deletes remitDate, and the row on
         the server has to lose it too or the booking stays marked as paid.

         omitted: the column is NOT NULL with a default, so leaving it out lets
         the database fill it rather than being told nothing is a date. */
      if(v === '' && (m.blankToNull || []).includes(col)){ out[col] = null; continue; }
      if(v === '' && (m.blankToDefault || []).includes(col)) continue;
      out[col] = v;
    }
    /* A cleared field is a deleted key, not an empty one — so anything nullable
       that is simply missing has to be sent as null on the way back up. An
       upsert that merely omits it would leave the old value standing. */
    (m.blankToNull || []).forEach(col => { if(!(col in out)) out[col] = null; });
    if(unknown.length){
      throw new Error(
        `${name}: no column for ${unknown.join(', ')}. ` +
        `Add the column in a migration and list it in sync.js — do not let the value go missing.`);
    }
    return out;
  }

  function fromRow(name, row){
    const m = MAP[name];
    const back = Object.fromEntries(Object.entries(m.rename || {}).map(([a, b]) => [b, a]));
    const out = {};
    for(const [col, v] of Object.entries(row)){
      if(col === 'created_at') continue;
      const k = back[col] || camel(col);
      out[k] = trimDay(v);
    }
    return out;
  }

  /* ---------- the whole store ---------- */
  async function pull(){
    const store = {};
    for(const name of Object.keys(MAP)){
      const m = MAP[name];
      /* The log is the one table that only grows. Reading all of it would mean
         a slower sign-in every week of the office's life, and nothing on any
         screen looks further back than the last few hundred entries. */
      const rows = m.insertOnly
        ? (await CLOUD.rest(m.table + '?select=*&order=at.desc&limit=300')) || []
        : await CLOUD.selectAll(m.table);
      store[name] = rows.map(r => fromRow(name, r));
    }

    /* What each invoice has actually been paid, summed from the receipts that
       still stand. This is the number the whole billing screen turns on, and
       deriving it here is why it can no longer disagree with the receipts. */
    const paid = {};
    store.payments.forEach(p => {
      if(p.voided || !p.invoiceId) return;
      paid[p.invoiceId] = Math.round(((paid[p.invoiceId] || 0) + Number(p.amount)) * 100) / 100;
    });
    store.invoices.forEach(i => {
      i.paid = paid[i.id] || 0;
      i.status = i.voided ? 'Void'
        : i.paid <= 0 ? 'Unpaid'
        : i.paid + 0.005 >= i.total ? 'Paid' : 'Partial';
    });

    /* Numerics come back from PostgREST as strings, because a JSON number
       cannot hold numeric(12,2) faithfully. Money that arrives as "5000.00"
       and gets added to a number becomes "05000.00" — so it is converted on
       the way in, once, here. */
    const MONEY = ['amount','fee','discount','rebate','total','subtotal','debit','credit',
                   'centerPayable','rebateReceivable','centerPaid','fromCredit','fromOver','days'];
    Object.values(store).forEach(rows => rows.forEach(r => {
      MONEY.forEach(f => { if(typeof r[f] === 'string' && r[f] !== '') r[f] = Number(r[f]); });
    }));

    /* The roster is admin-only, so for everybody else this comes back empty and
       the Settings screen simply does not offer it. A failure to read it is not
       a failure to load the system. */
    const [company, staff, seq, roster] = await Promise.all([
      CLOUD.rest('company?select=profile&limit=1'),
      CLOUD.selectAll('staff'),
      CLOUD.selectAll('doc_seq'),
      CLOUD.selectAll('roster').catch(() => []),
    ]);
    store.roster = roster;
    store.company = (company && company[0] && company[0].profile) || null;
    /* No password comes down. Supabase Auth holds those and this browser has no
       business knowing them — the browser build kept them in a field called
       `code` and shipped them to anyone who opened the page. */
    store.users = staff.map(s => ({ id:s.id, name:s.name, role:s.role,
                                    initials:s.initials, email:s.email, active:s.active }));
    store.seq = Object.fromEntries(seq.map(s => [s.kind, s.value]));
    return store;
  }

  /* ---------- only what changed ----------
     A push writes the rows that differ from what was last read, not the whole
     store. Two people working at once is the ordinary case now, and a cashier
     saving a receipt must not post the entire database back over whatever the
     registrar just did at the next desk. */
  /* Most rows are keyed on their id; the chart of accounts on its code; the
     log on the moment it recorded, having neither. */
  const keyer = name => (MAP[name] && MAP[name].keyOf)
    || (r => String(r.id != null ? r.id : r.code));

  const fingerprint = (rows, name) => {
    const key = keyer(name);
    const out = {};
    (rows || []).forEach(r => { out[key(r)] = JSON.stringify(r); });
    return out;
  };

  function snapshot(store){
    const out = {};
    Object.keys(MAP).forEach(name => { out[name] = fingerprint(store[name], name); });
    out.company = JSON.stringify(store.company || {});
    out.seq = JSON.stringify(store.seq || {});
    return out;
  }

  /* The price list, the chart of accounts and the office's own details are the
     admin's, and the policies on the server say so. The trouble was that the
     client asked anyway: migrate() fills in defaults on every load, so those
     three always looked changed, and the front desk's very first save was
     refused for a table they had never opened and cannot see.

     Skipping is right rather than lossy here. A cashier has no Courses screen
     and no Settings screen — the difference is migration noise, not their work,
     and an admin signing in pushes the same thing properly. */
  async function push(store, base, opts){
    const admin = !opts || opts.isAdmin !== false;
    const done = { upserts:0, deletes:0, tables:[], skipped:[] };
    for(const name of Object.keys(MAP)){
      const m = MAP[name];
      if(m.adminOnly && !admin){ done.skipped.push(m.table); continue; }
      const now = fingerprint(store[name], name);
      const was = (base && base[name]) || {};
      const key = keyer(name);

      /* An append-only table sends what the server has not seen and nothing
         else — never a rewrite of an entry already recorded. */
      const changed = (store[name] || []).filter(r =>
        m.insertOnly ? !(key(r) in was) : now[key(r)] !== was[key(r)]);
      const gone = m.insertOnly ? [] : Object.keys(was).filter(k => !(k in now));

      if(changed.length){
        /* No id to merge on, so this is a plain insert rather than an upsert. */
        await CLOUD.upsert(m.table, changed.map(r => toRow(name, r)), 500, !m.insertOnly);
        done.upserts += changed.length;
        done.tables.push(`${m.table} +${changed.length}`);
      }
      /* Only the catalogue may lose rows. Nothing else in this system deletes:
         a receipt is voided, an entry is reversed, a booking is cancelled —
         all of which are rows that still exist and still say what happened. */
      if(gone.length && m.table === 'courses'){
        await CLOUD.remove(m.table, gone, m.key);
        done.deletes += gone.length;
      }
    }

    if(!admin){ done.skipped.push('company'); }
    else if(JSON.stringify(store.company || {}) !== (base && base.company)){
      await CLOUD.upsert('company', [{ id:true, profile:store.company || {}, updated_at:new Date().toISOString() }]);
      done.tables.push('company');
    }
    if(JSON.stringify(store.seq || {}) !== (base && base.seq)){
      await CLOUD.upsert('doc_seq', Object.entries(store.seq || {}).map(([kind, value]) => ({ kind, value })), 100);
      done.tables.push('doc_seq');
    }
    return done;
  }

  return { MAP, toRow, fromRow, pull, push, snapshot, snake, camel };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = SYNC;
