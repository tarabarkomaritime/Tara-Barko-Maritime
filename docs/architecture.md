# Architecture

Zero-dependency static site. Two HTML entry points over one shared data layer.

---

## Module map

```
                    ┌──────────────────┐   ┌──────────────────┐
   PUBLIC           │  register.html   │   │    index.html    │        INTERNAL
                    │  + register.js   │   │    + app.js      │
                    │  + public.css    │   │                  │
                    └────────┬─────────┘   └────────┬─────────┘
                             │                      │
                             │   ┌──────────────────┴──┐
                             ├──▶│   applications.js   │  admissions lifecycle
                             │   │   (APPS)            │  shared by both surfaces
                             │   └──────────┬──────────┘
                             │              │
                             │   ┌──────────▼──────────┐
                             ├──▶│   accounting.js     │  double-entry engine
                             │   │   (ACC)             │  + every financial report
                             │   └──────────┬──────────┘
                             │              │
                             │   ┌──────────▼──────────┐
                             ├──▶│      db.js          │  the ONLY module that
                             │   │      (DB)           │  touches localStorage
                             │   └──────────┬──────────┘
                             │              │
                             │       localStorage['tbm_is_v1']
                             │
                             └──▶│      ui.js          │  rendering primitives
                                 │      (UI)           │  (no business logic)
                                 └─────────────────────┘
```

Dependencies point downward only. `db.js` knows nothing about `applications.js`;
`accounting.js` knows nothing about the UI.

---

## What each module owns

### `db.js` → `DB`

Persistence, schema, seed data, migration, backup and restore. **The only module that
touches `localStorage`.** That is not incidental — it is what makes the Phase 2 backend port
a single-file change.

Exports: `load reload save get reset nextNo exportJSON importJSON activity uid r2 today PERMS blank`

Also owns the chart of accounts (`COA`), the demo users, the role matrix (`PERMS`), and
`DEFAULT_COMPANY`.

**Invariants**
- `get()` returns live references. Callers mutate them and then call `save()`.
- `migrate()` runs on every load and every import, giving new collections a default so old
  backups keep opening.
- `nextNo(kind, prefix)` produces `PREFIX-YYYY-####`. Client-side, and therefore racy — see
  B5 in the action plan.

### `accounting.js` → `ACC`

The double-entry engine, and every financial report derived from it.

Exports: `r2 vatSplit computeInvoice post reverse acct buildInvoice postInvoice buildPayment postPayment postExpense recomputeInvoice balanceOf cashAccount trialBalance incomeStatement arAging collections ledgerFor`

**Invariants**
- Every financial event posts a *balanced* entry through `post()`. Unbalanced entries are
  rejected with a console warning rather than silently stored.
- `balanceLines()` nudges sub-centavo rounding residue onto one line, so VAT splitting never
  leaves an entry a centavo out.
- Voids reverse (`reverse()`), never delete.
- Reports are pure functions of `journal[]`. No report stores a total.

See [`accounting-policy.md`](accounting-policy.md) for what each event posts.

### `applications.js` → `APPS`

The admissions lifecycle. Loaded by both surfaces, which is the point: the portal cannot
invent a status the registrar does not understand, and the registrar cannot close an
application in a way the tracker would misreport.

Exports: `OPEN_STATES FINAL_STATES ALL_STATES NEXT isOpen isFinal refCode seatsTaken openBatches validate submit track advance reject withdraw matchTrainee convert pending counts find forName ageDays course batch`

**Invariants**
- `NEXT` is the single source of allowed transitions. `advance()` throws on anything else,
  and the UI derives its buttons from the same table.
- `convert()` is the only path from admissions into the ledger.
- `seatsTaken()` counts pending applications as claimed seats.
- `submit()` calls `DB.reload()` first, so a second tab's write is not clobbered.

See [`public-registration-flow.md`](public-registration-flow.md).

### `ui.js` → `UI`

Rendering primitives with no business logic: escaping, peso and date formatting, tables,
cards, KPI tiles, form fields, the modal, toasts, and inline-SVG bar/column/donut charts.

Exports: `esc peso num int date dateShort dateRange days tag statusTag table card kpi f row modal close confirm toast barChart columns donut shortMoney print`

**Invariant:** `UI.esc()` on everything that reaches `innerHTML`. All views build HTML
strings, so this is the only thing standing between a trainee's remarks field and an XSS.

### `app.js` — internal system

Session, hash router, twelve modules, and every modal. Structure:

| Section | Contents |
|---|---|
| Session & lookups | `SESSION`, `state`, `NAV`, `TITLES`, `D/T/CRS/BAT/ENR/INV/PAY`, `can()` |
| Login | `initLogin()`, `renderNav()` |
| Router | `route()`, `render()`, `refresh()` |
| Views | `VIEWS.<module>` — one function per module, each returning an HTML string |
| Modals & actions | `applicationModal()`, `convertForm()`, `traineeForm()`, `enrollmentForm()`, `invoiceModal()`, `paymentForm()`, … |
| Event wiring | Delegated `click` / `input` / `change` / `submit` / `storage` listeners |

Views are pure string-returning functions. Interaction happens through delegated
`data-act` / `data-q` attributes, so re-rendering never leaves dangling listeners.

### `register.js` — public portal

Same shape, smaller: hash router over four screens (home, courses, wizard, tracker), a
three-step wizard with a `P.draft` that survives navigating backwards, and the tracker.

---

## Why the boundaries are where they are

**Storage is isolated in one file** so replacing `localStorage` with an API is one file's
work. Everything above it already talks in terms of `DB.get()`, not storage.

**The accounting engine is isolated** because it is the part where a mistake is expensive and
silent. It has no UI dependency, which is why `tests/smoke.js` can exercise it in Node.

**The admissions lifecycle is shared, not duplicated.** The alternative — the portal owning
its own notion of application state and the back office owning another — is the classic
integration that drifts. One module, two callers.

**The UI layer has no business logic** so a view can be rewritten without risking a rule.

---

## Data flow: application to ledger

```
  applicant fills wizard
        │
        ▼
  APPS.validate()          field-level + seat + duplicate checks
        │
        ▼
  APPS.submit()            DB.reload() → append to applications[] → DB.save()
        │
        │  ..... storage event → registrar's tab re-renders .....
        ▼
  registrar opens applicationModal()
        │
        ▼
  APPS.advance('Under Review') → APPS.advance('Approved')      no ledger impact
        │
        ▼
  APPS.convert()
        ├─ APPS.matchTrainee()      reuse existing seafarer, or create a master record
        ├─ push enrollment          Enrolled or Reserved
        ├─ ACC.buildInvoice()       only when Enrolled — a reservation is not a receivable
        ├─ ACC.postInvoice()        ← the single point where admissions reaches the ledger
        └─ APPS.advance('Enrolled')
        │
        ▼
  journal[] ──▶ trialBalance / incomeStatement / arAging / collections / ledgerFor
```

---

## Cross-tab synchronisation

Both pages listen for the `storage` event on key `tbm_is_v1`. When the portal writes an
application, the registrar's open tab calls `DB.reload()`, re-renders, and toasts the count of
new arrivals. When the registrar converts one, the applicant's tracker updates on refresh.

This only works when both pages are served from the same origin. `file://` gives each page its
own storage partition in some browsers — serve the folder instead.

---

## Rendering model

Views return HTML strings; the router assigns them to `innerHTML`. No virtual DOM, no
component instances, no lifecycle.

Consequences worth knowing:

- **All event handling is delegated** from `document`, keyed on `data-act` and `data-q`.
  Re-rendering cannot orphan a listener.
- **Filter inputs restore focus and caret** manually after re-render — see the `input`
  listener in `app.js`. Any new filter input gets this for free by using `data-q`.
- **Everything interpolated must be escaped.** `UI.esc()` is not optional.
- Modals are the exception: `UI.modal()` writes into `#modalRoot` and wires its own `onSubmit`,
  returning the form data as a plain object.

---

## Conventions

| Convention | Why |
|---|---|
| Dates are `YYYY-MM-DD` strings, compared lexically | Sorts and ranges correctly, no timezone bugs, survives JSON round-trips |
| Money rounds through `r2()` at every step | Keeps float drift out of the ledger |
| Document numbers are `PREFIX-YYYY-####` | Readable, sortable, matches Philippine practice |
| IDs are `prefix-random` from `DB.uid()` | Type-visible in the debugger |
| One `localStorage` key holding one JSON object | Backup and restore are a single file |
| Modules are IIFEs assigned to a global | No bundler needed, and load order is explicit |
