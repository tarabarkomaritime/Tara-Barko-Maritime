-- The day's cash count: what was in the drawer when it opened and what was in
-- it when it closed, as counted by hand.
--
-- The system already knows what the drawer *should* hold — it is the balance of
-- account 1000 and it is arithmetic. What it cannot know is what is actually
-- there, and the difference between those two numbers is the only reason a cash
-- count exists. A till that is short by two hundred pesos is a thing somebody
-- needs to be told; a system that only ever reports its own arithmetic back
-- will never tell anybody.
--
-- One row per day, so a second count on the same date corrects the first rather
-- than sitting beside it disagreeing.
create table if not exists tbm.cash_counts (
  on_date     date primary key,
  opening     numeric(12,2),
  closing     numeric(12,2),
  note        text not null default '',
  counted_by  text not null default '',
  updated_at  timestamptz not null default now()
);

alter table tbm.cash_counts enable row level security;

-- Everybody at the office can see the count. The cashier needs to know what the
-- drawer opened with; being unable to read it would make the day's first
-- receipt guesswork.
drop policy if exists cash_counts_read on tbm.cash_counts;
create policy cash_counts_read on tbm.cash_counts
  for select using (tbm.is_staff());

-- Only an admin writes it. The person counting the till is not the person who
-- signs off what the till should contain — that is the whole of why the count
-- is worth doing, and it is enforced here rather than only hidden in a screen.
drop policy if exists cash_counts_write  on tbm.cash_counts;
drop policy if exists cash_counts_change on tbm.cash_counts;
create policy cash_counts_write  on tbm.cash_counts
  for insert with check (tbm.is_admin());
create policy cash_counts_change on tbm.cash_counts
  for update using (tbm.is_admin()) with check (tbm.is_admin());

grant select, insert, update on tbm.cash_counts to authenticated;
