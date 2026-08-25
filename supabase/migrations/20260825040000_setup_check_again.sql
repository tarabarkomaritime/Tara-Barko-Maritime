-- Re-added for one reading, before the cutover, for the same reason as before:
-- deploying a build nobody can sign into has already happened twice, and the
-- cost of checking is two migrations nobody will ever read again.
create or replace function tbm.setup_check()
  returns table (roster_rows int, staff_rows int, auth_rows int, matched text)
  language sql security definer set search_path = tbm, public, auth as
$$
  select (select count(*)::int from tbm.roster),
         (select count(*)::int from tbm.staff where active),
         (select count(*)::int from auth.users),
         (select coalesce(string_agg(
                   left(u.email, 3) || '***@' || split_part(u.email, '@', 2)
                   || case when s.id is null then ' (no role)' else ' → ' || s.role end
                   || case when u.email_confirmed_at is null then ' [UNCONFIRMED]' else '' end,
                   ', ' order by u.email), '')
            from auth.users u
            left join tbm.staff s on s.id = u.id)
$$;
grant execute on function tbm.setup_check() to anon, authenticated;
