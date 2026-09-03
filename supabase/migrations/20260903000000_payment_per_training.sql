-- Which training a payment was for.
--
-- A day's bookings share one invoice, which is right for the document the
-- trainee is handed. It left the books unable to say which of six trainings a
-- payment settled: money was recorded against the bill, and anything wanting a
-- per-training figure had to guess by laying payments over the bookings in
-- order, oldest first.
--
-- That guess is wrong exactly when it matters. A trainee who pays for the
-- medical but not the refresher has the money assigned to the refresher because
-- it was booked first, and the centre for the medical is then never remitted
-- while the refresher looks paid.
--
-- So the row says. It is nullable: every payment written before today has no
-- answer to give and the waterfall remains the best available reading of those,
-- which is what the app falls back to when this is null.

alter table tbm.payments
  add column if not exists enrollment_id text
  references tbm.enrollments (id) on delete set null;

create index if not exists payments_enrollment_idx
  on tbm.payments (enrollment_id) where enrollment_id is not null;
