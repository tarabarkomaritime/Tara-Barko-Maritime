-- The public enrollment form, moved off the visitor's browser.
--
-- The awkward part of this is that an applicant is nobody: they have no account
-- and they must not get one. So they cannot be given rights over tbm.trainees —
-- a table with nine hundred seafarers' birth dates and mobile numbers in it —
-- merely so the form can add a row.
--
-- Two security definer functions instead. They run with the schema's own
-- rights, and they are the only thing anon may call: each one does exactly one
-- job, decides for itself what to write and what to hand back, and there is no
-- path through either that returns somebody else's record. The alternative —
-- granting anon insert on trainees and select on registrations — would have
-- given a stranger the register.

-- ---------------------------------------------------------------- submitting
create or replace function tbm.submit_registration(p jsonb)
  returns jsonb
  language plpgsql security definer set search_path = tbm, public as $$
declare
  v_srn    text := upper(btrim(coalesce(p->>'srn','')));
  v_last   text := btrim(coalesce(p->>'last',''));
  v_first  text := btrim(coalesce(p->>'first',''));
  v_mobile text := btrim(coalesce(p->>'mobile',''));
  v_email  text := lower(btrim(coalesce(p->>'email','')));
  v_id     text;
  v_no     text;
  v_reused boolean := false;
  v_ref    text;
  v_regno  text;
  missing  text[] := '{}';
  f        text;
begin
  -- The same fields the form marks required, checked again here: a browser can
  -- be told anything, and this is the side that cannot be edited by the caller.
  foreach f in array array['srn','last','first','birth','birthPlace','mobile',
                           'email','address','rank','agency',
                           'emergencyName','emergencyMobile']
  loop
    if coalesce(btrim(p->>f), '') = '' then missing := missing || f; end if;
  end loop;
  if array_length(missing, 1) > 0 then
    return jsonb_build_object('ok', false, 'missing', to_jsonb(missing));
  end if;

  -- A seafarer who has trained here before is the same person, not a second
  -- file. The SRN is the strong key; a repeat booking usually arrives with the
  -- same mobile number, so that is the fallback.
  select t.id, t.no into v_id, v_no
    from tbm.trainees t
   where (v_srn <> '' and upper(btrim(t.srn)) = v_srn)
      or (v_mobile <> '' and btrim(t.mobile) = v_mobile and upper(btrim(t.last)) = upper(v_last))
   order by t.created_at
   limit 1;

  if v_id is not null then
    v_reused := true;
    -- What may have changed since last time. The name and birth date are not
    -- touched: those are corrected at the desk against the papers, never by a
    -- form somebody typed in a hurry.
    update tbm.trainees set
      mobile             = coalesce(nullif(v_mobile,''), mobile),
      email              = coalesce(nullif(v_email,''), email),
      address            = coalesce(nullif(btrim(p->>'address'),''), address),
      rank               = coalesce(nullif(btrim(p->>'rank'),''), rank),
      agency             = coalesce(nullif(btrim(p->>'agency'),''), agency),
      emergency_name     = coalesce(nullif(btrim(p->>'emergencyName'),''), emergency_name),
      emergency_relation = coalesce(nullif(btrim(p->>'emergencyRelation'),''), emergency_relation),
      emergency_mobile   = coalesce(nullif(btrim(p->>'emergencyMobile'),''), emergency_mobile)
     where id = v_id;
  else
    v_no := tbm.next_no('trainee', 'TRN');
    v_id := 'trn-' || replace(gen_random_uuid()::text, '-', '');
    insert into tbm.trainees (
      id, no, srn, last, first, middle, suffix, birth, birth_place,
      rank, agency, mobile, email, address,
      emergency_name, emergency_relation, emergency_mobile, source, registered)
    values (
      v_id, v_no, v_srn, v_last, v_first,
      btrim(coalesce(p->>'middle','')), btrim(coalesce(p->>'suffix','')),
      nullif(btrim(coalesce(p->>'birth','')), '')::date,
      btrim(coalesce(p->>'birthPlace','')),
      btrim(coalesce(p->>'rank','')), btrim(coalesce(p->>'agency','')),
      v_mobile, v_email, btrim(coalesce(p->>'address','')),
      btrim(coalesce(p->>'emergencyName','')),
      btrim(coalesce(p->>'emergencyRelation','')),
      btrim(coalesce(p->>'emergencyMobile','')),
      'Public portal', current_date);
  end if;

  -- The reference the applicant quotes. Ambiguous characters are left out: it
  -- gets read down a phone line and written on a form by hand.
  loop
    v_ref := array_to_string(array(
      select substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                    (floor(random() * 32) + 1)::int, 1)
      from generate_series(1, 6)), '');
    exit when not exists (select 1 from tbm.registrations where ref = v_ref);
  end loop;

  v_regno := tbm.next_no('application', 'REG');
  insert into tbm.registrations (
    id, no, ref, channel, status, srn, last, first, trainee_id,
    submitted_at, payload, terms_version, terms_accepted, terms_accepted_at, history)
  values (
    'app-' || replace(gen_random_uuid()::text, '-', ''), v_regno, v_ref,
    'Public Portal', 'Registered', v_srn, v_last, v_first, v_id,
    now(), p,
    btrim(coalesce(p->>'termsVersion','')),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(
                case when jsonb_typeof(p->'termsAccepted') = 'array'
                     then p->'termsAccepted' else '[]'::jsonb end) as value), '{}'),
    now(),
    jsonb_build_array(jsonb_build_object(
      'ts', now(), 'status', 'Registered', 'by', 'Public Portal',
      'note', 'Registered online · terms ' ||
              coalesce(nullif(btrim(p->>'termsVersion'),''), 'not recorded') || ' accepted')));

  return jsonb_build_object('ok', true, 'ref', v_ref, 'no', v_regno,
                            'traineeNo', v_no, 'reused', v_reused);
end $$;

-- ----------------------------------------------------------------- tracking
-- Both halves are required and must match exactly. An SRN on its own would let
-- somebody walk the register by guessing numbers; an SRN plus the right surname
-- is something the applicant knows about themselves.
create or replace function tbm.track_registration(p_srn text, p_last text)
  returns jsonb
  language plpgsql security definer set search_path = tbm, public as $$
declare v_t tbm.trainees%rowtype; v_out jsonb;
begin
  if coalesce(btrim(p_srn),'') = '' or coalesce(btrim(p_last),'') = '' then
    return jsonb_build_object('found', false);
  end if;
  select * into v_t from tbm.trainees
   where upper(btrim(srn)) = upper(btrim(p_srn))
     and upper(btrim(last)) = upper(btrim(p_last))
   limit 1;
  if not found then return jsonb_build_object('found', false); end if;

  -- Only what the applicant already knows or is entitled to see about their own
  -- booking. No fees, no balances, no ledger.
  select jsonb_build_object(
    'found', true,
    'trainee', jsonb_build_object('no', v_t.no, 'srn', v_t.srn,
                                  'last', v_t.last, 'first', v_t.first),
    'registrations', coalesce((
       select jsonb_agg(jsonb_build_object('no', r.no, 'ref', r.ref,
                'submitted', to_char(r.submitted_at,'YYYY-MM-DD'), 'status', r.status)
              order by r.submitted_at desc)
         from tbm.registrations r where r.trainee_id = v_t.id), '[]'::jsonb),
    'enrollments', coalesce((
       select jsonb_agg(jsonb_build_object('no', e.no,
                'course', coalesce(c.title, ''), 'center', e.center,
                'start', e.start_on, 'end', e.end_on, 'status', e.status)
              order by e.start_on desc nulls last)
         from tbm.enrollments e
         left join tbm.courses c on c.id = e.course_id
        where e.trainee_id = v_t.id), '[]'::jsonb))
  into v_out;
  return v_out;
end $$;

-- A stranger may call these two and nothing else. They still cannot select from
-- any table in the schema — the grants below are the whole of anon's reach.
revoke all on function tbm.submit_registration(jsonb) from public;
revoke all on function tbm.track_registration(text, text) from public;
grant execute on function tbm.submit_registration(jsonb) to anon, authenticated;
grant execute on function tbm.track_registration(text, text) to anon, authenticated;
