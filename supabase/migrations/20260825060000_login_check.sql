-- Why one account cannot sign in. Reads flags, never secrets: no password hash,
-- no token, no recovery link. Dropped in the migration after this one.
create or replace function tbm.login_check(p_email text)
  returns table (found boolean, exact_stored text, confirmed boolean,
                 banned boolean, last_sign_in text, providers text)
  language sql security definer set search_path = tbm, public, auth as
$$
  select true,
         '[' || u.email || ']',                        -- brackets reveal stray spaces
         u.email_confirmed_at is not null,
         u.banned_until is not null and u.banned_until > now(),
         coalesce(u.last_sign_in_at::text, 'never'),
         coalesce((select string_agg(i.provider, ',') from auth.identities i where i.user_id = u.id), 'none')
    from auth.users u
   where lower(btrim(u.email)) = lower(btrim(p_email))
$$;
grant execute on function tbm.login_check(text) to anon, authenticated;
