-- The seafarer I invented to prove the live public form reaches the office.
-- Removed, and the counters wound back so the office's first real registration
-- is TRN-2026-0001 and REG-2026-0001 rather than starting at two.
delete from tbm.registrations where srn = 'SRN-LIVE-777';
delete from tbm.trainees      where srn = 'SRN-LIVE-777';

update tbm.doc_seq set value = 0
 where kind in ('trainee','application')
   and not exists (select 1 from tbm.trainees)
   and not exists (select 1 from tbm.registrations);
