-- Jocelyn moves to a company address.
--
-- The roster is what turns an auth account into a member of staff, so a new
-- address has to be on it before the account is made — otherwise the trigger
-- has nothing to match and she signs in to a system with no rows in it, which
-- is exactly what the tarabarkomaritime@gmail.com account does today.
--
-- The old address is left in place deliberately. Taking it off the roster would
-- not remove the account that already exists, and removing that account is not
-- something to do from a migration on the strength of an inference: if she is
-- meant to lose the old login, that is a decision to take deliberately, once
-- the new one is proven to work.
insert into tbm.roster (email, name, role, initials) values
  ('ealajocelyn.tarabarko@gmail.com', 'Jocelyn Eala', 'frontdesk', 'JE')
on conflict (email) do update
  set name = excluded.name, role = excluded.role, initials = excluded.initials;

-- If the account already exists, attach the role now rather than waiting for a
-- sign-up that has already happened.
insert into tbm.staff (id, name, role, initials, email, active)
select u.id, r.name, r.role, r.initials, lower(btrim(u.email)), true
  from auth.users u
  join tbm.roster r on lower(btrim(r.email)) = lower(btrim(u.email))
 where lower(btrim(u.email)) = 'ealajocelyn.tarabarko@gmail.com'
on conflict (id) do update
  set name = excluded.name, role = excluded.role,
      initials = excluded.initials, email = excluded.email, active = true;
