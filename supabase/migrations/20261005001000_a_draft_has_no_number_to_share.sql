-- A draft has no number, and two of them had to share that.
--
-- Voucher numbers used to be handed out the moment a voucher was generated, so
-- every draft thrown away took one with it and the office watched the count
-- climb past documents that never existed. The number is now spent when the
-- voucher is marked paid, which is right -- and it means a draft is saved with
-- no number at all.
--
--   no text unique not null
--
-- One draft is fine. The second one is a second empty string, the unique index
-- refuses it, and because the office's work goes up in one push it refuses
-- everything behind it too:
--
--   NOT SAVED -- duplicate key value violates unique constraint "expenses_no_key"
--
-- Jocelyn's screen went red and stayed red, with a day's receipts behind it,
-- over two documents that have no numbers to collide.
--
-- Numbers still cannot be shared. Documents without one are simply not what the
-- rule is about, so they are left out of it: a partial unique index over the
-- rows that have been numbered. Postgres treats '' as an ordinary value, which
-- is why this has to be said explicitly rather than relying on nulls.
--
-- The sixth time a value this client writes has had nowhere to go on the
-- server, and the second where the shape of the data changed under a constraint
-- nobody re-read.

alter table tbm.expenses drop constraint if exists expenses_no_key;

create unique index if not exists expenses_no_numbered_key
  on tbm.expenses (no)
  where no <> '';
