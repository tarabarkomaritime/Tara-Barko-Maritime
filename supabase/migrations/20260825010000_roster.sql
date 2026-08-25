-- Who counts as one of the office's people.
--
-- Signing in to Supabase and being staff here are two different questions. A
-- stranger can create an account against this project at any time; what they
-- must not get is a row back from tbm.trainees. Every policy in the schema asks
-- tbm.is_staff(), which asks whether there is a row in tbm.staff — so the whole
-- question reduces to who gets a staff row, and that is this file.
--
-- The roster is the office's list of expected email addresses. When an auth
-- account appears for one of them, the trigger below gives it the staff row and
-- the role that address was promised. An account for any other address gets
-- nothing at all: it can sign in and see an empty system, which is the correct
-- answer to "who are you".
--
-- This exists because the accounts themselves have to be created by a person,
-- in the Supabase dashboard, where they can set the passwords. Passwords should
-- not pass through a migration, a repository, or an assistant.

create table if not exists tbm.roster (
  email     text primary key,
  name      text not null,
  role      text not null check (role in ('owner','admin','frontdesk','registrar','cashier','accounting')),
  initials  text not null default '',
  added_at  timestamptz not null default now()
);

insert into tbm.roster (email, name, role, initials) values
  ('kyla.esguerra24@gmail.com',          'Kyla Esguerra', 'owner',     'KE'),
  ('pkmesguerra.ph@gmail.com',           'Kate Esguerra', 'admin',     'KA'),
  ('ealajocelyn.qaplamaritime@gmail.com','Jocelyn Eala',  'frontdesk', 'JE')
on conflict (email) do update
  set name = excluded.name, role = excluded.role, initials = excluded.initials;

-- Matching is case-insensitive and ignores stray spaces, because an address
-- typed into a dashboard by hand is an address typed by hand.
create or replace function tbm.enroll_staff() returns trigger
  language plpgsql security definer set search_path = tbm, public as $$
declare r tbm.roster%rowtype;
begin
  select * into r from tbm.roster
   where lower(btrim(email)) = lower(btrim(new.email));
  if found then
    insert into tbm.staff (id, name, role, initials, email, active)
    values (new.id, r.name, r.role, r.initials, lower(btrim(new.email)), true)
    on conflict (id) do update
      set name = excluded.name, role = excluded.role,
          initials = excluded.initials, email = excluded.email, active = true;
  end if;
  return new;
end $$;

drop trigger if exists enroll_staff_on_signup on auth.users;
create trigger enroll_staff_on_signup
  after insert on auth.users
  for each row execute function tbm.enroll_staff();

-- Anyone already created before this ran.
insert into tbm.staff (id, name, role, initials, email, active)
select u.id, r.name, r.role, r.initials, lower(btrim(u.email)), true
  from auth.users u
  join tbm.roster r on lower(btrim(r.email)) = lower(btrim(u.email))
on conflict (id) do update
  set name = excluded.name, role = excluded.role,
      initials = excluded.initials, email = excluded.email, active = true;

alter table tbm.roster enable row level security;
create policy roster_read  on tbm.roster for select using (tbm.is_admin());
create policy roster_write on tbm.roster for all    using (tbm.is_admin()) with check (tbm.is_admin());
grant select, insert, update, delete on tbm.roster to authenticated;

-- The office's own details and the price list have to be there before anybody
-- can take a booking, so the one company row is created empty rather than
-- waiting for someone to press save on the Settings screen.
insert into tbm.company (id, profile) values (true, '{}'::jsonb)
on conflict (id) do nothing;
