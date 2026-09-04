-- That the trigger is on the table is not the same as it working.
--
-- The check before this one proved tbm.doc_seq_forward exists on tbm.doc_seq.
-- What matters is what it does when a stale browser posts a lower number back,
-- because that is the write that broke the public form, and a trigger that is
-- present and wrong looks exactly like one that is present and right.
--
-- So it is exercised, on a counter that belongs to nothing. No real number is
-- touched, and the row is removed again -- and if any assertion here fails the
-- whole migration rolls back, taking the probe row with it.

do $$
declare v_after integer;
begin
  -- A kind no document uses, so nothing real is at stake either way.
  delete from tbm.doc_seq where kind = '__clamp_probe';
  insert into tbm.doc_seq (kind, value) values ('__clamp_probe', 100);

  -- The stale write: a browser posting back the counter as it stood before the
  -- public form advanced it.
  update tbm.doc_seq set value = 5 where kind = '__clamp_probe';
  select value into v_after from tbm.doc_seq where kind = '__clamp_probe';
  if v_after <> 100 then
    raise exception 'The clamp did not hold: 100 was walked back to %', v_after;
  end if;

  -- And that it has not been made stubborn instead of forward-only. A counter
  -- that refused to move at all would be its own outage.
  update tbm.doc_seq set value = 101 where kind = '__clamp_probe';
  select value into v_after from tbm.doc_seq where kind = '__clamp_probe';
  if v_after <> 101 then
    raise exception 'The counter would not move forward: expected 101, got %', v_after;
  end if;

  delete from tbm.doc_seq where kind = '__clamp_probe';
  if exists (select 1 from tbm.doc_seq where kind = '__clamp_probe') then
    raise exception 'The probe row would not clear';
  end if;
end $$;
