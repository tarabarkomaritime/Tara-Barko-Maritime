-- The tracker shows the applicant their own rank, company and the day they
-- registered, and names the course on any booking the office has made. All of
-- it is theirs already; it was simply not being handed back, so the page drew
-- em-dashes where the answers should have been.
--
-- The course arrives as a title rather than an id on purpose: the public page
-- has no read access to the catalogue and should not be given any, so it cannot
-- resolve an id into a name. Handing it the name is the whole of what it needs.
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

  -- Still nothing priced: no fee, no balance, no rebate, no ledger.
  select jsonb_build_object(
    'found', true,
    'trainee', jsonb_build_object(
        'no', v_t.no, 'srn', v_t.srn, 'last', v_t.last, 'first', v_t.first,
        'middle', v_t.middle, 'suffix', v_t.suffix,
        'rank', v_t.rank, 'agency', v_t.agency,
        'registered', to_char(v_t.registered, 'YYYY-MM-DD')),
    'registrations', coalesce((
       select jsonb_agg(jsonb_build_object('no', r.no, 'ref', r.ref,
                'submitted', to_char(r.submitted_at,'YYYY-MM-DD'), 'status', r.status)
              order by r.submitted_at desc)
         from tbm.registrations r where r.trainee_id = v_t.id), '[]'::jsonb),
    'enrollments', coalesce((
       select jsonb_agg(jsonb_build_object('no', e.no,
                'course', coalesce(c.title, ''), 'center', e.center,
                'start', to_char(e.start_on,'YYYY-MM-DD'),
                'end', to_char(e.end_on,'YYYY-MM-DD'), 'status', e.status)
              order by e.start_on desc nulls last)
         from tbm.enrollments e
         left join tbm.courses c on c.id = e.course_id
        where e.trainee_id = v_t.id), '[]'::jsonb))
  into v_out;
  return v_out;
end $$;
revoke all on function tbm.track_registration(text, text) from public;
grant execute on function tbm.track_registration(text, text) to anon, authenticated;
