# Tara Barko Maritime — Integrated System

Public registration portal and internal integrated system for enrollment, accounting and
finance, for a MARINA/STCW-accredited maritime training and assessment center.

> **Prototype.** Data lives in browser `localStorage`, login codes are plaintext, and
> permissions are enforced client-side. Do not put real seafarer data or real money in it.
> See section 4 of [`ACTION-PLAN.md`](ACTION-PLAN.md).

---

## Quick start

No dependencies, no build step. Serve the folder so both pages share one store:

```bash
npx --yes serve -l 4173 .
```

- **Public portal** — <http://localhost:4173/register.html> (no login)
- **Internal system** — <http://localhost:4173/index.html>

Demo codes: `admin` · `registrar` · `cashier` · `accounting` (the code is the role name).

Run the tests:

```bash
node tests/smoke.js
```

---

## What it does

**Public portal** — browse accredited courses and open schedules with live seat counts, apply
through a three-step wizard, print an acknowledgement slip, and track the application with a
six-character reference code.

**Internal system** — twelve role-gated modules:

| Group | Modules |
|---|---|
| Operations | Dashboard, Admissions, Trainees, Courses, Schedules, Enrollments |
| Finance | Billing, Collections, Disbursements, General Ledger, Reports |
| System | Settings |

The two surfaces share one data layer. An application submitted on the portal is the same
record the registrar approves, and approving it creates the trainee, the enrollment, the
invoice and its journal entry in one step.

Every financial report is derived from a balanced double-entry journal — nothing is
hand-computed. Voids reverse rather than delete, so the audit trail never has holes in it.

---

## Documentation

| File | What it is |
|---|---|
| [`ACTION-PLAN.md`](ACTION-PLAN.md) | **Master plan** — phases, decisions, risks, what blocks production |
| [`HANDOFF.md`](HANDOFF.md) | **Start here if the project is new to you** — how it works and where things live |
| [`docs/architecture.md`](docs/architecture.md) | Module boundaries |
| [`docs/data-model.md`](docs/data-model.md) | Every store and field — the porting contract |
| [`docs/public-registration-flow.md`](docs/public-registration-flow.md) | The admissions lifecycle |
| [`docs/accounting-policy.md`](docs/accounting-policy.md) | Chart of accounts, VAT, what each event posts |
| [`docs/roles-and-permissions.md`](docs/roles-and-permissions.md) | The role matrix |
| [`docs/testing-checklist.md`](docs/testing-checklist.md) | Manual QA script |
| [`docs/deployment.md`](docs/deployment.md) | Running and hosting it |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed, when |

---

## Stack

Vanilla HTML, CSS and JavaScript. No framework, no bundler, no package manager. This is a
deliberate choice — see decision D1 in the action plan.

Tests run on Node (any recent version) using only built-in modules.
