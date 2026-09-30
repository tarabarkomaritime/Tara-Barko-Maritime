-- Assert the account is actually there. A migration that applies cleanly is not
-- the same as a migration that did what it said; the office finds out otherwise
-- when a voucher is refused and the screen says nothing saved.
do $$
begin
  if not exists (select 1 from tbm.accounts where code = '5600') then
    raise exception '5600 Refunds & Goodwill is not in the chart';
  end if;
end $$;
