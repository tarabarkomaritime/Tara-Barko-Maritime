# Changelog

Notable changes to the Tara Barko Maritime Integrated System.

---

## Phase 1 — Public registration and admissions bridge — 2026-08-15

Adds a public-facing registration portal and the admissions module that turns an application
into a billed enrollment, plus repository documentation and a test suite.

### Added

- **Public registration portal** (`register.html`, `assets/register.js`, `assets/public.css`)
  - Home with open schedules and live seat counts
  - Course catalogue with search, published VAT-inclusive rates and STCW references
  - Three-step application wizard: schedule → details → review, with a draft that survives
    navigating backwards
  - Fee estimate on the review step, computed by the same VAT logic that produces the invoice
  - Consent gate before submission
  - Printable acknowledgement slip with a six-character reference code
  - Reference-code tracker requiring code **and** surname, with a four-stage timeline
- **Admissions lifecycle engine** (`assets/applications.js`) shared by both surfaces
  - Six states with a transition table (`NEXT`) as the single authority
  - Seat accounting that counts pending applications as soft claims
  - Field, seat and duplicate-submission validation
  - Duplicate seafarer detection on SRN, then name plus birthdate
  - `convert()` — the only path from admissions into the ledger, creating the trainee,
    enrollment, invoice and journal entry together
- **Admissions module** in the internal system
  - Queue with status filter, search, KPI tiles and an age warning at 3+ days
  - Review modal showing seat position, duplicate warning, full details and the audit trail
  - Action buttons derived from the transition table
  - Approve → enroll form with live charge summary and optional fees
  - Rejection and withdrawal with a reason shown to the applicant
  - Dashboard queue card, nav badge, and applications in global search
- **Cross-tab live sync** between the portal and the back office via the `storage` event
- **`tests/smoke.js`** — 48 headless assertions over the data, accounting and admissions layers
- **Documentation** — `ACTION-PLAN.md`, `HANDOFF.md`, `README.md`, `CHANGELOG.md`, and
  `docs/` covering architecture, data model, the registration flow, accounting policy,
  roles and permissions, the testing checklist and deployment

### Changed

- `assets/db.js` — added the `applications` store and its sequence; extracted `migrate()` so
  backups predating a collection still open; added `reload()` for cross-tab safety; seeded
  five applications across different lifecycle stages
- `assets/db.js` — granted `admissions` to the admin and registrar roles
- `assets/ui.js` — added the admissions statuses to `STATUS_KIND`
- `assets/app.js` — added the Admissions module, its modals, the dashboard card, the nav
  badge, application search and the `storage` listener
- `index.html` — loads `applications.js`; links to the public portal from the login screen

### Notes

- The build remains a prototype. Data is in `localStorage`, access codes are plaintext, and
  permissions are enforced client-side. Section 4 of `ACTION-PLAN.md` lists everything that
  blocks production.
- No change to the double-entry engine. The trial balance is asserted to balance before and
  after every new financial path.

---

## Phase 0 — Internal Integrated System — pre-existing

The original prototype, before this iteration.

- Trainee registry, course catalogue, batch scheduling with seat tracking
- Enrollment combining registration and billing
- VAT-aware invoicing, official receipts, disbursement vouchers
- Double-entry engine with a 15-account chart of accounts and reversal-on-void
- Trial balance, income statement, AR ageing, collections, per-account general ledger
- Dashboard with billing-versus-collections trend, ageing, enrollment mix and top courses
- JSON backup and restore, activity log, four demo roles
