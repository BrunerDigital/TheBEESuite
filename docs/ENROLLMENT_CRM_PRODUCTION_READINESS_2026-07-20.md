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

## Evidence completed

- Code review confirmed public intake rejects unknown Kid City locations, prefers active CRM-location matches, creates the lead in the resolved center, and records SendGrid notification and Google Sheets backup delivery attempts.
- Code review confirmed lead list/detail/update, notes, tasks, tours, messages, and merges enforce CRM role checks plus center access.
- Read-only location/lead-scope audit on July 20 checked 84 users: 84 had center-only grants and the database audit reported 0 failures. This audit did not perform credentialed live API checks (`liveChecked: 0`).
- Read-only notification audit on July 20 checked 70 active schools: 70 had a valid center email, 70 had a center-scoped leadership fallback, and 0 were missing routing recipients. This proves syntax and configured routing, not human approval or delivery.
- Focused automated tests passed: 18/18 across CRM scope, inquiry routing, origins, embeds, notification fallback, and registration handoff.
- A repo-scoped handoff fix adds an **Open school application** action to the selected CRM lead. It opens the public packet with that lead's active school preselected, does not put family PII in the URL, and does not automatically change stage or approve enrollment.

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

3. **The application handoff fix is local only.** It passed focused tests but has not passed the repository-wide gates or been deployed.  
   Owner: Brenden.  
   Exact retest: after workspace contention clears, run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run vercel-build`; then promote only under separate release authorization and verify the changed flow.

4. **Stage labels can be advanced manually without a corresponding application or enrollment record.** The UI supports operational pipeline tracking, while formal record creation occurs only through reviewed registration approval. Directors must not treat `APPLICATION_*` or `ENROLLED` stage values as proof of completed onboarding.  
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

- `node --import tsx --test tests/registration-handoff.test.ts tests/crm.test.ts tests/inquiry-routing.test.ts tests/inquiry-notifications.test.ts tests/inquiry-origins.test.ts tests/inquiry-embed.test.ts`: passed, 18 tests.
- `npm run kidcity:audit-director-notifications -- --rows`: passed, 70/70 ready, 0 missing.
- `npm run kidcity:audit-location-leads`: database audit passed, 84/84 center-only grants, 0 failures; credentialed live checks were not run.
- `npm run typecheck`: timed out after 184 seconds with no diagnostics emitted.
- Focused ESLint invocation: timed out after 124 seconds with no diagnostics emitted.

## Exact next action

Brenden names the selected rollout schools and approves test accounts/test-family data; then rerun the two read-only audits for that exact school list and execute the credentialed inquiry-to-enrollment smoke above before any wider-wave GO decision.
