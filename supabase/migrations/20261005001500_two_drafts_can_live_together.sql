-- Prove it, rather than trust a clean apply: two un-numbered drafts must save,
-- and two numbered documents must still be refused. Both are rolled back.
do $$
declare ok boolean := false;
begin
  insert into tbm.expenses (id, no, kind, payee, amount, account)
    values ('__probe_a', '', 'remittance', 'PROBE', 1, '2000'),
           ('__probe_b', '', 'remittance', 'PROBE', 1, '2000');

  begin
    insert into tbm.expenses (id, no, kind, payee, amount, account)
      values ('__probe_c', 'DV-PROBE-0001', 'remittance', 'PROBE', 1, '2000'),
             ('__probe_d', 'DV-PROBE-0001', 'remittance', 'PROBE', 1, '2000');
  exception when unique_violation then ok := true;
  end;

  delete from tbm.expenses where id like '__probe%';
  if not ok then
    raise exception 'a number can now be shared, which it must not be';
  end if;
end $$;
