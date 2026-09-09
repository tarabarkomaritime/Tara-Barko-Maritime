-- A voucher that never became anything can be taken off the list.
--
-- Rejected before approval, or a draft thrown away: no journal entry was ever
-- written against it, no money moved, and nobody outside the office is holding
-- a copy. Those are aborted attempts rather than documents, and leaving them on
-- the list buries the ones that matter.
--
-- A voucher voided *after* approval is a different thing and stays. It has a
-- posting and a reversal on the books, the centre may well have the paper, and
-- removing the row would leave two ledger entries pointing at a document that
-- does not exist. The books decide it, not the state -- so the policy asks the
-- journal, exactly as the screen does.
--
-- Only an admin, and only a row nothing was ever posted against.

drop policy if exists expenses_remove on tbm.expenses;

create policy expenses_remove on tbm.expenses
  for delete
  using (
    tbm.is_admin()
    and state in ('Draft', 'Rejected')
    and not exists (select 1 from tbm.journal j where j.ref_id = tbm.expenses.id)
  );

grant delete on tbm.expenses to authenticated;

-- The policy is the guard; the grant only says the verb is available at all.
-- Everyone else, and every voucher with an entry against it, is refused by the
-- policy whatever the screen happens to offer.
