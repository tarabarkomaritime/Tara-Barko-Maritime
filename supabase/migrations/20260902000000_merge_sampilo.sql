-- Merge two files for one seafarer.
--
-- SAMPILO, MARK DANIEL YANGA was registered twice on the same SRN — once in
-- August and again in September — because the office's Register trainee form
-- pushed a new record whatever was typed into it. His courses ended up on one
-- file and his balance on the other, and neither screen shows both.
--
-- Everything that points at the September file is moved to the August one and
-- the September file is deleted. The keeper is the older record deliberately:
-- it carries the longer history and the outstanding balance, and its trainee
-- number is the one already written on documents the office has handed out.
--
-- The ledger is not touched and does not need to be. Journal entries reference
-- invoices, receipts and bookings — never a trainee — so moving a seafarer's
-- documents between files cannot move a peso. The trial balance before this
-- runs and after it are the same trial balance.
--
-- Runs as one transaction. If either file is missing, or they turn out not to
-- share an SRN, it raises and nothing at all happens.

do $$
declare
  -- The two files, by the numbers on screen. Change these to merge a different
  -- pair; everything below reads from them.
  keep_no  text := 'TRN-2026-0002';   -- survives
  drop_no  text := 'TRN-2026-0031';   -- is merged into the above and removed

  keep_id  text;
  drop_id  text;
  keep_srn text;
  drop_srn text;
  n_enr    int;
  n_inv    int;
  n_pay    int;
  n_ref    int;
  n_reg    int;
  n_chg    int := 0;
begin
  select id, upper(btrim(coalesce(srn,''))) into keep_id, keep_srn
    from tbm.trainees where no = keep_no;
  select id, upper(btrim(coalesce(srn,''))) into drop_id, drop_srn
    from tbm.trainees where no = drop_no;

  if keep_id is null then
    raise exception 'No trainee numbered % — nothing merged.', keep_no;
  end if;
  if drop_id is null then
    raise exception 'No trainee numbered % — nothing merged.', drop_no;
  end if;
  if keep_id = drop_id then
    raise exception 'Those are the same record — nothing merged.';
  end if;

  -- The whole justification for merging is that these are one person. If the
  -- SRNs differ they are two people who happen to share a name, and merging
  -- them would be the worse version of the bug being fixed.
  if keep_srn = '' or keep_srn is distinct from drop_srn then
    raise exception
      'Refusing to merge: % has SRN "%" and % has SRN "%". They must match.',
      keep_no, keep_srn, drop_no, drop_srn;
  end if;

  -- Move the documents.
  update tbm.enrollments   set trainee_id = keep_id where trainee_id = drop_id;
  get diagnostics n_enr = row_count;
  update tbm.invoices      set trainee_id = keep_id where trainee_id = drop_id;
  get diagnostics n_inv = row_count;
  update tbm.payments      set trainee_id = keep_id where trainee_id = drop_id;
  get diagnostics n_pay = row_count;
  update tbm.refunds       set trainee_id = keep_id where trainee_id = drop_id;
  get diagnostics n_ref = row_count;
  update tbm.registrations set trainee_id = keep_id where trainee_id = drop_id;
  get diagnostics n_reg = row_count;

  -- Only if that table has been created; the approvals migration may not have
  -- been applied yet, and a merge should not depend on it.
  if to_regclass('tbm.booking_changes') is not null then
    execute format('update tbm.booking_changes set trainee_id = %L where trainee_id = %L',
                   keep_id, drop_id);
    get diagnostics n_chg = row_count;
  end if;

  -- Anything the newer file knew and the older one did not. The keeper's own
  -- values win: they have been checked at the desk against the seafarer's
  -- papers, and the second file was typed in a hurry by whoever made it.
  update tbm.trainees k set
    middle             = coalesce(nullif(btrim(k.middle),''),             d.middle),
    suffix             = coalesce(nullif(btrim(k.suffix),''),             d.suffix),
    birth              = coalesce(k.birth,                                d.birth),
    birth_place        = coalesce(nullif(btrim(k.birth_place),''),        d.birth_place),
    sirb               = coalesce(nullif(btrim(k.sirb),''),               d.sirb),
    passport           = coalesce(nullif(btrim(k.passport),''),           d.passport),
    "rank"             = coalesce(nullif(btrim(k."rank"),''),           d."rank"),
    agency             = coalesce(nullif(btrim(k.agency),''),             d.agency),
    mobile             = coalesce(nullif(btrim(k.mobile),''),             d.mobile),
    email              = coalesce(nullif(btrim(k.email),''),              d.email),
    address            = coalesce(nullif(btrim(k.address),''),            d.address),
    facebook           = coalesce(nullif(btrim(k.facebook),''),           d.facebook),
    messenger          = coalesce(nullif(btrim(k.messenger),''),          d.messenger),
    emergency_name     = coalesce(nullif(btrim(k.emergency_name),''),     d.emergency_name),
    emergency_relation = coalesce(nullif(btrim(k.emergency_relation),''), d.emergency_relation),
    emergency_mobile   = coalesce(nullif(btrim(k.emergency_mobile),''),   d.emergency_mobile),
    -- Said on the record itself, because in a year nobody will remember that
    -- this number ever existed.
    remarks = btrim(coalesce(nullif(btrim(k.remarks),'') || ' · ', '')
              || drop_no || ' was a duplicate of this record and was merged into it.')
    from tbm.trainees d
   where k.id = keep_id and d.id = drop_id;

  delete from tbm.trainees where id = drop_id;

  raise notice 'Merged % into %: % booking(s), % bill(s), % receipt(s), % refund(s), % registration(s), % request(s).',
    drop_no, keep_no, n_enr, n_inv, n_pay, n_ref, n_reg, n_chg;
end $$;

-- What the two files look like afterwards. There should be one row.
select t.no, t.last || ', ' || t.first as name, t.srn, t.remarks,
       (select count(*) from tbm.enrollments e where e.trainee_id = t.id) as bookings,
       (select count(*) from tbm.invoices    i where i.trainee_id = t.id) as bills,
       (select count(*) from tbm.payments    p where p.trainee_id = t.id) as receipts
  from tbm.trainees t
 where t.no in ('TRN-2026-0002', 'TRN-2026-0031');
