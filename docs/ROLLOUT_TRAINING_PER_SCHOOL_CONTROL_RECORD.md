# Rollout and Training Per-School Control Record

Copy this file once per selected school. Keep `[ ]` items open until dated evidence exists. Completing this record does not override any gate in `SCHOOL_ROLLOUT_READINESS_CHECKLIST_2026-07-18.md`.

## 1. School and launch scope

- School name:
- Center/location ID (`ST | City`; this is one shared identifier):
- Time zone:
- Proposed launch date/time:
- Parallel-operation start and minimum duration:
- Evidence packet location:
- Current decision: `NO-GO` / `GO WITH PAYMENTS OFF` / `GO FOR NAMED MODULES`

| Module/workflow | Operational at launch? | System of record | Activation date/time | Evidence/exception |
| --- | --- | --- | --- | --- |
| CRM/inquiries |  |  |  |  |
| Family/child/classroom operations |  |  |  |  |
| Attendance/teacher workflows |  |  |  |  |
| Parent portal invitations | **SEPARATE GATE** |  |  |  |
| Kiosk/PIN | **SEPARATE GATE** |  |  |  |
| Billing/invoices | **SEPARATE GATE** |  |  |  |
| Live payments/payouts | **SEPARATE GATE** |  |  |  |
| Reports/FTE |  |  |  |  |
| ProCare retirement | **FINAL CUTOVER GATE** |  |  |  |

## 2. Accepted human ownership

Brenden remains accountable until delegation is explicit and accepted.

| Responsibility | Primary name/contact | Backup name/contact | Acceptance date | Coverage window |
| --- | --- | --- | --- | --- |
| Corporate launch owner |  |  |  |  |
| Director signoff owner |  |  |  |  |
| Data/import and reconciliation |  |  |  |  |
| Billing/Stripe |  |  |  |  |
| Technical release |  |  |  |  |
| Training |  |  |  |  |
| First-week support |  |  |  |  |
| Stop/rollback authority |  |  |  |  |

## 3. Role training evidence

Use approved test data; never expose another family's or school's data in training.

| Audience | Required topics/scenario | Guide and revision | Trainer | Attendees/completion date | Practical check result | Remediation/retest |
| --- | --- | --- | --- | --- | --- | --- |
| Corporate/executive | school scope, readiness, access, imports, FTE, billing visibility, escalation |  |  |  |  |  |
| Director | daily operations, parent support, incidents/documents, reports, escalation |  |  |  |  |  |
| Billing | invoices, pending/failed payments, reconciliation, refunds/disputes |  |  |  |  |  |
| Teacher | tablet login, roster, attendance, health/location, reports, incidents/media, offline recovery |  |  |  |  |  |
| Front desk/kiosk | credentials, authorization/custody warnings, duplicate prevention, fallback |  |  |  |  |  |
| Parent/family instructions | setup, correct-family check, PIN, notifications, privacy, support |  |  |  |  |  |

- [ ] Every role using an enabled module completed its practical check.
- [ ] Failed or missed training has a named owner, scheduled remediation, and completed retest.
- [ ] Staff know which workflows remain in ProCare.
- [ ] Staff know the issue intake method and stop conditions.

## 4. Support and launch-week coverage

- Support intake method/link/number:
- Published support hours and time zone:
- After-hours contact:
- School escalation contact:
- Corporate escalation contact:
- Technical escalation contact:
- Billing escalation contact if payments are enabled:

| Severity | School-specific definition | Initial response target | Primary/backup | Escalation trigger |
| --- | --- | --- | --- | --- |
| P0 | Safety, unauthorized data access, wrong-family/wrong-school exposure, or incorrect payment routing | Immediate stop and executive escalation |  | Any suspected P0 condition |
| P1 | Critical operating workflow unavailable with no safe workaround | Same business day remediation |  | Workflow cannot safely continue |
| P2 | Material issue with a documented safe workaround | 1-3 business days |  | Workaround fails or risk increases |
| P3 | Cosmetic issue or training/enhancement request | Backlog or training refresh |  | Reclassification by support owner |

| Review | Date/time | Facilitator | Required attendees | Evidence/decisions location |
| --- | --- | --- | --- | --- |
| Prelaunch readiness |  |  |  |  |
| Launch-day morning |  |  |  |  |
| Launch-day midday |  |  |  |  |
| Launch-day end-of-day reconciliation |  |  |  |  |
| Day-1 director check-in |  |  |  |  |
| First billing review, if enabled |  |  |  |  |
| Week-1 review |  |  |  |  |

## 5. Stop, rollback, and re-entry

Default stop conditions include data mismatch, unauthorized access, incorrect payment routing/reconciliation, missing required training, unavailable support owner, and unresolved critical defect.

| Workflow/module | Stop condition and decision authority | Immediate containment | Authoritative system during stop | Preserve/export BEE Suite writes | Reconciliation owner | Re-entry evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Operations/CRM | Wrong-school routing, missing/duplicated records, unauthorized visibility, or critical workflow failure; named stop authority decides | Pause affected module and use the approved prior process | ProCare or the approved existing school process until written re-entry | Required; retain timestamps, audit evidence, and all new records |  | Correct scope/data proven, role smoke passes, owner approves |
| Attendance/classroom | Attendance, custody, medical, pickup, location, or roster state cannot be trusted; named stop authority decides | Disable live kiosk/attendance workflow; use approved paper/ProCare procedure | ProCare/paper attendance process | Required; reconcile every event since rollback point |  | Kiosk/teacher tests pass, attendance reconciles, director approves |
| Parent invitations/portal | Wrong-family visibility, incorrect guardian link, custody restriction failure, or unavailable support; named stop authority decides | Pause invitations and disable affected access | ProCare and existing school communication process | Required; retain invite/delivery/access evidence |  | Family scope and parent test pass; director approves |
| Kiosk/PIN | PIN, authorization, custody warning, duplicate prevention, or attendance audit cannot be trusted; named stop authority decides | Disable live kiosk workflow | ProCare/paper attendance process | Required; reconcile every affected attendance event |  | Kiosk scenarios pass; director approves |
| Billing/invoices | Balances, tuition, credits, invoices, or family assignment cannot be trusted; billing owner or stop authority decides | Pause invoice generation and billing actions | ProCare/current approved billing process | Required; preserve ledger and invoice evidence |  | Balances and tuition reconcile; billing owner approves |
| Payments/payouts | Misrouting, duplicate charge, failed reconciliation, wrong invoice/family, or unresolved Stripe requirement; billing owner or stop authority decides | Pause checkout, autopay, and payment links; escalate immediately | Previously approved payment process; do not create replacement charges without accounting approval | Required; preserve Stripe IDs, webhook, invoice, ledger, and payout evidence |  | Stripe ready, end-to-end reconciliation passes, finance approves |

- [ ] Rollback scope favors the smallest safe module-level rollback.
- [ ] ProCare remains the source of truth until written cutover approval.
- [ ] No BEE Suite records are deleted or overwritten during rollback.
- [ ] Staff communication identifies the authoritative system and effective time.
- [ ] Re-entry requires defect resolution, reconciliation, retraining if needed, and written approval.

## 6. Separate activation decisions

| Gate | Decision and exact scope | Decision owner | Date/time | Evidence/conditions |
| --- | --- | --- | --- | --- |
| Operations/CRM | `GO` / `NO-GO` |  |  |  |
| Parent invitations | `GO` / `NO-GO` |  |  |  |
| Kiosk/PIN | `GO` / `NO-GO` |  |  |  |
| Billing/invoices | `GO` / `NO-GO` |  |  |  |
| Live payments/payouts | `GO` / `NO-GO` |  |  |  |
| ProCare retirement | `GO` / `NO-GO` |  |  |  |

## 7. Final acknowledgements and signatures

- [ ] Underlying automated readiness report has no unresolved gap for this school.
- [ ] Data/import reconciliation and exceptions are approved.
- [ ] Required role/access and workflow evidence passed.
- [ ] Training completion is evidenced for every enabled module.
- [ ] Support coverage, stop conditions, rollback, and launch-week reviews are acknowledged.
- [ ] Parent invitation/kiosk and billing/payment decisions remain separately recorded.

| Approval | Name | Decision/scope | Date/time | Signature or approved evidence link | Exceptions |
| --- | --- | --- | --- | --- | --- |
| Director |  |  |  |  |  |
| Corporate |  |  |  |  |  |
| Billing/accounting (`NOT ENABLED` permitted when held off) |  |  |  |  |  |
| Technical/release |  |  |  |  |  |
| ProCare cutover |  |  |  |  |  |

Final school decision: `NO-GO` / `GO WITH NAMED HOLDS` / `GO FOR NAMED MODULES`  
Decision time and time zone:  
Decision owner:  
Open holds and owners:
