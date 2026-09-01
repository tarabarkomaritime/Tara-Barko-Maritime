-- The person who counts the drawer is the person standing at it.
--
-- The cash count was admin-only to write, which put the one person who can see
-- the money at the end of the day on the wrong side of the door: the count was
-- recorded by somebody being told a number over the phone, which is not a count
-- of anything.
--
-- So the front desk records it. What the front desk cannot do is record it
-- twice. A count that can be revised after the fact is not a count, it is a
-- second opinion, and the whole reason for writing down what was actually in
-- the drawer is that it can be set against what the books say should have been.
-- Revising it away from that is exactly the thing worth preventing.
--
-- The admin can still change one, because somebody has to be able to fix a
-- mistyped figure, and because the admin is who the discrepancy is escalated to
-- anyway.

drop policy if exists cash_counts_write  on tbm.cash_counts;
drop policy if exists cash_counts_change on tbm.cash_counts;

-- Anyone at the office may write the day's count.
create policy cash_counts_write on tbm.cash_counts
  for insert with check (tbm.is_staff());

-- Only an admin may change one that is already there. The row is the primary
-- key on the date, so a second attempt at the same day arrives as an update and
-- is refused for everybody else -- which is the "once" rule, enforced here
-- rather than only asked for by a screen.
create policy cash_counts_change on tbm.cash_counts
  for update using (tbm.is_admin()) with check (tbm.is_admin());

grant select, insert, update on tbm.cash_counts to authenticated;
