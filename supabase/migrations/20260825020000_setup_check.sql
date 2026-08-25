-- A temporary, counts-only view of whether the office is set up.
--
-- It exists to answer one question from outside — have the three accounts been
-- created and did the roster attach their roles — without anybody having to
-- read it off a dashboard and describe it. It returns numbers and a masked
-- address, never a password, never a token, and it is dropped in the migration
-- immediately after this one.
create or replace function tbm.setup_check()
  returns table (roster_rows int, staff_rows int, auth_rows int, matched text)
  language sql security definer set search_path = tbm, public, auth as
$$
  select (select count(*)::int from tbm.roster),
         (select count(*)::int from tbm.staff where active),
         (select count(*)::int from auth.users),
         (select coalesce(string_agg(
                   left(u.email, 3) || '***@' || split_part(u.email, '@', 2)
                   || case when s.id is null then ' (no role)' else ' → ' || s.role end,
                   ', ' order by u.email), '')
            from auth.users u
            left join tbm.staff s on s.id = u.id)
$$;
grant execute on function tbm.setup_check() to anon, authenticated;
