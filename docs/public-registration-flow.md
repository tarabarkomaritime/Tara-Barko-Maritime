# Public registration flow

End-to-end: a seafarer applying online, through to a billed enrollment in the ledger.

Owned by `assets/applications.js` (`APPS`), driven by `assets/register.js` on the public side
and `VIEWS.admissions` / `applicationModal()` / `convertForm()` in `assets/app.js` on the
staff side.

---

## The whole thing in one picture

```
  PUBLIC (register.html)                   INTERNAL (index.html)

  ┌────────────────────┐
  │ 1  Choose schedule │  open batches only, seats net of pending applications
  ├────────────────────┤
  │ 2  Your details    │  validated field-by-field, draft survives Back
  ├────────────────────┤
  │ 3  Review & submit │  fee estimate + consent checkbox
  └─────────┬──────────┘
            │ APPS.submit()
            ▼
     ┌─────────────┐   storage event    ┌──────────────────────────┐
     │  Submitted  │ ─────────────────▶ │  Admissions queue        │
     └──────┬──────┘                    │  badge + KPI tiles       │
            │                           └────────────┬─────────────┘
            │                                        │ open the application
            │                                        ▼
            │                           ┌──────────────────────────┐
            │                           │  Mark under review       │
            │                           ├──────────────────────────┤
            │                           │  Approve                 │
            │                           ├──────────────────────────┤
            │                           │  Reject (reason required)│
            │                           └────────────┬─────────────┘
            │                                        │ Approved → Enroll & bill
            │                                        ▼
            │                              ┌────────────────────┐
            │                              │  APPS.convert()    │
            │                              ├────────────────────┤
            │                              │ trainee (new/reuse)│
            │                              │ enrollment         │
            │                              │ invoice            │  ← only when Enrolled
            │                              │ journal entry      │  ← the ledger, at last
            │                              └─────────┬──────────┘
            ▼                                        │
     ┌─────────────┐ ◀──────────────────────────────┘
     │  Tracker    │   ref code + surname → four-stage timeline
     └─────────────┘
```

---

## Public side

### Screen 1 — choose a schedule

`APPS.openBatches()` returns batches where all three hold:

- `status === 'Open'`
- `start >= today` — a batch that has begun cannot take an online applicant
- `seatsTaken(b).free > 0`

Batches are grouped by course category. Each row shows seats remaining **net of pending
applications**, so the portal stops offering a batch before it is oversold.

### Screen 2 — details

Required: surname, first name, sex, birthdate, rank, mobile.
Optional: middle name, SRN, SIRB, passport, email, address, manning agency, remarks.

Seafarer document numbers are optional on purpose — a first-timer may not have an SRN yet, and
refusing the application over it would push them back into the queue at the office. The
registrar checks originals before the first training day.

The draft lives in `P.draft` and is captured on every navigation, so going Back never loses
typing. Validation failures re-render with `.fld.bad` on the offending fields.

`payer` (`Self-paid` / `Agency-billed`) is captured here and surfaced to the registrar as a
tag, because it changes who gets chased for the balance.

### Screen 3 — review and submit

Shows every entered value, plus a **fee estimate** computed with `ACC.computeInvoice()` so the
VAT split matches exactly what the invoice will say.

The estimate is explicitly labelled as the course fee only. Training kits, ID processing and
insurance are added by the registrar at conversion, and the notice says so. **No payment is
collected on the portal** in Phase 1.

Submission is gated on a consent checkbox certifying the information and permitting
processing for enrollment, billing and regulatory reporting. This is a starting point for Data
Privacy Act compliance, not the whole of it — see Phase 5.4.

### Confirmation

The applicant gets:

- a **six-character reference code** in large type
- an application number `APP-YYYY-####`
- a printable acknowledgement slip with the center's details, the course, the schedule and the
  code, clearly marked **not an official receipt**

Reference codes are drawn from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — no `O`, `0`, `I`, `1` or
`L`, because the code gets read over the phone. Uniqueness is checked at generation.

### Tracker

`APPS.track(ref, surname)` requires **both**. A six-character code alone is short enough to
guess and slips get lost; this is personal data behind a public URL. Lookup is
case-insensitive and trims whitespace.

The timeline shows the four progress stages, or a single closing row for a rejected or
withdrawn application together with its reason. An enrolled applicant is told to settle at the
cashier's window and bring original documents.

---

## Staff side

### The queue

`VIEWS.admissions` defaults to **open applications**. Four KPI tiles: awaiting a decision (with
a warning when anything has waited 3+ days), submitted, under review, and converted.

The table shows the applicant, course and schedule, contact details, who is paying, how long
it has waited, the status, and — usefully — whether the applicant is already in the trainee
registry.

The nav badge counts `APPS.pending()`. The dashboard carries the same queue as a card for
admin and registrar.

### The review modal

`applicationModal()` shows everything the registrar needs to decide without leaving the modal:

- **Duplicate warning.** If `matchTrainee()` finds an existing seafarer, the modal names them
  and says the existing record will be reused.
- **Seat position.** Enrolled and pending counts against capacity, so the registrar can see
  whether approving this one fills the batch.
- Full personal and document details.
- The **audit trail** — every transition, who made it and when.

Action buttons are derived from `APPS.NEXT[status]`, so a `Submitted` application never offers
*Enroll*, and an already-final one offers nothing. The lifecycle table is the only authority.

### Conversion

`convertForm()` → `APPS.convert()` does all of this in one transaction:

1. **Trainee.** Reuse the matched seafarer, refreshing mobile, email, address, rank and agency
   from the application and back-filling any missing document numbers — or create a new master
   record noting the application number in its remarks.
2. **Enrollment.** `Enrolled` (bill now) or `Reserved` (hold the seat, bill later).
3. **Invoice** — only when `Enrolled`. Course fee plus any optional fees the registrar ticked,
   less any discount, VAT split per the company settings.
4. **Journal entry**, posted by `ACC.postInvoice()`. This is the single point where admissions
   reaches the ledger.
5. **Close the application** as `Enrolled`, linked to both the trainee and the enrollment, with
   a history note naming the enrollment and invoice numbers.

Guards, all of which throw rather than half-completing:

- already enrolled
- not yet approved
- the batch no longer exists
- the batch filled up between approval and conversion

### Rejection and withdrawal

Both require a reason, which is **shown to the applicant on the tracker**. Both are terminal,
release the seat, and post nothing to the ledger.

---

## Rules and why they exist

| Rule | Why |
|---|---|
| Pending applications consume seats | Overselling is a customer-facing failure; a conservative seat count is an internal one. Prefer the internal cost. |
| Nothing posts to the ledger before conversion | Application volume is noisy and speculative. Keeping it out of the books entirely means admissions can never distort the financial statements. |
| Reservations are not billed | A reservation is not a receivable, and it matches how the registrar already works. |
| Transitions are validated against `NEXT` | Makes an invalid state unreachable rather than merely unlikely, and lets the UI derive its own buttons. |
| Tracking needs code **and** surname | Personal data behind a public URL. |
| Existing seafarers are reused, not duplicated | A duplicate master record splits a person's certificates and statement of account. |
| Duplicate submissions are blocked per batch | Same name, same batch, still pending = a double submit, not a second course. |
| `submit()` calls `DB.reload()` first | The registrar's tab may have written since the portal page loaded. |

---

## Known gaps

Carried in the action plan; repeated here because this is where they hurt.

| Gap | Effect | Phase |
|---|---|---|
| Seat locking is best-effort | Two simultaneous applicants can claim the same last seat | 2.5 |
| No notifications | Applicants must poll the tracker | 2.7 |
| No document upload | The registrar approves on trust and checks papers on training day | 4.1 |
| Applications never expire | A stale application holds a seat indefinitely | Open question 2 in `HANDOFF.md` |
| No agency bulk application | An agency enrolling twelve seafarers fills the form twelve times | Open question 3 |
| No payment on the portal | Fees settle at the cashier's window only | 3.1 |
