-- Whether the rebate comes off what the office remits, decided per training
-- center. Until now every one of the 341 courses said "do not deduct", which
-- was the safe default the catalogue was imported with and not the office's
-- actual arrangement with anybody.
--
-- Deduct: the rebate is kept back and the center is paid the fee less the
-- rebate. Do not deduct: the center is remitted the full fee and settles the
-- rebate separately, so it sits in receivables until it comes back.
--
-- NEW WAVE is the one center split by course rather than by name: its STCW
-- courses do not deduct, everything else it runs does. Of the codes named, only
-- BT is at NEW WAVE today — and that row is titled PSSR, which is worth a look.
--
-- GRAMCARE is deliberately untouched.

update tbm.courses set deduct = true
 where upper(btrim(center)) in
   ('MARIANA','GREAT SEAS','RAJ','PNTC','UNITED INTERNATIONAL','JVV','COMPASS',
    'GRANDLINE','HEALTHLINE','TONSBERG');

-- NEW WAVE: everything deducts except the STCW courses.
update tbm.courses set deduct = true
 where upper(btrim(center)) = 'NEW WAVE'
   and upper(btrim(code)) not in ('AFF','SCRB','BTR','AFFR','BT','SCRBR','BTOC','BTLGT');

update tbm.courses set deduct = false
 where upper(btrim(center)) = 'NEW WAVE'
   and upper(btrim(code)) in ('AFF','SCRB','BTR','AFFR','BT','SCRBR','BTOC','BTLGT');

-- Named explicitly rather than left on the import default, so the next person
-- reading this knows it was decided and not overlooked.
update tbm.courses set deduct = false
 where upper(btrim(center)) in ('ALTITUDE MARITIME','FAREAST','NAUTICAL OPTIONS','NAVIGATOR');
