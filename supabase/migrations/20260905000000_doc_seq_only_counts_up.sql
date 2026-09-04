-- A document number is never handed out twice.
--
-- A seafarer signing up on the public form was told:
--
--   The office did not accept the enrollment: duplicate key value violates
--   unique constraint "trainees_no_key"
--
-- tbm.next_no takes its number from tbm.doc_seq, which is atomic and cannot
-- collide with itself. It collides when the counter is standing behind a
-- number already in use, and that is exactly what the office's own browser
-- does to it.
--
-- The browser reads doc_seq when somebody signs in and keeps its own copy.
-- Every trainee, invoice and receipt it writes bumps that copy, and on saving
-- it writes the whole of it back. Meanwhile the public form is advancing the
-- same counter on the server, for registrations that browser has never heard
-- of. So the save puts the counter back to where the browser thought it was,
-- and the next seafarer to fill in the form is handed a trainee number that
-- already belongs to somebody.
--
-- Nothing in the office notices. The person who cannot enrol is a stranger on
-- a phone, and what they see is the office refusing them.
--
-- Two counters running against one sequence is the shape of it. Rather than
-- stop the browser writing (it has to, for the numbers it allocates itself),
-- the sequence is made to do the only thing a document number may ever do.

-- ---------------------------------------------------------------- forward only
create or replace function tbm.doc_seq_forward() returns trigger
  language plpgsql as $$
begin
  -- A counter that goes backwards is always a stale writer, never an intention.
  -- The write is not refused -- refusing it would fail the office's whole save
  -- over a field it did not mean to send -- it is simply not allowed to lose
  -- ground.
  if new.value < old.value then
    new.value := old.value;
  end if;
  return new;
end $$;

drop trigger if exists doc_seq_forward on tbm.doc_seq;
create trigger doc_seq_forward
  before update on tbm.doc_seq
  for each row execute function tbm.doc_seq_forward();

-- --------------------------------------------------------------- and caught up
-- The counters that have already been walked backwards are still behind. Each
-- is moved to at least the highest number of its kind actually on file, so the
-- next one issued is free whichever side issues it.
--
-- The trailing digits are the count. A receipt covering three trainings is
-- written OR-2026-0007/2 and /3, so anything after the digits is dropped
-- before comparing.
do $$
declare
  r record;
  v_max integer;
begin
  for r in
    select * from (values
      ('trainee',     'tbm.trainees'),
      ('enrollment',  'tbm.enrollments'),
      ('invoice',     'tbm.invoices'),
      ('receipt',     'tbm.payments'),
      ('voucher',     'tbm.expenses'),
      ('refund',      'tbm.refunds'),
      ('change',      'tbm.booking_changes'),
      ('application', 'tbm.registrations')
    ) as t(kind, tbl)
  loop
    execute format(
      'select coalesce(max(nullif(regexp_replace(split_part(no, ''-'', 3),
                                                 ''\D.*$'', ''''), '''')::int), 0) from %s',
      r.tbl) into v_max;

    insert into tbm.doc_seq (kind, value) values (r.kind, v_max)
      on conflict (kind) do update set value = greatest(tbm.doc_seq.value, excluded.value);
  end loop;
end $$;
