# Data model

The entire system is one JSON object in `localStorage` under the key **`tbm_is_v1`**.

This document is the **porting contract for Phase 2**. When the schema moves to Postgres, keep
these field names verbatim — `db.js` is the only module that touches storage, so identical
names mean nothing above it has to change.

---

## Root shape

```js
{
  meta:    { version, created },
  company: { … },          // single record, see below
  users:   [ … ],          // demo auth — replaced in Phase 2
  accounts:[ … ],          // chart of accounts
  seq:     { … },          // document number counters
  applications:[ … ],      // public portal submissions
  trainees:    [ … ],
  courses:     [ … ],
  batches:     [ … ],
  enrollments: [ … ],
  invoices:    [ … ],
  payments:    [ … ],
  expenses:    [ … ],
  journal:     [ … ],      // the source of truth for all financial reporting
  log:         [ … ],      // activity ring buffer, capped at 300
}
```

### Conventions

| Rule | Detail |
|---|---|
| Dates | `YYYY-MM-DD` strings. Compared lexically. Never `Date` objects in stored data. |
| Timestamps | ISO 8601 strings — only in `journal` history and `log.ts`. |
| Money | Numbers, rounded to 2dp through `ACC.r2()` at every step. |
| IDs | `DB.uid(prefix)` → `"trn-k3f9a2b"`. Type-visible on sight. |
| Document numbers | `DB.nextNo(kind, prefix)` → `"INV-2026-0042"`. |
| Empty values | `''` for absent strings, not `null`. Simplifies the form round-trip. |

### Migration

`DB.migrate()` runs on **every** `load()` and `importJSON()`. Any new top-level collection
gets a default there rather than in a versioned migration script, so a backup taken before
the collection existed still opens. When you add a store, add it to `blank()` **and**
`migrate()`.

---

## `company` — center profile

Single record. Editable at Settings.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Printed on invoices, receipts and the portal footer |
| `address` | string | |
| `contact` | string | Phone and email, one line |
| `tin` | string | Taxpayer identification number |
| `accreditation` | string | MARINA/STCW accreditation number |
| `vatRate` | number | Percent, e.g. `12` |
| `vatInclusive` | boolean | `true` = published fees include VAT (the Philippine norm) |
| `fiscalYear` | number | |
| `addons` | array? | Optional fee presets; falls back to `DEFAULT_ADDONS` in `app.js` |

---

## `users` — demo authentication

**Replaced entirely in Phase 2.** Codes are plaintext; this is not authentication.

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `name` | string | |
| `role` | string | `admin` \| `registrar` \| `cashier` \| `accounting` |
| `code` | string | **Plaintext demo access code** |
| `initials` | string | Sidebar avatar |

---

## `accounts` — chart of accounts

| Field | Type | Notes |
|---|---|---|
| `code` | string | Four digits, referenced by every journal line |
| `name` | string | |
| `type` | string | `Asset` \| `Liability` \| `Equity` \| `Revenue` \| `Expense` |
| `nature` | string | `debit` \| `credit` — **which side increases the account** |

`nature` drives the trial balance sign. `4900 Discounts Given` is a contra-revenue account:
`type: 'Revenue'` with `nature: 'debit'`. See [`accounting-policy.md`](accounting-policy.md).

---

## `seq` — document counters

```js
{ trainee, course, batch, enrollment, invoice, receipt, voucher, journal, application }
```

Incremented by `DB.nextNo()`. **Client-side and therefore racy** — two tabs can collide.
Known limitation B5; move this into a database transaction in Phase 2.

---

## `applications` — public portal submissions

The Phase 1 addition. Written by the portal, decided on by the registrar.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `app-…` |
| `no` | string | `APP-YYYY-####` |
| `ref` | string | **6-char public tracking code.** Alphabet excludes `O 0 I 1 L` so it can be read over the phone. Uniqueness checked on generation. |
| `submitted` | date | |
| `channel` | string | `'Public Portal'` — reserved for walk-in or agency-batch channels later |
| `status` | string | See lifecycle below |
| `courseId` | string | → `courses.id` |
| `batchId` | string | → `batches.id` |
| `last` `first` `middle` | string | |
| `sex` | string | `M` \| `F` |
| `birth` | date | |
| `srn` `sirb` `passport` | string | Seafarer documents — all optional at application time |
| `rank` | string | Required |
| `agency` | string | Manning agency, blank = direct hire |
| `mobile` | string | Required — the registrar's callback number |
| `email` | string | Lowercased on submit |
| `address` | string | |
| `payer` | string | `Self-paid` \| `Agency-billed` |
| `remarks` | string | Applicant's own note |
| `traineeId` | string | Set on conversion → `trainees.id` |
| `enrollmentId` | string | Set on conversion → `enrollments.id` |
| `decidedBy` | string | Staff name, set when the application reaches a final state |
| `decidedOn` | date | |
| `reason` | string | Rejection or withdrawal reason. **Visible to the applicant on the tracker.** |
| `history` | array | `[{ ts, status, by, note }]` — append-only audit trail |

### Lifecycle

```
Submitted ──▶ Under Review ──▶ Approved ──▶ Enrolled      terminal, has an enrollment
     │              │              │
     └──────────────┴──────────────┴──────▶ Rejected      terminal, has a reason
     │              │              │
     └──────────────┴──────────────┴──────▶ Withdrawn     terminal, applicant pulled out
```

`APPS.NEXT` is the machine-readable version and the only authority. `APPS.advance()` throws on
an illegal transition, and the registrar's UI derives its buttons from the same table — so
adding a state there surfaces it everywhere at once.

**Open states** (`Submitted`, `Under Review`, `Approved`) hold a seat.
**Final states** (`Enrolled`, `Rejected`, `Withdrawn`) release it.

---

## `trainees` — seafarer master records

| Field | Type | Notes |
|---|---|---|
| `id` | string | `trn-…` |
| `no` | string | `TRN-YYYY-####` |
| `last` `first` `middle` | string | |
| `sex` | string | `M` \| `F` |
| `birth` | date | |
| `srn` | string | Seafarer Registration Number — **primary duplicate-detection key** |
| `sirb` | string | Seafarer's Identification and Record Book |
| `passport` | string | |
| `rank` | string | |
| `agency` | string | |
| `mobile` `email` `address` | string | |
| `registered` | date | |
| `remarks` | string | Portal-created records note their application number here |

`APPS.matchTrainee()` matches on `srn` first, then `last + first + birth`. Seafarers return
for refreshers constantly; a duplicate master record would split their certificates and
statement of account.

---

## `courses` — accredited catalogue

| Field | Type | Notes |
|---|---|---|
| `id` `code` `title` | string | `code` is what appears in tables, e.g. `PSCRB` |
| `regulation` | string | STCW/MARINA reference, e.g. `STCW VI/2-1` |
| `days` | number | Duration; drives the batch end date |
| `fee` | number | Published rate, VAT-inclusive by default |
| `capacity` | number | Default seats per batch |
| `category` | string | Groups the portal catalogue |
| `active` | boolean | Inactive courses are hidden from the portal |

---

## `batches` — scheduled runs

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `no` | string | `CODE-###`, e.g. `BT-004` |
| `courseId` | string | → `courses.id` |
| `start` `end` | date | `end` derived from the course's `days` |
| `room` `instructor` | string | |
| `capacity` | number | Copied from the course, overridable per batch |
| `status` | string | `Open` \| `Ongoing` \| `Completed` \| `Cancelled` |

The portal offers a batch only when `status === 'Open'`, `start >= today`, and
`APPS.seatsTaken(b).free > 0`.

### Seat accounting

```js
APPS.seatsTaken(batch) → { enrolled, pending, total, free }
```

- `enrolled` — enrollments in `Enrolled`, `Reserved` or `Completed`
- `pending` — applications in an open state without an enrollment yet
- `free` — `capacity - enrolled - pending`

A pending application is a **soft claim**. The trade-off is deliberate: see decision D3 in
the action plan.

---

## `enrollments`

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `no` | string | `ENR-YYYY-####` |
| `traineeId` `batchId` `courseId` | string | |
| `date` | date | Registration date |
| `status` | string | `Reserved` \| `Enrolled` \| `Completed` \| `Cancelled` |
| `result` | string | `''` \| `Passed` \| `Failed` |
| `fee` | number | Snapshot of the course fee at enrollment time |
| `discount` | number | |
| `discountNote` | string | |
| `certificateNo` | string | Set when the result is `Passed` |
| `invoiceId` | string? | Absent while `Reserved` |
| `applicationId` | string? | Present when created from the portal |
| `remarks` | string | |

**`Reserved` enrollments are never billed.** A reservation is not a receivable.

---

## `invoices`

Built by `ACC.buildInvoice()`, posted by `ACC.postInvoice()`.

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `no` | string | `INV-YYYY-####` |
| `enrollmentId` `traineeId` | string | |
| `date` | date | |
| `terms` | string | |
| `items` | array | `[{ desc, account, qty, price, amount }]` — `account` is the revenue account credited |
| `subtotal` | number | Sum of item amounts |
| `discount` | number | Capped at `subtotal` |
| `gross` | number | `subtotal - discount` |
| `net` | number | VAT-able amount |
| `vat` | number | |
| `total` | number | Amount due |
| `paid` | number | Recomputed from payments by `ACC.recomputeInvoice()` |
| `status` | string | `Unpaid` \| `Partial` \| `Paid` \| `Void` — **derived, never set by hand** |
| `voided` | boolean | |

The UI additionally derives `Overdue` (unpaid with the batch already started) in
`invStatus()` — it is a presentation state, not a stored one.

---

## `payments` — official receipts

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `no` | string | `OR-YYYY-####` |
| `invoiceId` `traineeId` | string | |
| `date` | date | |
| `amount` | number | |
| `method` | string | `Cash` \| `GCash` \| `Bank Transfer` \| … — `Cash` posts to `1000`, everything else to `1010` |
| `ref` | string | Reference number for non-cash |
| `note` | string | |
| `voided` | boolean | |

---

## `expenses` — disbursement vouchers

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `no` | string | `DV-YYYY-####` |
| `date` | date | |
| `payee` | string | |
| `account` | string | Expense account code debited |
| `amount` | number | |
| `particulars` | string | |
| `method` | string | Determines the cash account credited |

---

## `journal` — the source of truth

Every financial report is derived from this array. Nothing else.

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `no` | string | `JE-YYYY-####` |
| `date` | date | |
| `memo` | string | |
| `refType` | string | `Invoice` \| `Receipt` \| `Voucher` \| `''` |
| `refNo` | string | Source document number |
| `refId` | string | Source document id — how `reverse()` finds entries to void |
| `lines` | array | `[{ account, debit, credit }]` |
| `debit` `credit` | number | Totals, always equal |
| `voided` | boolean | |
| `reversalOf` | string? | Present on reversal entries, holding the original `no` |

**Invariants**
- `debit === credit` on every entry. `ACC.post()` rejects anything else.
- Zero-value lines are stripped before storage.
- Voiding writes a mirror-image entry and flags the original — history never loses a row.

---

## `log` — activity ring buffer

`[{ ts, user, action, ref }]`, newest first, capped at 300 entries.

This is a convenience feed for the dashboard, **not an audit log.** A real audit trail
covering every financial mutation is Phase 5.2.

---

## Notes for the Phase 2 port

1. **Keep every field name.** Nothing above `db.js` should need to change.
2. **`seq` becomes a database sequence** or a counters table updated in the same transaction
   as the document insert. This fixes B5.
3. **`users` is replaced** by the auth provider. `PERMS` becomes row-level security; the
   client-side copy stays only as a UI convenience.
4. **`journal` is append-only.** Enforce it with a database grant, not a convention.
5. **Seat locking** needs `SELECT … FOR UPDATE` (or an equivalent) around
   `seatsTaken → insert` in both `APPS.submit()` and `APPS.convert()`. This is B4, and it is
   the one bug that cannot be fixed in the browser.
6. **`applications.ref` needs a unique index.** The current uniqueness check is a scan.
7. **`history` on applications** becomes a child table, not a JSON column, once you want to
   query "everything the registrar decided last month".
