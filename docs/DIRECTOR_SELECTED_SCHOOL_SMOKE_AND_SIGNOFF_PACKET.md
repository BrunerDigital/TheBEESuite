# Selected-School Director Smoke and Signoff Packet

Status: reusable evidence template. Completing this packet does not authorize production data changes, parent invitations, billing, deployment, or ProCare retirement.

Use one copy per selected school. The wider wave remains **NO-GO** until all shared signoffs pass. Kokomo may continue normal production use.

## 1. Selection and control record

Do not record passwords, PINs, tokens, session cookies, full payment details, medical details, or custody-note text.

| Field | Value |
| --- | --- |
| School name |  |
| Center/location ID (`ST | City`) |  |
| Tenant/organization |  |
| Environment and URL |  |
| Commit/deployment ID |  |
| Test window and time zone |  |
| Intended live modules |  |
| Modules held off |  |
| Director account email/role |  |
| Billing account email/role, if separate |  |
| Comparison school and synthetic record IDs |  |
| Desktop/browser |  |
| Tablet/mobile/browser |  |
| Tester |  |

Stop immediately for cross-school visibility, unexplained source mismatch, unauthorized mutation, incorrect custody/medical exposure, payment/refund mismatch, missing audit history, or an unrecoverable critical workflow. Preserve sanitized evidence and notify the named technical owner and Brenden.

## 2. Required owners

| Responsibility | Primary owner | Backup | Acceptance/date |
| --- | --- | --- | --- |
| Director operational signoff |  |  |  |
| Data/ProCare reconciliation |  |  |  |
| Billing, refunds, and accounting |  |  |  |
| Technical release and defect retest |  |  |  |
| Alert delivery and first-week support |  |  |  |
| Stop/rollback authority |  |  |  |

## 3. Evidence rules

- Use approved staging or a safe test tenant unless the exact production accounts, records, window, and reversible actions are separately authorized.
- Use synthetic School A records and known synthetic School B identifiers for negative isolation tests.
- Record timestamp, route, action, expected result, actual result, and sanitized screenshot/response/audit reference.
- Use `PASS`, `FAIL`, `BLOCKED`, or `NOT APPLICABLE`. Every `FAIL` or `BLOCKED` row needs one owner and an exact retest.
- Cross-reference `USER_ROLE_TWO_SCHOOL_CREDENTIALED_TEST_PLAN.md`, `SCHOOL_SETUP_ONBOARDING_READINESS_AUDIT_2026-07-20.md`, `ENROLLMENT_CRM_PRODUCTION_READINESS_2026-07-20.md`, `PAYMENTS_STRIPE_CONNECT_PRODUCTION_READINESS_AUDIT_2026-07-20.md`, and `REPORTING_ANALYTICS_PRODUCTION_READINESS_2026-07-20.md` rather than weakening their gates here.

## 4. Exact credentialed Director smoke sequence

| ID | Sequence and expected result | Result | Evidence/defect |
| --- | --- | --- | --- |
| DR-01 | Sign in with the selected school's active Director account. Confirm role, school identity, and expected modules; verify another school is absent from selectors. |  |  |
| DR-02 | Open Dashboard. Reconcile enrolled children, present/absent counts, staffing/ratio warnings, incidents, documents, billing/AR, FTE, and alert counts to source records. |  |  |
| DR-03 | Open School Setup. Verify identity, address, time zone, hours, classrooms, ratios, notification recipients, and completion state. Save only an approved reversible test field, then verify audit history. |  |  |
| DR-04 | Open CRM. Create or use an approved synthetic inquiry, verify selected-school routing, approve/follow up, schedule a tour, advance the pipeline, and confirm enrollment handoff without another school's leads appearing. |  |  |
| DR-05 | Open Families/Children. Verify one approved test family, guardians, pickups, custody warning presence without exposing restricted text in evidence, classroom/schedule, tuition, documents, messages, and history. Perform one reversible approved update and verify the audit trail. |  |  |
| DR-06 | Open Staff. Verify active/former staff separation, classroom assignment, schedule/coverage, time card, credential checklist, and permission controls. Perform one reversible schedule or time-card correction and verify its record. |  |  |
| DR-07 | Open Attendance. Check in/out an approved synthetic child, reject a duplicate/invalid transition, confirm current classroom/location and dashboard counts, and verify the audit log. |  |  |
| DR-08 | Open Daily Reports/Incidents. Review an incomplete report or incident, exercise validation recovery, complete Director review/follow-up, and verify parent-notification/acknowledgement state without contacting a real family. |  |  |
| DR-09 | Open Documents/Compliance. Review requested/approved/rejected/expiring states, verify restricted-document handling, send no real email, and confirm checklist/export scope for the selected school only. |  |  |
| DR-10 | Open FTE. Verify the selected week, calculated totals, deadline/status, correction rules, history, and escalation state; prove a School B center/report ID is denied. |  |  |
| DR-11 | Open Analytics/Reports. Reconcile CRM, attendance, billing, messages, and staff-hours totals; test date/school filters; export CSV/PDF; record truncation/completeness and traceability evidence. |  |  |
| DR-12 | Open Notifications. Verify unread/archived state, preferences, Director recipients, FTE/document/billing alert categories, not-found recovery, and school scope. Do not trigger external delivery without authorization. |  |  |
| DR-13 | Open Billing. Reconcile family balance, invoices, credits, payments, and ledger. Create/edit/void only approved test records; verify duplicate prevention, error recovery, and audit history. |  |  |
| DR-14 | If financial testing is separately authorized, execute one approved partial refund against an original refundable test payment. Reconcile Stripe refund ID, connected account, payment status, invoice, family balance, ledger, audit entry, receipt/support record, and refundable remainder. Otherwise mark `BLOCKED`, not `PASS`. |  |  |
| DR-15 | Prove isolation using known School B IDs for family, staff, lead, document, incident, FTE report, report export, invoice/payment/refund reference, notification, and setup center. Expect no data plus 403/404 without protected metadata. |  |  |
| DR-16 | Repeat the critical read and recovery paths on the named tablet/mobile device. Capture page identity, meaningful content, no framework overlay, console health, screenshot evidence, and at least one state-changing interaction. |  |  |
| DR-17 | Sign out, revoke or invalidate the approved test session if part of the plan, and confirm protected routes no longer expose Director data. Record cleanup ownership for synthetic records. |  |  |

## 5. Reconciliation evidence

| Domain | BEE Suite total/state | Approved source total/state | Difference | Explanation/owner | Approved |
| --- | --- | --- | --- | --- | --- |
| Families/children/guardians/classrooms |  |  |  |  |  |
| Staff/schedules/time cards |  |  |  |  |  |
| CRM leads/tours/enrollments |  |  |  |  |  |
| Attendance/current locations |  |  |  |  |  |
| Incidents/documents |  |  |  |  |  |
| FTE selected week |  |  |  |  |  |
| Report exports |  |  |  |  |  |
| Alerts/recipient coverage |  |  |  |  |  |
| Invoices/payments/credits/open AR |  |  |  |  |  |
| Refund/payout evidence, if enabled |  |  |  |  |  |

## 6. Defects and retests

| ID | BLOCKER / REQUIRED BEFORE WAVE / FOLLOW-UP | Workflow | Expected | Actual | Owner | Fix/workaround | Exact retest | Result/evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |

## 7. Signoff

- Director operational decision: `GO / NO-GO / GO WITH EXCEPTIONS`
- Director owner, signature/date, and exact module scope:
- Data/ProCare reconciliation decision and owner/date:
- Billing/accounting decision and owner/date: `GO / NO-GO / NOT ENABLED`
- Technical/release decision and owner/date:
- Support/rollback acknowledgement and owner/date:
- Brenden final decision/date:
- Parent invitations gate: `GO / NO-GO / NOT IN SCOPE`
- Billing/payments gate: `GO / NO-GO / NOT IN SCOPE`
- ProCare retirement gate: `GO / NO-GO / NOT IN SCOPE`

One gate never authorizes another. Any unresolved BLOCKER keeps the selected school and wider wave NO-GO.
