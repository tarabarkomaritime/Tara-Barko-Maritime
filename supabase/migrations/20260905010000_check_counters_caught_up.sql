-- The post-condition of the migration before this one, said out loud.
--
-- That one clamped tbm.doc_seq so it can never lose ground, and caught every
-- counter up to the highest number of its kind on file. Both are invisible from
-- here: applying cleanly proves the statements ran, not that the numbers came
-- out right, and the counter values are behind a login this session does not
-- have.
--
-- So the check is made where the data is. It changes nothing. If a counter is
-- still standing behind a document already issued, this refuses to apply and
-- names it -- which is better than finding out from a seafarer who cannot sign
-- up, and is the whole failure this pair of migrations exists to end.

do $$
declare
  r      record;
  v_max  integer;
  v_seq  integer;
  v_bad  text := '';
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

    select value into v_seq from tbm.doc_seq where kind = r.kind;

    if coalesce(v_seq, 0) < v_max then
      v_bad := v_bad || format('%s is at %s but %s holds %s; ',
                               r.kind, coalesce(v_seq, 0), r.tbl, v_max);
    end if;
  end loop;

  if v_bad <> '' then
    raise exception 'Counters still behind the documents already issued: %', v_bad;
  end if;
end $$;

-- And that the clamp is really on the table, not merely written down.
do $$
begin
  if not exists (
    select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'tbm' and c.relname = 'doc_seq'
       and t.tgname = 'doc_seq_forward' and not t.tgisinternal
  ) then
    raise exception 'doc_seq_forward is not on tbm.doc_seq -- a stale browser can still walk the counter back';
  end if;
end $$;
