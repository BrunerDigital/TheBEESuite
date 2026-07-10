# Director Implementation Guide

Last updated: July 9, 2026

Audience: Kid City USA directors and assistant directors joining the Bee Suite enterprise rollout.

## What Is Happening

Your school is joining The Bee Suite rollout. This does not mean ProCare is being turned off immediately. Your school will run ProCare and The Bee Suite side by side while records, attendance, billing, staff workflows, parent access, and reporting are validated.

ProCare stays active until leadership tells your school in writing that it may stop using ProCare for approved workflows.

## Estimated Time Required

| Work block | Estimate |
| --- | --- |
| Kickoff and timeline review | 30-45 minutes |
| School profile, rooms, staff, and hours validation | 60-90 minutes |
| Data validation after import | 2-4 hours |
| Billing and tuition validation | 60-120 minutes |
| Attendance, kiosk, and device test | 45-90 minutes |
| Staff training support | 60-90 minutes |
| Parent communication review | 30-45 minutes |
| Daily parallel reconciliation | 20-30 minutes per day |

Total expected director time during launch week: 6-10 hours.

## Director Responsibilities

- Keep ProCare current until final cutover approval.
- Validate school profile, classrooms, staff, families, children, contacts, schedules, billing, and balances.
- Confirm sensitive fields: custody, authorized pickup, allergies, medication, medical notes, and emergency contacts.
- Attend required training.
- Confirm staff can log in and use their workflows.
- Approve parent communication before it is sent.
- Report discrepancies the same day.
- Sign off only when the school is truly ready.

## Implementation Timeline

| Day | Focus | Director action |
| --- | --- | --- |
| Day 0 | Kickoff | Attend kickoff, review checklist, confirm ProCare export access |
| Day 1 | School profile and staff | Validate school details, classrooms, ratios, users, staff |
| Day 2 | Data migration | Review imported families, children, contacts, medical, schedules |
| Day 3 | Billing and configuration | Review tuition, balances, Stripe/payment readiness, notifications |
| Day 4 | Training and devices | Train staff, test tablets, front desk, QR/PIN, kiosk |
| Day 5 | Parallel operation rehearsal | Run daily reconciliation and approve parent/staff communications |
| Days 6-14 | Parallel operation | Use both systems, reconcile daily, report exceptions |
| Day 15+ | Readiness review | Complete go-live scorecard and leadership approval |

## Director Checklist

- [ ] I can log in to The Bee Suite.
- [ ] I see only my school.
- [ ] My school name, address, phone, email, timezone, hours, and director contacts are correct.
- [ ] All classrooms/rooms are present.
- [ ] Room capacity and ratio rules are correct.
- [ ] Staff list and classroom assignments are correct.
- [ ] Teacher accounts are ready.
- [ ] Imported families and children match ProCare.
- [ ] Guardian emails, phones, and billing contacts are correct.
- [ ] Authorized pickups and emergency contacts are correct.
- [ ] Custody, allergy, medication, and medical notes are correct and restricted.
- [ ] Schedules and classroom assignments are correct.
- [ ] Tuition plans, recurring charges, one-time fees, discounts, subsidy/copay rules, and balances are correct.
- [ ] Parent payment status is understood and checkout is disabled unless approved.
- [ ] Kiosk check-in and check-out have been tested.
- [ ] Tablets/front desk devices are ready.
- [ ] Parent communication has been reviewed.
- [ ] Staff training is completed.
- [ ] Daily reconciliation process is understood.
- [ ] I know how to contact support and escalate issues.

## Training Schedule

| Session | Audience | Length | Required before |
| --- | --- | --- | --- |
| Director kickoff and launch overview | Director, assistant director | 45 minutes | Data validation |
| School setup and roster validation | Director, assistant director | 60 minutes | Import approval |
| Attendance, kiosk, and tablet workflow | Director, teachers, front desk | 60 minutes | Parallel attendance |
| Billing and balance validation | Director, billing owner | 60 minutes | Parent payment launch |
| Parent portal and communication | Director, assistant director | 45 minutes | Parent invites |
| Staff classroom workflow | Teachers | 45 minutes | Teacher daily use |
| Go-live readiness review | Director, corporate, support | 60 minutes | ProCare retirement |

## What To Enter In Each System During Parallel Operation

| Record or workflow | ProCare | The Bee Suite |
| --- | --- | --- |
| New enrollment | Enter officially | Enter after ProCare entry for parallel validation |
| Family contact update | Enter officially | Mirror update and confirm visibility |
| Attendance | Official record unless told otherwise | Parallel attendance and kiosk validation |
| Pickup authorization | Official record | Mirror and validate before kiosk use |
| Billing balance | Official record | Preview/reconcile only until approved |
| Parent payment | Current approved process | Disabled until payment approval |
| Staff schedule | Current approved process | Mirror and validate ratios/tablets |
| Documents | Current retention process | Upload/review after document readiness |

## Frequently Asked Questions

| Question | Answer |
| --- | --- |
| Do I stop using ProCare? | No. Continue ProCare until leadership sends final approval. |
| Can I invite all parents right away? | No. Start with approved test or pilot parent accounts after data validation. |
| Can parents pay tuition in The Bee Suite immediately? | No. Payments wait for Stripe Connect, billing validation, and approval. |
| What if I find incorrect data? | Log it on the discrepancy sheet, mark severity, and notify the implementation specialist. |
| What if staff see the wrong classroom? | Stop use for that staff account and escalate before they enter records. |
| What if a parent sees the wrong family? | Stop parent access and escalate immediately as a critical issue. |
| How long will parallel operation last? | At least until the school meets all go-live criteria, including 14 days without critical bugs. |
| Who decides when ProCare can be eliminated? | Corporate leadership, after director, operations, billing, support, and technical signoff. |

## Director Signoff

```text
School:
Director:
Assistant director:
Week:

I confirm:
- School profile is correct.
- Classrooms, capacity, and ratios are correct.
- Staff and teacher access are correct.
- Family, child, guardian, pickup, medical, and custody records are correct or exceptions are documented.
- Billing, tuition, balances, and payment readiness are verified or exceptions are documented.
- Attendance/kiosk/device workflows are tested.
- Staff training is complete.
- Parent communication is approved.
- Daily parallel reconciliation is being completed.

Director signature:
Date:

Implementation lead signature:
Date:
```
