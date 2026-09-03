-- Run this FIRST. It changes nothing.
--
-- It shows the two files side by side and everything that would move, so the
-- merge is approved against what is actually in the database rather than
-- against what a screenshot said last week.
--
-- Check three things before running the merge:
--   1. both rows are the same man
--   2. the SRNs match exactly
--   3. the counts are what you expect to move

select
  t.no                              as "Trainee no.",
  t.last || ', ' || t.first
    || coalesce(' ' || nullif(t.middle,''), '')  as "Name",
  t.srn                             as "SRN",
  t.mobile                          as "Mobile",
  t.registered                      as "Registered",
  (select count(*) from tbm.enrollments   e where e.trainee_id = t.id) as "Bookings",
  (select count(*) from tbm.invoices      i where i.trainee_id = t.id) as "Bills",
  (select count(*) from tbm.payments      p where p.trainee_id = t.id) as "Receipts",
  (select count(*) from tbm.refunds       r where r.trainee_id = t.id) as "Refunds",
  (select count(*) from tbm.registrations g where g.trainee_id = t.id) as "Registrations",
  coalesce((select sum(i.total) from tbm.invoices i
             where i.trainee_id = t.id and not i.voided), 0)           as "Billed",
  coalesce((select sum(p.amount) from tbm.payments p
             where p.trainee_id = t.id and not p.voided), 0)           as "Paid"
from tbm.trainees t
where t.no in ('TRN-2026-0002', 'TRN-2026-0031')
order by t.registered;
