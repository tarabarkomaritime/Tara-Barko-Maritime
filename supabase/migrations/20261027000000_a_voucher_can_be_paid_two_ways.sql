-- A voucher can leave two accounts at once.
--
-- A receipt has always been able to: a trainee hands over 3,000 cash and the
-- rest by GCash, and tbm.payments.tenders records which money arrived where.
-- Vouchers carry a single `method`, so settling a centre partly in cash and
-- partly by bank transfer could only be written down as one of the two -- and
-- the day's Money By Channel then showed the whole amount leaving an account
-- that only part of it left. The office reconciles each channel against what is
-- actually in it, so that is a figure that cannot be made to tally.
--
-- Same shape as payments, for the same reason: one row per tender, each with
-- the account it left from, its reference and its amount. An empty array means
-- what it has always meant -- the whole of it went by `method`.

alter table tbm.expenses
  add column if not exists tenders jsonb not null default '[]'::jsonb;
