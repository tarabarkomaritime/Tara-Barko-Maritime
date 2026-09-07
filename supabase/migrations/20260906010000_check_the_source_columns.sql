-- The post-condition of the migration before this one, checked where the data
-- is rather than assumed from a clean apply.
--
-- The app writes `source` on every booking now, and a column that is not there
-- takes the whole save down for whoever is at the desk -- the office would see
-- NOT SAVED naming a field they had never heard of. So each column is asserted
-- present, and the constraint that keeps a fourth source from ever appearing.
--
-- Nothing is written.

do $$
declare
  c    text;
  miss text := '';
begin
  foreach c in array array['source', 'marketing_fee', 'marketing_set_by',
                           'marketing_set_on', 'marketing_voucher']
  loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'tbm' and table_name = 'enrollments' and column_name = c
    ) then
      miss := miss || c || ' ';
    end if;
  end loop;

  if miss <> '' then
    raise exception 'tbm.enrollments is missing: %', miss;
  end if;
end $$;

-- Three ways in and no others, enforced rather than hoped for.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'enrollments_source_check'
       and conrelid = 'tbm.enrollments'::regclass
  ) then
    raise exception 'enrollments_source_check is not on tbm.enrollments';
  end if;
end $$;

-- And that nothing already on file falls outside it. A row written before the
-- constraint existed would not have been checked by it.
do $$
declare bad text;
begin
  select string_agg(distinct source, ', ') into bad
    from tbm.enrollments
   where source is null or source not in ('Walk-in', 'Online', 'Marketing');
  if bad is not null then
    raise exception 'bookings on file carry a source nobody offers: %', bad;
  end if;
end $$;
