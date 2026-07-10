# Risk Matrix, Contingencies, And Rollback

Last updated: July 9, 2026

Use this document whenever a school has a blocker, a live-operational issue, or a possible reason to pause ProCare retirement.

## Severity Levels

| Severity | Definition | Response target |
| --- | --- | --- |
| P0 | Live system down, data exposure, wrong-school visibility, payment misrouting, parent sees wrong family | Immediate stop and executive escalation |
| P1 | Critical workflow broken: import failure, missing active children, kiosk unusable, billing cannot reconcile | Same business day remediation |
| P2 | Important issue with workaround: report mismatch, notification issue, non-critical data cleanup | 1-3 business days |
| P3 | Cosmetic issue or enhancement | Backlog or training refresh |

## Risk Matrix

| Risk | Impact | Likelihood | Owner | Prevention | Trigger | Contingency |
| --- | --- | --- | --- | --- | --- | --- |
| Wrong school data visible | Critical privacy and trust failure | Low | CTO | Role smoke tests, scoped access, parent test account | Any user sees another school/family | Stop affected access, disable parent invites, investigate audit logs |
| Import maps to wrong center | Corrupt records, cross-school data | Low | CTO/implementation | Confirm `locationId`, preview before commit | Preview shows wrong school or unexpected duplicates | Stop import, discard batch, correct mapping |
| ProCare export incomplete | Missing families, staff, balances | Medium | Director/export owner | Export inventory checklist | Counts do not match | Request new export, hold school in migration |
| Encrypted export cannot be decrypted | Migration delay | Medium | ProCare admin | Confirm export format before kickoff | Files unusable | Use approved ProCare admin process, reschedule import |
| Duplicate families/guardians | Parent confusion, billing errors | High | Implementation lead | Duplicate review and matching rules | Duplicate groups unresolved | Hold parent invites and billing until merged |
| Custody or pickup restriction missing | Child safety risk | Medium | Director | Required sample review of restricted records | Missing restriction or wrong pickup | Block kiosk/parent access for affected family |
| Medical/allergy data missing | Child safety risk | Medium | Director | Review all medical/allergy records | Missing or wrong note | Block classroom use for affected child until corrected |
| Billing balances do not match | Parent disputes, revenue errors | High | Billing owner | Billing validation checklist | Balance total mismatch | Keep billing in ProCare, correct ledger/import |
| Tuition plan is wrong | Incorrect recurring invoices | Medium | Billing owner | Tuition plan validation | Wrong rate/cadence/discount | Disable invoice generation for school |
| Stripe Connect incomplete | Payments cannot launch | High | Billing owner | Payout preflight | Charges/payouts not enabled | Keep checkout disabled, use ProCare/current payment process |
| Payment routed incorrectly | Critical financial issue | Low | CTO/billing | Connected account verification and test payment | Wrong destination/account | Disable checkout, refund/reconcile, escalate |
| Kiosk check-in fails | School operations disrupted | Medium | Operations | Device and PIN/QR testing | Check-in/out fails during drop-off | Use paper fallback and ProCare attendance |
| Teacher sees wrong classroom | Data/privacy risk | Medium | Operations | Staff/classroom role smoke | Teacher sees wrong roster | Disable teacher account, correct assignment |
| Parent adoption too low | Dual-system burden remains | Medium | Customer success | Parent communication timeline | Adoption under threshold | Extend parallel period, send adoption campaign |
| Director overloaded | Rollout slows or data untrusted | Medium | VP Operations | Batch office hours, simple checklist | Director misses validation windows | Assign temporary corporate support |
| One specialist overloaded | Delays across wave | Medium | Enterprise implementation | Dashboard by exception, standard packets | Blocker aging increases | Add escalation triage or reduce active wave |
| Production app health issue | Rollout disruption | Low/medium | CTO | Release checks and monitoring | Health/readiness fail | Pause rollout actions, resolve incident |
| Email/domain delivery issue | Parents/staff do not receive invites | Medium | CTO/customer success | Domain verification and test sends | Bounces or missing invites | Use manual resend and alternate verified sender |
| Device shortage | Kiosk/tablet training blocked | Medium | Operations | Device inventory in Phase 1 | Front desk/classrooms lack device | Use shared device or paper fallback |
| Staff resistance or low comfort | Incomplete adoption | Medium | Customer success | Training schedule and refreshers | Staff avoid Bee Suite | Targeted retraining and director coaching |
| Public website/location mismatch | School omitted from rollout | Medium | Corporate ops | Location master reconciliation | School not in Bee Suite master | Add to master, score, schedule future wave |

## Contingency Plans

### ProCare Export Missing Or Unusable

1. Keep the school in ProCare-only operation.
2. Mark the school `Hold - export blocker`.
3. Request a new unencrypted export.
4. Confirm export owner and timeline.
5. Do not manually recreate large datasets unless leadership approves a reduced-scope launch.
6. Re-run import preview after new export is available.

### Import Preview Fails

1. Stop before commit.
2. Save preview errors to the evidence packet.
3. Confirm target school and location ID.
4. Review duplicate logic and required columns.
5. Clean a working copy of the data, not the original export.
6. Re-run preview.
7. Escalate to technical owner if errors repeat.

### Data Counts Do Not Reconcile

1. Keep ProCare as the control record.
2. Identify which count differs: child, family, guardian, staff, classroom, balance, attendance, document.
3. Review source export scope: active only, inactive included, current year, all history.
4. Review skipped rows and duplicate merges.
5. Document approved exceptions.
6. Block go-live until critical counts are reconciled or approved.

### Billing Or Balance Mismatch

1. Disable invoice generation and parent checkout for that school.
2. Keep billing in ProCare/current process.
3. Compare tuition plan, recurring charges, discounts, subsidies, credits, voids, balances, and open invoices.
4. Correct ledger/import data with evidence.
5. Re-run billing preview.
6. Director and billing owner sign off before any parent payment communication.

### Stripe Connect Not Ready

1. Leave parent checkout disabled.
2. Confirm connected account owner and legal business details.
3. Complete Stripe-hosted onboarding.
4. Refresh status in The Bee Suite.
5. Verify charges enabled, payouts enabled, no open requirements.
6. Run approved test or pilot payment path.
7. Update parent communication only after payment approval.

### Kiosk Or Device Failure

1. Use ProCare or paper sign-in as the official control record.
2. Log device, browser, school, user, time, and workflow.
3. Confirm internet, device session, kiosk URL, and school scope.
4. Confirm guardian PIN/QR and authorized pickup status.
5. Re-test check-in/out with director present.
6. Do not rely on Bee Suite attendance until the test passes.

### Parent Portal Visibility Issue

1. Disable parent access for affected school or family.
2. Capture safe evidence: school, user, URL, timestamp, expected family, visible family.
3. Escalate as P0.
4. Review guardian-family links, access grants, and audit logs.
5. Do not resume invites until technical owner clears the issue.
6. Notify leadership and affected parties according to approved privacy process.

### Staff Training Failure

1. Keep ProCare as the control workflow.
2. Identify workflow gap: login, classroom roster, attendance, daily report, incident, message, device.
3. Assign staff to refresher session.
4. Have teacher complete role smoke test with director.
5. Track completion in dashboard.
6. Block final cutover if classroom leads are not ready.

### Director Does Not Approve Data

1. Keep school in parallel operation.
2. Capture director's unresolved concerns.
3. Assign each concern an owner and severity.
4. Correct and revalidate.
5. Do not overrule a director on child safety, custody, medical, roster, or billing accuracy.
6. Escalate to corporate operations only if the concern is non-critical and documented.

## Rollback Procedure

Rollback means temporarily returning the affected workflow or school to ProCare as the operational source of truth after Bee Suite parallel or go-live use has begun.

### Rollback Principles

- ProCare is the fallback system until final retirement is complete and approved.
- Prefer module-level rollback over full-school rollback when possible.
- Preserve every Bee Suite write made since the rollback point.
- Do not delete production data unless the technical owner and executive sponsor approve a documented correction.
- Communicate clearly to directors and staff which system is official during rollback.

### Rollback Triggers

- Cross-location, wrong-family, custody, medical, or billing visibility.
- Payment misrouting, duplicate payment, or unreconciled live payment issue.
- Attendance/kiosk cannot be trusted during live operation.
- Billing balances or tuition invoices cannot be trusted.
- Production outage blocks core school operations.
- Director or leadership loses trust in imported data.
- Critical bug occurs during the 14-day stability window.

### Immediate Rollback Steps

1. Declare rollback scope:
   - Attendance only.
   - Billing only.
   - Parent portal only.
   - Payments only.
   - Full school.
2. Pause affected Bee Suite workflow:
   - Disable parent checkout.
   - Pause parent invites.
   - Disable kiosk/live attendance if needed.
   - Stop invoice generation if needed.
3. Communicate to school:
   - Which system is official now.
   - Which workflows continue in Bee Suite.
   - Which workflows return to ProCare.
   - Who to contact for support.
4. Preserve evidence:
   - School.
   - Users affected.
   - Time and timezone.
   - URLs.
   - Import batch ID.
   - Screenshots if safe.
   - Audit logs.
   - Bee Suite records created since rollback point.
5. Reconcile:
   - Export Bee Suite changes since rollback point.
   - Enter required official changes into ProCare if ProCare is control.
   - Mark Bee Suite records as pending review if needed.
6. Fix:
   - Assign technical, data, billing, or training owner.
   - Test in safe environment or with controlled record.
   - Re-run role smoke tests.
7. Resume:
   - Resume only after owner approval.
   - Record the new parallel validation start date.
   - Restart the 14-day no-critical-bug window if a P0/P1 occurred.

### Module-Level Rollback Details

| Module | Rollback action | Re-entry criteria |
| --- | --- | --- |
| Attendance/kiosk | Use ProCare/paper as official attendance; Bee Suite read-only or test only | Kiosk tests pass, reconciliation stable, director approves |
| Billing | Use ProCare/current billing; stop Bee Suite invoices/payment requests | Balances and tuition verified, billing owner approves |
| Payments | Disable checkout/autopay/payment links | Stripe ready, reconciliation tested, finance approves |
| Parent portal | Pause invites or disable affected accounts | Family visibility verified, parent test passes |
| Messaging | Use existing school communication process | Templates and delivery verified |
| Staff/tablets | Use existing classroom process | Teacher role smoke tests pass |
| Documents | Use existing retention process | Document visibility and upload review pass |

### Rollback Communication Template

```text
Subject: Temporary workflow update for [School Name]

Team,

We are temporarily moving [workflow/module] back to ProCare/current process while we resolve a Bee Suite issue.

Effective immediately:
- Official system for [workflow]: ProCare/current process
- Bee Suite status for [workflow]: paused/test only/read-only
- Other Bee Suite workflows: [continue/pause]

Please do not enter live [workflow] records in The Bee Suite until we send a resume notice.

Support owner:
Expected next update:
```

### Resume Communication Template

```text
Subject: Bee Suite [workflow/module] resumed for [School Name]

Team,

The [workflow/module] issue has been resolved and validated.

Effective [date/time]:
- Official system for [workflow]: [ProCare + Bee Suite parallel / Bee Suite]
- Required staff action:
- Director verification:
- Support contact:

We will continue monitoring and reconciling daily.
```

## Post-Incident Review

Complete within five business days after any P0/P1 or rollback.

- What happened?
- Which schools, users, families, children, invoices, or records were affected?
- What was the customer impact?
- What was the operational impact?
- What data was changed?
- What was the rollback scope?
- How was ProCare reconciled?
- What fix was made?
- What test prevents recurrence?
- What training or process change is needed?
- Who approved resume?
