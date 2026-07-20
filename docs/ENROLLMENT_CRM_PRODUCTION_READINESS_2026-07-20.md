# Enrollment CRM Production Readiness

Date: July 20, 2026  
Accountable human: Brenden until explicitly delegated  
Decision: **NO-GO for the wider school wave.** Kokomo may continue normal production use.

## Production-ready definition

For every school in the explicitly selected rollout wave:

- a public inquiry resolves to the intended active school and no other school;
- only authorized corporate and center-scoped enrollment roles can see or change the lead;
- the approved school mailbox receives the notification, an approved center-scoped fallback exists, and failed email or Google Sheets backup attempts are recorded for retry;
- staff can schedule and complete a tour, give the family the application for the same school, receive the submitted packet on the same lead, review it, and create the approved family, child, guardian, and enrollment records;
- the director verifies the resulting records and explicitly approves the handoff; changing a CRM stage alone is never treated as enrollment approval.

## CRM stage versus approved enrollment record

CRM stages are operational follow-up labels. `APPLICATION_SENT`, `APPLICATION_SUBMITTED`, `DOCUMENTS_PENDING`, `DEPOSIT_PENDING`, and `ENROLLED` do not themselves create a family, child, guardian, registration approval, or enrollment record.

Director registration approval is the boundary that creates the linked family/child/guardian data and enrollment record. The CRM API returns a `stageSemantics` disclosure. Manual lead creation as `ENROLLED` and moving a lead to `ENROLLED` without a linked approved enrollment record return HTTP `409` with code `approved_enrollment_required`. Parent invitation remains a separate explicit opt-in during approval.

Use `ENROLLMENT_CRM_DELIVERY_BACKUP_EVIDENCE_TEMPLATE.md` once per selected school for notification, Google Sheets backup, retry, isolation, and signoff evidence.

## Evidence completed

- Code review confirmed public intake rejects unknown Kid City locations, prefers active CRM-location matches, creates the lead in the resolved center, and records SendGrid notification and Google Sheets backup delivery attempts.
- Code review confirmed lead list/detail/update, notes, tasks, tours, messages, and merges enforce CRM role checks plus center access.
- Read-only location/lead-scope audit on July 20 checked 84 users: 84 had center-only grants and the database audit reported 0 failures. This audit did not perform credentialed live API checks (`liveChecked: 0`).
- Read-only notification audit on July 20 checked 70 active schools: 70 had a valid center email, 70 had a center-scoped leadership fallback, and 0 were missing routing recipients. This proves syntax and configured routing, not human approval or delivery.
- Focused automated tests passed: 33/33 across two-school CRM scope, missing access, inquiry routing, origins, embeds, school-prefilled handoff, invalid schools, duplicate containment, explicit invitation opt-in, and registration approval boundaries.
- A repo-scoped handoff fix adds an **Open school application** action to the selected CRM lead. It opens the public packet with that lead's active school preselected, does not put family PII in the URL, and does not automatically change stage or approve enrollment.
- Registration duplicate lookup is constrained by both school ID and normalized guardian email; the same email at two schools remains two school-scoped leads.

## Findings and open items

### BLOCKER

1. **Credentialed cross-school and role smoke is not complete.** Database scope predicates passed, but no selected-wave director/corporate accounts were used against the live API/UI in this audit.  
   Owner: Brenden.  
   Exact retest: select the wave, then use approved test accounts to prove each director sees only their school while an approved corporate role sees only its granted scope across lead list, detail, update, tour, note, task, message, merge, registration review, and global search.

2. **The selected-wave end-to-end handoff is not evidenced.** No production inquiry or registration was created because production data mutation and user contact were not authorized.  
   Owner: Brenden.  
   Exact retest: in an approved safe tenant or with approved test-family data, submit inquiry -> verify correct lead and confirmation -> schedule/complete tour -> open the pinned application -> submit with the same school/email -> director review -> verify linked family, child, guardian, enrollment, checklist, audit log, and no duplicate/cross-school record.

### REQUIRED BEFORE WAVE

1. **Notification recipients require human approval and delivery evidence.** All 70 active schools have syntactically valid primary and fallback addresses, but mailbox ownership, recipient approval, SendGrid delivery, bounce/suppression state, and reply handling were not proven.  
   Owner: Brenden.  
   Exact retest: obtain written school/corporate approval for each selected-wave primary and fallback mailbox, send an approved test inquiry, and retain the delivery event plus received-message evidence.

2. **Google Sheets backup readiness is not evidenced for the selected wave.** Code records backup attempts and supports retry, but this audit did not write a test row or verify an approved spreadsheet, access list, retention policy, or retry completion.  
   Owner: Brenden.  
   Exact retest: approve the backup destination and data handling, submit an approved test inquiry, reconcile the lead ID and center ID in the sheet, then simulate/observe a failed attempt through successful retry.

3. **The application handoff and approval-boundary changes have not passed repository-wide gates or been deployed.** Focused tests pass. The repository-wide notification suite is currently blocked by an unrelated duplicate `stripeTimestamp` declaration in `src/lib/integrations.ts`; typecheck and focused ESLint also timed out under concurrent workspace activity.
   Owner: Brenden.  
   Exact retest: after workspace contention clears, run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run vercel-build`; then promote only under separate release authorization and verify the changed flow.

4. **The remaining stage-label operating rule needs human approval and training.** The UI and API now disclose that CRM stages are operational only and block `ENROLLED` without a linked enrollment record. Earlier application stages remain follow-up labels and are not proof of completed onboarding.
   Owner: Brenden.  
   Exact retest: approve the operating rule and train selected-wave directors to reconcile stage, registration submission, review status, and linked enrollment before reporting conversion.

### FOLLOW-UP

1. **Add route-level authorization tests with a mocked data layer.** Current unit coverage proves scope helpers and routing decisions, while credentialed smoke remains the authoritative launch gate.  
   Owner: Brenden.

2. **Add a director-visible delivery-health view scoped to inquiry notification and backup attempts.** Delivery records and retry infrastructure exist, but the CRM workspace does not surface that status beside the lead.  
   Owner: Brenden.

## External decisions required

- Name the first school wave and launch dates.
- Approve one primary notification mailbox and fallback group per selected school.
- Approve the Google Sheets backup destination, access list, retention, and acceptable inquiry fields.
- Approve safe test families/accounts and whether tests may create and then retain or remove test records.
- Approve the operational rule for who may advance stages and who may approve registration into live family/child/enrollment records.
- Delegate the accountable human if it will not remain Brenden.

## Verification notes

- Isolated focused suite: passed, 33 tests, 0 failures.
- Expanded focused suite: 33 tests passed; 2 notification/integration test files could not load because the unrelated `src/lib/integrations.ts` duplicate `stripeTimestamp` declaration fails transformation.
- `npm run kidcity:audit-director-notifications -- --rows`: passed, 70/70 ready, 0 missing.
- `npm run kidcity:audit-location-leads`: database audit passed, 84/84 center-only grants, 0 failures; credentialed live checks were not run.
- `npm run typecheck`: timed out after 95 seconds with no diagnostics emitted during this continuation.
- Focused ESLint invocation: timed out after the passing tests completed; no ESLint diagnostics were emitted.

## Exact next action

Brenden names the selected rollout schools and approves test accounts/test-family data; then rerun the two read-only audits for that exact school list and execute the credentialed inquiry-to-enrollment smoke above before any wider-wave GO decision.

## Exact credentialed smoke sequence

1. Record two selected schools, A and B, plus approved corporate and school-scoped test accounts in `BRENDENS_TASKS.md`; obtain authorization for one test-family identity and the retention/removal plan.
2. Sign in as School A director and School B director in separate clean browser contexts. Confirm each CRM initially excludes the other school's known lead/control record.
3. Submit one approved inquiry for School A from an allowed public origin. Record the public confirmation, lead ID, resolved center ID, task, note, notification delivery record, and Google Sheets backup delivery record.
4. Confirm the lead appears for School A and the approved corporate account. Attempt list, direct-detail URL, update, note, task, tour, message, merge, registration review, and global-search access as School B; every access must return no data, `403`, or `404` as appropriate.
5. Verify the approved School A primary mailbox receives exactly one notification, no School B recipient receives it, reply-to works, and provider delivery/bounce/suppression evidence reconciles.
6. Verify exactly one approved School A backup row contains the same lead ID and center ID and no School B sheet/tab receives it.
7. In an approved safe environment, exercise one notification or backup failure through retry. Reconcile initial/final delivery status and attempt counts and prove no duplicate message or row.
8. From the School A CRM lead, open the school application. Confirm School A is preselected; replace the URL with an invalid center ID and confirm no school is preselected.
9. Submit the application with the same normalized guardian email. Confirm the existing School A lead is updated, no duplicate School A lead is created, and a School B lead with the same email remains separate.
10. Before approval, attempt to set the CRM stage to `ENROLLED`; require HTTP `409` and code `approved_enrollment_required`. Confirm no family, child, guardian, enrollment, or parent invitation was created by the stage attempt.
11. Approve the registration as the authorized School A director with parent invitation explicitly off. Verify the linked family, child, guardians, enrollment record, checklist, registration review, audit log, and absence from School B. Confirm no invitation was sent.
12. Set the CRM stage to `ENROLLED` only after the linked enrollment exists and confirm the API `stageSemantics` plus UI show both the operational CRM stage and the linked onboarding record stage.
13. Complete `ENROLLMENT_CRM_DELIVERY_BACKUP_EVIDENCE_TEMPLATE.md`, obtain director/corporate/technical `GO` or `NO-GO`, and record only actual approved accounts, real mailbox evidence, school selection, and signed decisions in `BRENDENS_TASKS.md`.
