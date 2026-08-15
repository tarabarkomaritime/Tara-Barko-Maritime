/* terms.js — the enrollment terms and conditions shown on the review step.

   Kept in its own file, away from view code, because this is legal text: it gets
   edited by people who should not have to read JavaScript to find it, and every
   word of it matters. Edit the sections below and nothing else.

   IMPORTANT — bump `version` whenever the wording changes.
   Each application records the version the applicant accepted and the moment
   they accepted it (see APPS.submit). A "strictly no refund" clause is only
   worth anything if you can show which wording the trainee agreed to, so
   editing the text without bumping the version would silently mis-attribute
   every future acceptance to the wrong wording. */

const TERMS = {
  version: '2026-08-15',
  title: 'TERMS AND CONDITIONS',

  sections: [
    {
      n: 1,
      heading: 'Enrollment Responsibility',
      body: [
        `By enrolling, you confirm that the selected course and schedule are based on your
         own request. You expressly acknowledge that you have been informed of the complete
         training details and the exact fees provided by Tara Barko by QMCS, and that you
         fully agree to the stated pricing. You confirm that you are fully aware of and
         accept the training cost. Tara Barko by QMCS shall not be liable for any wrong or
         mistaken enrollment.`,
      ],
    },
    {
      n: 2,
      heading: 'Strictly No Refund',
      bullets: [
        'All payments are final.',
        'No refund.',
        'No cancellation.',
        'Non-transferable.',
      ],
    },
    {
      n: 3,
      heading: 'Personal Information',
      body: [
        `You must verify the correct spelling of your full name and details before final
         submission. Once endorsed to the training center, any correction, reprinting, or
         related charges shall be for your account. Tara Barko by QMCS shall not be liable
         for such costs.`,
      ],
    },
    {
      n: 4,
      heading: 'Rescheduling and Make-Up Classes',
      body: [
        `Any reschedule, rebooking, or make-up class is subject to the training center's
         policy and may incur additional charges. All related costs shall be borne by the
         trainee.`,
      ],
    },
    {
      n: 5,
      heading: 'Limited Liability',
      body: [
        `Tara Barko by QMCS acts only as an endorsing and coordinating entity to accredited
         training centers. We do not conduct the training. All training policies, schedule
         changes, cancellations, assessments, and certifications are under the full control
         of the training center. Tara Barko by QMCS shall not be held liable for any changes
         or actions made by the training center.`,
      ],
    },
  ],

  /* The lead-in above the tick boxes, and the boxes themselves. Every one of
     these must be ticked before the enrollment can be submitted. */
  agreementLead: 'By proceeding with enrollment, you confirm your full agreement to these terms',
  agreements: [
    { id: 'termsAccept',  label: 'I hereby accept the terms and conditions' },
    { id: 'termsProceed', label: 'I would like to proceed with my enrollment' },
  ],
};

if(typeof module !== 'undefined') module.exports = { TERMS };
