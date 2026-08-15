# Accounting policy

What the system posts, when, and why. Owned by `assets/accounting.js`.

> **The rule everything else follows:** every peso in every report traces back to a balanced
> journal entry. No report stores or hand-computes a total.

---

## Chart of accounts

Defined as `COA` in `assets/db.js`. `nature` is which side *increases* the account, and it
drives the sign in the trial balance.

| Code | Account | Type | Nature |
|---|---|---|---|
| 1000 | Cash on Hand | Asset | debit |
| 1010 | Cash in Bank | Asset | debit |
| 1200 | Accounts Receivable | Asset | debit |
| 2100 | Output VAT Payable | Liability | credit |
| 2200 | Unearned Training Fees | Liability | credit |
| 3000 | Owner's Equity | Equity | credit |
| 4000 | Training Fees Revenue | Revenue | credit |
| 4100 | Assessment & Other Fees | Revenue | credit |
| 4900 | **Discounts Given** | Revenue | **debit** |
| 5000 | Instructor Fees | Expense | debit |
| 5100 | Training Materials | Expense | debit |
| 5200 | Rent & Utilities | Expense | debit |
| 5300 | Salaries & Wages | Expense | debit |
| 5400 | Regulatory & Permits | Expense | debit |
| 5900 | Miscellaneous Expense | Expense | debit |

### 4900 is contra-revenue — do not "fix" it

`Discounts Given` has `type: 'Revenue'` with `nature: 'debit'`. That combination looks wrong at
a glance and is correct.

`ACC.incomeStatement()` signs each account **by its statement section**, not by its own nature:

```js
const amt = type === 'Revenue' ? m.credit - m.debit : m.debit - m.credit;
```

So a debit-natured account sitting inside Revenue lands negative and *subtracts* from gross
revenue, which is exactly what a discount should do. Moving it to Expense would overstate both
revenue and expenses by the discount amount and leave net income unchanged — a worse
presentation of the same number.

---

## VAT

Configured at Settings: `vatRate` (percent) and `vatInclusive` (boolean).

**Default: fees are quoted VAT-inclusive**, which is how Philippine training rates are
published. `ACC.vatSplit(gross)` backs the tax out:

```
inclusive:   net = gross / (1 + rate)      vat = gross - net       total = gross
exclusive:   net = gross                   vat = gross * rate      total = gross + vat
```

Setting `vatRate` to `0` disables VAT entirely — no `2100` line is posted.

Revenue is credited **net of VAT**. Every invoice item's amount is divided by `(1 + rate)`
when inclusive pricing is on, so revenue accounts never carry tax.

---

## What each event posts

### Billing an enrollment — `ACC.postInvoice()`

Triggered by a new enrollment with status `Enrolled`, or by converting an approved application.

| | Account | Debit | Credit |
|---|---|---|---|
| | 1200 Accounts Receivable | invoice total | |
| | 4000 / 4100 (per item) | | item amount ÷ (1 + rate) |
| | 4900 Discounts Given | discount ÷ (1 + rate) | |
| | 2100 Output VAT Payable | | VAT |

Each item credits **its own** revenue account, so course fees and assessment fees are separable
in the income statement without inspecting invoice line items.

### Collecting a payment — `ACC.postPayment()`

| | Account | Debit | Credit |
|---|---|---|---|
| | 1000 Cash on Hand *or* 1010 Cash in Bank | amount | |
| | 1200 Accounts Receivable | | amount |

`Cash` posts to `1000`; every other method (`GCash`, `Bank Transfer`, …) posts to `1010`.
See `ACC.cashAccount()`.

Partial payments are ordinary — the invoice's `status` is recomputed from the sum of its
non-void payments, never set by hand.

### Paying an expense — `ACC.postExpense()`

| | Account | Debit | Credit |
|---|---|---|---|
| | 5xxx expense account | amount | |
| | 1000 / 1010 cash account | | amount |

### Voiding anything — `ACC.reverse()`

Writes a **mirror-image entry** — every debit becomes a credit and vice versa — flags the
original as `voided`, and stamps `reversalOf` with the original entry number.

Nothing is ever deleted. An audit trail with holes in it is not an audit trail.

---

## Rounding

`ACC.r2()` rounds to two decimal places, and every arithmetic step goes through it.

VAT back-calculation can still leave a sub-centavo residue that would make an entry a centavo
out. `balanceLines(lines, plugIndex)` nudges any difference under ₱0.05 onto a single
designated line — the VAT line for invoices — so entries always balance exactly.

Differences above ₱0.05 are *not* silently absorbed. `ACC.post()` warns on the console and
refuses to treat the entry as balanced, because a discrepancy that large is a bug, not
rounding.

---

## Derived states

Never stored. Always computed, so they cannot go stale.

| State | Derived by | Rule |
|---|---|---|
| Invoice `paid` | `recomputeInvoice()` | Sum of non-void payments against the invoice |
| Invoice `status` | `recomputeInvoice()` | `Void` → `Unpaid` (paid ≤ 0) → `Paid` (paid ≥ total) → `Partial` |
| `Overdue` | `invStatus()` in `app.js` | Unpaid balance **and** the batch has already started. Presentation only. |
| Invoice balance | `balanceOf()` | `total - paid` |

The half-centavo tolerance in the `Paid` test (`paid + 0.005 >= total`) prevents an invoice
settled to the last centavo from showing as `Partial`.

---

## Reports

All pure functions of `journal[]`.

| Report | Function | Notes |
|---|---|---|
| Trial balance | `trialBalance(asOf)` | **Cumulative** as of a date — a trial balance is an as-of statement, not a period one. Accounts with no movement are omitted. |
| Income statement | `incomeStatement(from, to)` | Period-based. Signs by statement section (see 4900 above). |
| AR ageing | `arAging(asOf)` | Buckets: Current, 1–30, 31–60, 61–90, Over 90, aged from the invoice date. Void invoices and settled balances excluded. |
| Collections | `collections(from, to)` | Receipts in the period, totalled and broken down by payment method. |
| General ledger | `ledgerFor(code, from, to)` | Per-account movements with a running balance signed by the account's `nature`. |

---

## Invariants to protect

If you change `accounting.js`, these must all still hold. `tests/smoke.js` checks the first
and the last.

1. **Every entry balances.** `debit === credit`, always.
2. **The journal is append-only.** Corrections are reversals, not edits.
3. **Revenue is recorded net of VAT.**
4. **Reservations post nothing.** A reservation is not a receivable.
5. **Rejected and withdrawn applications post nothing.** Admissions volume never touches the
   books.
6. **No report stores a total.** Everything derives from `journal[]`.
7. **The trial balance balances** after every path that can create a financial record.

```bash
node tests/smoke.js
```

---

## Not yet handled

Deliberate Phase 3 scope, listed so nobody assumes they are covered.

- Withholding tax on instructor honoraria
- Instalment and down-payment schedules
- Refunds and cancellation charges
- Consolidated agency billing (one statement per manning agency)
- BIR-registered receipt series with authority-to-print details
- Fiscal year close and opening balances (Phase 5.3)
- Unearned Training Fees (`2200`) is in the chart of accounts but nothing posts to it yet —
  it is there for deferred revenue recognition once instalments arrive
