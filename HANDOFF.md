# Handoff — Tara Barko Maritime Integrated System

Written for whoever picks this up next, including future-you six months from now. It assumes
no prior context. Read this before changing anything.

**Last updated:** 2026-08-15 · **Build state:** Phase 1 complete, prototype
**Plan of record:** [`ACTION-PLAN.md`](ACTION-PLAN.md)

---

## 1. Read this first

This is a **working prototype, not a production system.** It stores everything in browser
`localStorage`, the login codes are plaintext strings in the source, and permissions are
enforced only in the browser. It is genuinely useful for demonstrating the workflow,
validating it with the registrar and cashier, and as the specification for the real build.
It must not hold real seafarer data or real money.

The full list of what blocks production is section 4 of [`ACTION-PLAN.md`](ACTION-PLAN.md).

---

## 2. Run it in 30 seconds

Everything is static. There is nothing to install.

```bash
node tests/smoke.js
```

That runs the 48-assertion smoke test in Node — no dependencies, no test runner. Exit code 0
means the data and accounting layers are healthy.

To use the app, open the files in a browser. Either double-click `index.html`, or serve the
folder — serving is better, because the two pages then share `localStorage` cleanly and the
cross-tab live sync works:

```bash
npx --yes serve -l 4173 .
```

| URL | What it is | How to get in |
|---|---|---|
| `http://localhost:4173/register.html` | Public registration portal | No login — it is public |
| `http://localhost:4173/index.html` | Internal integrated system | Pick a user, type the matching code |

Demo access codes — the code is the role name:

| User | Role | Code |
|---|---|---|
| Kate Esguerra | admin | `admin` |
| Registrar Desk | registrar | `registrar` |
| Cashier Window | cashier | `cashier` |
| Accounting Dept | accounting | `accounting` |

On first load the store seeds itself: 12 courses, 9 batches, 18 trainees, 28 enrollments with
invoices and payments, 7 expense vouchers, and 5 applications sitting in the admissions
queue. To start clean, sign in as admin → Settings → erase, or clear site data.

---

## 3. The five-minute tour

Do this once. It exercises the whole system and shows you why the pieces are shaped the way
they are.

1. Open **`register.html`**. Note the seat counts on the home page.
2. Click **Register** → pick a batch → fill in the details → review → tick the certification
   box → **Submit**. Write down the six-character reference code.
3. Go to **Track Application**, enter the code and the surname. You see a four-stage timeline
   sitting at *Submitted*.
4. Open **`index.html`** in another tab and sign in as **registrar**. The Admissions nav item
   has a badge; your new application is at the top of the queue.
5. Click it. Read the modal: the seat position, whether the applicant already exists in the
   registry, and the audit trail. Click **Mark under review**, reopen it, click **Approve**.
6. Reopen it once more and click **Enroll & bill**. Tick an optional fee, type a discount, and
   watch the summary recompute. Submit.
7. You now have a new **trainee**, an **enrollment**, an **invoice**, and a balanced **journal
   entry** — check Reports → Trial Balance, it still balances.
8. Return to the portal's tracker and re-check the code. It now reads *Enrolled*.

That path — application to ledger — is the whole point of the project.

---

## 4. Where everything lives

```
TARA BARKO MARITIME - IS/
├─ index.html               Internal system shell (login + sidebar + view slot)
├─ register.html            Public portal shell
├─ ACTION-PLAN.md           ← the plan of record
├─ HANDOFF.md               ← you are here
├─ README.md                Short orientation
├─ CHANGELOG.md
├─ assets/
│  ├─ styles.css            Shared design system. Navy/brass palette, all CSS variables
│  ├─ public.css            Public portal only — loaded after styles.css
│  ├─ db.js                 Persistence, schema, seed data, migration, backup/restore
│  ├─ accounting.js         Double-entry engine and every financial report
│  ├─ applications.js       Admissions lifecycle — shared by both surfaces
│  ├─ ui.js                 Rendering primitives: tables, cards, KPIs, modals, charts
│  ├─ app.js                Internal system: router, twelve modules, all modals
│  └─ register.js           Public portal: router, wizard, tracker
├─ docs/                    Reference documentation — see the index below
└─ tests/
   └─ smoke.js              Headless test, run with `node tests/smoke.js`
```

### Load order matters

Both pages load `db.js → ui.js → accounting.js → applications.js → (app.js | register.js)`.
`db.js`'s seed calls `ACC.buildInvoice`, so `accounting.js` must be parsed before anything
calls `DB.load()`. Both entry scripts call `DB.load()` at the bottom, after everything is
defined. If you add a file, keep it in that chain.

### Documentation index

| File | Read it when |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | You need to know which module owns what |
| [`docs/data-model.md`](docs/data-model.md) | You are porting to a real database, or adding a field |
| [`docs/public-registration-flow.md`](docs/public-registration-flow.md) | You are changing anything about admissions |
| [`docs/accounting-policy.md`](docs/accounting-policy.md) | You are touching money |
| [`docs/roles-and-permissions.md`](docs/roles-and-permissions.md) | You are adding a module or a role |
| [`docs/testing-checklist.md`](docs/testing-checklist.md) | Before you call anything done |
| [`docs/deployment.md`](docs/deployment.md) | You are hosting it |

---

## 5. The four ideas you need to hold in your head

### 5.1 One store, two front doors

There is no integration between the portal and the back office. There is one
`localStorage` key, `tbm_is_v1`, holding one JSON object, and both pages read and write it
through `db.js`. An application submitted on the portal is *literally the same object* the
registrar opens. This is why the workflow cannot drift out of sync — and it is the property
to preserve when the backend arrives.

Both pages listen for the `storage` event, so a change in one tab re-renders the other.

### 5.2 Nothing touches the ledger until conversion

Applications are free. They can pile up, be rejected, be withdrawn — the financial statements
never move. The only door between admissions and the books is `APPS.convert()`, and it is the
function that creates the trainee, the enrollment, the invoice and the journal entry together.

If you are ever tempted to post something from the admissions module, don't. Route it through
conversion.

### 5.3 The journal is the source of truth

`assets/accounting.js` posts a balanced entry for every billable event. Every report —
trial balance, income statement, receivables ageing, collections, per-account ledger — is
*derived from* `journal[]`. No report stores or hand-computes a total.

Voids reverse rather than delete: `ACC.reverse()` writes a mirror-image entry and flags the
original. History never gets holes in it.

### 5.4 A pending application holds a seat

`APPS.seatsTaken(batch)` counts confirmed enrollments **and** open applications. The portal
therefore stops offering a batch before it is oversold. The cost is that stale applications
tie up seats; the benefit is that the registrar never has to phone an applicant to say the
seat they were offered does not exist. See decision D3 in the action plan.

---

## 6. Common changes, and where to make them

| I want to… | Do this |
|---|---|
| Change company name, address, TIN, VAT rate | Sign in as admin → Settings. Defaults live in `DEFAULT_COMPANY` in `db.js`. |
| Add or edit a course | Admin or registrar → Courses → Add course. Seed catalogue is in `db.js` → `seed()`. |
| Add an optional fee (training kit, ID processing) | Settings → optional fees. Defaults are `DEFAULT_ADDONS` in `app.js`. |
| Add a ledger account | `COA` array in `db.js`. Set `nature` correctly — it drives the trial balance sign. |
| Add a module to the internal system | Add to `NAV` and `TITLES` in `app.js`, define `VIEWS.<id>`, and grant it in `PERMS` in `db.js`. All three, or the router will bounce the user. |
| Add a field to an application | `APPS.submit()` in `applications.js`, the wizard's `stepDetails()` in `register.js`, and `applicationModal()` in `app.js`. Add it to `docs/data-model.md`. |
| Change the admissions lifecycle | The `NEXT` table in `applications.js` is the single source of allowed transitions. The UI derives its buttons from it, so adding a state there surfaces it everywhere. |
| Change how an event posts to the ledger | `accounting.js` only. Then run `node tests/smoke.js` — it asserts the trial balance still balances. |
| Add a status colour | `STATUS_KIND` in `ui.js`. |

---

## 7. Traps

Things that will bite you. Each one is here because it is non-obvious.

1. **`nextNo()` is client-side.** Two browser tabs can mint the same invoice number. Known,
   logged as B5, fixed in Phase 2.6. Don't paper over it in the browser — move it to the
   server.
2. **`DB.get()` returns live references, not copies.** Mutating what you get back mutates the
   store. That is intentional and the whole codebase relies on it, but it means you must call
   `DB.save()` yourself after a mutation. `refresh()` in `app.js` saves and re-renders.
3. **`DB.reload()` before writing across tabs.** `APPS.submit()` does this. If you add another
   cross-surface write, do the same, or you will clobber whatever the other tab just wrote.
4. **The seed only runs on an empty store.** If you change `seed()` you will not see it until
   you erase the data. Settings → erase, or clear site data.
5. **`APPS.convert()` throws rather than returning an error.** Callers must wrap it in
   `try/catch` — `convertForm()` in `app.js` shows the pattern, returning `false` from
   `onSubmit` to keep the modal open.
6. **Adding a module means three edits, not one.** `NAV`, `TITLES`, `VIEWS`, plus `PERMS`.
   Miss `PERMS` and `route()` silently redirects the user to their first allowed view.
7. **`register.html` and `index.html` must be served from the same origin** to share the
   store. Opening one from `file://` and the other from `http://localhost` gives you two
   separate databases and a very confusing afternoon.
8. **The contra-revenue account matters.** `4900 Discounts Given` sits inside Revenue with a
   `debit` nature. The income statement signs by section, not by account nature, so it
   subtracts correctly. Do not "fix" this.
9. **Dates are `YYYY-MM-DD` strings throughout**, compared lexically. This works, is
   deliberate, and keeps timezone bugs out. Don't introduce `Date` objects into stored data.

---

## 8. Testing

```bash
node tests/smoke.js
```

48 assertions covering seed integrity, migration of old backups, seat accounting, validation,
submission, duplicate guards, tracking privacy, lifecycle transition guards, both conversion
paths (new trainee and returning seafarer), rejection, and ledger balance after every
financial path. Exit 0 = green.

It stubs `localStorage` in a Node VM context and loads `db.js`, `accounting.js` and
`applications.js` directly. The DOM layers are not covered — walk
[`docs/testing-checklist.md`](docs/testing-checklist.md) by hand for those.

**Run the smoke test after any change to `db.js`, `accounting.js` or `applications.js`.**
It is fast and it is the only thing standing between you and a quietly unbalanced ledger.

---

## 9. What to do next

Section 8 of [`ACTION-PLAN.md`](ACTION-PLAN.md) has the ordered list. The short version:

1. Choose the Phase 2 backend — Supabase is the recommendation.
2. Port the schema from `docs/data-model.md` keeping field names identical.
3. Rewrite `db.js` against the API, preserving its exported surface so nothing else changes.
4. Move document numbering server-side in the same pass.
5. Replace the demo login with real authentication.
6. Add server-side seat locking.

The reason `db.js` is the only module that touches storage is precisely so step 3 is a
single-file change. Keep it that way.

---

## 10. Open questions for the business

These need answers from Tara Barko, not from an engineer. They are blocking design decisions
in Phases 3 and 4.

1. Should the portal collect a reservation fee or deposit at application time, or stay
   enquiry-only until the cashier is involved?
2. How long should an unattended application hold its seat before expiring?
3. Do manning agencies need their own portal login to apply for several seafarers at once and
   receive one consolidated statement?
4. Which documents must be verified *before* approval, and which can wait until the first
   training day?
5. What is the refund policy for cancellations, and at what point in the schedule does it
   change?
6. Is the receipt series BIR-registered, and what are the authority-to-print details that must
   be printed on it?
7. What is the data retention period for applications that are rejected or withdrawn?
