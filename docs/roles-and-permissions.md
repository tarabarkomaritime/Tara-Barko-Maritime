# Roles and permissions

> **Client-side only.** `PERMS` controls what the browser renders and where the router will
> go. It is not a security boundary — any user can bypass it from the console. Server-side
> enforcement is Phase 2.4, and until then this document describes an operating convention,
> not a control.

---

## The matrix

Defined as `PERMS` in `assets/db.js`.

| Module | admin | registrar | cashier | accounting |
|---|:---:|:---:|:---:|:---:|
| Dashboard | ● | ● | ● | ● |
| **Admissions** | ● | ● | | |
| Trainees | ● | ● | ● | |
| Courses | ● | ● | | |
| Schedules | ● | ● | | |
| Enrollments | ● | ● | ● | |
| Billing | ● | ● | ● | ● |
| Collections | ● | | ● | ● |
| Disbursements | ● | | | ● |
| General Ledger | ● | | | ● |
| Reports | ● | ● | ● | ● |
| Settings | ● | | | ● |

---

## Why it is drawn this way

**Registrar** owns the front of the operation: admissions, the trainee registry, the course
catalogue, scheduling and enrollment. They can see Billing because they need to know whether a
trainee has settled before letting them into a classroom — but they cannot receive money.

**Cashier** receives payments. They can see trainees, enrollments and billing to identify who
is paying for what, and they issue receipts. They deliberately have **no Admissions access** —
an application is not a financial document, and reviewing one is the registrar's judgment call
about documents and seats.

**Accounting** owns the books: billing, collections, disbursements, the general ledger and
settings. No access to the trainee registry or scheduling, which are operational rather than
financial.

**Admin** sees everything, and is the only role that can erase all data.

The separation that matters: **the person who approves an application is not the person who
receives the money for it.** That is the segregation of duties this matrix is built around, and
it should survive the Phase 2 rewrite intact.

---

## How it is enforced today

Three places, all in the browser:

1. **`renderNav()`** hides nav items the role cannot open, and drops group headers left empty.
2. **`route()`** redirects a disallowed hash to the role's first permitted module —
   `location.hash = '#/admissions'` as a cashier lands on the Dashboard.
3. **`can(view)`** guards individual controls inside a view. For example, the Courses module
   only shows *Add course* to roles holding `settings`, and global search only searches
   applications for roles holding `admissions`.

Verified in [`testing-checklist.md`](testing-checklist.md) §5.

---

## Adding a module

Four edits. Miss any one and the module is unreachable or invisible.

1. `NAV` in `app.js` — the sidebar entry, with a group and an icon
2. `TITLES` in `app.js` — the page heading and subtitle
3. `VIEWS.<id>` in `app.js` — the view function, returning an HTML string
4. **`PERMS` in `db.js`** — grant it to every role that needs it

The one people forget is 4. Without it, `route()` silently redirects and the module appears
not to exist.

---

## Adding a role

1. Add the user to `USERS` in `db.js` with a `role`.
2. Add a `PERMS[role]` array listing every module id it may open.
3. Order matters: `PERMS[role][0]` is the landing view and the redirect target, so put the
   most useful module first.

---

## Demo credentials

Plaintext, in the source, and not authentication. Listed in `HANDOFF.md` §2.

| User | Role | Code |
|---|---|---|
| Kate Esguerra | admin | `admin` |
| Registrar Desk | registrar | `registrar` |
| Cashier Window | cashier | `cashier` |
| Accounting Dept | accounting | `accounting` |

---

## Phase 2 notes

- `PERMS` becomes **row-level security** in the database, matching this matrix exactly. The
  client-side copy stays, purely so the UI does not render controls that would fail.
- The `users` array is replaced by the auth provider. Delete the `code` field with it.
- The activity log currently records `SESSION.name`. That becomes a real user id, and the log
  becomes a proper audit trail (Phase 5.2) covering every financial mutation rather than a
  300-entry ring buffer.
- Segregation of duties should be enforced server-side too: the endpoint that converts an
  application must reject a cashier's token, not merely hide the button.
