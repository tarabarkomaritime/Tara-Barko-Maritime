-- Two more kinds of voucher, one of them overdue.
--
-- tbm.expenses.kind allows voucher, remittance and payroll. The referral fee
-- added with the marketing tab writes 'marketing', which the constraint
-- refuses -- so the first referral fee the office pays would be rejected by the
-- server, and a refused write takes the whole save down with it. Nobody has hit
-- it yet only because nobody has paid one.
--
-- That is the third time I have invented a value the server would not take.
-- 'Voided' on this same column stopped the office saving anything at all in
-- August, and 'Draft' was caught before it shipped. The lesson keeps being the
-- same: a new word in a checked column is a migration, not a decision.
--
-- The other is new. Money sometimes comes back from a training centre -- we
-- overpay a remittance and they return the difference -- and there was nowhere
-- to record it. It is a remittance run backwards: cash in, and the centre's
-- payable restored. It lives on this table because that is where money moving
-- between the office and a centre already lives, with its own kind so every
-- screen that totals spending can leave it out and the day's takings can pick
-- it up.

alter table tbm.expenses drop constraint if exists expenses_kind_check;
alter table tbm.expenses
  add constraint expenses_kind_check
  check (kind in ('voucher', 'remittance', 'payroll', 'marketing', 'center-refund'));
