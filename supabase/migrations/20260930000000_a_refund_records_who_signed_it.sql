-- A refund records whether the person approving it raised it.
--
-- Every document that goes through the approval door is stamped with
-- self_approved -- it says whether the signature came from the same hand that
-- wrote the request, which is the whole point of having the door. Vouchers have
-- the column. Refunds never got one, and the code stamps them all the same way,
-- so approving a refund produced:
--
--   NOT SAVED -- refunds: no column for selfApproved -> self_approved
--
-- and the office could not save anything at all until the page was reloaded.
--
-- The fourth time a value in the store has had nowhere to go on the server. The
-- test that sweeps every table for this compares the map against itself, so it
-- cannot see a field the code writes and the map never declared -- which is the
-- gap all four have come through.

alter table tbm.refunds
  add column if not exists self_approved boolean not null default false;
