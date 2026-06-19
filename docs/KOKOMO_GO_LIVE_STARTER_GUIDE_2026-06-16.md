# Kid City USA Kokomo BEE Suite Starter Guide

Last updated: June 16, 2026

Assumption: "open on Monday" means Monday, June 22, 2026. If Kokomo meant Monday, June 15, 2026, treat every pre-launch item below as same-day cleanup before staff enter live records.

## Launch Scope

Location:

- School: Kid City USA - Kokomo
- Location ID / CRM location ID: `IN | Kokomo`
- Address: `1998 Bent Creek Road, Kokomo, IN 46901`
- Phone: `855-543-2489`
- Director/login email to verify: `kokomo@kidcityusa.com`
- Starting enrolled children: `5`

Day-one goal:

- Kokomo can log in, verify the school profile, enter the 5 enrolled children, set up the core classroom/staff records, test attendance/kiosk, test teacher daily reports, and invite parents only after the family records are verified.

Do not enable live parent tuition checkout until Kokomo's Stripe Connect payout account, disclosures, refund/dispute handling, and payment approval are complete.

## Before The Walkthrough

Have Kokomo bring this information for each of the 5 children:

| Data area | Required fields |
| --- | --- |
| Family | Family name, home address, billing email, preferred contact method |
| Guardians | Primary guardian, secondary guardian, email, phone, relationship, billing contact flag |
| Child | Legal name, preferred name, date of birth, age group, enrollment status, start date |
| Classroom | Classroom/room name, schedule, full-time or part-time status |
| Safety | Allergies, medication notes, medical action plan, custody notes, authorized pickups |
| Emergency | Emergency contacts, phone numbers, relationship |
| Permissions | Photo/video, field trip, sunscreen/topical, handbook/tuition acknowledgments |
| Billing | Tuition plan, registration/deposit, opening balance if any |
| Kiosk | Guardian 4 digit PIN decision, authorized pickup verification notes |
| Documents | Enrollment packet, immunization/health record, emergency card, policy acknowledgments |

Internal preflight for BrunerDigital/Kid City support:

1. Confirm Kokomo exists as an active center with `locationId` and `crmLocationId` set to `IN | Kokomo`.
2. Confirm `kokomo@kidcityusa.com` exists, is active, and has center-scoped access only to Kokomo.
3. Confirm the login URL is `https://thebeesuite.io/login`.
4. Confirm whether Kokomo should use a temporary password or password reset email.
5. Confirm parent payments stay off unless Stripe readiness is approved.
6. Confirm the first support contact and escalation path for launch day.

## Walkthrough Agenda

Use this as the call script with the Kokomo director.

### 1. Login And Verify School Scope

1. Go to `https://thebeesuite.io/login`.
2. Sign in as `kokomo@kidcityusa.com`.
3. Reset the password if prompted.
4. Confirm the visible school is Kid City USA - Kokomo.
5. Stop immediately if the dashboard shows another school or cross-location data.

### 2. Complete School Setup

1. Open `School setup`.
2. Fill in school profile and launch ownership.
3. Confirm operating hours, timezone, director/assistant director contacts, and launch approver.
4. Save the setup section.

Minimum fields for first week:

- School name and address
- Director contact
- Operating hours
- Planned go-live date
- Final launch approver
- First-week support contact

### 3. Add Classrooms And Staff

1. Open `Classroom` or `School setup` > `Classrooms and ratios`.
2. Create every classroom that will have one of the 5 enrolled children on day one.
3. Add licensed capacity, desired capacity, ratio rule, and age group for each room.
4. Open `Teachers`.
5. Add each teacher who needs a tablet or classroom workflow.
6. Assign each teacher to the correct classroom.
7. Save any generated teacher username and temporary password for handoff.

Minimum first-week setup:

- At least one classroom for every enrolled child.
- At least one teacher assigned to each active classroom.
- Teacher access tested before live daily reports.

### 4. Enter The 5 Enrolled Children

Use `Family detail` or the family/student intake flow. Enter one family at a time and validate before moving to the next.

Recommended order:

1. Create or find the family.
2. Add primary guardian and billing contact.
3. Add secondary guardian if applicable.
4. Add authorized pickups and emergency contacts.
5. Add the child record.
6. Assign classroom, schedule, and enrollment status.
7. Add allergy, medication, custody, and safety notes.
8. Add photo/video and field trip permissions.
9. Add required documents or mark what is missing.
10. Add billing plan/opening balance only if the amount has been verified.
11. Set or confirm guardian kiosk PIN if attendance is going live.
12. Save and confirm the child appears in the correct classroom roster.

Validation after each child:

- Child is linked to the correct family.
- Guardians are linked to the family.
- Billing contact is correct.
- Classroom assignment is correct.
- Sensitive notes are entered only where needed.
- Parent portal invite is not sent until the record is reviewed.

### 5. Test Attendance And Kiosk

1. Open `Attendance`.
2. Confirm the 5 children appear in the correct classroom.
3. Set or confirm a test guardian PIN.
4. Open the center-specific kiosk route from the attendance/kiosk area.
5. Search for the test child/family.
6. Complete a check-in.
7. Complete a check-out.
8. Confirm the attendance log appears under Kokomo only.

Stop conditions:

- Wrong child returned.
- Wrong school shown.
- Duplicate check-in cannot be resolved.
- Unauthorized pickup can complete an action.

### 6. Test Teacher Workflow

1. Log in as one Kokomo teacher or use the teacher tablet with the assigned classroom account.
2. Open `Teacher portal`.
3. Confirm the teacher sees only assigned classroom children.
4. Mark attendance for one child.
5. Add a daily report with meal, nap, activity, and note.
6. Submit the report.
7. Create a test incident only if the director knows it is a test and can clean it up.
8. Confirm the director can review teacher-submitted items.

### 7. Parent Portal Readiness

Only invite parents after the family and child records are reviewed.

1. Open the family profile.
2. Confirm guardian email and phone.
3. Confirm child visibility and custody restrictions.
4. Confirm the kiosk PIN or QR setup.
5. Send one test invite to a trusted parent/internal test contact first.
6. Confirm the parent sees only their family, children, documents, messages, daily reports, and invoices.
7. Invite the remaining parents after the test is clean.

### 8. Billing And Payments

For first week, billing can be tracked without enabling live checkout.

1. Open `Billing & invoices`.
2. Confirm tuition plan, fees, discounts, and any opening balance.
3. Add invoices only after amounts are verified.
4. Keep parent checkout disabled until Stripe Connect is ready.
5. Open `Payments` or `Billing Settings` only with the director or owner who can complete school payout onboarding.

### 9. Communications, Documents, And FTE

1. Open `Messages`; send a test staff/internal message if needed.
2. Open `Documents`; confirm required family and child documents.
3. Open `Compliance`; enter any known licensing dates or reminders needed for first week.
4. Open `FTE reports`; confirm the director knows the weekly Friday noon submission workflow.
5. Open `Notifications`; confirm Kokomo can see action items for its own school only.

## Launch-Day Checklist

Run this on Monday morning before live child drop-off:

- Director can log in.
- Teacher can log in.
- Kokomo dashboard shows only Kokomo.
- All 5 children are in the correct classroom.
- Guardian contacts and pickups are reviewed.
- Allergy/medical/custody notes are entered and restricted.
- Kiosk test check-in and check-out works.
- Teacher daily report test works.
- Parent portal test account shows only the linked family.
- Parent payments are disabled unless Stripe approval is complete.
- Support contact is available during drop-off and pickup windows.

## First-Week Operating Rhythm

Daily, Monday through Friday:

1. Check login issues by role.
2. Review roster corrections from the director.
3. Reconcile attendance at end of day.
4. Review teacher daily reports before parent confidence depends on them.
5. Check parent portal invite issues.
6. Review billing questions but do not turn on payment processing until approved.
7. Log any data corrections as Kokomo-specific support notes.

Friday:

1. Have the director submit FTE before noon Eastern.
2. Confirm any missing documents or records from the 5 starting children.
3. Decide whether to invite additional parents or enable more modules the next week.

## Key Reminders For Kokomo

- Enter real child data only after confirming the visible school is Kokomo.
- Do not use another school's data as a template.
- Do not paste child, medical, custody, or payment details into chat or unsecured support tickets.
- AI suggestions are drafts only. Staff must review anything related to children, billing, safety, incidents, custody, medical, legal, or compliance.
- Parent checkout waits for Stripe Connect and approval. The rest of the school setup can proceed without payments.

## Walkthrough Videos

Captioned role walkthrough videos can be generated with:

```bash
node scripts/render-kokomo-walkthrough-videos.mjs
```

The generated files are written to:

```text
outputs/walkthroughs/
```

The source deck is:

```text
docs/KOKOMO_ROLE_WALKTHROUGHS_2026-06-16.html
```
