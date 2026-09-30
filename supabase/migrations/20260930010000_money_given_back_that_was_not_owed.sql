-- Somewhere to post a refund the books did not say was owed.
--
-- A refund used to be possible only against money the books already held for
-- the trainee: an overpayment, or what they paid for a booking that was
-- cancelled. Those come out of 4300 Overpayments and 1200 Receivables, which is
-- right, because that is where the money was sitting.
--
-- The office also gives money back for reasons the books cannot know about -- a
-- seafarer sent home, a run the centre closed, a decision simply taken at the
-- counter -- and the screen refused to record those at all. Now it records them,
-- and they need an account of their own. Posting them to 4300 would drive an
-- income line negative for an overpayment that never existed, and the month's
-- statement would read as though the office had un-earned something.
--
-- It is an expense: money out, for no goods and no service. 5600.
--
-- Inserted here rather than left to the client, because tbm.expenses.account
-- carries a foreign key to this table -- a voucher charged to an account the
-- server has never heard of is rejected, and the office is told nothing saved.

insert into tbm.accounts (code, name, type, nature)
values ('5600', 'Refunds & Goodwill', 'Expense', 'debit')
on conflict (code) do nothing;
