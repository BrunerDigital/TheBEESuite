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

## 2. Consolidated workstream gate register

Apply every row to this school. Preserve the source audit's owner and exact retest. `OPEN` means the source finding has not been evidenced closed for this school; copying this packet never changes that status.

| # | Workstream and authoritative audit | BLOCKER — keep open until evidenced | REQUIRED BEFORE WAVE — keep open until evidenced | FOLLOW-UP — track without weakening launch gates | School status/evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | User and role permissions — `USER_ROLE_PERMISSIONS_PRODUCTION_READINESS_2026-07-20.md` | Credentialed two-school/selected-school evidence; executive role-only tenant fallback policy and remediation | Persistent kiosk throttling deployment proof; public trial policy; authorized-pickup routing; executive/admin MFA | Repeat the credentialed matrix per school after material access changes | `OPEN` — |
| 2 | User experience and flows — no dedicated July 20 audit present | Do not infer closure; shared role and critical-flow smoke remain open | Credentialed desktop/mobile recovery, accessibility, and no-dead-end evidence for enabled modules | Record UX defects, workarounds, owners, and retests | `OPEN` — |
| 3 | School setup and onboarding — `SCHOOL_SETUP_ONBOARDING_READINESS_AUDIT_2026-07-20.md` | Wave/owners; structure/record reconciliation; school-specific data gaps; identity/configuration evidence; signoff packet | Invitation safeguard; credentialed access; reconciliation beyond notes; assignment/guardian/pickup evidence; independent approvals | Strict selected-school semantics; named people; partial guardian readiness | `OPEN` — |
| 4 | ProCare migration — `PROCARE_MIGRATION_PRODUCTION_READINESS_AUDIT_2026-07-20.md` | Wave/owners; approved exports/mappings; dry-run/import/reconciliation; written approvals; safe large-import plan | Financial coverage; zero row errors or signed exceptions; sensitive-data/role checks; freeze/rollback window | Reconciliation download; reversal requirements; raw-row/backup retention | `OPEN` — |
| 5 | Payments and Stripe Connect — `PAYMENTS_STRIPE_CONNECT_PRODUCTION_READINESS_AUDIT_2026-07-20.md` | Connected account; Stripe packet; business enablement gate; payout reconciliation; lifecycle evidence; billing preview/opening balances | Fail-safe overrides; webhooks/replay; responsibility model; owners; first-batch/payout reconciliation | Durable evidence; automated gates; future-requirements policy | `OPEN` / `HELD OFF` — |
| 6 | Enrollment CRM — `ENROLLMENT_CRM_PRODUCTION_READINESS_2026-07-20.md` | Credentialed cross-school/role smoke; inquiry-to-enrollment handoff | Approved recipients/delivery; Sheets backup; final release gate; stage-label training | Route fixtures; delivery-health view | `OPEN` / `HELD OFF` — |
| 7 | Parent experience — `PARENT_EXPERIENCE_PRODUCTION_READINESS_2026-07-20.md` | Safe parent credential transition; three-identity isolation; guardian/PIN readiness; payment lifecycle if enabled | Multi-family behavior; documents flag/copy; delivery; kiosk/PIN device evidence; receipt standard | Announcement policy; route fixtures | `OPEN` / `HELD OFF` — |
| 8 | Teacher experience — no dedicated July 20 audit present | Do not infer closure; credentialed teacher/classroom isolation and operating-loop evidence remain open | Target-device roster, attendance, health, location, reports, incidents, media, messages, and recovery | Record retraining and device/process improvements | `OPEN` — |
| 9 | Director experience — `DIRECTOR_EXPERIENCE_PRODUCTION_READINESS_AUDIT_2026-07-20.md` | Credentialed operating loop; setup/reconciliation; billing/refund reconciliation if enabled | Final typecheck/build; target devices; alert/cron ownership and delivery; lint | Training/reconciliation drills; catalog ownership | `OPEN` — |
| 10 | Corporate dashboards — `CORPORATE_DASHBOARDS_PRODUCTION_READINESS_AUDIT_2026-07-20.md` | Tenant/center query scoping and two-tenant proof; credentialed smoke | Wave; KPI/freshness definitions; authenticated readiness; actionable paths; access/MFA; retained school evidence | Integration coverage; action queue; metric docs | `OPEN` — |
| 11 | Communications — `COMMUNICATIONS_PRODUCTION_READINESS_AUDIT_2026-07-20.md` | Signed event delivery; sender/reply authentication; suppression policy; approved recipients | Webhook config; school delivery tests; operational owner; message classification; reminders/dunning; receipt/failure notices | Event dedupe; delivery health; fallback-sender policy | `OPEN` / `HELD OFF` — |
| 12 | Reporting and analytics — `REPORTING_ANALYTICS_PRODUCTION_READINESS_2026-07-20.md` | Source reconciliation; credentialed scope/filter/deep-link/export tests | Truncation/completeness; AR and message definitions; traceability; freshness | Date validation; FTE source transition | `OPEN` — |
| 13 | Apple and Google app readiness — `APPLE_GOOGLE_APP_READINESS_AUDIT_2026-07-20.md` | Legal; Apple signing/TestFlight/privacy/store/reviewer evidence; explicit Android/PWA decision and native prerequisites if chosen | Native target-device workflows; crash ownership; accurate PWA/no-push/deep-link copy | Universal/App Links; push; native-value roadmap | `OPEN` / `NOT IN SCHOOL CUTOVER SCOPE` — |
| 14 | Security and compliance — `SECURITY_COMPLIANCE_PRODUCTION_READINESS_AUDIT_2026-07-20.md` | Credential rotation; database/Storage restore; credentialed isolation; legal/privacy | RLS release/retest; leaked-password protection; MFA; payment; retention/deletion; monitoring; Storage isolation | CSP; PITR/network/vendor posture; recurring cadence | `OPEN` — |
| 15 | Performance and QA — `PERFORMANCE_QA_PRODUCTION_READINESS_AUDIT_2026-07-20.md` | Credentialed role smoke | Target devices; load model/results; final build; rendered recovery | Cross-browser matrix; browser evidence refresh | `OPEN` — |
| 16 | Deployment and ops — `DEPLOYMENT_OPS_PRODUCTION_READINESS_AUDIT_2026-07-20.md` | Release ownership; monitoring/alerts; backup/restore and migration recovery | Build/deployment proof; Ready/health/readiness/logs/smoke; cron execution; migration recovery; escalation roster | CI optimization; probes; cron ledger | `OPEN` — |
| 17 | Rollout and training — `ROLLOUT_TRAINING_PRODUCTION_READINESS_AUDIT_2026-07-20.md` | Wave/scope; owners; training; support; stop/rollback/re-entry; signatures | Launch reviews; module training; system-of-record; independent gates; school sequencing; retained evidence | Training versions; adoption/support trends; retrospective | `OPEN` — |

Status rules: `PASS` requires the source audit's exact retest and linked evidence. `HELD OFF` means not enabled, not passed. `NOT APPLICABLE` requires a written scope reason and approval. A FOLLOW-UP may remain open only when it does not contradict a higher gate or enabled-module safety control.

## 3. Accepted human ownership

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

### Owner acceptance form

Assignment without recorded acceptance is not delegation.

| Responsibility | Acceptance statement | Owner name | Acceptance evidence/method | Accepted date/time | Backup confirmed? |
| --- | --- | --- | --- | --- | --- |
| Corporate launch | I accept this school's scope, coverage, escalation, and evidence obligations. |  |  |  |  |
| Director signoff | I accept school validation, staff readiness, and the final Director decision. |  |  |  |  |
| Data/import | I accept reconciliation, exceptions, freeze, rollback, and evidence ownership. |  |  |  |  |
| Billing/Stripe | I accept billing preview, reconciliation, stop, refund, and dispute ownership. |  |  |  |  |
| Technical release | I accept release gates, recovery, monitoring, smoke, and rollback ownership. |  |  |  |  |
| Training | I accept curriculum, attendance, competency, remediation, and version evidence. |  |  |  |  |
| First-week support | I accept coverage, response, issue intake, reviews, and handoff ownership. |  |  |  |  |
| Stop/rollback authority | I accept authority to pause an affected module when a stop condition occurs. |  |  |  |  |

## 4. Role training attendance and competency evidence

Use approved test data; never expose another family's or school's data in training.

| Audience | Required topics/scenario | Guide and revision | Trainer | Attendees/completion date | Practical check result | Remediation/retest |
| --- | --- | --- | --- | --- | --- | --- |
| Corporate/executive | school scope, readiness, access, imports, FTE, billing visibility, escalation |  |  |  |  |  |
| Director | daily operations, parent support, incidents/documents, reports, escalation |  |  |  |  |  |
| Billing | invoices, pending/failed payments, reconciliation, refunds/disputes |  |  |  |  |  |
| Teacher | tablet login, roster, attendance, health/location, reports, incidents/media, offline recovery |  |  |  |  |  |
| Front desk/kiosk | credentials, authorization/custody warnings, duplicate prevention, fallback |  |  |  |  |  |
| Parent/family instructions | setup, correct-family check, PIN, notifications, privacy, support |  |  |  |  |  |

| Attendee | Role | School/location ID | Session/version | Date | Scenario | Result | Remediation owner/date | Retest evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |

- [ ] Every role using an enabled module completed its practical check.
- [ ] Failed or missed training has a named owner, scheduled remediation, and completed retest.
- [ ] Staff know which workflows remain in ProCare.
- [ ] Staff know the issue intake method and stop conditions.

## 5. Support schedule and launch-week coverage

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

### Launch-week review record

| Review date/time | Coverage/attendance | New issues by severity | Reconciliation result | Invitation/kiosk state | Billing/payment state | Stop/continue decision | Decision owner | Actions/owners/dates | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |

## 6. Stop, rollback, and re-entry

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

## 7. Separate activation decisions

| Gate | Decision and exact scope | Decision owner | Date/time | Evidence/conditions |
| --- | --- | --- | --- | --- |
| Operations/CRM | `GO` / `NO-GO` |  |  |  |
| Parent invitations | `GO` / `NO-GO` |  |  |  |
| Kiosk/PIN | `GO` / `NO-GO` |  |  |  |
| Billing/invoices | `GO` / `NO-GO` |  |  |  |
| Live payments/payouts | `GO` / `NO-GO` |  |  |  |
| ProCare retirement | `GO` / `NO-GO` |  |  |  |

## 8. Final signoff packet

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
