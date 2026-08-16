/* accounting.js — double-entry engine.
   Every billable event in the portal posts a balanced journal entry here, so the
   trial balance, income statement and AR aging are all derived, never hand-keyed. */

const ACC = (() => {
  const r2 = n => Math.round((Number(n)||0) * 100) / 100;

  const co  = () => DB.get().company;

  const acct = code => DB.get().accounts.find(a => a.code === code) || { code, name:code, type:'Other', nature:'debit' };

  /* No VAT and no withholding anywhere in this engine. The amount agreed with
     the applicant is the amount billed, collected and reported — one figure the
     whole way through. If tax is ever reinstated it belongs here, in one place,
     and not scattered through the views. */

  /* ---------- journal ---------- */
  /* Nudges sub-centavo rounding residue onto one line so entries always balance. */
  function balanceLines(lines, plugIndex){
    const dr = r2(lines.reduce((s,l)=>s+(l.debit||0),0));
    const cr = r2(lines.reduce((s,l)=>s+(l.credit||0),0));
    const diff = r2(dr - cr);
    if(diff !== 0 && Math.abs(diff) < 0.05 && lines[plugIndex]){
      const l = lines[plugIndex];
      if(l.credit != null) l.credit = r2(l.credit + diff);
      else l.debit = r2(l.debit - diff);
    }
    return lines;
  }

  function post({ date, memo, refType, refNo, refId, lines }){
    const d = DB.get();
    const clean = lines
      .map(l => ({ account:l.account, debit:r2(l.debit||0), credit:r2(l.credit||0) }))
      .filter(l => l.debit || l.credit);
    const dr = r2(clean.reduce((s,l)=>s+l.debit,0));
    const cr = r2(clean.reduce((s,l)=>s+l.credit,0));
    if(dr !== cr) console.warn('Unbalanced entry rejected', memo, dr, cr);
    d.seq.journal++;
    const je = {
      id:DB.uid('je'), no:`JE-${new Date(date).getFullYear()}-${String(d.seq.journal).padStart(4,'0')}`,
      date, memo, refType:refType||'', refNo:refNo||'', refId:refId||'',
      lines:clean, debit:dr, credit:cr, voided:false,
    };
    d.journal.push(je);
    return je;
  }

  /* Mirror-image entry — used when a document is voided. Keeps the audit trail intact
     instead of deleting history. */
  function reverse(refId, reason){
    const d = DB.get();
    const originals = d.journal.filter(j => j.refId === refId && !j.voided && !j.reversalOf);
    originals.forEach(j => {
      j.voided = true;
      const je = post({
        date:DB.today(), memo:`REVERSAL — ${j.memo}${reason ? ' ('+reason+')' : ''}`,
        refType:j.refType, refNo:j.refNo, refId:j.refId,
        lines:j.lines.map(l => ({ account:l.account, debit:l.credit, credit:l.debit })),
      });
      je.reversalOf = j.no;
    });
    return originals.length;
  }

  /* ---------- documents ---------- */
  function computeInvoice(items, discount){
    const subtotal = r2(items.reduce((s,i) => s + (Number(i.qty)||0) * (Number(i.price)||0), 0));
    const disc     = r2(Math.min(Number(discount)||0, subtotal));
    const total    = r2(subtotal - disc);
    return { subtotal, discount:disc, total };
  }

  function buildInvoice({ enrollmentId, traineeId, date, items, discount, terms }){
    const c = computeInvoice(items, discount);
    return {
      id:DB.uid('inv'), no:DB.nextNo('invoice','INV'),
      enrollmentId, traineeId, date:date||DB.today(),
      terms: terms || 'Due on or before first day of training',
      items: items.map(i => ({ ...i, qty:Number(i.qty)||1, price:r2(i.price), amount:r2((Number(i.qty)||1)*i.price) })),
      ...c, paid:0, status:'Unpaid', voided:false,
    };
  }

  function postInvoice(inv){
    const lines = [{ account:'1200', debit:inv.total, credit:0 }];

    // Each line credits its own revenue account, at the amount charged.
    const byAcct = {};
    inv.items.forEach(i => {
      const a = i.account || '4000';
      byAcct[a] = r2((byAcct[a]||0) + i.amount);
    });
    Object.entries(byAcct).forEach(([a,v]) => lines.push({ account:a, debit:0, credit:v }));

    if(inv.discount) lines.push({ account:'4900', debit:inv.discount, credit:0 });

    balanceLines(lines, lines.length - 1);
    return post({ date:inv.date, memo:`Billing — ${inv.no}`, refType:'Invoice', refNo:inv.no, refId:inv.id, lines });
  }

  /* ---------- what we owe the training center ----------
     TB Maritime endorses a seafarer to a partner center; the center runs the
     course and is owed its fee. The rebate is what the center gives back, and
     the course's `deduct` flag says how it is settled:

       Deduct        — the rebate comes off the payable. We remit the fee less
                       the rebate, and the margin is realised the moment the
                       booking is made, whether or not the trainee has paid.
       Do not deduct — the payable is the full fee. The rebate is owed to us
                       separately, so it is carried as a receivable from the
                       center until they settle it.

     Either way the trainee is charged the same amount: this decides what moves
     between us and the center, not what the seafarer pays. Both are posted when
     the booking is billed, because the debt to the center exists from that
     moment regardless of how much of the fee has been collected. */
  function centerSettlement({ fee, rebate, deduct }){
    const f = r2(fee), rb = r2(rebate || 0);
    return deduct
      ? { payable:r2(f - rb), receivable:0, rebate:rb }
      : { payable:f,          receivable:rb, rebate:rb };
  }

  function postCenterPayable({ date, memo, refNo, refId, fee, rebate, deduct }){
    const s = centerSettlement({ fee, rebate, deduct });
    const lines = [
      { account:'5050', debit:s.payable, credit:0 },   // cost of the seat
      { account:'2000', debit:0, credit:s.payable },   // owed to the center
    ];
    if(s.receivable){
      lines.push({ account:'1250', debit:s.receivable, credit:0 });  // rebate due to us
      lines.push({ account:'4200', debit:0, credit:s.receivable });  // and earned
    }
    if(deduct && s.rebate){
      /* Netted off the payable, so the margin is already in the numbers above;
         name it in the memo so the ledger reads as what happened. */
      memo += ` · rebate ${s.rebate} deducted`;
    }
    return { entry:post({ date, memo, refType:'Booking', refNo, refId, lines }), ...s };
  }

  /* Modes of payment are configurable — the admin maintains the list in
     Settings — but each one has to say where its money lands, or the cash
     accounts stop meaning anything. GCash gets its own account rather than
     sharing Cash in Bank: the wallet reconciles against a GCash statement, the
     bank against a bank statement, and a cashier who has to unpick one from the
     other at month end will not bother.

     `ref:true` means the mode leaves a reference number on a statement, so the
     cashier is made to key it in. Cash leaves none and is not asked. */
  const DEFAULT_METHODS = [
    { name:'Cash',  account:'1000', ref:false },
    { name:'GCash', account:'1020', ref:true  },
    { name:'Bank',  account:'1010', ref:true  },
  ];
  function methods(){
    const m = (co() || {}).methods;
    return Array.isArray(m) && m.length ? m : DEFAULT_METHODS;
  }
  const methodNames = () => methods().map(m => m.name);
  /* Older records used names that are no longer offered; they still have to
     post somewhere sensible rather than silently landing in the cash drawer. */
  const LEGACY = { 'Bank Transfer':'Bank', Cheque:'Bank', Card:'Bank' };
  function normalMethod(m){
    const names = methodNames();
    if(names.includes(m)) return m;
    const mapped = LEGACY[m];
    if(mapped && names.includes(mapped)) return mapped;
    return names[0] || 'Cash';
  }
  function cashAccount(m){
    const hit = methods().find(x => x.name === normalMethod(m));
    return (hit && hit.account) || '1000';
  }
  const needsRef = m => {
    const hit = methods().find(x => x.name === m);
    return !!(hit && hit.ref);
  };

  /* A receipt may be settled in more than one way at the window — half in cash,
     half by GCash. `tenders` is the truth; `method` is the one-word summary the
     tables and the donut chart read. */
  function normalTenders(input, fallbackAmount){
    const list = (Array.isArray(input) ? input : [])
      .map(t => ({ method:normalMethod(t.method), ref:String(t.ref||'').trim(), amount:r2(t.amount) }))
      .filter(t => t.amount > 0);
    if(list.length) return list;
    return [{ method:'Cash', ref:'', amount:r2(fallbackAmount) }];
  }

  function buildPayment({ invoiceId, traineeId, date, amount, method, ref, note, tenders }){
    const list = tenders
      ? normalTenders(tenders, amount)
      : [{ method:normalMethod(method), ref:String(ref||'').trim(), amount:r2(amount) }];
    const total = r2(list.reduce((s,t) => s + t.amount, 0));
    return {
      id:DB.uid('pay'), no:DB.nextNo('receipt','OR'),
      invoiceId, traineeId, date:date||DB.today(),
      amount:total,
      tenders:list,
      method: list.length > 1 ? 'Split' : list[0].method,
      ref: list.map(t => t.ref).filter(Boolean).join(' · '),
      note:note||'', voided:false,
    };
  }

  /* Every tender debits the account its money actually landed in; the whole
     receipt credits receivables once. */
  function paymentLines(p){
    const list = p.tenders && p.tenders.length ? p.tenders : [{ method:p.method, amount:p.amount }];
    const byAcct = {};
    list.forEach(t => {
      const a = cashAccount(t.method);
      byAcct[a] = r2((byAcct[a]||0) + r2(t.amount));
    });
    return Object.entries(byAcct).map(([account, debit]) => ({ account, debit, credit:0 }));
  }

  function postPayment(p, inv){
    inv.paid = r2((inv.paid||0) + p.amount);
    inv.status = inv.paid <= 0 ? 'Unpaid' : (inv.paid + 0.005 >= inv.total ? 'Paid' : 'Partial');
    return post({
      date:p.date, memo:`Collection — ${p.no} vs ${inv.no}`,
      refType:'Receipt', refNo:p.no, refId:p.id,
      lines:[ ...paymentLines(p), { account:'1200', debit:0, credit:p.amount } ],
    });
  }

  function postExpense(v){
    return post({
      date:v.date, memo:`${v.particulars} — ${v.payee}`,
      refType:'Voucher', refNo:v.no, refId:v.id,
      lines:[
        { account:v.account, debit:r2(v.amount), credit:0 },
        { account:cashAccount(v.method), debit:0, credit:r2(v.amount) },
      ],
    });
  }

  function recomputeInvoice(inv){
    const paid = DB.get().payments
      .filter(p => p.invoiceId === inv.id && !p.voided)
      .reduce((s,p) => s + p.amount, 0);
    inv.paid = r2(paid);
    inv.status = inv.voided ? 'Void'
      : inv.paid <= 0 ? 'Unpaid'
      : inv.paid + 0.005 >= inv.total ? 'Paid' : 'Partial';
    return inv;
  }
  const balanceOf = inv => r2(inv.total - (inv.paid||0));

  /* ---------- reports ---------- */
  const inRange = (d,from,to) => (!from || d >= from) && (!to || d <= to);

  /* Cumulative balances as of `to` — a trial balance is an as-of statement. */
  function trialBalance(to){
    const map = {};
    DB.get().journal.forEach(j => {
      if(to && j.date > to) return;
      j.lines.forEach(l => {
        const m = map[l.account] || (map[l.account] = { debit:0, credit:0 });
        m.debit += l.debit; m.credit += l.credit;
      });
    });
    const rows = DB.get().accounts.map(a => {
      const m = map[a.code] || { debit:0, credit:0 };
      const bal = r2(a.nature === 'debit' ? m.debit - m.credit : m.credit - m.debit);
      return { ...a, drTotal:r2(m.debit), crTotal:r2(m.credit), balance:bal,
               dr: a.nature === 'debit' ? Math.max(bal,0) : Math.max(-bal,0),
               cr: a.nature === 'credit' ? Math.max(bal,0) : Math.max(-bal,0) };
    }).filter(r => r.drTotal || r.crTotal);
    return {
      rows,
      totalDr:r2(rows.reduce((s,r)=>s+r.dr,0)),
      totalCr:r2(rows.reduce((s,r)=>s+r.cr,0)),
    };
  }

  function incomeStatement(from, to){
    const map = {};
    DB.get().journal.forEach(j => {
      if(!inRange(j.date, from, to)) return;
      j.lines.forEach(l => {
        const m = map[l.account] || (map[l.account] = { debit:0, credit:0 });
        m.debit += l.debit; m.credit += l.credit;
      });
    });
    /* Signed by statement section rather than by the account's own nature, so a
       contra account (Discounts Given sits inside Revenue) subtracts from its group
       instead of inflating it. */
    const pick = type => DB.get().accounts.filter(a => a.type === type).map(a => {
      const m = map[a.code] || { debit:0, credit:0 };
      const amt = r2(type === 'Revenue' ? m.credit - m.debit : m.debit - m.credit);
      return { ...a, amount:amt };
    }).filter(a => a.amount !== 0);

    const revenue  = pick('Revenue');   // Discounts Given lands negative here, by design
    const expenses = pick('Expense');
    const gross = r2(revenue.reduce((s,a)=>s+a.amount,0));
    const opex  = r2(expenses.reduce((s,a)=>s+a.amount,0));
    return { revenue, expenses, grossRevenue:gross, totalExpense:opex, netIncome:r2(gross - opex) };
  }

  function arAging(asOf){
    const d = DB.get(), ref = asOf || DB.today();
    const buckets = [
      { label:'Current',  min:-9999, max:0,   total:0, rows:[] },
      { label:'1–30 days',min:1,     max:30,  total:0, rows:[] },
      { label:'31–60',    min:31,    max:60,  total:0, rows:[] },
      { label:'61–90',    min:61,    max:90,  total:0, rows:[] },
      { label:'Over 90',  min:91,    max:1e6, total:0, rows:[] },
    ];
    let grand = 0;
    d.invoices.filter(i => !i.voided && i.date <= ref).forEach(inv => {
      const bal = balanceOf(recomputeInvoice(inv));
      if(bal <= 0.004) return;
      const age = Math.floor((new Date(ref) - new Date(inv.date)) / 86400000);
      const b = buckets.find(b => age >= b.min && age <= b.max) || buckets[0];
      b.rows.push({ inv, bal, age }); b.total = r2(b.total + bal); grand = r2(grand + bal);
    });
    return { buckets, grand, asOf:ref };
  }

  function collections(from, to){
    const rows = DB.get().payments.filter(p => !p.voided && inRange(p.date, from, to));
    const byMethod = {};
    rows.forEach(p => byMethod[p.method] = r2((byMethod[p.method]||0) + p.amount));
    return { rows, byMethod, total:r2(rows.reduce((s,p)=>s+p.amount,0)) };
  }

  function ledgerFor(code, from, to){
    const out = []; let run = 0;
    const nature = acct(code).nature;
    DB.get().journal
      .filter(j => inRange(j.date, from, to))
      .sort((a,b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no))
      .forEach(j => j.lines.filter(l => l.account === code).forEach(l => {
        run = r2(run + (nature === 'debit' ? l.debit - l.credit : l.credit - l.debit));
        out.push({ date:j.date, no:j.no, memo:j.memo, ref:j.refNo, debit:l.debit, credit:l.credit, running:run });
      }));
    return out;
  }

  return {
    r2, computeInvoice, post, reverse, acct,
    methods, methodNames, needsRef, DEFAULT_METHODS,
    buildInvoice, postInvoice, buildPayment, postPayment, postExpense,
    recomputeInvoice, balanceOf, cashAccount, paymentLines,
    centerSettlement, postCenterPayable,
    trialBalance, incomeStatement, arAging, collections, ledgerFor,
  };
})();
