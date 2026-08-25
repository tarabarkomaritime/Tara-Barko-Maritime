-- Answered. A function that reads auth.users as security definer exists for as
-- long as it is being used and not one minute longer.
drop function if exists tbm.setup_check();
