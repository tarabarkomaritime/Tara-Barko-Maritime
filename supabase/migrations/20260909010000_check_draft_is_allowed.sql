-- The post-condition of the migration before this one, checked where the data
-- is rather than assumed from a clean apply.
--
-- Every voucher raised from Center Payables is written as a Draft now. If the
-- check constraint does not allow that word, the first one the office generates
-- takes the whole save down -- which is exactly how a state I invented once
-- before ("Voided") stopped the office saving anything at all.
--
-- Nothing is written.

do $$
declare v_ok boolean;
begin
  -- Postgres will not let a row through that the constraint rejects, so the
  -- constraint itself is asked.
  select pg_get_constraintdef(oid) like '%Draft%'
    into v_ok
    from pg_constraint
   where conname = 'expenses_state_check'
     and conrelid = 'tbm.expenses'::regclass;

  if v_ok is null then
    raise exception 'expenses_state_check is not on tbm.expenses at all';
  end if;
  if not v_ok then
    raise exception 'expenses_state_check does not allow Draft: %',
      (select pg_get_constraintdef(oid) from pg_constraint
        where conname = 'expenses_state_check'
          and conrelid = 'tbm.expenses'::regclass);
  end if;
end $$;

-- And that it still refuses a word nobody offers. A constraint widened by
-- accident to allow anything would pass the check above and catch nothing.
do $$
begin
  begin
    insert into tbm.expenses (id, no, kind, date, payee, particulars, amount, state)
    values ('__probe_state', '__PROBE', 'expense', current_date, 'probe', 'probe', 1, 'Whatever');
    -- Reaching here means it was accepted, which it must not be.
    delete from tbm.expenses where id = '__probe_state';
    raise exception 'expenses_state_check accepted a state nobody offers';
  exception
    when check_violation then
      null;   -- refused, as it should be
  end;
end $$;
