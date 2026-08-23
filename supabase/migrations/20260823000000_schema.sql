-- Tara Barko Maritime — Integrated System
-- Everything lives in its own schema, `tbm`.
--
-- This project already carries a different system in `public` — schedules,
-- price matrix, shipping requests, marketing — whose table names (trainees,
-- courses, enrollments, payments, expenses) are the same as the ones here while
-- the columns are not. A separate schema is what lets the two sit in one
-- database without either having to be renamed, and lets this one be dropped
-- whole if it is ever replaced.
--
-- Two decisions worth knowing before you read it:
--
--   Ids stay text, not uuid. Every record already carries one ('trn-a1b2c3',
--   'INV-2026-0004'), the whole app refers to records by it, and every backup
--   JSON written so far is keyed on it. Converting to uuid would orphan every
--   existing backup for no gain the office would ever see.
--
--   Money is numeric(12,2), never float. A float cannot hold 0.10 exactly, and
--   an accounting system that cannot add ten centavos to twenty centavos and
--   get thirty is not an accounting system.

create schema if not exists tbm;

-- ---------------------------------------------------------------- staff
-- Sign-in moves to Supabase Auth. This table is the profile beside it: which
-- of the office's people an auth account belongs to, and what they may open.
-- The plain-text `code` from the browser build does not come across — that was
-- a way of keeping the wrong desk out of the wrong screen, never a password.
create table if not exists tbm.staff (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  role        text not null check (role in ('admin','frontdesk','registrar','cashier','accounting')),
  initials    text not null default '',
  email       text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function tbm.is_staff() returns boolean
  language sql stable security definer set search_path = tbm, public as
$$ select exists (select 1 from tbm.staff where id = auth.uid() and active) $$;

create or replace function tbm.is_admin() returns boolean
  language sql stable security definer set search_path = tbm, public as
$$ select exists (select 1 from tbm.staff where id = auth.uid() and active and role = 'admin') $$;

-- ---------------------------------------------------------- office settings
-- One row. The company profile, the modes of payment and the chargeable extras
-- were a single object in the browser store and stay one here: they are edited
-- as a unit on the Settings screen and never queried piecemeal.
create table if not exists tbm.company (
  id          boolean primary key default true check (id),
  profile     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Document numbering. Kept server-side so two cashiers cannot both be handed
-- OR-2026-0042 — the browser build could not prevent that and this can.
create table if not exists tbm.doc_seq (
  kind    text primary key,
  value   integer not null default 0
);

create or replace function tbm.next_no(p_kind text, p_prefix text) returns text
  language plpgsql security definer set search_path = tbm, public as $$
declare n integer;
begin
  insert into tbm.doc_seq (kind, value) values (p_kind, 1)
    on conflict (kind) do update set value = tbm.doc_seq.value + 1
    returning value into n;
  return p_prefix || '-' || extract(year from now())::int || '-' || lpad(n::text, 4, '0');
end $$;

-- ------------------------------------------------------------- chart of accounts
create table if not exists tbm.accounts (
  code    text primary key,
  name    text not null,
  type    text not null check (type in ('Asset','Liability','Equity','Revenue','Expense')),
  nature  text not null check (nature in ('debit','credit'))
);

-- ----------------------------------------------------------------- catalogue
-- One row per course at one training center: the same course at two centers is
-- two rows at two prices, because that is what the office sells.
create table if not exists tbm.courses (
  id       text primary key,
  code     text not null,
  title    text not null,
  days     numeric(5,1),
  duration text not null default '',
  modes    text[] not null default '{}',
  options  text[] not null default '{}',
  center   text not null default '',
  amount   numeric(12,2) not null default 0,
  rebate   numeric(12,2) not null default 0,
  -- true: the rebate comes off what we remit. false: the center owes it back.
  deduct   boolean not null default false,
  constraint rebate_not_over_fee check (rebate <= amount)
);
create index if not exists courses_center_idx on tbm.courses (upper(center));
create index if not exists courses_title_idx  on tbm.courses (upper(title));

-- ------------------------------------------------------------------ trainees
create table if not exists tbm.trainees (
  id                 text primary key,
  no                 text unique not null,
  srn                text not null default '',
  last               text not null,
  first              text not null,
  middle             text not null default '',
  suffix             text not null default '',
  sex                text not null default '',
  birth              date,
  birth_place        text not null default '',
  rank               text not null default '',
  agency             text not null default '',
  mobile             text not null default '',
  email              text not null default '',
  facebook           text not null default '',
  messenger          text not null default '',
  address            text not null default '',
  emergency_name     text not null default '',
  emergency_relation text not null default '',
  emergency_mobile   text not null default '',
  source             text not null default '',
  registered         date not null default current_date,
  remarks            text not null default '',
  created_at         timestamptz not null default now()
);
create index if not exists trainees_name_idx on tbm.trainees (upper(last), upper(first));
create index if not exists trainees_srn_idx  on tbm.trainees (srn) where srn <> '';

-- ---------------------------------------------------------------- bookings
create table if not exists tbm.enrollments (
  id                 text primary key,
  no                 text unique not null,
  trainee_id         text not null references tbm.trainees (id) on delete restrict,
  course_id          text references tbm.courses (id) on delete set null,
  center             text not null default '',
  start_on           date,
  end_on             date,
  date_encoded       date not null default current_date,
  status             text not null default 'Enrolled',
  fee                numeric(12,2) not null default 0,
  discount           numeric(12,2) not null default 0,
  discount_note      text not null default '',
  -- what the seat costs us and how the rebate is settled, frozen at booking
  -- time: editing a course price later must not restate a booking already made
  rebate             numeric(12,2) not null default 0,
  deduct             boolean not null default false,
  center_payable     numeric(12,2),
  rebate_receivable  numeric(12,2) not null default 0,
  -- remittance to the center
  center_paid        numeric(12,2) not null default 0,
  remit_no           text,
  remit_date         date,
  -- the rebate coming back from the center
  rebate_received_on date,
  rebate_method      text,
  rebate_ref         text,
  rebate_received_by text,
  remarks            text not null default '',
  created_at         timestamptz not null default now(),
  constraint ends_after_start check (end_on is null or start_on is null or end_on >= start_on)
);
create index if not exists enrollments_trainee_idx on tbm.enrollments (trainee_id);
create index if not exists enrollments_center_idx  on tbm.enrollments (upper(center));
create index if not exists enrollments_open_idx    on tbm.enrollments (center) where remit_no is null;

-- ----------------------------------------------------------------- billing
create table if not exists tbm.invoices (
  id            text primary key,
  no            text unique not null,
  enrollment_id text references tbm.enrollments (id) on delete set null,
  trainee_id    text not null references tbm.trainees (id) on delete restrict,
  date          date not null default current_date,
  terms         text not null default '',
  items         jsonb not null default '[]'::jsonb,
  subtotal      numeric(12,2) not null default 0,
  discount      numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  voided        boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists invoices_trainee_idx on tbm.invoices (trainee_id);

-- `paid` is deliberately not a column. It was one in the browser build and it
-- drifted: a voided receipt left the invoice claiming money it no longer had.
-- Summing the receipts cannot drift.
create table if not exists tbm.payments (
  id          text primary key,
  no          text unique not null,
  invoice_id  text references tbm.invoices (id) on delete restrict,
  trainee_id  text not null references tbm.trainees (id) on delete restrict,
  date        date not null default current_date,
  amount      numeric(12,2) not null check (amount > 0),
  tenders     jsonb not null default '[]'::jsonb,
  method      text not null default 'Cash',
  ref         text not null default '',
  note        text not null default '',
  voided      boolean not null default false,
  taken_by    text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists payments_invoice_idx on tbm.payments (invoice_id) where not voided;
create index if not exists payments_date_idx    on tbm.payments (date);

create or replace view tbm.invoice_status as
  select i.id,
         i.total,
         coalesce(p.paid, 0)                                  as paid,
         greatest(i.total - coalesce(p.paid, 0), 0)           as balance,
         greatest(coalesce(p.paid, 0) - i.total, 0)           as overpaid,
         case when i.voided then 'Void'
              when coalesce(p.paid, 0) <= 0 then 'Unpaid'
              when coalesce(p.paid, 0) + 0.005 >= i.total then 'Paid'
              else 'Partial' end                              as status
    from tbm.invoices i
    left join (
      select invoice_id, sum(amount) as paid from tbm.payments where not voided group by invoice_id
    ) p on p.invoice_id = i.id;

-- ---------------------------------------------------------------- money out
-- Vouchers, remittances to centers and payroll are one table: they are the same
-- document with a different `kind`, and they all wait for the same approval.
create table if not exists tbm.expenses (
  id            text primary key,
  no            text unique not null,
  kind          text not null default 'voucher' check (kind in ('voucher','remittance','payroll')),
  date          date not null default current_date,
  payee         text not null default '',
  account       text references tbm.accounts (code),
  particulars   text not null default '',
  amount        numeric(12,2) not null check (amount > 0),
  method        text not null default 'Cash',
  ref           text not null default '',
  bookings      text[] not null default '{}',
  lines         jsonb not null default '[]'::jsonb,
  state         text not null default 'Pending' check (state in ('Pending','Approved','Rejected')),
  raised_by     text not null default '',
  approved_by   text,
  approved_on   date,
  decided_by    text,
  decided_on    date,
  decision_note text not null default '',
  self_approved boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists tbm.refunds (
  id            text primary key,
  no            text unique not null,
  date          date not null default current_date,
  trainee_id    text not null references tbm.trainees (id) on delete restrict,
  amount        numeric(12,2) not null check (amount > 0),
  -- which pocket it comes out of: a cancelled booking sits in receivables, an
  -- overpayment in income, and they post to different accounts
  from_credit   numeric(12,2) not null default 0,
  from_over     numeric(12,2) not null default 0,
  method        text not null default 'Cash',
  ref           text not null default '',
  reason        text not null,
  state         text not null default 'Pending' check (state in ('Pending','Approved','Rejected')),
  raised_by     text not null default '',
  approved_by   text,
  approved_on   date,
  decided_by    text,
  decided_on    date,
  decision_note text not null default '',
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------ ledger
-- Append-only. A wrong entry is corrected by a reversing entry, never by an
-- update — that is the whole point of a journal, and the policies below are
-- what stop a well-meaning edit from quietly rewriting history.
create table if not exists tbm.journal (
  id          text primary key,
  no          text unique not null,
  date        date not null,
  memo        text not null default '',
  ref_type    text not null default '',
  ref_no      text not null default '',
  ref_id      text not null default '',
  lines       jsonb not null default '[]'::jsonb,
  debit       numeric(12,2) not null default 0,
  credit      numeric(12,2) not null default 0,
  voided      boolean not null default false,
  reversal_of text,
  posted_by   text not null default '',
  created_at  timestamptz not null default now(),
  constraint entry_balances check (debit = credit)
);
create index if not exists journal_date_idx on tbm.journal (date);
create index if not exists journal_ref_idx  on tbm.journal (ref_id);

create table if not exists tbm.activity_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  who        text not null default '',
  action     text not null,
  reference  text not null default ''
);

-- ------------------------------------------------------- public registration
-- Written by anonymous visitors on the public page, which is why it is its own
-- table with its own policy: a stranger may add a row here and read nothing at
-- all, and never touches trainees.
create table if not exists tbm.registrations (
  id                text primary key,
  no                text unique not null,
  submitted_at      timestamptz not null default now(),
  payload           jsonb not null,
  terms_version     text not null default '',
  terms_accepted    text[] not null default '{}',
  terms_accepted_at timestamptz,
  handled           boolean not null default false
);

-- ------------------------------------------------------------------- access
do $$
declare t text;
begin
  foreach t in array array['staff','company','doc_seq','accounts','courses','trainees',
                           'enrollments','invoices','payments','expenses','refunds',
                           'journal','activity_log','registrations']
  loop
    execute format('alter table tbm.%I enable row level security', t);
  end loop;
end $$;

-- Signed-in staff read everything. The office is four people who already share
-- a room; hiding rows from each other would only mean phoning across the desk.
do $$
declare t text;
begin
  foreach t in array array['company','accounts','courses','trainees','enrollments',
                           'invoices','payments','expenses','refunds','journal','activity_log']
  loop
    execute format('drop policy if exists %I on tbm.%I', t || '_read', t);
    execute format('drop policy if exists %I on tbm.%I', t || '_add', t);
    execute format('create policy %I on tbm.%I for select using (tbm.is_staff())', t || '_read', t);
    execute format('create policy %I on tbm.%I for insert with check (tbm.is_staff())', t || '_add', t);
  end loop;
end $$;

-- Updating is narrower than reading.
drop policy if exists trainees_edit    on tbm.trainees;
drop policy if exists enrollments_edit on tbm.enrollments;
drop policy if exists invoices_edit    on tbm.invoices;
drop policy if exists payments_edit    on tbm.payments;
drop policy if exists expenses_edit    on tbm.expenses;
drop policy if exists refunds_edit     on tbm.refunds;
create policy trainees_edit    on tbm.trainees    for update using (tbm.is_staff());
create policy enrollments_edit on tbm.enrollments for update using (tbm.is_staff());
create policy invoices_edit    on tbm.invoices    for update using (tbm.is_staff());
create policy payments_edit    on tbm.payments    for update using (tbm.is_staff());
create policy expenses_edit    on tbm.expenses    for update using (tbm.is_staff());
create policy refunds_edit     on tbm.refunds     for update using (tbm.is_staff());

-- The price list, the chart of accounts and the office profile are the admin's.
drop policy if exists courses_edit  on tbm.courses;
drop policy if exists courses_drop  on tbm.courses;
drop policy if exists accounts_edit on tbm.accounts;
drop policy if exists company_edit  on tbm.company;
drop policy if exists staff_read    on tbm.staff;
drop policy if exists staff_admin   on tbm.staff;
drop policy if exists seq_use       on tbm.doc_seq;
create policy courses_edit  on tbm.courses  for update using (tbm.is_admin());
create policy courses_drop  on tbm.courses  for delete using (tbm.is_admin());
create policy accounts_edit on tbm.accounts for update using (tbm.is_admin());
create policy company_edit  on tbm.company  for update using (tbm.is_admin());
create policy staff_read    on tbm.staff    for select using (tbm.is_staff());
create policy staff_admin   on tbm.staff    for all    using (tbm.is_admin()) with check (tbm.is_admin());
create policy seq_use       on tbm.doc_seq  for select using (tbm.is_staff());

-- No update policy on journal, and no delete policy anywhere else. Postgres
-- denies what is not allowed, so the ledger can be added to and never altered,
-- and nothing but a course can be deleted through the API.

-- Anyone may register. Nobody anonymous may read what anyone else submitted.
drop policy if exists registrations_submit on tbm.registrations;
drop policy if exists registrations_read   on tbm.registrations;
drop policy if exists registrations_edit   on tbm.registrations;
create policy registrations_submit on tbm.registrations for insert to anon, authenticated with check (true);
create policy registrations_read   on tbm.registrations for select using (tbm.is_staff());
create policy registrations_edit   on tbm.registrations for update using (tbm.is_staff());

-- ------------------------------------------------------------------ grants
-- A schema outside `public` gets none of Supabase's default grants, so they are
-- spelled out. Row-level security above is what actually restricts; these only
-- decide which verbs exist at all. No delete is granted anywhere except the
-- course list, which is the one thing an admin genuinely removes.
grant usage on schema tbm to anon, authenticated, service_role;

grant select, insert, update on all tables in schema tbm to authenticated;
grant delete on tbm.courses to authenticated;
grant usage, select on all sequences in schema tbm to authenticated;
grant insert on tbm.registrations to anon;
grant all on all tables in schema tbm to service_role;
grant all on all sequences in schema tbm to service_role;

alter default privileges in schema tbm grant select, insert, update on tables to authenticated;
alter default privileges in schema tbm grant all on tables to service_role;

revoke all on function tbm.next_no(text, text) from public, anon;
grant execute on function tbm.next_no(text, text) to authenticated;
grant execute on function tbm.is_staff() to authenticated;
grant execute on function tbm.is_admin() to authenticated;
