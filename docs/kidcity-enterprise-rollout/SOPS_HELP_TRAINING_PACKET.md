# SOPs, Help Center, Training Videos, And Printable Packet

Last updated: July 9, 2026

This document collects the standard operating procedures and training assets needed to roll out The Bee Suite across Kid City USA while ProCare remains active during the parallel period.

## Standard Operating Procedures

### SOP 1: Corporate School Preflight

Owner: Enterprise Implementation Manager

When to use: Before any director is contacted.

Steps:

1. Confirm school is in rollout master.
2. Confirm location profile, IDs, active status, owner group, region, and public inquiry visibility.
3. Confirm classrooms, capacity, ratios, programs, hours, holidays, and licensing fields.
4. Confirm users and scopes.
5. Confirm ProCare export owner and expected file set.
6. Confirm Stripe/payment status.
7. Confirm messaging/email/domain readiness.
8. Confirm support owner and escalation path.
9. Create executive dashboard row.
10. Send kickoff only after the corporate checklist is complete.

Quality check:

- Director receives a prepared school workspace, not a blank system.
- No parent or staff launch message is sent before the school is validated.

### SOP 2: Director Kickoff

Owner: Customer Success

When to use: First director touchpoint for each wave.

Steps:

1. Send kickoff email.
2. Hold kickoff call.
3. State clearly that ProCare is not being replaced immediately.
4. Review timeline, director checklist, training schedule, and support path.
5. Confirm required ProCare exports and school-specific data.
6. Confirm director time commitment.
7. Confirm no parents are invited and no payments are enabled until approved.
8. Log director concerns and blockers.

Quality check:

- Director can explain the parallel operation model.
- Director knows what to validate and when.

### SOP 3: ProCare Export Handling

Owner: Implementation Lead + ProCare Export Owner

When to use: Any time ProCare data is exported.

Steps:

1. Export the required school datasets.
2. Confirm export timestamp and owner.
3. Store original files in the approved secure location.
4. Decrypt only if required and only through approved process.
5. Preserve original files unchanged.
6. Create a working copy for cleaning.
7. Record file names in the evidence packet.
8. Do not paste sensitive data into chat or tickets.

Quality check:

- Export inventory is complete.
- Original files are retained.
- Decrypted files are controlled.

### SOP 4: Import Preview And Approval

Owner: CTO or assigned technical/implementation owner

When to use: Before committing any ProCare import.

Steps:

1. Select the correct school.
2. Upload or select the approved export.
3. Run import preview.
4. Confirm target center.
5. Review counts, matches, duplicates, warnings, and errors.
6. Resolve or document duplicates.
7. Confirm unmapped fields are preserved or excluded intentionally.
8. Get director and implementation approval.
9. Commit only after approval.
10. Save import batch ID and validation output.

Quality check:

- No rows map to the wrong center.
- Critical counts match or exceptions are approved.

### SOP 5: Data Validation

Owner: Director + Implementation Lead

When to use: After import preview and after final import.

Steps:

1. Validate counts.
2. Sample active family records.
3. Review all custody records.
4. Review all medical/allergy records.
5. Review all subsidy/copay records.
6. Review high-balance accounts.
7. Review classroom rosters.
8. Review staff assignments.
9. Review required documents.
10. Log discrepancies by severity.

Quality check:

- Director signs off or exceptions are tracked.
- P0/P1 issues block go-live.

### SOP 6: Parallel Attendance

Owner: VP Operations + Director

When to use: During Phase 5.

Steps:

1. Keep ProCare as official attendance unless leadership approves otherwise.
2. Enter the same attendance activity in The Bee Suite.
3. Test check-in, check-out, invalid PIN, duplicate check-in, checkout-before-checkin, and authorized pickup.
4. Compare midday attendance totals.
5. Compare end-of-day totals.
6. Log discrepancies.
7. Review ratio warnings.
8. Confirm teacher tablet sync/offline queue.

Quality check:

- Attendance reconciliation is 99%+ for go-live readiness.
- No wrong child/guardian/school result occurs.

### SOP 7: Billing Validation

Owner: Billing Owner + Director

When to use: Before parent billing or payment launch.

Steps:

1. Keep ProCare/current billing as official until approved.
2. Compare tuition plans.
3. Compare billing cadence.
4. Compare discounts, agency billing, subsidy/copay, late fees, and one-time fees.
5. Compare opening balances and open invoices.
6. Confirm one-time charges are not recurring.
7. Confirm Stripe readiness if payments are included.
8. Review parent-facing billing language.
9. Run billing preview.
10. Sign off before parent payment messages.

Quality check:

- Billing validation must be 100% or have approved exceptions.
- Parent checkout remains disabled until all gates pass.

### SOP 8: Parent Portal Launch

Owner: Customer Success + Director

When to use: Before inviting parents.

Steps:

1. Confirm family links.
2. Confirm guardian emails and phone numbers.
3. Confirm custody restrictions.
4. Confirm child visibility.
5. Confirm document visibility.
6. Confirm billing visibility.
7. Send a test invite to a controlled parent/test account.
8. Confirm the account sees only the intended family.
9. Send parent invites in approved batches.
10. Track activation and support questions.

Quality check:

- Parent adoption threshold is met before ProCare retirement.
- Any wrong-family visibility is P0.

### SOP 9: Staff Training And Certification

Owner: Customer Success + Director

When to use: Before parallel operation.

Steps:

1. Train director and assistant director.
2. Train billing owner.
3. Train teachers by classroom workflow.
4. Train front desk/kiosk users.
5. Confirm logins.
6. Confirm each teacher sees the right classroom.
7. Run attendance and daily report practice.
8. Run incident/media practice if used.
9. Track staff completion.
10. Schedule refreshers for missed users.

Quality check:

- Classroom leads must be ready before live classroom workflows.

### SOP 10: Daily Rollout Command Rhythm

Owner: Enterprise Implementation Manager

When to use: Every active rollout day.

Steps:

1. Review health and blockers.
2. Update dashboard.
3. Review imports and validation.
4. Host office hours.
5. Review billing/payment readiness.
6. Review attendance/kiosk readiness.
7. Review parent/staff communications.
8. Escalate P0/P1.
9. Send daily summary.
10. Assign next-day actions.

Quality check:

- No blocker is ownerless.
- Dashboard is updated by 5:00 PM.

### SOP 11: Go-Live Review

Owner: Executive Sponsor + Implementation Lead

When to use: When a school asks to eliminate ProCare.

Steps:

1. Review mandatory criteria.
2. Confirm 14 days without critical bugs.
3. Confirm director certification.
4. Confirm data validation.
5. Confirm attendance and billing reconciliation.
6. Confirm parent/staff adoption.
7. Confirm Stripe/payment readiness if applicable.
8. Confirm open support issues.
9. Capture approvals.
10. Send go-live or hold decision.

Quality check:

- No school retires ProCare without leadership approval.

### SOP 12: Post-Go-Live Monitoring

Owner: Customer Success + Operations + Support

When to use: First 30 days after ProCare retirement approval.

Steps:

1. Day 1 morning and afternoon check-ins.
2. Daily first-week support review.
3. Week 2 adoption and billing review.
4. Week 3 compliance/FTE review.
5. Week 4 success scorecard.
6. Capture feedback and feature requests.
7. Identify training refreshers.
8. Close or escalate open issues.
9. Confirm permanent operating habits.
10. Deliver 30-day report.

Quality check:

- School remains stable without returning to ProCare for approved workflows.

## Help Center Article List

### Corporate And Executive

1. Kid City USA rollout overview for corporate leaders.
2. How the ProCare parallel period works.
3. Executive dashboard definitions.
4. Readiness score and go-live gates.
5. How to approve a school for ProCare retirement.
6. How to handle rollout blockers.
7. Security and privacy rules during migration.
8. Stripe Connect and school payout readiness.
9. Payment support, refunds, disputes, and failed payments.
10. How to reconcile location master differences.

### Director

1. Director rollout checklist.
2. What directors validate after ProCare import.
3. How to review classrooms, capacity, and ratios.
4. How to review staff and teacher access.
5. How to validate families, children, guardians, and pickups.
6. How to validate custody, allergy, medication, and medical notes.
7. How to validate tuition plans and balances.
8. How to run daily parallel reconciliation.
9. How to start parent portal invites.
10. How to request help or escalate an issue.

### Teacher And Staff

1. Teacher first login.
2. How to confirm classroom roster.
3. How to use attendance during parallel operation.
4. How to complete daily reports.
5. How to submit incidents for director review.
6. How photo/media review works.
7. How offline tablet sync works.
8. What to do when a child is missing or in the wrong room.
9. Staff kiosk and clock workflow.
10. Teacher support checklist.

### Parent And Guardian

1. What is The Bee Suite parent portal?
2. How to activate a parent account.
3. How to install the parent app.
4. How to view child updates.
5. How to send and receive messages.
6. How to submit documents.
7. How to review invoices and balances.
8. How payment methods work when enabled.
9. How PIN/QR check-in works.
10. Who to contact for family, pickup, billing, or medical corrections.

### Billing And Payments

1. Billing setup during ProCare parallel operation.
2. How tuition plans are validated.
3. How opening balances are imported.
4. How one-time fees differ from recurring tuition.
5. How Stripe Connect payout readiness works.
6. How payment method requests work.
7. How ACH/card checkout works when approved.
8. How failed payments are handled.
9. How refunds and disputes are handled.
10. How to reconcile Bee Suite payments against ProCare/current records.

### Support

1. Rollout support severity levels.
2. What information to capture in support tickets.
3. How to report wrong-school or wrong-family visibility.
4. How to report import issues.
5. How to report kiosk issues.
6. How to report billing/payment issues.
7. How to report email/SMS delivery issues.
8. How to support a director during go-live review.
9. How to use the rollback procedure.
10. Post-incident review template.

## Training Video List

### Corporate Videos

1. Enterprise rollout overview and three-week wave model.
2. Executive dashboard walkthrough.
3. Corporate preflight checklist.
4. Go-live gate and ProCare retirement approval.
5. Risk, escalation, and rollback process.

### Director Videos

1. Director kickoff and parallel operation overview.
2. School profile and classroom validation.
3. ProCare import validation: families, children, guardians.
4. Sensitive data validation: custody, pickups, allergies, medical notes.
5. Billing validation: tuition, fees, discounts, balances.
6. Parent portal invite workflow.
7. Daily reconciliation during parallel operation.
8. Director certification and go-live signoff.

### Teacher Videos

1. Teacher login and classroom roster check.
2. Attendance and classroom status.
3. Daily reports.
4. Photos, media permissions, and director review.
5. Incident reports and parent acknowledgement.
6. Tablet/offline queue expectations.

### Billing Videos

1. Billing dashboard and family account review.
2. Tuition plans and recurring charges.
3. Balances, invoices, credits, and adjustments.
4. Stripe Connect payout readiness.
5. Parent payment methods and failed payments.
6. End-of-day payment reconciliation.

### Parent Videos

1. Parent portal activation.
2. App install and login.
3. Viewing child updates, photos, and daily reports.
4. Messages and announcements.
5. Documents and acknowledgements.
6. Billing and payments when enabled.
7. Check-in PIN/QR overview.

## Printable Implementation Packet

Print or export these sections as a school packet. Keep a completed copy in each school evidence folder.

### Packet Order

1. Cover page:
   - School name.
   - Wave.
   - Director.
   - Implementation owner.
   - Support owner.
   - Parallel operation start date.
2. One-page rollout overview:
   - ProCare remains active.
   - The Bee Suite runs in parallel.
   - Final switch requires leadership approval.
3. Implementation timeline.
4. Director checklist.
5. Data verification checklist.
6. Daily migration checklist.
7. Parent communication timeline.
8. Staff training timeline.
9. Support escalation card.
10. Daily parallel operation SOP.
11. Go-live criteria.
12. Rollback summary.
13. Signoff page.

### Printable Support Escalation Card

```text
School:
Director:
Implementation lead:
Support owner:
Escalation phone/email:

Report immediately:
- Wrong school, family, child, classroom, invoice, document, medical, custody, or payment data
- Kiosk check-in/check-out failure
- Missing active children
- Incorrect billing balances
- Payment or payout issue
- Login outage

Include:
- School
- User email and role
- Page or workflow
- Time and timezone
- Expected result
- Actual result
- Screenshot only if safe
```

### Printable Director Signoff Page

```text
School:
Wave:
Director:
Implementation lead:

Corporate checklist complete: YES / NO
Director checklist complete: YES / NO
Data verification complete: YES / NO
Billing verification complete: YES / NO
Attendance/kiosk verified: YES / NO
Staff training complete: YES / NO
Parent communication approved: YES / NO
Parallel operation approved: YES / NO
Eligible for ProCare retirement review: YES / NO

Known exceptions:

Director signature:
Date:

Corporate operations signature:
Date:

Customer success signature:
Date:

Technical owner signature:
Date:

Executive sponsor signature:
Date:
```

## Recommended Existing Attachments

Attach or link these existing Bee Suite docs where helpful:

- `docs/sops/SCHOOL_SYSTEM_OPERATING_MANUAL.md`
- `docs/sops/DIRECTOR_SOP.md`
- `docs/sops/TEACHER_SOP.md`
- `docs/sops/BILLING_ADMIN_SOP.md`
- `docs/sops/PARENT_PORTAL_SOP.md`
- `docs/sops/KIOSK_AND_AUTHORIZED_PICKUP_GUIDE.md`
- `docs/PROCARE_LOCATION_MIGRATION_RUNBOOK.md`
- `docs/PROCARE_FIELD_COVERAGE.md`
- `docs/STRIPE_CONNECT_SETUP.md`
- `docs/SUPPORT_ESCALATION_GUIDE.md`
