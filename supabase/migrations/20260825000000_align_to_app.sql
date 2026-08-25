-- Align the tbm schema with the shape the application actually writes.
--
-- The tables were written from the store as it stood in August; the app has
-- moved since. Every column below is a field the browser build produces today
-- and the table had nowhere to put — which in a sync layer does not raise an
-- error, it quietly drops the value. A seafarer's SIRB and passport number
-- going missing between the desk and the database is exactly the kind of loss
-- this whole migration exists to stop, so the columns come first and the code
-- that depends on them comes after.

-- ---------------------------------------------------------------- staff
-- 'owner' is admin-and-accounting in one person: the plain admin role has no
-- ledger on purpose, and somebody doing both jobs needs the one screen the
-- other admins do not get. The role existed in the app before it existed here.
alter table tbm.staff drop constraint if exists staff_role_check;
alter table tbm.staff add constraint staff_role_check
  check (role in ('owner','admin','frontdesk','registrar','cashier','accounting'));

-- an admin is anybody the office trusts with the settings screen
create or replace function tbm.is_admin() returns boolean
  language sql stable security definer set search_path = tbm, public as
$$ select exists (
     select 1 from tbm.staff
      where id = auth.uid() and active and role in ('owner','admin')
   ) $$;

-- --------------------------------------------------------------- trainees
-- Read off the originals by staff, not asked for on the public form.
alter table tbm.trainees add column if not exists sirb     text not null default '';
alter table tbm.trainees add column if not exists passport text not null default '';

-- ------------------------------------------------------------ enrollments
-- Where the class sits, who runs it, how it ended, and the certificate it
-- produced. `invoice_id` closes the loop back to billing: the enrollment knows
-- which bill was raised for it, which is how the screens stop offering to
-- raise a second one.
alter table tbm.enrollments add column if not exists room           text not null default '';
alter table tbm.enrollments add column if not exists instructor     text not null default '';
alter table tbm.enrollments add column if not exists result         text not null default '';
alter table tbm.enrollments add column if not exists certificate_no text not null default '';
alter table tbm.enrollments add column if not exists invoice_id     text;

-- ---------------------------------------------------------------- payments
-- Who was at the window. It is on the receipt already; it belongs in the row.
alter table tbm.payments add column if not exists taken_by text not null default '';

-- ----------------------------------------------------------------- journal
alter table tbm.journal add column if not exists posted_by   text not null default '';
alter table tbm.journal add column if not exists reversal_of text;

-- ----------------------------------------------------------- registrations
-- The public form's own record. `payload` already holds the applicant's
-- answers; these are the fields the tracker and the queue actually read, so
-- they are columns rather than a jsonb lookup on every row.
alter table tbm.registrations add column if not exists ref        text not null default '';
alter table tbm.registrations add column if not exists channel    text not null default '';
alter table tbm.registrations add column if not exists status     text not null default 'New';
alter table tbm.registrations add column if not exists srn        text not null default '';
alter table tbm.registrations add column if not exists last       text not null default '';
alter table tbm.registrations add column if not exists first      text not null default '';
alter table tbm.registrations add column if not exists trainee_id text;
alter table tbm.registrations add column if not exists history    jsonb not null default '[]'::jsonb;
create index if not exists registrations_ref_idx on tbm.registrations (upper(ref));

-- ------------------------------------------------------------ the sync row
-- One row, holding the version the browser last read. Two people editing the
-- same records from two desks is now possible, so a write has to be able to
-- notice that the store moved underneath it rather than flatten the other
-- desk's work. Bumped by the client on every successful push.
create table if not exists tbm.store_version (
  id      boolean primary key default true check (id),
  version bigint  not null default 0,
  changed_at timestamptz not null default now(),
  changed_by text not null default ''
);
insert into tbm.store_version (id) values (true) on conflict (id) do nothing;
alter table tbm.store_version enable row level security;
create policy store_version_read on tbm.store_version for select using (tbm.is_staff());
create policy store_version_bump on tbm.store_version for update using (tbm.is_staff());
grant select, update on tbm.store_version to authenticated;
