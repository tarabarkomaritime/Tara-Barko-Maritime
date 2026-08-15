# Tara Barko Maritime — Action Plan (Master)

**Project:** Public Registration Portal + Internal Integrated System for Enrollment, Accounting and Finance
**Owner:** Kate Esguerra
**Document status:** Living. This is the plan of record — when reality and this file disagree, fix this file.
**Last updated:** 2026-08-15

---

## 1. What we are building

Tara Barko Maritime Training & Assessment Center runs MARINA/STCW-accredited courses for
seafarers. Two audiences, one database:

| Audience | Surface | Purpose |
|---|---|---|
| Seafarers and manning agencies | `register.html` — **Public Registration Portal** | Browse accredited courses and open schedules, apply for a seat, track the application with a reference code. |
| Registrar, cashier, accounting, admin | `index.html` — **Internal Integrated System** | Admissions, trainee registry, scheduling, enrollment, billing, collections, disbursements, general ledger, financial reports. |

The point of the pairing is that **an application submitted on the public site is the same
record the registrar acts on** — no export, no re-keying, no separate "web enquiries" inbox.
Approving an application creates the trainee master record, the enrollment, the invoice and
its journal entry in one transaction.

### The one non-negotiable design rule

> Every peso that appears in a report must be traceable to a balanced journal entry.

No report hand-computes a total. The trial balance, income statement, receivables ageing and
collections report are all derived from `journal[]`. This is why the accounting engine
(`assets/accounting.js`) is the only module allowed to create financial records, and why
`APPS.convert()` is the single door between admissions and the ledger.

---

## 2. Where we are

```
Phase 0  Internal IS prototype                                   ✅ DONE  (pre-existing)
Phase 1  Public registration + admissions bridge                 ✅ DONE  (this iteration)
Phase 2  Real backend, real authentication                       ⬜ NEXT — blocks production
Phase 3  Payments, official receipts, BIR compliance             ⬜
Phase 4  Documents, certificates and regulatory reporting        ⬜
Phase 5  Operational hardening and go-live                       ⬜
```

**Current build is a working prototype, not a production system.** It runs entirely in the
browser on `localStorage`. Section 4 lists exactly what stops it from being deployed to real
applicants. Do not skip that section.

---

## 3. Phase detail

### Phase 0 — Internal Integrated System ✅

Delivered before this iteration. Eleven modules behind a role-gated shell.

- Trainee registry, course catalogue, batch scheduling with seat tracking
- Enrollment with combined registration + billing
- VAT-aware invoicing (inclusive or exclusive, configurable), official receipts, disbursement vouchers
- Double-entry engine with a 15-account chart of accounts, reversal-on-void (never delete history)
- Trial balance, income statement, AR ageing, collections, per-account general ledger
- Backup / restore to a single JSON file, activity log, four demo roles

### Phase 1 — Public registration + admissions bridge ✅

**Goal:** let a seafarer apply without queueing at the office, and let the registrar convert
that application into a billed enrollment without re-typing anything.

Delivered:

| # | Item | Where |
|---|---|---|
| 1.1 | Public portal shell: home, course catalogue, three-step wizard, tracker | `register.html`, `assets/register.js`, `assets/public.css` |
| 1.2 | Application lifecycle engine shared by both surfaces | `assets/applications.js` |
| 1.3 | `applications[]` store, sequence, and backwards-compatible migration | `assets/db.js` |
| 1.4 | Admissions module for the registrar (queue, review modal, audit trail) | `assets/app.js` → `VIEWS.admissions`, `applicationModal()` |
| 1.5 | Approve → enroll conversion creating trainee + enrollment + invoice + journal entry | `APPS.convert()` |
| 1.6 | Duplicate seafarer detection (SRN first, then name + birthdate) | `APPS.matchTrainee()` |
| 1.7 | Seat accounting that treats a pending application as a soft claim | `APPS.seatsTaken()` |
| 1.8 | Reference-code tracker (code + surname, never code alone) | `APPS.track()` |
| 1.9 | Cross-tab live sync between portal and back office | `storage` listeners in `app.js` / `register.js` |
| 1.10 | Headless smoke test — 48 assertions | `tests/smoke.js` |

**Design decisions taken in Phase 1** — see the decision log in section 6 for the reasoning.

- A pending application reserves a seat. Otherwise the portal oversells and the registrar
  absorbs the mess by hand.
- Nothing touches the ledger until conversion. Rejecting or withdrawing an application
  leaves the books untouched, so admissions volume can never distort the financials.
- Reserved enrollments are not billed. A reservation is not a receivable.
- Status transitions are validated against a fixed table. There is no way to get from
  `Submitted` straight to `Enrolled`.

### Phase 2 — Real backend and real authentication ⬜ **NEXT**

This is the phase that turns a demo into a system. Nothing in Phases 3–5 is worth starting
first.

| # | Task | Notes |
|---|---|---|
| 2.1 | Stand up Postgres (Supabase recommended) and port the schema in `docs/data-model.md` | Keep the same field names to limit churn in the UI layer |
| 2.2 | Replace `DB` with an API client; keep the module's public surface identical | `assets/db.js` is deliberately the only place that touches `localStorage` |
| 2.3 | Real authentication — hashed credentials, sessions, password reset | Current access codes are plaintext demo strings |
| 2.4 | Row-level security enforcing the role matrix server-side | Client-side `PERMS` becomes a UI convenience, not a control |
| 2.5 | **Server-side seat locking** on application submit and on conversion | The one concurrency bug the current build cannot solve in the browser |
| 2.6 | Server-generated document numbers in a transaction | `nextNo()` in two tabs can currently collide |
| 2.7 | Email/SMS notification on status change | Applicants currently have to poll the tracker |
| 2.8 | Move the demo seed behind an environment flag | Production must not ship 18 fictional seafarers |

**Exit criterion:** two people using the system on two machines cannot produce a duplicate
document number, an oversold batch, or a lost application.

### Phase 3 — Payments, receipts and BIR compliance ⬜

| # | Task |
|---|---|
| 3.1 | Online payment on the portal (GCash / Maya / card) with reconciliation against the invoice |
| 3.2 | Down-payment and instalment schedules — common for agency-sponsored trainees |
| 3.3 | BIR-compliant Official Receipt and Sales Invoice series, with the authority-to-print details |
| 3.4 | Refund and cancellation handling that reverses rather than deletes |
| 3.5 | Agency billing: consolidated statement of account per manning agency, not per trainee |
| 3.6 | Withholding tax on instructor honoraria |

### Phase 4 — Documents, certificates and regulatory reporting ⬜

| # | Task |
|---|---|
| 4.1 | Document upload on the portal (SIRB, passport, SRN, medical certificate) with expiry tracking |
| 4.2 | Registrar document verification checklist before approval |
| 4.3 | Certificate generation and a serial register per course |
| 4.4 | Assessment and result capture, including re-assessment |
| 4.5 | MARINA / STCW periodic reporting exports |
| 4.6 | Instructor and room scheduling conflict detection |

### Phase 5 — Operational hardening and go-live ⬜

| # | Task |
|---|---|
| 5.1 | Automated backups with restore drills — a backup that has never been restored is not a backup |
| 5.2 | Audit log covering every financial mutation, not just the 300-entry activity ring |
| 5.3 | Fiscal year close and opening balances |
| 5.4 | Data privacy: retention policy, consent records, subject access — the portal collects PII under the Philippine Data Privacy Act |
| 5.5 | Accessibility pass (WCAG AA) on the public portal |
| 5.6 | Filipino / Tagalog interface option for the public portal |
| 5.7 | Staff training material and a runbook |
| 5.8 | Load test the portal against an enrollment-season spike |

---

## 4. What blocks production today

Read this before showing the system to anyone who might mistake it for finished.

| # | Limitation | Consequence | Fixed in |
|---|---|---|---|
| B1 | Data lives in `localStorage`, one browser profile | Two staff members do not share data at all. Clearing site data destroys everything. | 2.1, 2.2 |
| B2 | Access codes are plaintext strings in `db.js` | There is no authentication. Anyone can read the codes from the source. | 2.3 |
| B3 | Permissions are enforced in the browser | A user can bypass the role matrix from the console. | 2.4 |
| B4 | Seat locking is best-effort | Two simultaneous applicants can claim the same last seat. | 2.5 |
| B5 | Document numbers are generated client-side | Two tabs can mint the same invoice number. | 2.6 |
| B6 | No notifications | Applicants must poll the tracker to learn their status. | 2.7 |
| B7 | Demo seed data ships with the app | 18 fictional seafarers and a fake MARINA accreditation number. | 2.8 |
| B8 | No document upload or verification | The registrar approves on trust and checks papers on training day. | 4.1, 4.2 |
| B9 | No payment collection on the portal | Fees are settled at the cashier's window only. | 3.1 |
| B10 | Receipt series is not BIR-registered | The receipts are not valid official receipts. | 3.3 |

---

## 5. Definition of done, per phase

A phase is done when **all** of these hold:

1. `node tests/smoke.js` exits 0.
2. The manual checklist in `docs/testing-checklist.md` passes for every role.
3. The trial balance balances, before and after every new financial path introduced.
4. `HANDOFF.md` and this file describe what actually exists, not what was intended.
5. No new item in section 4 is introduced without being logged there.

---

## 6. Decision log

Decisions that were not obvious, and would otherwise be re-litigated every few months.

| # | Decision | Reasoning | Revisit when |
|---|---|---|---|
| D1 | Zero dependencies, no build step | The center's IT support is one person. A static folder that opens by double-clicking survives staff turnover; a broken `npm install` does not. | A framework earns its keep — probably at Phase 2, and only for the internal system. |
| D2 | Public portal and internal system share one data layer, not an integration | An integration between two systems is a thing that breaks at 2am. One store cannot drift out of sync with itself. | Never — keep this property through the Phase 2 rewrite. |
| D3 | Pending applications consume seats | Overselling a batch is a customer-facing failure; a slightly conservative seat count is an internal one. Prefer the internal cost. | If applications routinely go stale and starve real enrollments — then add expiry, don't remove the claim. |
| D4 | Admissions never posts to the ledger; only conversion does | Keeps application volume, which is noisy and speculative, out of the financial statements entirely. | Never. |
| D5 | Reservations are not billed | Matches how the registrar already works, and a reservation genuinely is not a receivable. | Never. |
| D6 | Reuse the existing trainee record on a match, don't create a second | Seafarers return for refreshers constantly. A duplicate master record splits a person's certificates and statement of account. | If false-positive matches appear, tighten `matchTrainee()` — don't disable reuse. |
| D7 | Tracking needs reference code **and** surname | A six-character code alone is guessable and slips get lost. This is PII behind a public URL. | Never — strengthen if anything. |
| D8 | Voids reverse, never delete | An audit trail with holes in it is not an audit trail. | Never. |
| D9 | Fees quoted VAT-inclusive by default | Matches how Philippine training rates are published. Configurable in Settings for centers that quote net. | Per-client configuration, already supported. |
| D10 | The demo seed is in `db.js` and always runs on a fresh store | Makes the prototype demonstrable in one click. Becomes a liability at Phase 2 — see B7. | Phase 2.8. |

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Someone runs the prototype as if it were production and loses data | Medium | Severe | B1–B3 stated at the top of `README.md` and `HANDOFF.md`; back up before every demo |
| Phase 2 rewrite drifts from the current field names, breaking the UI | Medium | Moderate | `docs/data-model.md` is the contract; port names verbatim |
| Enrollment-season application spike overwhelms manual review | High | Moderate | Admissions KPI flags anything waiting 3+ days; consider bulk approve at Phase 4 |
| PII collected without a retention or consent policy | High | Severe | Phase 5.4; the consent checkbox on the wizard is a start, not compliance |
| The double-entry engine is modified without understanding it | Low | Severe | `tests/smoke.js` asserts the trial balance balances after every financial path |

---

## 8. Immediate next actions

In order. Do not start 2 before 1.

1. **Decide the Phase 2 backend.** Supabase is the recommendation — Postgres, row-level
   security matching the role matrix, and auth in one service, which suits a team without a
   dedicated backend engineer.
2. **Port the schema** in `docs/data-model.md`, keeping field names identical.
3. **Rewrite `assets/db.js` against the API**, preserving its exported surface
   (`load / get / save / nextNo / activity / …`) so `app.js`, `register.js` and
   `applications.js` need no changes.
4. **Move `nextNo()` server-side** in the same pass — it is the cheapest moment to fix B5.
5. **Replace the login screen** with real authentication and delete the demo codes.
6. **Add server-side seat locking** to `APPS.submit()` and `APPS.convert()`.
7. Re-run `tests/smoke.js` and the manual checklist against the new backend.

---

## 9. Related documents

| File | What it is for |
|---|---|
| [`HANDOFF.md`](HANDOFF.md) | Pick this up cold — what exists, how to run it, where everything lives |
| [`README.md`](README.md) | Short orientation and quick start |
| [`docs/architecture.md`](docs/architecture.md) | Module boundaries and why they are drawn where they are |
| [`docs/data-model.md`](docs/data-model.md) | Every store, every field — the Phase 2 porting contract |
| [`docs/public-registration-flow.md`](docs/public-registration-flow.md) | The admissions lifecycle end to end |
| [`docs/accounting-policy.md`](docs/accounting-policy.md) | Chart of accounts, VAT treatment, what each event posts |
| [`docs/roles-and-permissions.md`](docs/roles-and-permissions.md) | The role matrix and how it is enforced |
| [`docs/testing-checklist.md`](docs/testing-checklist.md) | Manual QA script for the parts tests cannot reach |
| [`docs/deployment.md`](docs/deployment.md) | Running it locally and hosting the static build |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed, when |
