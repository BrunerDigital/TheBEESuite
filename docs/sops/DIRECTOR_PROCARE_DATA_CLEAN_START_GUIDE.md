# Director's School Data Clean-Start Checklist - The BEE Suite

**Updated:** August 24, 2026

**For:** school directors and assistant directors

**Goal:** confirm that the families, children, classrooms, safety information, tuition, balances, and staff shown in The BEE Suite are correct before the school begins using them.

> START HERE
>
> Compare The BEE Suite with the review packet for your school. Mark what is correct, write down what needs to be fixed, and stop when information is missing or unclear. You are not expected to repair import files or guess which record is right. Finishing this checklist does not turn on invitations, access, kiosk PINs, attendance, billing, payments, messages, or ProCare cutover; each requires a separate approval.

## Before You Begin

Ask your BEE Suite implementation contact for these items:

- [ ] Your school's current Fleet Verification Packet marked `READY_FOR_DIRECTOR_REVIEW`.
- [ ] Your school's current review workbook, including the current-enrollment count and exact source-file paths prepared by BEE Suite support.
- [ ] The date of the ProCare exports used for the review.
- [ ] The name of the person who will receive your corrections.

**Stop and ask for help if:**

- the packet is missing or is not marked `READY_FOR_DIRECTOR_REVIEW`;
- the packet names a different school or different export date;
- The BEE Suite opens to the wrong school; or
- you cannot find the source information needed to confirm an answer.

Do not use an older packet just because it is available. Do not edit the original ProCare exports.

## How To Mark Your Review

Use one of these four answers for every section:

| Mark | What it means | What to do |
| --- | --- | --- |
| `CORRECT` | The BEE Suite matches the school record. | Check the item and continue. |
| `NEEDS FIXING` | You found a specific difference. | Write down the family, child, or staff member and the correction needed. |
| `MISSING INFORMATION` | The answer cannot be proven from the packet or current school record. | Stop that item and request the missing information. |
| `NOT USED` | The item truly does not apply to this school or family. | Add a short reason. |

Never guess. A blank field means "not yet confirmed," not "none."

For every section you review, use the exact source-file path already entered in the review workbook by BEE Suite support. It should begin with `docs/procare-exports/<YOUR SCHOOL>/raw/`. The Fleet Verification Packet shows source filenames but does not show this full repository path. You do not need to find or open the repository folder yourself. Stop and ask support to complete the workbook when a full path is missing.

## Step 1 - Confirm You Are Reviewing The Correct School

1. Go to `https://thebeesuite.io/directors` and sign in.
2. Check the school name at the top of the page.
3. Confirm the review packet shows the same school.
4. Write down the school name, your name, review date, ProCare export date, and planned BEE Suite start date if one has been assigned.

**Pass this step when:** the school name and review dates agree.

**Stop when:** you see another school, the packet is outdated, or records from more than one location appear together.

## Step 2 - Check The School, Classrooms, And Children

### School information

- [ ] School name and parent-facing name are correct.
- [ ] Address, phone number, time zone, and operating hours are correct.
- [ ] Director and notification contacts are correct.
- [ ] Licensed capacity is correct.

### Classrooms

For each active classroom, check:

- [ ] classroom name and age group;
- [ ] capacity and ratio;
- [ ] assigned teachers; and
- [ ] current children.

Mark duplicate rooms, placeholder rooms, `Unknown` rooms, or zero-capacity rooms as `NEEDS FIXING` unless your current school record proves they are intentional.

### Children

For each currently enrolled child, check:

- [ ] legal/preferred name and date of birth;
- [ ] enrollment status and start date;
- [ ] correct family;
- [ ] one current classroom;
- [ ] age group; and
- [ ] actual scheduled days and times.

Do not turn an unclear or part-time schedule into five days. Former or withdrawn children may remain in history, but they must not appear as currently enrolled.

**Pass this step when:** every current child belongs to the correct family and has the correct status, classroom, and schedule.

## Step 3 - Check Families, Contacts, Pickups, And Safety

Open each current family record and review every child and adult connected to it.

### Family and contact information

- [ ] Every child is in the correct family.
- [ ] The primary payer is correct.
- [ ] Each adult's name, relationship, email, and phone are correct.
- [ ] Billing contacts are marked correctly.
- [ ] Emergency contacts are marked correctly.
- [ ] Authorized pickups are marked correctly.
- [ ] Anyone prohibited from pickup is clearly recorded.

### Child safety information

Check each item separately:

- [ ] allergies and severity;
- [ ] allergy or medical action plan;
- [ ] medical conditions;
- [ ] medications and instructions;
- [ ] emergency contacts;
- [ ] pickup permissions; and
- [ ] custody restrictions and supporting documents.

An allergy entry by itself does not complete the safety review. If the child has no information in one of these areas, record `director confirmed none` only after checking the current school record.

**Stop immediately when:** custody, pickup permission, allergies, medications, or medical instructions are missing, conflicting, or attached to the wrong child.

## Step 4 - Check Tuition And Opening Balances

In The BEE Suite, open `Billing & Payments`. Select the correct school, then the family and child you are reviewing.

### Tuition - check every current child

- [ ] tuition amount;
- [ ] weekly, biweekly, four-week, monthly, or other billing schedule;
- [ ] program or tuition description;
- [ ] date the rate begins;
- [ ] additional recurring charges;
- [ ] discounts or credits;
- [ ] parent/family portion; and
- [ ] agency or subsidy portion.

Tuition belongs to the individual child. Do not copy one sibling's rate to another unless the signed child-level record confirms every detail is the same. Do not edit a shared tuition plan to correct only one child; report the child-specific correction instead.

### Opening balance - check every current family

- [ ] balance amount matches the dated school record;
- [ ] the "as of" date is the same in both places;
- [ ] charges, payments, credits, refunds, and adjustments explain the balance;
- [ ] parent responsibility is separated from agency/subsidy responsibility; and
- [ ] a credit is shown as a credit, not an amount owed.

Never add a general adjustment simply to make two totals match. Report the difference so it can be researched.

**Important:** reviewing tuition and balances does not approve invoices, autopay, payment collection, or agency claim submission.

## Step 5 - Check Current Staff

For every current employee, check:

- [ ] name;
- [ ] current employment status;
- [ ] title or role;
- [ ] correct school;
- [ ] classroom assignment, when applicable; and
- [ ] contact information.

Former employees may remain in history but must not appear as current staff. Report duplicate employees, missing employees, or anyone assigned to the wrong school or classroom.

Do not create staff logins, invitations, access permissions, or PINs during this review.

## Step 6 - Compare The School Totals

Use the totals named below and compare them with the matching totals in The BEE Suite. Do not compare a current-only total with an all-record total. Record the results in the review workbook.

| Total to compare | Where to find the source total | Source total | The BEE Suite | Difference | Result |
| --- | --- | --- | --- | --- | --- |
| All imported families | Fleet Verification Packet |  |  |  |  |
| All imported child IDs | Fleet Verification Packet |  |  |  |  |
| All imported classroom IDs | Fleet Verification Packet |  |  |  |  |
| All imported employee IDs | Fleet Verification Packet |  |  |  |  |
| Signed opening-balance total | Fleet Verification Packet |  |  |  |  |
| Currently enrolled children | Review workbook |  |  |  |  |

If any totals differ, mark the line `NEEDS FIXING` and identify which records are missing, extra, duplicated, or in the wrong status. Do not mark the school `DATA CORRECT` until every difference is corrected and checked again, or formally recorded as `NOT USED` with an approved reason.

## Step 7 - Perform A Family Spot Check

Review at least 10 current families from beginning to end. If the school has fewer than 10, review all current families.

Include these examples when the school has them:

- siblings;
- part-time care;
- school-age care;
- allergies or medical needs;
- multiple authorized pickups;
- custody restrictions;
- agency/subsidy care;
- a family with an amount owed;
- a family with a credit; and
- a recent enrollment or withdrawal.

For each sample, follow this order:

`Family -> children -> adults -> pickups/custody -> safety -> classroom -> schedule -> tuition -> balance`

The spot check is an extra safeguard. It does not replace checking the full roster and totals.

## Step 8 - Record Corrections And Review Them Again

For every item marked `NEEDS FIXING` or `MISSING INFORMATION`, record:

- school name;
- family, child, classroom, or employee name;
- the ID shown in the review packet, when available;
- what The BEE Suite currently shows;
- what the school record shows;
- where the correct answer came from;
- the exact source-file path supplied in the review workbook;
- who is responsible for the correction; and
- whether the item affects safety, family privacy, tuition, balances, staff, or launch readiness.

After support reports that the item is corrected:

1. Open the record again.
2. Compare it with the same school evidence.
3. Mark the retest `CORRECT` or return it for another correction.
4. Add your name and the retest date.

Do not resolve unclear identity, family relationships, safety information, tuition, balances, or staff assignments by making your best guess.

## Director Sign-Off Checklist

- [ ] I reviewed the correct school and the current review packet.
- [ ] School information and classrooms are correct.
- [ ] Every current child is in the correct family and classroom with the correct schedule.
- [ ] Guardians, payers, emergency contacts, pickups, and custody restrictions are correct.
- [ ] Allergies, medical needs, medications, and action plans are correct or confirmed as none.
- [ ] Tuition amount, billing schedule, description, and start date are correct for each child.
- [ ] Opening balances use the same date and separate parent responsibility from agency responsibility.
- [ ] Current staff and classroom assignments are correct.
- [ ] Imported family, child, classroom, employee, and signed opening-balance totals match the Fleet Verification Packet.
- [ ] The currently enrolled child total matches the review workbook.
- [ ] I completed at least 10 family spot checks, or all families when fewer than 10.
- [ ] Every correction has an owner and has been reviewed again after the change.
- [ ] The original exports and review evidence remain available.
- [ ] Every reviewed section includes the exact source-file path supplied in the review workbook.
- [ ] I understand that invitations, staff access, kiosk/PINs, attendance, billing, payments, messaging, and ProCare cutover still require separate approval.

**School:** _______________________________________________

**Director:** _____________________________________________

**Review completed on:** __________________________________

**Open corrections remaining:** ____________________________

**Director result:** `DATA CORRECT` / `CORRECTIONS REQUIRED` / `MISSING INFORMATION`

**Director signature:** ____________________________________

## Frequently Asked Questions

### Does "import complete" mean everything is correct?

No. It only means the import process ended. The director review confirms whether the records are accurate.

### Can I match a person by name, email, or phone number?

Not when there is any doubt. Families may share contact information, and names may be misspelled. Report the uncertain match so support can verify it using the source IDs.

### Does a blank allergy, pickup, or custody field mean there is nothing to report?

No. A blank means the information has not been confirmed. Check the current school record before marking `director confirmed none`.

### Does the parent owe every positive balance?

No. Part of the balance may belong to an agency or subsidy program. Only the verified family portion should be shown to the parent for payment.

### Can I delete a duplicate or withdrawn record?

Do not delete it during this review. Report the duplicate or incorrect status. Billing, attendance, safety, and audit history may need to be preserved.

### Can parents be invited as soon as the family list looks correct?

No. Parent invitations have a separate approval because the wrong family connection could show private information to the wrong person.

### When can the school stop using ProCare?

Only after all required data is verified, corrections are closed or formally held, separate operating features are approved, a recoverable backup exists, and the school receives written cutover approval.
