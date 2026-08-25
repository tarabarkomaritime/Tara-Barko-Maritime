-- doc_seq was left out of the loop that gives every table its read and insert
-- policies. It got a select policy written by hand and nothing else, so a
-- counter that does not exist on the server yet cannot be created — and the
-- first document of every kind creates one. The office hit it twice.
--
-- The lesson is in the shape of the original: a list of table names written out
-- by hand next to a set of tables that grew. So this does not add doc_seq to a
-- list; it walks the schema and gives staff insert and update on anything that
-- has neither, which cannot fall behind the same way.
do $$
declare r record;
begin
  for r in
    select c.relname as t
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'tbm' and c.relkind = 'r'
       and c.relname not in ('staff','roster','journal')   -- these are deliberately narrower
  loop
    if not exists (select 1 from pg_policies p
                    where p.schemaname='tbm' and p.tablename=r.t and p.cmd='INSERT') then
      execute format('create policy %I on tbm.%I for insert with check (tbm.is_staff())',
                     r.t || '_ins', r.t);
      raise notice 'added insert policy to %', r.t;
    end if;
    if not exists (select 1 from pg_policies p
                    where p.schemaname='tbm' and p.tablename=r.t and p.cmd='UPDATE') then
      execute format('create policy %I on tbm.%I for update using (tbm.is_staff()) with check (tbm.is_staff())',
                     r.t || '_upd', r.t);
      raise notice 'added update policy to %', r.t;
    end if;
  end loop;
end $$;
