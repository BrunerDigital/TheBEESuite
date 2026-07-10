# Master Corporate Rollout Playbook

Last updated: July 9, 2026

## Executive Objective

Move every tracked Kid City USA school from ProCare-only operations to parallel ProCare plus The Bee Suite operations, then eliminate ProCare school by school only after measurable readiness criteria are met.

The rollout is designed for one corporate implementation specialist to guide dozens of schools at once. The model depends on corporate pre-configuration, standardized director packets, batch training, strict checklists, and daily exception management.

## Rollout Model

| Stage | Scope | Timing | Owner |
| --- | --- | --- | --- |
| Pilot complete | Kokomo, IN live validation | Completed before this rollout | Bee Suite + Kid City leadership |
| Week 1 | 23 schools | Days 1-5 | Corporate implementation specialist |
| Week 2 | 23 schools | Days 6-10 | Corporate implementation specialist |
| Week 3 | 23 schools | Days 11-15 | Corporate implementation specialist |
| Stabilization | All active waves | Days 16-30 | Customer success + operations |
| ProCare retirement | School by school | After readiness gate | Leadership approval required |

## Core Principles

1. ProCare remains the system of record until leadership approves the final switch for that school.
2. The Bee Suite becomes a parallel operating system first, not an immediate replacement.
3. Corporate completes as much setup as possible before contacting directors.
4. Directors validate, but they do not design the migration process.
5. One implementation specialist manages by exception: dashboards, readiness scores, batch office hours, and blocker queues.
6. No parent payments are enabled until Stripe Connect, payment policy, disclosures, reconciliation, and school payout readiness are approved.
7. Wrong-school visibility, payment misrouting, missing children, custody/medical exposure, or broken kiosk attendance stops the affected school.

## Rollout Governance

| Role | Responsibilities |
| --- | --- |
| Executive sponsor | Approves rollout waves, ProCare retirement, staffing support, and payment policy. |
| VP Customer Success | Owns adoption, training, director confidence, parent communication, and post-go-live success scorecards. |
| VP Operations | Owns school readiness, daily operating procedure, staffing impact, support rhythm, and reconciliation discipline. |
| CTO | Owns data import safety, production health, access control, security, integrations, rollback options, and readiness reporting. |
| Enterprise Implementation Manager | Owns wave execution, checklists, director kickoff, validation evidence, issue triage, and go/no-go packets. |
| School director | Validates roster, classrooms, staff, schedules, contacts, billing, attendance, parent readiness, and daily use. |
| Billing or finance owner | Validates tuition plans, balances, invoices, payment methods, Stripe payout readiness, refunds, disputes, and reconciliation. |
| Support owner | Tracks issues, severity, response time, escalation, and first-week resolution. |

## Week-Level Cadence

Each week runs a fixed sequence so one implementation specialist can manage 23 schools without one-off project plans.

| Day | Corporate work | Director work | Output |
| --- | --- | --- | --- |
| Monday | Final preflight, kickoff email, dashboard creation, office hours | Attend kickoff, confirm school profile, upload missing files | Kickoff completed and blockers logged |
| Tuesday | Import dry runs, duplicate review, Stripe status review | Validate families, children, classrooms, staff | Import preview approved or blocked |
| Wednesday | Configuration review, training sessions, device readiness | Configure tuition, notifications, tablets, kiosk, users | Configuration checklist completed |
| Thursday | Parallel operation rehearsal, parent/staff communication review | Run attendance, billing preview, parent test invite | Parallel daily SOP tested |
| Friday | Readiness scoring, executive review, support handoff | Director signoff, exception list, staff refresh | GO / HOLD decision for parallel operation |

## Phase 1: Corporate Preparation

Corporate completes this before contacting a school. The director should receive a mostly prepared school workspace, not a blank implementation project.

### 1. Location Master Verification

- Confirm school name, legal name, DBA, address, phone, school email, director email, assistant director email, timezone, state, county, and license number.
- Confirm `Center.crmLocationId`, `Center.locationId`, tenant, brand, organization, owner group, region, and active status.
- Confirm the school is open, should be included in rollout, and should appear in public inquiry routing where applicable.
- Confirm whether the school is corporate-owned, franchise-owned, or needs owner approval before payment setup.
- Confirm public website location data matches Bee Suite data or document the exception.

### 2. Licensing, Rooms, Capacity, And Programs

- Enter school licensed capacity.
- Enter every classroom/room.
- Enter room capacity, age group, desired capacity, ratio rule, and room schedule.
- Enter programs: infant, toddler, preschool, school age, before/after school, summer camp, part-time, full-time, drop-in if used.
- Confirm state-specific licensing fields, inspection dates, emergency drill cadence, medication log rules, and required documents.

### 3. Tuition, Fees, And Billing Setup

- Load tuition plans by program, age group, schedule, and billing cadence.
- Load registration fees, deposits, sibling discounts, staff discounts, subsidy/copay rules, agency billing notes, supply fees, activity fees, late payment fees, late pickup fees, and one-time product fees.
- Configure invoice timing, due dates, autopay behavior, dunning cadence, failed-payment messages, and statement policy.
- Confirm opening balance policy for imported ProCare balances.
- Confirm which fees are recurring and which are one-time only.

### 4. Staff And Role Setup

- Create director, assistant director, billing admin, teacher, executive, support, and auditor accounts.
- Assign center and classroom scopes.
- Verify least-privilege access.
- Generate teacher setup checklists.
- Load staff profiles, schedules, titles, classroom assignments, background check status, credential expiration dates, and staff kiosk codes if used.

### 5. Executive Permissions

- Confirm corporate executive users can view all assigned schools.
- Confirm regional or owner-group users can view only assigned scopes.
- Confirm directors cannot see other schools.
- Confirm teachers cannot see unrelated classrooms.
- Confirm parent/guardian accounts see only their linked family.

### 6. Stripe Connect And Payments

- Confirm Stripe platform keys and webhook reconciliation are production ready.
- Create or verify school connected payout account setup status.
- Confirm legal business name, EIN, support contact, address, bank payout onboarding owner, charges enabled, payouts enabled, and no open requirements.
- Keep parent checkout disabled until payment readiness passes.
- Confirm refund, dispute, failed payment, duplicate payment, and payout support ownership.
- Confirm ACH/card policy and parent-facing disclosures are approved.

### 7. Email, Domain, And Notifications

- Confirm SendGrid or approved email sender configuration.
- Confirm domain verification, sender authentication, SPF/DKIM where applicable, reply-to routing, and school notification recipients.
- Configure notification preferences by role.
- Configure templates for kickoff, parent welcome, staff invite, billing, failed payment, attendance, document request, incident acknowledgement, and FTE reminder.

### 8. Brand Assets

- Confirm Kid City USA logo, school display name, app icon, colors, parent portal labels, legal/footer language, and support contact.
- Confirm the school has the correct public inquiry routing and location display.
- Confirm no legacy test/demo branding appears in production workflows.

### 9. Calendars, Hours, And Holidays

- Enter school hours.
- Enter holidays, closures, early release days, staff training days, school events, billing due dates, and FTE deadlines.
- Confirm Google Calendar sync only if the school uses it operationally.

### 10. Security Review

- Confirm production release health.
- Confirm `/api/health` and `/api/system/readiness`.
- Confirm recent backups.
- Confirm role-scoped smoke tests.
- Confirm no P0/P1 incident is open.
- Confirm no production rollback is underway.
- Confirm imports, support screenshots, and evidence packets avoid unnecessary child, family, custody, medical, billing, or payment data exposure.

### Phase 1 Exit Criteria

Corporate may contact the director only when:

- School profile is verified.
- Rooms, programs, and capacity are preloaded or ready for director validation.
- Role accounts are created.
- Stripe readiness state is known.
- Import folder and evidence packet are created.
- Director checklist is assigned.
- Support owner and escalation path are set.
- Kickoff email, timeline, and training links are ready.

## Phase 2: Director Kickoff

Goal: make the director understand exactly what is happening, what is expected, and what does not change yet.

### Kickoff Message Positioning

- The Bee Suite is being introduced alongside ProCare.
- Directors should continue normal ProCare operations until told otherwise.
- The first week is validation, training, and parallel operation.
- Directors are responsible for confirming school facts, not manually rebuilding the system.
- Parent invites and payments wait for approval.

### Implementation Timeline

| Time | Milestone | Director time |
| --- | --- | --- |
| T-5 to T-3 | Kickoff, profile confirmation, data export request | 60-90 minutes |
| T-3 to T-2 | Data import preview, duplicate cleanup, classroom/staff validation | 2-4 hours |
| T-2 to T-1 | Configuration review, billing preview, device setup | 2-3 hours |
| T-1 | Staff training, parent communication approval, parallel SOP review | 1-2 hours |
| Day 1 | Parallel operation begins | 30-45 minutes plus normal operations |
| Days 2-5 | Daily reconciliation and support | 20-30 minutes daily |
| Days 6-14 | Stabilization and adoption tracking | 15-20 minutes daily |
| Day 15+ | Go-live readiness review | 60 minutes |

### Director Kickoff Email

```text
Subject: Kid City USA Bee Suite rollout for [School Name]

Hi [Director Name],

Kid City USA is beginning the next rollout phase for The Bee Suite at [School Name].

Important: this is not an immediate ProCare replacement. Your school will run ProCare and The Bee Suite side by side while we validate records, train staff, test attendance, review billing, and confirm parent readiness. ProCare remains active until leadership approves the final switch.

This week we will complete five steps:

1. Confirm your school profile, classrooms, staff, hours, and licensing details.
2. Import and validate ProCare data in The Bee Suite.
3. Configure billing, tuition, notifications, parent portal, kiosk, and devices.
4. Train directors, staff, and billing users.
5. Begin parallel operation and reconcile both systems daily.

Your estimated time this week is 6-10 total hours, split into short working blocks. Please do not invite parents, enable payments, or stop using ProCare until you receive written approval.

Your kickoff packet is attached:

- Implementation timeline
- Director checklist
- Training schedule
- Data verification checklist
- FAQ
- Support escalation path

Your implementation specialist is [Name] at [Email/Phone]. Please bring your current ProCare export access, classroom roster, staff roster, tuition list, school calendar, and billing balance report to the kickoff.

Thank you,
[Corporate Implementation Lead]
Kid City USA / The Bee Suite Rollout Team
```

### Director FAQ

| Question | Answer |
| --- | --- |
| Are we replacing ProCare today? | No. ProCare stays active until leadership approves the final switch for your school. |
| What should still be entered in ProCare? | All official live records until your school is approved for final cutover. During parallel operation, ProCare remains the control record. |
| What goes into The Bee Suite during parallel operation? | Imported records, attendance test/live parallel entries, staff validation, billing previews, messages/templates, parent portal test invites, and reconciliation evidence. |
| Can parents pay in The Bee Suite right away? | No. Parent checkout stays disabled until Stripe Connect, payment disclosures, billing validation, and reconciliation are approved. |
| Can staff use Bee Suite tablets immediately? | Only after the school passes the attendance/kiosk/tablet readiness checks. |
| What happens if data does not match ProCare? | The mismatch is logged, assigned a severity, corrected, and revalidated before go-live. |
| What if a parent sees the wrong child or invoice? | Stop parent access for the affected school and escalate immediately as P0. |
| Who approves removing ProCare? | Corporate leadership, with director, billing, support, and technical signoff. |

## Phase 3: Data Migration

Goal: move ProCare data into The Bee Suite with evidence, validation, and rollback options.

### Migration Rules

- Use unencrypted ProCare exports whenever possible.
- If encrypted exports are provided, decrypt only in the approved secure environment with an authorized ProCare admin.
- Never paste child, family, staff, custody, medical, billing, or payment data into chat, public tickets, or unsecured docs.
- Keep original exports unchanged.
- Clean data in a working copy only.
- Import preview must be approved before commit.
- Every school gets an evidence packet.

### ProCare Export Inventory

Collect these datasets for each school:

- School profile and site identifiers.
- Active and inactive families for the current year.
- Children, enrollment status, DOB, start date, classroom, schedule, program, and tuition status.
- Guardians, payers, emergency contacts, authorized pickups, custody notes, and communication preferences.
- Medical information, allergies, medications, immunizations, action plans, and restricted notes.
- Staff, roles, schedules, classroom assignment, credentials, background checks, and staff time history if used.
- Classrooms, rooms, capacities, ratio targets, programs, and rosters.
- Attendance, sign-in/out, absences, late pickup, and classroom movement history if applicable.
- Billing accounts, tuition plans, recurring charges, discounts, subsidies, agency billing, ledger, balances, credits, voids, deposits, and payment history.
- Documents, images, child photos, family files, staff files, and required licensing paperwork.
- Payment method references only. Raw card or bank credentials must not be imported into The Bee Suite.

### Decryption Procedure If Required

1. Confirm the export source and encryption method with a ProCare admin.
2. Confirm the destination secure workstation or storage location.
3. Decrypt using the approved ProCare/admin tool or documented vendor process.
4. Store decrypted files only in the approved migration folder.
5. Record file names, timestamps, owner, and hash/checksum if available.
6. Delete unsecured temporary copies after validation and archival are complete.

### Cleaning Standards

- Normalize school/location IDs.
- Normalize guardian names, phone numbers, email casing, and duplicate family records.
- Preserve original ProCare IDs.
- Preserve raw source columns in import metadata where supported.
- Do not infer custody, medical, allergies, billing responsibility, or subsidy rules without director confirmation.
- Separate recurring tuition from one-time fees.
- Mark missing DOB, guardian email, classroom, tuition plan, or balance as validation blockers.

### Import Sequence

1. Upload or select the approved school export.
2. Confirm the target center is correct.
3. Run preview/diff.
4. Review new records, matched records, duplicate warnings, skipped rows, and errors.
5. Resolve duplicate families, guardians, children, staff, and classrooms.
6. Confirm unmapped fields are preserved or intentionally excluded.
7. Commit import after director and implementation lead approval.
8. Record import batch ID, source files, export timestamp, and validation results.

### Verification Required

- Student counts.
- Active enrollment counts.
- Family counts.
- Guardian/contact counts.
- Emergency contact and authorized pickup counts.
- Medical/allergy/custody sample validation.
- Classroom roster counts.
- Staff counts and assignments.
- Attendance history if imported.
- Billing balances, open invoices, credits, and recurring tuition.
- Documents and image availability.
- Payment method readiness status, without importing raw payment credentials.
- Outstanding balances and aging.
- Validation report saved to the evidence packet.

## Phase 4: Configuration

Goal: configure the school for parallel operation.

### Director Configuration Walkthrough

| Area | Required configuration |
| --- | --- |
| Users | Director, assistant director, billing admin, teachers, support, executives, read-only auditors. |
| Staff | Staff profiles, schedules, classrooms, credentials, staff kiosk codes, permissions. |
| Ratios | State ratio rules, classroom target ratios, ratio warning thresholds, coverage owners. |
| Licensing | License capacity, room capacity, inspections, emergency drills, medication rules, required docs. |
| Programs | Program list, age groups, schedule types, part-time/full-time labels, school-age care. |
| Billing | Billing cadence, due dates, invoice timing, dunning, discounts, subsidies, balances. |
| Tuition | Tuition plans by program, recurring charges, one-time fees, late fees, deposits. |
| Payment methods | ACH/card policy, payment method request flow, autopay status, failed payment routing. |
| Stripe | Connected account, charges enabled, payouts enabled, requirements clear, webhook verified. |
| Notifications | Role preferences, email/SMS routes, templates, delivery logs. |
| Messaging | Segments, templates, sender rules, classroom and school announcements. |
| Parent app | Guardian invites, family links, child visibility, custody restrictions, document access. |
| Check-in devices | Kiosk URL, iPad/tablet readiness, QR/PIN policy, guardian lookup, staff clock-in. |
| Front desk | Kiosk launch path, support card, fallback process, printer access. |
| Printers | Office printer, receipt printer if used, network access, printed sign-in fallback. |
| QR codes | Parent QR cards, classroom/kiosk QR, reset process, lost-card process. |
| Kiosks | Device session, locked mode, logout process, incorrect pickup escalation. |

### Phase 4 Exit Criteria

- Director can log in and see only the assigned school.
- Teachers can log in and see only assigned classrooms.
- Billing users can see only approved billing scope.
- Parent test account sees only the linked family.
- Kiosk check-in/out works for approved guardians and blocks invalid users.
- Billing preview matches ProCare or documented exceptions.
- Stripe readiness is known and checkout remains blocked until approved.

## Phase 5: Parallel Operation

Goal: run both systems daily while proving that The Bee Suite can replace ProCare.

### Source Of Truth During Parallel Operation

| Workflow | ProCare | The Bee Suite |
| --- | --- | --- |
| Official attendance | Remains official unless leadership says otherwise | Enter same-day attendance in parallel for validation |
| Family/child profile changes | Continue entering official changes | Enter the same change after ProCare or import it through approved correction flow |
| Billing balances | Remain official control | Preview and reconcile balances, invoices, tuition plans |
| Payments | Continue ProCare/current process unless approved | Keep parent checkout disabled until payment gate passes |
| Parent communication | Continue established school process | Use templates/test groups or approved parallel messages |
| Staff records | Continue official ProCare/admin process | Validate user access, classroom assignments, schedules |
| Documents | Continue current retention process | Upload/review only after document handling is confirmed |
| Reports | Continue ProCare/corporate reporting | Compare Bee Suite dashboards, FTE, attendance, billing |

### Daily Operating Procedure

1. Morning readiness check:
   - Director login.
   - Teacher login.
   - Kiosk device online.
   - Today's roster count.
   - Known blockers.
2. Drop-off parallel entry:
   - ProCare remains control.
   - Bee Suite attendance entered by assigned staff.
   - Kiosk exceptions logged immediately.
3. Midday validation:
   - Compare present/absent count.
   - Check classroom ratio warnings.
   - Check teacher tablet sync/offline queue.
   - Review parent portal test issues.
4. Pickup validation:
   - Compare check-out records.
   - Confirm authorized pickup warnings.
   - Confirm no duplicate open attendance state.
5. End-of-day reconciliation:
   - Compare total attendance.
   - Compare unresolved check-ins.
   - Compare new child/family/staff changes.
   - Compare billing adjustments.
   - Log discrepancies by severity.
6. Corporate closeout:
   - Update executive dashboard.
   - Assign blockers.
   - Review P0/P1 issues.
   - Send daily summary to directors and leadership.

### Weekly Reconciliation

- Active child count.
- Active family count.
- Classroom roster count.
- Staff count.
- Attendance totals.
- FTE submission.
- Billing balance total.
- Open invoice total.
- Parent invite/adoption count.
- Payment method setup count if payments are approved.
- Support ticket aging.
- Director confidence score.

### Discrepancy Severity

| Severity | Example | Action |
| --- | --- | --- |
| P0 | Wrong family/child/billing data visible to another user or school | Stop affected workflow, escalate immediately, block go-live |
| P1 | Missing children, broken kiosk, import failure, incorrect billing totals | Same-day correction plan, block go-live |
| P2 | Report mismatch, missing optional field, notification issue with workaround | Log and resolve before ProCare retirement |
| P3 | Formatting, label, training confusion | Add to refresh training or backlog |

## Phase 6: Go Live

Goal: decide when a school can stop using ProCare for approved modules.

### Mandatory Go-Live Criteria

A school may eliminate ProCare only when all mandatory criteria are met:

- Attendance fully works for drop-off, classroom state, pickup, duplicates, and end-of-day closeout.
- Billing is verified against ProCare, including tuition, fees, discounts, subsidies, balances, open invoices, and credits.
- Stripe Connect is ready if parent payments are going live.
- Payments reconcile in test or approved live pilot path.
- Parent adoption is at or above the approved threshold.
- Staff are trained and comfortable with their daily workflows.
- Director and assistant director are certified.
- Reports are verified: attendance, FTE, billing, roster, compliance, parent portal, and executive rollups.
- No unresolved P0/P1 issue exists.
- No critical bug for 14 consecutive calendar days.
- Director signs off.
- Corporate operations signs off.
- Billing/finance signs off.
- Customer success signs off.
- Technical owner signs off.
- Executive sponsor signs off.

### Recommended Thresholds

| Metric | Minimum threshold |
| --- | --- |
| Director checklist completion | 100% |
| Corporate checklist completion | 100% |
| Data verification checklist | 100%, with documented exceptions only |
| Active child roster match | 100% or director-approved exceptions |
| Guardian/billing contact match | 98%+ and no custody/billing blockers |
| Classroom roster match | 100% for active children |
| Staff login readiness | 95%+ active staff; 100% classroom leads |
| Parent portal invites sent | 90%+ eligible guardians |
| Parent portal activation | 70%+ eligible families before ProCare retirement; 85%+ target by day 30 |
| Attendance reconciliation | 99%+ for 10 consecutive operating days |
| Billing reconciliation | 100% for balances and tuition plans before payment launch |
| Payment method setup | 75%+ eligible paying families before autopay launch, if required |
| No critical bugs | 14 consecutive days |

## Phase 7: Post Go-Live

Goal: stabilize the school and prove the permanent ProCare replacement.

### 30-Day Success Plan

| Time | Customer success action | Operations action | Technical action |
| --- | --- | --- | --- |
| Day 1 | Director check-in during morning and pickup | Attendance and support queue review | Monitor logs, auth, import, kiosk |
| Day 2-5 | Daily director check-in | Daily reconciliation and issue aging | Fix P0/P1, monitor notifications |
| Week 2 | Adoption review, staff refresher | Billing and reporting review | Data cleanup, dashboard health |
| Week 3 | Parent adoption push | Compliance and FTE review | Support trend analysis |
| Week 4 | Success scorecard and final stabilization report | ProCare retirement confirmation for approved modules | Post-launch technical review |

### Director Check-Ins

- Day 1 morning.
- Day 1 end of day.
- Day 3.
- Day 5.
- Day 10.
- Day 20.
- Day 30.

### Corporate Monitoring Dashboard

Track every school by phase, readiness score, blockers, import status, director completion, staff completion, parent adoption, attendance reconciliation, billing reconciliation, payment readiness, support severity, and ProCare retirement status.

### Customer Success Scorecard

| Category | Green | Yellow | Red |
| --- | --- | --- | --- |
| Director confidence | Director reports comfortable and independent | Director needs recurring support | Director cannot operate daily workflows |
| Staff adoption | Staff complete tasks without prompting | Some rooms need coaching | Staff continue avoiding Bee Suite |
| Parent adoption | 85%+ active families activated | 70-84% activated | Under 70% activated |
| Attendance | 99%+ clean reconciliation | Minor correctable mismatches | Missing/incorrect attendance |
| Billing | Balances and invoices verified | Minor non-payment exceptions | Incorrect balances or payment blockers |
| Support load | P2/P3 only, aging under 48 hours | Repeated P2s | P0/P1 or unresolved core blockers |

### Feedback And Feature Requests

- Collect daily during first week.
- Tag as blocker, training issue, configuration issue, data issue, bug, or feature request.
- Blockers go to implementation lead.
- Bugs go to technical owner.
- Training issues go to customer success.
- Feature requests go to product backlog only after rollout-critical work is stable.

### Training Refreshers

- Director refresher: dashboard, family changes, attendance reconciliation, billing, parent portal.
- Teacher refresher: classroom roster, attendance, daily reports, media, incidents, offline sync.
- Billing refresher: invoices, balances, payment methods, dunning, reports.
- Parent refresher: login, app install, messages, documents, billing, check-in.

## Stop Conditions

Stop the affected school or module if:

- Any cross-location or wrong-family visibility occurs.
- Kiosk returns the wrong child, guardian, or school.
- Billing or invoices appear under the wrong family.
- Parent portal exposes the wrong family.
- Import maps records to the wrong center.
- Critical counts cannot be reconciled.
- Stripe payment or payout routing is wrong.
- Production health is degraded.
- Director refuses signoff because the data is not trusted.

