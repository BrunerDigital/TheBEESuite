# Executive Dashboard

Last updated: July 9, 2026

Purpose: give Kid City USA leadership and The Bee Suite implementation owners one operating view for rollout progress across every school.

## Dashboard Views

| View | Audience | Purpose |
| --- | --- | --- |
| Executive summary | Leadership | One-page rollout status, blocker count, and go-live readiness |
| Wave command center | Implementation lead | Daily management of active schools in the current week |
| Data migration board | CTO, implementation | Import status, validation status, duplicates, errors, evidence packets |
| Operations readiness board | VP Operations | Attendance, kiosk, staffing, device, classroom, and parallel reconciliation status |
| Customer success board | VP Customer Success | Director confidence, staff training, parent adoption, support load |
| Billing and payment board | Finance, billing owner | Tuition, balances, Stripe Connect, payment method adoption, reconciliation |
| Risk and escalation board | Leadership + support | P0/P1 issues, aging, owner, expected resolution, go/no-go impact |

## Executive Summary KPIs

| KPI | Definition | Target |
| --- | --- | --- |
| Schools in rollout master | Count of tracked Bee Suite schools | 70 |
| Schools completed before rollout | Kokomo live and protected | 1 |
| Schools remaining | Rollout master minus completed schools | 69 |
| Week 1 schools | First rollout wave | 23 |
| Week 2 schools | Second rollout wave | 23 |
| Week 3 schools | Third rollout wave | 23 |
| Schools in corporate prep | Phase 1 not complete | Trending down daily |
| Schools in director kickoff | Phase 2 active | Current-wave only |
| Schools in data migration | Phase 3 active | Current-wave only |
| Schools in configuration | Phase 4 active | Current-wave only |
| Schools in parallel operation | Phase 5 active | Increases weekly |
| Schools eligible for ProCare retirement | Phase 6 criteria met | Leadership approved only |
| Schools in 30-day success plan | Phase 7 active | All schools after go-live |
| Open P0 issues | Live system down, data exposure, payment misrouting | 0 |
| Open P1 issues | Critical workflow blocker | 0 before go-live |
| Schools with Stripe ready | Charges and payouts enabled | 100% before payments |
| Schools with billing verified | Tuition/balances approved | 100% before ProCare retirement |
| Schools with attendance verified | Daily reconciliation threshold met | 99%+ |
| Parent adoption | Activated families / eligible families | 70%+ before retirement, 85%+ by day 30 |

## School-Level Tracker Schema

Create one row per school.

| Field | Type | Description |
| --- | --- | --- |
| `school_name` | Text | Display name from rollout master |
| `location_id` | Text | Bee Suite location ID |
| `state` | Text | School state |
| `wave` | Text | Week 0 complete, Week 1, Week 2, Week 3, or Future reconciliation |
| `phase` | Picklist | Corporate prep, kickoff, migration, configuration, parallel, go-live review, post-go-live, hold |
| `overall_status` | Picklist | Green, Yellow, Red, Hold |
| `readiness_score` | Number | Weighted score from 0 to 100 |
| `director_owner` | Text | School director or acting owner |
| `implementation_owner` | Text | Corporate implementation specialist |
| `support_owner` | Text | Support contact |
| `procare_export_status` | Picklist | Not requested, requested, received, decrypted, cleaned, previewed, imported, blocked |
| `import_batch_id` | Text | Final committed import batch ID |
| `evidence_packet_link` | Text | Folder or tracker link |
| `data_validation_status` | Picklist | Not started, in progress, passed, passed with exceptions, failed |
| `active_child_count_procare` | Number | ProCare active child count |
| `active_child_count_bee` | Number | Bee Suite active child count |
| `family_count_procare` | Number | ProCare family count |
| `family_count_bee` | Number | Bee Suite family count |
| `staff_count_procare` | Number | ProCare staff count |
| `staff_count_bee` | Number | Bee Suite staff count |
| `classroom_count_procare` | Number | ProCare classroom count |
| `classroom_count_bee` | Number | Bee Suite classroom count |
| `billing_validation_status` | Picklist | Not started, in progress, passed, passed with exceptions, failed |
| `stripe_connect_status` | Picklist | Not started, requirements due, charges disabled, payouts disabled, ready, not applicable |
| `parent_checkout_status` | Picklist | Disabled, test only, approved, live, blocked |
| `attendance_reconciliation_rate` | Percent | Daily matched attendance count / control count |
| `parent_invites_sent` | Number | Eligible guardians invited |
| `parent_accounts_activated` | Number | Activated parent accounts |
| `parent_adoption_rate` | Percent | Activated families / eligible families |
| `staff_training_status` | Picklist | Not started, scheduled, in progress, complete, refresh required |
| `director_certified` | Boolean | Director readiness complete |
| `teacher_readiness_rate` | Percent | Active classroom staff ready / active classroom staff |
| `open_p0_count` | Number | P0 issues |
| `open_p1_count` | Number | P1 issues |
| `open_p2_count` | Number | P2 issues |
| `oldest_blocker_age_hours` | Number | Age of oldest unresolved blocker |
| `go_live_ready_date` | Date | Date all criteria first met |
| `procare_retirement_status` | Picklist | Not eligible, eligible, approved, retired, reversed |
| `notes` | Text | Concise exceptions and next action |

## Readiness Score

Use a 100-point score. A school cannot go live if it has a P0/P1 issue, even if the score is high.

| Category | Points | Gate |
| --- | --- | --- |
| Corporate prep complete | 10 | Required before kickoff |
| Director checklist complete | 10 | Required before parallel |
| Data migration and validation | 20 | Required before go-live |
| Classroom/staff/device readiness | 10 | Required before parallel attendance |
| Billing and tuition validation | 15 | Required before ProCare retirement |
| Stripe/payment readiness | 10 | Required only if payments launch |
| Attendance/kiosk reconciliation | 10 | Required before ProCare retirement |
| Staff training | 5 | Required before parallel |
| Parent adoption | 5 | Required before ProCare retirement |
| Support stability | 5 | No P0/P1 and blocker aging under target |

### Score Bands

| Score | Status | Meaning |
| --- | --- | --- |
| 90-100 | Green | Candidate for go-live review if gates are clear |
| 75-89 | Yellow | Continue parallel operation and resolve gaps |
| 50-74 | Red | Not ready, active remediation required |
| Under 50 | Hold | Do not expand usage until blockers are resolved |

## Phase Definitions

| Phase | Entry Criteria | Exit Criteria |
| --- | --- | --- |
| Corporate prep | School in rollout master | Corporate checklist complete |
| Director kickoff | Kickoff email sent | Director confirms timeline, checklist, and data owner |
| Data migration | Export requested or received | Import committed and validation checklist complete |
| Configuration | School setup active | Users, classrooms, billing, notifications, kiosk, parent portal configured |
| Parallel operation | Director approves parallel start | Daily reconciliation stable and go-live criteria trending green |
| Go-live review | Mandatory criteria appear met | Leadership signs off or school remains parallel |
| Post-go-live | ProCare retirement approved | 30-day success plan complete |
| Hold | Stop condition or unresolved blocker | Executive or implementation lead clears hold |

## Daily Dashboard Update Rhythm

| Time | Update |
| --- | --- |
| 8:00 AM | App health, open P0/P1, active rollout school count |
| 10:00 AM | Export/import status and new blockers |
| 12:00 PM | Director validation status and training attendance |
| 3:00 PM | Attendance/device/billing/payment readiness |
| 5:00 PM | Final daily score, blockers, next actions |

## Weekly Executive Summary Template

```text
Week:
Wave:
Schools in active wave:
Schools green:
Schools yellow:
Schools red:
Schools on hold:

New schools entering parallel operation:
Schools eligible for ProCare retirement:
Schools approved to retire ProCare:

Open P0:
Open P1:
Top blockers:
Decisions needed from leadership:

Data migration summary:
Billing/payment summary:
Parent adoption summary:
Staff training summary:
Support load summary:

Next 24 hours:
```

## Go/No-Go Dashboard Criteria

A school receives GO only when:

- Readiness score is 90+.
- No P0/P1 exists.
- Director is certified.
- Corporate checklist is complete.
- Data verification is passed.
- Attendance reconciliation is stable.
- Billing validation is passed.
- Parent adoption threshold is met.
- Stripe/payment gate is passed if payments are included.
- No critical bug has occurred for 14 consecutive days.
- Leadership approves ProCare retirement.

A school receives HOLD when:

- Any stop condition is present.
- Director has not signed off.
- Billing or attendance cannot reconcile.
- Parent/custody/medical visibility is uncertain.
- Payment routing is uncertain.
- Production health is degraded.

## Importable CSV Header

```csv
school_name,location_id,state,wave,phase,overall_status,readiness_score,director_owner,implementation_owner,support_owner,procare_export_status,import_batch_id,evidence_packet_link,data_validation_status,active_child_count_procare,active_child_count_bee,family_count_procare,family_count_bee,staff_count_procare,staff_count_bee,classroom_count_procare,classroom_count_bee,billing_validation_status,stripe_connect_status,parent_checkout_status,attendance_reconciliation_rate,parent_invites_sent,parent_accounts_activated,parent_adoption_rate,staff_training_status,director_certified,teacher_readiness_rate,open_p0_count,open_p1_count,open_p2_count,oldest_blocker_age_hours,go_live_ready_date,procare_retirement_status,notes
```
