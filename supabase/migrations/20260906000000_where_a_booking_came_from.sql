-- Where a booking came from, and what the person who brought it is owed.
--
-- A seat reaches the office three ways: somebody walks in, somebody fills in
-- the public form, or somebody goes out and finds the trainee. The last of
-- those is paid for, and paid for out of the rebate on that seat -- so the
-- booking has to remember which it was, or the office cannot tell a margin it
-- keeps from one it is halving.
--
-- The referral fee itself is set by the admin, on the booking, and then leaves
-- through an ordinary disbursement voucher. Recording it here rather than as a
-- free-standing expense keeps it attached to the seat that earned it: which
-- trainee, which course, which centre, all answerable from one row.

alter table tbm.enrollments
  add column if not exists source text not null default 'Walk-in',
  -- What the marketer is paid for this seat. Null until the admin sets it.
  add column if not exists marketing_fee numeric(12,2),
  add column if not exists marketing_set_by text,
  add column if not exists marketing_set_on date,
  -- The voucher it went out on, once it has been paid.
  add column if not exists marketing_voucher text;

-- Three ways in and no others. A fourth would be a typo, and a typo here is a
-- rebate quietly halved or quietly not.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'enrollments_source_check'
       and conrelid = 'tbm.enrollments'::regclass
  ) then
    alter table tbm.enrollments
      add constraint enrollments_source_check
      check (source in ('Walk-in', 'Online', 'Marketing'));
  end if;
end $$;

-- A referral fee is money, so it may not be negative. Nothing says it has to be
-- less than the rebate: the office may decide a seat is worth paying over the
-- odds for, and a rule here would only be discovered at the counter.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'enrollments_marketing_fee_check'
       and conrelid = 'tbm.enrollments'::regclass
  ) then
    alter table tbm.enrollments
      add constraint enrollments_marketing_fee_check
      check (marketing_fee is null or marketing_fee >= 0);
  end if;
end $$;

-- Every booking already on file was taken at the counter or through the form,
-- and neither halved a rebate. Walk-in is the honest default for them: it says
-- nobody is owed a referral fee, which is true of every one of them.
update tbm.enrollments set source = 'Walk-in' where source is null;
