# School Director Quick Start

Last updated: July 24, 2026

This guide is for location-level school users/directors.

## Daily Login

1. Go to `https://thebeesuite.io/login`.
2. Sign in with the school account provided by Kid City USA or BrunerDigital.
3. Confirm the center shown in the sidebar/header is your school.
4. If the wrong center appears, stop and report it before entering data.

## CRM Leads

- Open `CRM Leads` to view inquiries for your school.
- Add walk-in or phone inquiries with `New Lead` or the manual lead entry flow.
- Move leads through the pipeline as the family progresses.
- Edit lead details without changing the pipeline stage unless the family actually moved stages.
- Use Mr. Bee for draft communication help, then review the message before sending or copying.

## FTE Reports

- Open `FTE Reports`.
- Submit the weekly FTE report for your school before the cutoff.
- Review totals before submitting.
- If a mistake is found after submission, contact an executive/admin or submit the corrected information if editing is enabled for your role.

## Families And Students

- Use the family/student intake flow to add a new family.
- Add guardians first, then children under the family profile.
- Before editing, confirm the sticky context header names the intended school, family, selected child, selected guardian, and billing account.
- Confirm each child is linked to the correct family and classroom.
- Use `View full profile` for the complete family record and `Open billing` for the selected family's or child's billing context.
- Weekly tuition comes from the child billing assignment. The family record shows the active family total and per-child rates; change the assignment in Billing rather than adding another amount to notes or profile fields.
- Save and confirm the section before switching families, children, or guardians.
- Keep custody, medical, allergy, and authorized pickup notes accurate and limited to staff who need them.

## Enrollment

- Use the enrollment directory and child profile to confirm status, classroom, family, and assigned weekly tuition.
- An `Enrolled` CRM stage does not replace a director-approved enrollment record.
- Do not create a duplicate family or child when the applicant already exists. Resolve duplicate warnings within the same school before continuing.
- Moving a child between classrooms or schools can affect access, attendance, and billing; use the approved transfer workflow rather than editing unrelated fields.

## Check-In / Check-Out

- Directors set or reset guardian 4-digit PINs from the family/guardian area.
- The lobby tablet should use the center-specific check-in page.
- Test the kiosk before families use it.
- Verify attendance logs route to the correct classroom and center.

## ProCare Import

- Do not run ProCare preview or import unless the named location and action are explicitly authorized.
- Use `npm run procare:prepare-rendered` only in an approved engineering environment to create an ignored review package; this command does not import data.
- Require the prepared package to retain its source-coverage manifest and require zero unresolved account links before requesting preview approval.
- After preview is separately authorized, review families, guardians, children, classrooms, teachers, balances, attendance, warnings, duplicates, source hash, and center identity before any commit decision.
- Do not upload exports from another school into your location, commit raw exports to Git, or treat a successful software release as ProCare cutover approval.
- ProCare remains authoritative until a written location-specific cutover is recorded.

## Support

- Report urgent live-school issues immediately with the school name, user email, page, action attempted, expected result, actual result, and screenshot if possible.
