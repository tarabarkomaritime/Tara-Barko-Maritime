# Testing checklist

Two layers. Run both before calling anything done.

---

## Layer 1 — automated

```bash
node tests/smoke.js
```

48 assertions, no dependencies, exit 0 = green. Covers `db.js`, `accounting.js` and
`applications.js`:

| Group | What it asserts |
|---|---|
| Seed & migration | Record counts, document number format, sequence initialisation |
| Ledger | Trial balance balances on seeded data and is non-empty |
| Seat accounting | Pending applications reduce free seats |
| Validation | Required fields, email format, future birthdate |
| Submit | Record shape, reference code length and alphabet, email lowercasing, persistence |
| Duplicate guard | Same person + same batch while pending is blocked |
| Tracking | Code + surname works, case-insensitive; wrong surname and bare code find nothing |
| Lifecycle | Illegal transitions throw; conversion before approval throws |
| Convert (new) | Trainee, enrollment, invoice and journal entry created; totals correct; ledger balances; double conversion throws |
| Convert (returning) | Existing seafarer reused, matched on SRN, contacts refreshed, reservation not billed |
| Reject | Status and reason stored, terminal, posts nothing |
| Backup | Round-trip restores applications; a backup predating the store still opens |

**Run it after any change to those three files.** It is the only thing standing between you
and a quietly unbalanced ledger.

---

## Layer 2 — manual

The DOM layers (`ui.js`, `app.js`, `register.js`) are not covered by tests. Walk these.

Serve the folder first so both pages share one store:

```bash
npx --yes serve -l 4173 .
```

Start from a clean state: sign in as admin → Settings → erase all records, then reload to
re-seed.

### 1 · Public portal — browsing

- [ ] Home lists open batches with seats, fees and schedules
- [ ] Seat counts are net of pending applications (a seeded batch shows fewer free seats than capacity minus enrollments)
- [ ] Courses screen search filters by code, title, STCW reference and category
- [ ] A course with no open batch says so instead of offering *Register*
- [ ] Footer shows the company name, address, contact and accreditation from Settings

### 2 · Public portal — the wizard

- [ ] *Apply for this batch* from home pre-selects that batch
- [ ] Step 1 without a selection blocks and warns
- [ ] Step 2 with empty required fields blocks and highlights exactly the missing ones
- [ ] An invalid email is rejected
- [ ] A future birthdate is rejected
- [ ] **Back from step 2 to step 1 and forward again preserves everything typed**
- [ ] Step 3 shows every entered value and a VAT-split fee estimate
- [ ] The estimate notice says optional fees are added later and no payment is collected
- [ ] **Submitting without ticking the consent box is refused**
- [ ] Submitting produces a reference code, an application number and a printable slip
- [ ] The reference code contains no `O`, `0`, `I`, `1` or `L`
- [ ] *Print slip* hides the nav, footer and buttons
- [ ] *Register another course* keeps the personal details and returns to step 1

### 3 · Public portal — tracker

- [ ] Correct code + surname finds the application
- [ ] Lowercase code and surname with stray spaces still work
- [ ] **Wrong surname with the correct code finds nothing**
- [ ] A blank surname finds nothing
- [ ] An unknown code shows the not-found message
- [ ] The timeline shows four stages with the reached ones marked
- [ ] A rejected application shows its reason instead of the timeline

### 4 · Internal — admissions

Sign in as **registrar**.

- [ ] The Admissions nav item shows a badge equal to submitted + under review
- [ ] The queue defaults to open applications; the filter switches to each status and to all
- [ ] Search matches name, reference code, mobile and course
- [ ] The *On file* column flags an applicant already in the trainee registry
- [ ] KPI tiles are consistent with the table
- [ ] Anything waiting 3+ days is flagged
- [ ] The dashboard carries the same queue as a card

Open an application:

- [ ] A `Submitted` one offers *Mark under review*, *Approve* and *Reject* — **not** *Enroll*
- [ ] An `Under Review` one offers *Approve* and *Reject*
- [ ] An `Approved` one offers *Enroll & bill*
- [ ] A `Rejected` or `Enrolled` one offers no actions
- [ ] The seat position and duplicate warning are shown
- [ ] The audit trail grows by one row per transition, naming the staff member

### 5 · Internal — conversion

- [ ] *Enroll & bill* opens with the duplicate/new-record notice
- [ ] Ticking an optional fee updates the summary live
- [ ] Typing a discount updates the summary live
- [ ] Switching to *Reserved* warns that nothing will be billed
- [ ] Submitting as **Enrolled** creates a trainee, an enrollment, an invoice and one journal entry
- [ ] Submitting as **Reserved** creates a trainee and an enrollment but **no invoice**
- [ ] The application closes as `Enrolled` and links to the enrollment
- [ ] The new trainee's remarks name the application number
- [ ] For a returning seafarer, **no second trainee record is created** and contacts are refreshed
- [ ] Reports → Trial Balance still balances
- [ ] Reports → AR Ageing includes the new invoice

### 6 · Internal — rejection

- [ ] *Reject* demands a reason
- [ ] The application becomes terminal with no further actions
- [ ] The seat is released — the portal offers one more seat on that batch
- [ ] The trial balance is unchanged
- [ ] The applicant's tracker shows the rejection and the reason

### 7 · Permissions

| Sign in as | Expect |
|---|---|
| **cashier** | No Admissions nav item; `#/admissions` redirects to Dashboard; no admissions card on the dashboard |
| **accounting** | No Admissions, Trainees, Courses, Schedules or Enrollments; Ledger and Settings available |
| **registrar** | Admissions available; no Collections, Disbursements, Ledger or Settings |
| **admin** | Everything, including erase-all-data |

### 8 · Cross-tab sync

With the portal in one tab and the internal system in another, both on `localhost`:

- [ ] Submitting an application toasts the registrar's tab and updates the badge without reloading
- [ ] Converting it updates the applicant's tracker on refresh

### 9 · Backup and restore

- [ ] *Backup* downloads a JSON file
- [ ] *Restore* on a fresh browser reproduces every record **including applications**
- [ ] An older backup with no `applications` key still opens (covered by the smoke test, worth confirming in the UI)
- [ ] Restoring does not corrupt document sequences — the next invoice continues from the right number

### 10 · Regression sweep

The Phase 1 work touched shared files. Confirm the pre-existing system still works:

- [ ] Enrollments → *New enrollment* still bills correctly
- [ ] Collections → recording a payment still updates the invoice status
- [ ] Disbursements → a voucher still posts
- [ ] Reports → Income Statement, Trial Balance, AR Ageing, Collections all render
- [ ] General Ledger → an account shows a running balance
- [ ] Voiding an invoice writes a reversal and leaves the trial balance balanced
- [ ] Global search finds trainees, enrollments, invoices and receipts — plus applications, for roles with admissions

### 11 · Presentation

- [ ] Both pages are usable at 375px wide
- [ ] The public wizard's step bar collapses to numbers on mobile
- [ ] Printing an invoice, a receipt and the acknowledgement slip produces a clean page
- [ ] No console errors on either page during a full pass

---

## Before you call it done

1. `node tests/smoke.js` exits 0
2. This checklist passes for every role
3. The trial balance balances before and after every financial path you touched
4. `ACTION-PLAN.md` and `HANDOFF.md` describe what now exists
5. Any new limitation is logged in section 4 of `ACTION-PLAN.md`
