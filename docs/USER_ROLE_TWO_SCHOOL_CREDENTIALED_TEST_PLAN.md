# User and Role Permissions: Two-School Credentialed Test Plan

Date: July 20, 2026

Status: Reusable evidence template. Completing this document does not authorize invitations, billing, deployment, or cutover.

## Purpose and stop rule

Use two approved schools, called **School A** and **School B**, to prove positive access inside each account's assigned scope and negative access outside it. Any cross-tenant, cross-school, cross-family, or cross-classroom visibility or mutation is a **BLOCKER**. Stop testing, preserve the evidence, revoke or disable the affected test session if authorized, and escalate to Brenden and the technical release owner.

Do not use production customer accounts or production data unless Brenden separately authorizes the exact accounts, schools, test window, and allowed actions. Prefer approved staging or safe test tenants with synthetic records.

## Test identity and data prerequisites

Record values without writing passwords, reset links, PINs, session cookies, or tokens into this file.

| Item | School A | School B |
| --- | --- | --- |
| School name |  |  |
| Tenant ID |  |  |
| Center ID |  |  |
| Classroom 1 ID/name |  |  |
| Classroom 2 ID/name |  |  |
| Test family ID/name |  |  |
| Test child ID/name |  |  |
| Executive account email |  |  |
| Director account email |  |  |
| Billing account email |  |  |
| Teacher 1 account email/classroom |  |  |
| Teacher 2 account email/classroom |  |  |
| Parent account email/family |  |  |
| Authorized-pickup account email, if approved |  |  |
| Kiosk device/browser |  |  |
| Public inquiry location selection |  |  |

For every credentialed account, verify before login: active application user, expected role, tenant ID, active access grant, grant scope, center IDs, staff/classroom assignment where applicable, Supabase Auth state, password-reset state, and device-session state.

## Evidence rules

- Use a new private browser profile for each account and clear it between roles.
- Capture timestamp, environment, commit/deployment identifier, route, expected scope, actual result, and screenshot or sanitized response reference.
- Record positive and negative tests. A successful in-scope action without a corresponding cross-scope denial is incomplete.
- Never capture credentials, PIN digits, full child medical/custody notes, payment details, tokens, or session cookies.
- Use only reversible synthetic mutations. Record created record IDs and cleanup ownership; do not clean up production records without authorization.

## Credentialed role matrix

Use `PASS`, `FAIL`, `BLOCKED`, or `NOT APPLICABLE`.

| ID | Role | Positive test | Required negative isolation test | A | B | Evidence reference |
| --- | --- | --- | --- | --- | --- | --- |
| EX-01 | Tenant executive | View both explicitly granted schools and tenant rollups | Attempt another tenant's route/resource ID; receive no data and 403/404 |  |  |  |
| EX-02 | Scoped executive/regional | View granted school only | School B is absent from filters and direct School B IDs are denied |  |  |  |
| EX-03 | Executive without grant | Sign in only if policy permits | No implicit tenant-wide dashboard or center access |  |  |  |
| DR-01 | Director | View and update School A operational test record | Direct School B family, staff, document, report, and message IDs denied |  |  |  |
| BI-01 | Billing admin | View School A invoices/payments permitted by policy | School B billing, family, refund, settings, and export IDs denied |  |  |  |
| TE-01 | Teacher | View and update assigned Classroom 1 child attendance/report/incident/media | Classroom 2 and School B child IDs denied on every mutation endpoint |  |  |  |
| TE-02 | Unassigned teacher | Reach only allowed recovery/profile state | All child and classroom mutations denied |  |  |  |
| PA-01 | Parent/guardian | View linked family and child records | Another family in School A and any School B family IDs denied |  |  |  |
| PA-02 | Parent billing/docs | View own invoices, documents, incidents, media, and preferences | Another family's invoice/document/incident/media IDs denied |  |  |  |
| KI-01 | Guardian kiosk | Valid School A PIN/QR exposes only linked children | Same credential at School B fails; injected unrelated child ID denied |  |  |  |
| KI-02 | Staff kiosk | Valid School A staff credential records permitted clock action | Same credential at School B fails; repeated invalid attempts reach 429 |  |  |  |
| PU-01 | Public inquiry | Submit synthetic inquiry to selected School A | School selection cannot route the lead to School B or another tenant |  |  |  |
| PU-02 | Trial onboarding | Approved trial request creates an isolated trial workspace | Existing customer tenant, centers, users, or grants are never attached or exposed |  |  |  |
| AP-01 | Authorized pickup | Perform only the approved pickup workflow | Parent family data, billing, documents, messages, and notifications remain unavailable |  |  |  |
| SE-01 | Session lifecycle | Active session works and records correct actor | Deactivation, password/session-version change, or device revocation invalidates session |  |  |  |

## Direct-object denial set

For each negative test, use a known synthetic School B identifier while authenticated as School A. Exercise both UI navigation and the corresponding request where permitted:

- center, classroom, family, child, guardian, staff profile;
- lead/tour, message/thread, document/signature request, incident, daily report/media;
- billing account, invoice, payment/refund reference, report/export;
- access grant, integration, notification, audit record.

Expected result: the resource is absent or the request returns 403/404 without disclosing its name, family, school, balance, document metadata, or other protected fields.

## Defect and retest record

| Defect ID | Classification | Role/account | School/resource boundary | Expected | Actual | Owner | Workaround | Fix reference | Retest result/evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  | BLOCKER / REQUIRED BEFORE WAVE / FOLLOW-UP |  |  |  |  |  |  |  |  |

## Completion record

- Test environment and URL:
- Commit/deployment identifier:
- Test start/end timestamps and time zone:
- Tester:
- School A result:
- School B result:
- Outstanding defects:
- Technical reviewer:
- Director reviewer for School A:
- Director reviewer for School B:
- Brenden decision: `ACCEPTED`, `RETEST REQUIRED`, or `NO-GO`
- Decision date and exact scope:

The wider wave remains **NO-GO** until this evidence and every shared readiness signoff pass. Kokomo may continue normal production use.
