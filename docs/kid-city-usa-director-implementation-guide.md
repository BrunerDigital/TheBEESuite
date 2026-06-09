# Kid City USA Director Implementation Guide

This guide is for school-level Kid City USA directors setting up their location in The BEE Suite after the CRM pilot. Each director user is already created with the school's email address. Initial password: `BusyBees`.

Kid City USA Enterprises pays the monthly software fees. Each location still needs to connect its own school bank account for tuition payouts before parent checkout can process tuition for that school.

## Before You Start

Have these items ready:

- The unencrypted ProCare export for families, guardians, children, emergency contacts, authorized pickups, schedules, allergies, medical notes, balances, and current classroom assignments.
- A current classroom list with age group, room name, licensed capacity, desired capacity, and staff-to-child ratio.
- Current staff roster with school email, role, classroom assignment, schedule, credentials, background check dates, and required onboarding documents.
- Current tuition rates, registration fees, deposits, subsidy rules, late fees, sibling discounts, and billing schedule.
- School bank account owner information for Stripe Connect payout onboarding.
- State licensing details, inspection dates, emergency drill cadence, medication rules, and required child/staff documents.
- School closure calendar, holidays, events, and reporting owners.

## Phase 1: Log In And Confirm The School Profile

1. Go to The BEE Suite login page.
2. Sign in with the school's email address and `BusyBees`.
3. If prompted, reset the password before continuing.
4. Open `School setup` from the left navigation.
5. Complete `School profile and launch ownership`.
6. Confirm:
   - School name
   - Director and assistant director contacts
   - Main phone number
   - Location address
   - Timezone
   - Operating hours
   - Planned go-live date
   - Final launch approver
7. Save the setup input.

Do not invite parents or turn on payments until the school profile, classrooms, staff, tuition, documents, and payout account are complete.

## Phase 2: Add Classrooms, Capacity, And Ratios

1. Open `Classroom` or use the `Classrooms and ratios` action from `School setup`.
2. Add every room used for care.
3. For each classroom, enter:
   - Room name
   - Age group
   - Licensed room capacity
   - Desired enrollment capacity
   - Ratio rule
   - Assigned teachers
   - Room schedule
4. Confirm the location's total licensed capacity matches the license.
5. Review classroom ratio warnings.
6. Assign staff coverage where a room has no teacher or upcoming coverage.

This step is required before importing children if the school wants children mapped into the correct classrooms during import.

## Phase 3: Add Teachers And Staff

1. Open `Teachers`.
2. Add each staff member.
3. Assign:
   - Role
   - School email
   - Classroom
   - Schedule
   - Permissions
   - Start date
4. Upload or track required staff documents:
   - Background check
   - CPR / First Aid
   - Training records
   - State-required onboarding forms
   - Any school-specific teacher forms
5. Review staff credential expirations.
6. Confirm teachers can access the teacher portal/tablet workflows they need.

Teacher classroom access depends on these assignments, so complete this before using daily reports, attendance, classroom logs, or parent messages from teachers.

## Phase 4: Import Families, Guardians, And Children

1. Open `Family detail`.
2. Start the ProCare import workflow.
3. Upload or provide the unencrypted ProCare export.
4. Review duplicate matches for:
   - Families
   - Children
   - Guardians
5. Resolve duplicates before final import.
6. Confirm each family has:
   - Family name
   - Billing contact
   - Guardian names
   - Guardian emails and phones
   - Authorized pickups
   - Emergency contacts
   - Custody notes or restrictions
   - Communication preferences
7. Confirm each child has:
   - Full name
   - Date of birth
   - Classroom
   - Enrollment status
   - Schedule
   - Allergies
   - Medication needs
   - Permissions
   - Required documents
8. Save and review import results.

If a guardian email is missing, do not invite that guardian to the parent portal until the email is corrected.

## Phase 5: Complete Required Documents

1. Open `Documents`.
2. Open the required document checklist.
3. Confirm family-level requirements:
   - Emergency card
   - Authorized pickup form
   - Parent handbook acknowledgment
   - Tuition policy acknowledgment
4. Confirm child-level requirements:
   - Enrollment application
   - Immunization record
   - Health record
   - Allergy or medication authorization when applicable
   - Photo/media permission
5. Confirm staff-level requirements:
   - Staff onboarding forms
   - Background check
   - Training records
   - CPR / First Aid
   - Any state-specific credential records
6. Upload missing files.
7. Review expiration dates.
8. Mark documents reviewed only after the director or authorized admin verifies them.

## Phase 6: Configure Tuition, Fees, And Billing Rules

1. Open `Settings` or `Billing & invoices`.
2. Enter all tuition plans by program and schedule.
3. Add:
   - Registration fee
   - Deposit rules
   - Sibling discount
   - Late fee
   - Supply or activity fees
   - Subsidy/copay rules
4. Confirm billing cadence:
   - Weekly, biweekly, or monthly
   - Invoice generation day
   - Due date
   - Late fee timing
5. Enter opening balances from ProCare only after the migration cutover date is confirmed.
6. Review fee disclosures before sending parent invoices.

Do not enable live parent tuition checkout until Stripe Connect payout onboarding is complete and reviewed.

## Phase 7: Connect The School Bank Account For Tuition Payouts

1. Open `Payments`.
2. Start Stripe Connect payout onboarding.
3. Use the school owner or authorized finance contact for verification.
4. Connect the school's bank account.
5. Complete all required Stripe verification items.
6. Return to The BEE Suite and confirm:
   - Details submitted
   - Charges enabled
   - Payouts enabled
   - No open payout requirements
7. Run a billing dry run before inviting parents to pay online.

Kid City USA Enterprises covers the BEE Suite software billing. This payout setup is only for tuition and school-level family payments.

## Phase 8: Configure Parent Portal Access

1. Open `Parent portal`.
2. Review every guardian linked to each family.
3. Decide which guardians should receive portal invites.
4. Confirm each invited guardian has:
   - Correct email
   - Correct phone number
   - Correct family link
   - Correct child visibility
   - Correct custody restrictions
5. Invite billing contacts first if payments are going live.
6. Invite remaining guardians after family records and documents are reviewed.
7. Verify parents can see only their own family, children, invoices, documents, messages, daily reports, and acknowledgments.

## Phase 9: Set Up Attendance, Kiosk, QR, And PIN Workflows

1. Open `Attendance`.
2. Confirm active children and classroom assignments.
3. Open the kiosk check-in workflow.
4. Confirm guardian PIN or QR options for authorized pickups.
5. Review authorized pickup lists before enabling check-in/out.
6. Test:
   - Parent check-in
   - Parent check-out
   - Staff check-in
   - Classroom attendance view
   - Late pickup flag
   - Ratio snapshot
7. Confirm teachers understand their tablet workflow for attendance and daily logging.

## Phase 10: Configure Messaging And Notifications

1. Open `Messages`.
2. Review message templates.
3. Confirm broadcast segments:
   - Classroom
   - Center
   - Enrollment status
   - Tags
4. Confirm who can send:
   - Director announcements
   - Teacher classroom messages
   - Billing messages
   - Emergency or urgent reminders
5. Open `Notifications`.
6. Configure notification preferences by role/user.
7. Confirm email/SMS delivery channels for urgent workflows.
8. Review AI reply suggestions before sending. AI drafts should never be sent without staff approval.

## Phase 11: Configure Calendar, Closures, And Weekly FTE

1. Open `Calendar`.
2. Add:
   - School closures
   - Holidays
   - Staff training days
   - Parent events
   - Tours
   - Billing due dates
   - Compliance reminders
3. Connect Google Calendar if the school uses it operationally.
4. Open `FTE reports`.
5. Confirm the reporting owner.
6. Submit weekly FTE by Friday at noon.
7. Watch for missing-report escalations:
   - Friday 8:00 AM reminder if not submitted
   - Friday 1:00 PM escalation, one hour after the noon deadline

## Phase 12: Configure Compliance, Incidents, And Medication Logs

1. Open `Compliance`.
2. Enter state licensing configuration.
3. Add:
   - License number
   - Agency name
   - Inspection dates
   - Renewal dates
   - Emergency drill cadence
   - Medication log rules
   - Required child documents
   - Required staff documents
4. Open emergency drill logs and enter upcoming or completed drills.
5. Review medication log workflow.
6. Confirm incident admin review workflow.
7. Confirm parent acknowledgment status is tracked.
8. Assign compliance tasks and reminders.
9. Test compliance export for licensing/records requests.

## Phase 13: Review Enrollment, Tours, Waitlist, And Registration

1. Open `CRM leads`.
2. Confirm current inquiries are assigned to the correct location.
3. Open `Pipeline`, `Tours`, and `Waitlist`.
4. Confirm:
   - Lead source
   - Desired start date
   - Age group interest
   - Tour status
   - Application status
   - Waitlist priority
5. Open `Forms` and review online registration packet fields.
6. Confirm document/signature collection for registration.
7. Review application approval or rejection workflow.
8. Collect registration fee/deposit only after payments are finalized.

## Phase 14: Review Reports And Dashboard Widgets

1. Open `Dashboard`.
2. Configure dashboard widgets for the director role.
3. Open `Analytics`.
4. Review:
   - Lead source and funnel conversion
   - Attendance/absence trends
   - Billing/revenue/AR reports
   - Parent response time and message analytics
   - Compliance trends
5. Export CSV/PDF reports needed for school operations.

## Phase 15: Run Launch Smoke Test

Before go-live, test each role and workflow:

- Director can log in, see only their school, and complete setup.
- Teacher can log in, see assigned classroom, and complete attendance/daily logs.
- Parent can log in, see only their family, documents, invoices, messages, and child updates.
- Kiosk check-in/out works with authorized guardian PIN or QR.
- Family import has no unresolved duplicates.
- Required documents are visible and expiring documents are flagged.
- Tuition plans and opening balances are correct.
- Stripe Connect payout status is ready.
- Invoice generation and checkout dry run are reviewed.
- Messages, broadcasts, notifications, and SMS/email delivery are routed correctly.
- Incidents, medication logs, emergency drills, and compliance exports are working.
- FTE report submission is ready for Friday noon.

## What The Director Must Provide

The BEE Suite can help organize and import data, but the system cannot reliably infer these items:

- Unencrypted ProCare export files.
- Final classroom names, capacities, and ratio rules.
- Exact licensed capacity for the school and each room.
- Current staff roster and teacher classroom assignments.
- Staff credential, training, and background check dates.
- Final tuition rates, fees, discounts, subsidy rules, and cutover balances.
- School bank account owner and payout verification information.
- Missing guardian emails or phone numbers.
- Custody, pickup, allergy, medication, and emergency contact corrections.
- State-specific licensing requirements if the school has local rules beyond the default checklist.
- Final launch date and director sign-off.

