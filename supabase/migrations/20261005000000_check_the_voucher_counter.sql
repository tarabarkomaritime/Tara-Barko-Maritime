-- A look at the counter, to be sure a signed-out probe never touched it.
-- It raises nothing; the notice is the point.
do $$
declare v integer;
begin
  select value into v from tbm.doc_seq where kind = 'voucher';
  raise notice 'doc_seq voucher = %', coalesce(v, -1);
end $$;
