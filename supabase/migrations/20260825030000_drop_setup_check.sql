-- The setup check has answered its question. It read from auth.users as a
-- security definer, which is a thing that should exist for as long as it is
-- being used and not one minute longer.
drop function if exists tbm.setup_check();
