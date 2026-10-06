# Start school imports this week: October 6-9, 2026

The secure family and billing importer is live. Schools can prepare their reports now. The school confirms its source facts and reviewed import before committing; preparing an import does not enable billing, invitations, parent access, or prior-system cutover.

## Current work list

The October 6 read-only inventory includes 45 active school records: 28 with no family records and 17 with existing records. Twenty-five empty schools have a direct school operator account linked to an Auth account. This proves that an account exists, not that its owner has successfully signed in. Three empty schools have no direct school operator account recorded: Meridian Park, Las Vegas 2-Bonanza, and Plainfield. An already-authorized BEE setup operator may still assist those schools; do not create or widen access without an approved named target.

Use SCHOOL_IMPORT_WEEK_WORKLIST_2026-10-06.csv for each school's next action. Public listing and operational scope are separate: Cordera remains an active database record but is excluded from the public location feed. Confirm its operating scope before including it in an import wave. Cuzco remains included even though its CRM identifier needs review. Empty records do not prove a school should start clean.

## Tuesday: get the source packages ready

1. Name one school director, one BEE implementation contact, and one finance reviewer for each participating school. Record the expected current-family and child counts and one agreed opening-balance date.
2. Confirm the existing director can sign in, select the correct school, and open School Setup. Follow Move Existing Records; direct migration workspace: https://thebeesuite.io/data-readiness?tab=procare. Do not create another school through public onboarding.
3. Read https://thebeesuite.io/resources/family-billing-transfer. Collect unchanged school-specific reports in the four groups below. Keep the original exports and source IDs. Do not combine spreadsheets, guess relationships, or drop a required report to reduce file size.
4. Schools with data already present start with Continue an existing migration and review the prior batch and remaining exceptions before uploading again.

Required groups:

- Families and children: accounts, stable account/child/person IDs, enrollment, contacts, classrooms, and schedules.
- Relationships and safety: guardians and responsible payers, emergency contacts, authorized pickups, custody restrictions, allergy and medical evidence as applicable.
- Balances and credits: one family balance at the agreed date, including zero and credits, with invoice/payment history needed to explain differences. Siblings do not each receive the family balance.
- Tuition and fees: each child's amount, actual weekly/biweekly/four-week/monthly frequency, description, effective date, discounts, fees, and family/agency responsibility. Unknown frequencies remain held for review.

Use the private import flow for personal information. Payment-card numbers, passwords, and bank credentials never belong in the source package.

## Wednesday: preview the first package

Proposed pilot: Deltona-Howland, subject to the school's availability and source reports. It has no family records and two existing direct operator/Auth accounts. This is a proposed technical pilot, not an activation approval or a guarantee that its reports are ready.

1. Select the exact school and source format. Upload a folder, supported reports, or ZIP: 50 MB total, 20 MB per file, 500 files, and 100 MB expanded ZIP limit.
2. Submit for Review. Check report coverage, relationships, expected family/child counts, tuition frequency, balances and credits, and every unresolved row.
3. The school and finance reviewer confirm the facts. Correct unclear source reports or request BEE Setup Help; do not guess a field match or waive an unexplained difference.
4. Commit only that reviewed school package after the school approves it. If interrupted, keep the same files selected and retry the retained batch. A saved transfer is not final verified completion.
5. Run the whole-school verification, reconcile totals, and record the school confirmation. Retain the linked private source backup.

## Thursday-Friday: repeat the verified process

Use the same preparation and review sequence for the remaining schools whose complete reports and director review are available. Prioritize ready packages, not an arbitrary school count. BEE handles technical preparation; the school supplies source truth and approves unresolved facts. Track each school as awaiting reports, awaiting sign-in, preview ready, correction needed, approved to import, transfer saved, or verified. Record a named owner and next action for every held school.

For existing-data schools, compare source and destination before approving any replacement import. Preserve canonical identities, relationships, billing and payment history, messages, and audit evidence.

## What is ready, and what still needs school input

Ready: the live import workflow, transfer guide, large secure uploads, resumable import handling, scoped balance checks, recoverable source backups, and responsive review UI. Authenticated synthetic director login and a 4 MB live upload/preview were verified on October 6; no import was committed. Synthetic temporary source bytes were removed.

Still required for each school: unchanged reports, real director sign-in, expected population counts, balance date, source corrections, and school/finance approval of the actual reviewed package. This packet does not approve charges, tuition activation, invitations, messages, changes to real users, or ProCare retirement.

## Copy-ready director instructions

Your school can start preparing its family and billing transfer into BEE Suite this week. Sign in to your existing director account and select your school. Open School Setup and choose Move Existing Records. If you already imported your data, use Continue an existing migration first.

Use this checklist: https://thebeesuite.io/resources/family-billing-transfer

Please have your unchanged family/child reports, guardian and safety relationships, child tuition schedules, and family balances/credits at one agreed date ready. Keep the source account, child, and person IDs. Upload through the secure school import screen and choose Submit for Review. Review all missing or conflicting information before committing. Use Request BEE Setup Help if reports, mappings, sign-in, or totals need attention. Saving a transfer does not turn on billing or send family invitations.

These instructions are prepared for approved distribution; no messages have been sent by this task.
