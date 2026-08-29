-- A correction to a booking, and the admin's decision on it.
--
-- Until now a booking could not be corrected at all. When the center moved a
-- run to the following week, or the trainee switched to another center, the
-- desk booked a second seat and left the first one standing — which bills the
-- trainee twice and puts the office down two remittances, one of them for a
-- seat nobody sat in.
--
-- It is not simply made editable, because the booking is what the center is
-- endorsed against and what the trainee was billed for. So it goes through the
-- gate the money already goes through: whoever notices raises the correction,
-- an admin signs it, and the booking does not move until they do.
create table if not exists tbm.booking_changes (
  id             text primary key,
  no             text not null,
  enrollment_id  text not null references tbm.enrollments(id) on delete cascade,
  trainee_id     text references tbm.trainees(id) on delete set null,
  date           date not null default current_date,
  raised_by      text not null default '',

  -- A correction, or a request to void the booking outright. Both wait for the
  -- same signature and both are one row, so which of the two it is has to be
  -- on the row rather than inferred from what changed -- a void and a status
  -- edit to Void would otherwise be indistinguishable, and only one of them
  -- reverses a bill.
  kind           text not null default 'edit',

  -- The booking as it stood when the request was raised, and as it is being
  -- asked to stand. Both are kept: approving a request written against a
  -- booking that has since moved would quietly undo whatever happened in
  -- between, and the app refuses to do that by comparing the two.
  was_state      jsonb not null default '{}'::jsonb,
  to_state       jsonb not null default '{}'::jsonb,
  reason         text not null default '',

  state          text not null default 'Pending',
  approved_by    text,
  approved_on    date,
  decided_by     text,
  decided_on     date,
  decision_note  text not null default '',
  self_approved  boolean not null default false,
  updated_at     timestamptz not null default now()
);

create index if not exists booking_changes_pending
  on tbm.booking_changes (state, date) where state = 'Pending';

alter table tbm.booking_changes enable row level security;

-- Everyone at the office reads the queue. The person who raised a request has
-- to be able to see whether it was signed; being unable to would send them to
-- ask the admin in person, which is the thing the queue exists to replace.
drop policy if exists booking_changes_read on tbm.booking_changes;
create policy booking_changes_read on tbm.booking_changes
  for select using (tbm.is_staff());

-- Anyone at the desk may raise one. Noticing that a date is wrong is not an
-- admin job, and a system where only the admin can report a mistake is a system
-- that hears about mistakes late.
drop policy if exists booking_changes_ins on tbm.booking_changes;
create policy booking_changes_ins on tbm.booking_changes
  for insert with check (tbm.is_staff());

-- Only an admin decides. Note this policy is written out here rather than left
-- to the loop in 20260825080000 that hands every table staff-level insert and
-- update: that loop skips a table which already has a policy for the command,
-- so this one has to exist for the narrower rule to survive a re-run.
drop policy if exists booking_changes_upd on tbm.booking_changes;
create policy booking_changes_upd on tbm.booking_changes
  for update using (tbm.is_admin()) with check (tbm.is_admin());

-- A request is written once and then decided. Granting update on the decision
-- columns alone is what stops an approved correction being quietly rewritten
-- afterwards into something nobody signed — the row on file stays the row that
-- was approved.
grant select, insert on tbm.booking_changes to authenticated;
grant update (state, approved_by, approved_on, decided_by, decided_on,
              decision_note, self_approved, updated_at)
  on tbm.booking_changes to authenticated;
