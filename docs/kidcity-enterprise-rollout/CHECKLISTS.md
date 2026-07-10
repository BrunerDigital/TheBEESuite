# Rollout Checklists

Last updated: July 9, 2026

Use these checklists as the operating controls for each school. Each school should have one evidence packet containing completed checklist copies, validation reports, screenshots where safe, exception notes, and signoffs.

## Corporate Checklist

Complete before contacting the school.

### Location And Profile

- [ ] Confirm school is in `public/kidcity-locations.json` or the corporate rollout master.
- [ ] Confirm school should be included in this wave.
- [ ] Confirm school name, legal name, DBA, address, phone, school email, director email, and timezone.
- [ ] Confirm `crmLocationId` and `locationId`.
- [ ] Confirm tenant, brand, organization, owner group, region, and active status.
- [ ] Confirm operating hours.
- [ ] Confirm school calendar, holidays, closures, early release days, and staff training days.
- [ ] Confirm school support owner and escalation contact.

### Licensing And Programs

- [ ] Confirm state license number.
- [ ] Confirm total licensed capacity.
- [ ] Confirm each room/classroom exists.
- [ ] Confirm classroom capacity.
- [ ] Confirm age group and ratio rules by classroom.
- [ ] Confirm programs offered.
- [ ] Confirm required child documents.
- [ ] Confirm required staff documents.
- [ ] Confirm medication log and incident rules.
- [ ] Confirm emergency drill cadence.

### Users And Permissions

- [ ] Create or confirm director user.
- [ ] Create or confirm assistant director user.
- [ ] Create or confirm billing user.
- [ ] Create or confirm teacher users.
- [ ] Create or confirm executive users.
- [ ] Create or confirm support/auditor access.
- [ ] Confirm each user has correct center/classroom/family scope.
- [ ] Smoke test director can see only assigned school.
- [ ] Smoke test teacher can see only assigned classroom.
- [ ] Smoke test parent test user can see only linked family.
- [ ] Smoke test executive can see intended rollup.

### Data Migration Readiness

- [ ] Create school evidence packet folder.
- [ ] Confirm ProCare export owner.
- [ ] Confirm export date/time.
- [ ] Confirm unencrypted CSV files are available or approved decryption process is ready.
- [ ] Confirm source files are stored in approved secure location.
- [ ] Confirm import preview can identify target center.
- [ ] Confirm duplicate handling owner.
- [ ] Confirm unsupported fields will be preserved or intentionally excluded.

### Billing And Payments

- [ ] Load tuition plans.
- [ ] Load fees, deposits, discounts, subsidies, agency/copay rules, and late fees.
- [ ] Confirm recurring vs one-time charges.
- [ ] Confirm opening balance policy.
- [ ] Confirm invoice cadence and due dates.
- [ ] Confirm failed payment and dunning settings.
- [ ] Confirm Stripe connected account exists or onboarding owner is assigned.
- [ ] Confirm charges enabled.
- [ ] Confirm payouts enabled.
- [ ] Confirm no open Stripe requirements.
- [ ] Confirm parent checkout remains disabled until approved.
- [ ] Confirm refund, dispute, failed payment, duplicate payment, and payout support owner.

### Email, Notifications, And Messaging

- [ ] Confirm sender domain verification.
- [ ] Confirm reply-to routing.
- [ ] Confirm school notification recipients.
- [ ] Confirm director templates.
- [ ] Confirm parent templates.
- [ ] Confirm staff templates.
- [ ] Confirm billing templates.
- [ ] Confirm urgent escalation templates.
- [ ] Confirm SMS/email policy if used.

### Devices And Kiosks

- [ ] Confirm front desk device owner.
- [ ] Confirm classroom tablet count.
- [ ] Confirm kiosk URL/device session.
- [ ] Confirm QR/PIN policy.
- [ ] Confirm printer needs.
- [ ] Confirm receipt printer needs if used.
- [ ] Confirm fallback paper sign-in sheet.
- [ ] Confirm device support contact.

### Security And Release Readiness

- [ ] Confirm production build approved.
- [ ] Confirm `/api/health`.
- [ ] Confirm `/api/system/readiness`.
- [ ] Confirm backups current.
- [ ] Confirm no P0/P1 incident open.
- [ ] Confirm role smoke tests pass.
- [ ] Confirm support screenshots/data handling rules are understood.
- [ ] Confirm Kokomo production data is protected and not used for destructive testing.

### Corporate Exit Criteria

- [ ] School is ready for director kickoff.
- [ ] Kickoff email is prepared.
- [ ] Director checklist is prepared.
- [ ] Training sessions are scheduled.
- [ ] Dashboard row is created.
- [ ] Blocker owner is assigned.

## Director Checklist

Use with the director during kickoff and validation.

### School Setup

- [ ] I can log in.
- [ ] I see only my school.
- [ ] School name, address, phone, email, and timezone are correct.
- [ ] Operating hours are correct.
- [ ] Holiday/closure calendar is correct.
- [ ] Director and assistant director contacts are correct.
- [ ] Support contact is understood.

### Classrooms And Staff

- [ ] Every classroom is listed.
- [ ] Classroom age groups are correct.
- [ ] Licensed and desired capacity are correct.
- [ ] Ratio rules are correct.
- [ ] Staff roster is correct.
- [ ] Teacher classroom assignments are correct.
- [ ] Teacher login process is understood.
- [ ] Staff credentials/background check dates are correct or exceptions are logged.

### Families And Children

- [ ] Active child count matches ProCare or exceptions are documented.
- [ ] Active family count matches ProCare or exceptions are documented.
- [ ] Guardians and billing contacts are correct.
- [ ] Emails and phone numbers are correct.
- [ ] Authorized pickups are correct.
- [ ] Emergency contacts are correct.
- [ ] Custody restrictions are correct.
- [ ] Allergies and medical notes are correct.
- [ ] Schedules and classroom assignments are correct.
- [ ] Required documents are visible or missing items are tracked.

### Billing

- [ ] Tuition plans are correct.
- [ ] Recurring charges are correct.
- [ ] One-time charges are not recurring.
- [ ] Discounts are correct.
- [ ] Subsidy/copay rules are correct.
- [ ] Opening balances match ProCare or exceptions are documented.
- [ ] Parent checkout is disabled unless approved.
- [ ] Billing preview has been reviewed.

### Attendance, Devices, And Parent Portal

- [ ] Kiosk check-in test passes.
- [ ] Kiosk check-out test passes.
- [ ] Invalid guardian/PIN test blocks correctly.
- [ ] Teacher classroom attendance view is correct.
- [ ] Tablet/front desk device is ready.
- [ ] Parent test account sees only the correct family.
- [ ] Parent invite plan is approved.
- [ ] Parent communication is approved.

### Director Signoff

- [ ] I approve parallel operation.
- [ ] I understand ProCare remains active.
- [ ] I know the daily reconciliation process.
- [ ] I know how to escalate P0/P1 issues.

## Daily Migration Checklist

Use each day during rollout waves.

| Time | Task | Owner | Complete |
| --- | --- | --- | --- |
| 8:00 AM | Review overnight app health and support issues | Implementation lead | [ ] |
| 8:15 AM | Check import status for active-wave schools | Implementation lead | [ ] |
| 8:30 AM | Confirm director login blockers | Support owner | [ ] |
| 9:00 AM | Confirm ProCare exports received | School/director | [ ] |
| 10:00 AM | Run or review import previews | Technical/implementation | [ ] |
| 11:00 AM | Review duplicate groups and errors | Implementation lead | [ ] |
| 12:00 PM | Midday blocker review | Corporate team | [ ] |
| 1:00 PM | Director validation office hours | Implementation lead | [ ] |
| 2:00 PM | Billing and Stripe readiness review | Billing owner | [ ] |
| 3:00 PM | Kiosk/tablet readiness review | Operations owner | [ ] |
| 4:00 PM | Parent/staff communication readiness | Customer success | [ ] |
| 5:00 PM | Update executive dashboard | Implementation lead | [ ] |
| 5:30 PM | Send daily wave summary | Implementation lead | [ ] |

## Data Verification Checklist

Complete after import preview and after final committed import.

### Count Validation

| Area | ProCare count | Bee Suite count | Difference | Approved exception |
| --- | --- | --- | --- | --- |
| Active families |  |  |  |  |
| Inactive families imported |  |  |  |  |
| Active children |  |  |  |  |
| Inactive children imported |  |  |  |  |
| Guardians |  |  |  |  |
| Billing contacts |  |  |  |  |
| Authorized pickups |  |  |  |  |
| Emergency contacts |  |  |  |  |
| Staff |  |  |  |  |
| Classrooms |  |  |  |  |
| Attendance records |  |  |  |  |
| Documents |  |  |  |  |
| Open invoices |  |  |  |  |
| Account balances total |  |  |  |  |

### Sample Validation

- [ ] Review at least 10 active families per school or 10%, whichever is greater, capped at 30 unless discrepancies appear.
- [ ] Review all families with custody restrictions.
- [ ] Review all children with allergies or medication notes.
- [ ] Review all subsidy/agency/copay families.
- [ ] Review all families with balances over the corporate threshold.
- [ ] Review all staff assigned to active classrooms.
- [ ] Review all classrooms with ratio warnings.
- [ ] Review all duplicate groups.
- [ ] Review all import warnings and errors.

### Required Field Validation

- [ ] Child first and last name.
- [ ] Child date of birth.
- [ ] Enrollment status.
- [ ] Classroom.
- [ ] Schedule/program.
- [ ] Primary guardian.
- [ ] Billing contact.
- [ ] Guardian phone/email where available.
- [ ] Authorized pickups.
- [ ] Emergency contacts.
- [ ] Allergy/medical/custody flags.
- [ ] Tuition plan.
- [ ] Opening balance.
- [ ] Staff role.
- [ ] Staff classroom assignment.

### Billing Validation

- [ ] Tuition plan matches ProCare.
- [ ] Billing cadence matches ProCare.
- [ ] Discounts match ProCare.
- [ ] Agency/subsidy/copay rules match ProCare.
- [ ] Ledger/open balance matches ProCare.
- [ ] One-time fees are not recurring.
- [ ] Failed payment/dunning copy is approved.
- [ ] Parent checkout blocked until approval.

### Attendance Validation

- [ ] Today's roster visible.
- [ ] Check-in works.
- [ ] Check-out works.
- [ ] Duplicate check-in blocked or handled correctly.
- [ ] Checkout-before-checkin blocked.
- [ ] Wrong guardian blocked.
- [ ] Classroom attendance total matches ProCare during parallel period.
- [ ] End-of-day attendance reconciliation completed.

## Parent Communication Timeline

Do not send parent communication until director and corporate approve the school-specific content.

| Timing | Audience | Message | Owner |
| --- | --- | --- | --- |
| T-5 | Parents, optional heads-up | A new Kid City USA parent experience is coming, ProCare remains active | Director + corporate |
| T-2 | Pilot/test parents only | Parent portal test invite and feedback request | Director |
| T-1 | All staff first, parents after approval | Staff are training; parent invite date confirmed | Director |
| Day 1 parallel | Parents | School is validating The Bee Suite alongside current process | Director |
| Day 3 parallel | Parents | Reminder to activate portal if invited | Director |
| Day 5 parallel | Parents | Billing/payment status clarification, only if approved | Billing/director |
| Go-live approval | Parents | The Bee Suite is now approved for selected workflows | Corporate + director |
| Day 7 post-go-live | Parents | App install, documents, messages, payment reminder | Director |
| Day 30 post-go-live | Parents | Thank-you, support path, feature reminders | Customer success |

### Parent Message Guardrails

- Do not say ProCare is being eliminated until leadership approves.
- Do not ask parents to pay in The Bee Suite until payment readiness is approved.
- Do not mention unresolved internal bugs.
- Keep custody, medical, billing, and payment support instructions precise and director-approved.
- Give one support path and one expected response time.

## Staff Training Timeline

| Timing | Session | Audience | Outcome |
| --- | --- | --- | --- |
| T-5 | Director kickoff | Director, assistant director | Director understands scope and timeline |
| T-4 | School profile and data validation | Director, assistant director | Director can validate imported data |
| T-3 | Teacher login and classroom roster | Teachers | Teachers can log in and confirm classroom |
| T-2 | Attendance, daily reports, incidents | Teachers, director | Staff can complete daily classroom workflows |
| T-2 | Billing and payment readiness | Director, billing owner | Billing data and payment gate understood |
| T-1 | Front desk/kiosk devices | Director, front desk, opener/closer | Check-in/out and fallback process understood |
| Day 1 | Launch huddle | All school users | Staff know daily parallel process |
| Day 3 | Issue-based refresher | Users with blockers | Top blockers corrected |
| Day 5 | End-of-week closeout | Director, staff leads | Parallel operation confidence reviewed |
| Day 10 | Go-live readiness training | Director, staff leads | Remaining ProCare retirement gaps identified |
| Day 30 | Refresher and adoption review | Director, corporate | Permanent operating habits reinforced |

## Weekly Executive Review Checklist

- [ ] Schools by phase.
- [ ] Schools with P0/P1 blockers.
- [ ] Schools missing ProCare exports.
- [ ] Schools with failed import previews.
- [ ] Schools with director checklist incomplete.
- [ ] Schools with data verification incomplete.
- [ ] Schools with Stripe not ready.
- [ ] Schools with attendance reconciliation under threshold.
- [ ] Schools with billing reconciliation incomplete.
- [ ] Schools below parent adoption threshold.
- [ ] Schools ready for ProCare retirement review.
- [ ] Schools requiring leadership intervention.
