-- Two tables the office can read and insert into but not update, which is not a
-- rule anybody meant — it is a gap in the original policy loop.

-- ------------------------------------------------------------------ doc_seq
-- The document counters. Every receipt, voucher and booking number bumps a row
-- here, so this is not an occasional write, it is the most frequent one in the
-- system. Without an update policy the counter can be created once and never
-- moved again, and the first save after that fails with "new row violates
-- row-level security policy" — which is what the office actually hit.
drop policy if exists doc_seq_bump on tbm.doc_seq;
create policy doc_seq_bump on tbm.doc_seq
  for update using (tbm.is_staff()) with check (tbm.is_staff());

-- ------------------------------------------------------------------ journal
-- The ledger is append-only on purpose: a wrong entry is corrected by a
-- reversing entry, never by an edit. But voiding an entry marks the original,
-- and that is an update — so it had to be possible or a void could never be
-- recorded at all.
--
-- The intent is kept by the grant rather than the policy: `voided` is the only
-- column authenticated may write. Postgres refuses an update touching any other
-- column outright, so the history cannot be rewritten even by code that tries.
drop policy if exists journal_void on tbm.journal;
create policy journal_void on tbm.journal
  for update using (tbm.is_staff()) with check (tbm.is_staff());

revoke update on tbm.journal from authenticated;
grant update (voided) on tbm.journal to authenticated;

-- The login check has answered its question.
drop function if exists tbm.login_check(text);
