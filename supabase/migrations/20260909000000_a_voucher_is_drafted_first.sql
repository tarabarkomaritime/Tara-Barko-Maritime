-- A voucher is drafted before it is paid.
--
-- Raising a remittance used to do two things at once: it fixed which seats were
-- being settled and it declared the money gone, in one press. So the only place
-- to check that the trainees and the amounts were right was after the fact, on
-- a document already queued for approval -- and correcting one meant rejecting
-- it and starting again.
--
-- There is a step before that now. Generating a voucher fixes the seats and the
-- amounts and nothing else: no payment method, no reference, nothing posted. It
-- can be read, printed and checked against the centre's own statement. When it
-- is right, the office marks it paid -- which is when how the money went and
-- what reference it carries are asked for -- and only then does it reach the
-- admin for approval.
--
-- Three states became four. Draft is the new one, and it is the only one that
-- can be discarded outright: nothing has been posted and nobody has signed it.

alter table tbm.expenses drop constraint if exists expenses_state_check;
alter table tbm.expenses
  add constraint expenses_state_check
  check (state in ('Draft', 'Pending', 'Approved', 'Rejected'));

-- A draft has not been paid yet, so it carries no method. The column has a
-- default and a not-null on it, which is right for a voucher that has been
-- paid; a draft simply leaves it at its default and the screens read the state,
-- not the method.

-- Refunds keep the three they had. A refund is decided in one step -- there is
-- no seat list to check over first -- so a draft would be a state nothing ever
-- puts a row into.
