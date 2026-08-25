-- Remove the rows my own tests of tbm.submit_registration left behind, and put
-- the counters back so the office's first real seafarer is TRN-2026-0001 rather
-- than starting at three because somebody was checking the plumbing.
delete from tbm.registrations where srn = 'SRN-TEST-9001';
delete from tbm.trainees      where srn = 'SRN-TEST-9001';

update tbm.doc_seq set value = 0
 where kind in ('trainee','application')
   and not exists (select 1 from tbm.trainees)
   and not exists (select 1 from tbm.registrations);
