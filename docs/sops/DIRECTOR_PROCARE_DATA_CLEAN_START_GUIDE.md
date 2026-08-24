# Director ProCare Data Clean-Start Guide - The BEE Suite

**Updated:** August 24, 2026

**Audience:** school directors, assistant directors, billing reviewers, and BEE Suite implementation support

**Purpose:** verify each school's imported data against its preserved ProCare exports before operational launch.

> DATA READINESS ONLY
>
> A clean data review does not authorize parent invitations, staff access, kiosk/PIN activation, attendance, tuition generation, payment collection, messaging, or ProCare retirement. Record those decisions separately in `SCHOOL_TRANSITION_SETUP_AND_CUTOVER_SOP.md`.

## 1. Use The Repository Export Package Correctly

The private canonical export root is `docs/procare-exports/<LOCATION>/`. It is intentionally excluded from Git because it contains private school records.

- `raw/` contains the original source evidence. Never edit, rename, normalize, or overwrite these files during director review.
- `review/` contains generated worksheets, exception lists, readiness reports, and dated reviewer outputs. These are aids, not a replacement for the raw source.
- `packages/` contains dated received packages and their rendered review outputs.
- `source-archives/`, ZIP, and RPT files are preserved source artifacts. Keep them recoverable; do not treat an unreadable archive as verified coverage.
- `SOURCE-MANIFEST.csv` maps former paths to canonical paths and hashes when duplicates were collapsed.

Classify a report from its headers and stable identifiers, not its filename. A misleading filename never expands what the file proves.

## 2. Complete Source Coverage Before Reviewing Values

Record `AVAILABLE`, `MISSING SOURCE`, or `NOT APPLICABLE` for each domain. `MISSING SOURCE` means `NOT VERIFIED`; it never means none exists.

| Director verifies | Preferred ProCare evidence | Required identity/evidence |
| --- | --- | --- |
| Family account and payer | Account Information, Account Data, Accounts | stable Account ID and payer Person ID |
| Child identity and enrollment | Child All Enrollment Status, Child Enrollment Status | stable Child ID, status, start/end date |
| Guardians and relationships | Child Relationships, Children and Relationships | Child ID, Person ID, relationship, account link |
| Emergency contacts and pickups | Relationship or Pickup People report | stable Person ID and explicit role/permission |
| Custody and child safety | Child Information Tracking and current school documents | exact source row plus current supporting record |
| Classroom and age group | Classroom Schedule or Children by Classroom | Classroom ID/name, assignment, capacity, ratio |
| Child schedule | Child Schedule, Weekly Schedule, Classroom Schedule | child identity, days/times, effective period |
| Tuition | Child Contract Billing Summary | Child ID, positive amount, cadence, description, effective date |
| Opening balance | Account Balance Summary or dated ledger | Account ID, signed amount, as-of date |
| Agency responsibility | Account Agency Relationships and primary/agency balance reports | program, child/account, authorization and amount |
| Current staff | Employee Information Tracking | Employee ID, current status, school/classroom |
| Attendance evidence | Child Time Card | Child ID, date/time, school/classroom |

Payment exports, immunization workbooks, photos, and historical timecards are reconciliation evidence only unless a separately reviewed importer explicitly supports them. Never recreate historical payments, charges, medical records, or access from evidence-only files.

## 3. Director FAQs

### Does `import complete` mean the school is accurate?

No. It means processing ended. Review the final batch status, imported/excluded/error counts, source coverage, reconciliation, and every exception before calling the data accurate.

### Can I match records by name, email, phone, address, or date of birth?

Not when ownership is ambiguous. Use stable Account, Person, Child, Classroom, and Employee IDs. Shared or misspelled contact information remains blocked until authoritative evidence resolves it.

### Does a blank safety field mean none?

No. Allergies, medical conditions, medications, emergency contacts, authorized pickups, and custody restrictions are separate checks. Record `director confirmed none` only after reviewing the current school record.

### Does an allergy entry complete the safety review?

No. Confirm severity, action plan, medication/instructions, medical notes, pickups, emergency contacts, custody restrictions, and supporting documents independently.

### Does the family owe every positive balance?

No. Separate family responsibility from agency/subsidy responsibility. Parent-facing balances and payment paths must contain only family responsibility.

### Can one sibling's tuition be copied to another?

Only when the signed child-level evidence proves the same amount, cadence, description, and effective date. Tuition is child-specific, and siblings may differ.

### Can I edit a shared tuition plan for one child?

No. Create a new child-specific plan or assignment so other assigned children retain their approved rate.

### What should I do with withdrawn or duplicate records?

Keep history. Correct status/end dates and exclude historical records from current operations. Do not delete or merge records containing identity, attendance, billing, payment, safety, or audit history without an approved reconciliation.

### Can parents be invited after the roster review?

Only after the separate invitation gate. A wrong guardian/family link can disclose another family's information.

### When can ProCare be retired?

Only after all applicable data domains are verified, exceptions and approvals are recorded, operational gates are independently decided, rollback evidence exists, and the named school has written cutover approval. Archive exports as recoverable backups after verified cutover; never delete them or leave them as active import inputs.

## 4. Start The School Review

Prerequisite: do not begin this director review until the exact school package has completed the Fleet Verification Gate and its current Fleet Verification Packet is `READY_FOR_DIRECTOR_REVIEW`. If it is `NOT_VERIFIED`, `BLOCKED`, missing, or tied to different source files, stop and return it for machine verification. Machine readiness permits this human review; it does not approve import, launch, billing, invitations, access, payments, retirement, or cutover.

1. Sign in at `https://thebeesuite.io/directors`.
2. Confirm the header shows the intended school and role. Stop immediately for wrong-school visibility.
3. Record school, director, export date, review date, target start date, and source-package location.
4. Confirm all raw reports belong to the same location and intended reporting period.
5. Complete the source-coverage table before reviewing individual values.
6. Open the latest dated `review/` package. Treat older reviews as historical evidence.
7. Create or update an exception register with domain, stable record ID, issue, source reference, affected gate, owner, due date, resolution, reviewer, and retest result.

## 5. Reconcile School, Classroom, And Roster Data

1. Verify school name, address, phone, time zone, operating hours, licensed capacity, director contact, notification recipients, and parent-facing name.
2. Compare active classrooms with the classroom/schedule exports.
3. For every classroom, verify name, age group, capacity, ratio, active status, current children, and assigned staff.
4. Hold duplicate, placeholder, `Unknown`, or zero-capacity classrooms unless current evidence proves they are intentional.
5. Compare current enrolled-child counts to the enrollment export.
6. For every child, verify name, Child ID, date of birth, enrollment status, start/end date, classroom, age group, schedule, and family Account ID.
7. Confirm each active child has exactly one current classroom. Do not default an unclear or part-time schedule to five days.
8. Keep withdrawn/historical children out of active roster, attendance, invitation, and tuition populations without deleting their history.

## 6. Reconcile Families, Guardians, And Safety

1. Open each current family and bind it to one stable source Account ID.
2. Verify every child belongs to the correct account.
3. Bind the primary payer only to the selected source Person ID and relationship evidence.
4. Verify each adult's name, relationship, email, phone, billing-contact status, emergency-contact status, and pickup authorization separately.
5. Hold any Person ID crossing active family accounts and any contact collision that lacks an explicit household/privacy decision.
6. Compare authorized pickups and prohibited pickups with the current signed school record.
7. Review custody documentation without inferring rights from payment, household name, or enrollment ownership.
8. Review allergies, severity, action plans, medical conditions, medications/instructions, emergency contacts, custody, and permissions independently.
9. Treat missing or conflicting custody, pickup, allergy, or medical information as a safety blocker.

## 7. Reconcile Tuition, Balances, And Agency Responsibility

1. Open `Billing & Payments` and select the exact school, family, and child.
2. For every current child, compare the assigned tuition with Child Contract Billing evidence.
3. Confirm amount, cadence, description, effective date/period, additional charges, discounts/credits, family portion, agency portion, and billing-enabled status.
4. Do not derive tuition from employee pay, account totals, a point-in-time balance, or monthly totals divided into weeks.
5. Compare opening balances with one dated account-level source using the same as-of date.
6. Reconcile charges, payments, credits, refunds, adjustments, open invoices, and agency responsibility. Never add a generic adjustment merely to force equality.
7. For subsidy families, verify program, authorization/reference, covered child, coverage dates, rate, family copay, claim evidence, external submission/reference, decision, and remittance separately.
8. Keep recurring billing, invoices, payments, autopay, and agency submission held until their independent approvals.

## 8. Reconcile Current Staff

1. Compare the BEE Suite staff roster with the current Employee Information export.
2. Verify stable Employee ID, name, current employment status, title, school, classroom, and contact information.
3. Keep former employees out of current operational lists without deleting their history.
4. Hold staff missing required Employee IDs or with ambiguous school/classroom assignments.
5. Do not create logins, grants, invitations, PINs, or Auth identities as part of data validation.

## 9. Perform Representative Spot Checks

Review at least 10 representative current families, or all families when fewer than 10. Include, when present: siblings, part-time care, school-age care, medical/allergy needs, multiple pickups, custody restrictions, subsidy, a positive balance, a credit, and recent enrollment/withdrawal.

Trace each sample end to end:

`Account -> children -> guardians -> pickups/custody -> safety -> classroom -> schedule -> tuition -> balance`

Spot checks supplement full count reconciliation; they do not replace it.

## 10. Resolve, Retest, And Sign Off

Every excluded or unresolved row requires:

- one affected row/record;
- resolution category and reason;
- exact source/evidence reference;
- reviewer identity and timestamp;
- approved correction or documented hold;
- exact retest and result.

Do not resolve identity, relationship, safety, financial, tuition, or staff ambiguity by inference. Correct the source and regenerate the review package whenever possible.

Record this summary for each domain:

| Field | Required value |
| --- | --- |
| Source filename and report date | exact canonical raw path and as-of/export date |
| Source/BEE counts | totals and current-population definitions |
| Matched/unresolved counts | exact counts |
| Result | `VERIFIED`, `NEEDS CORRECTION`, `MISSING SOURCE`, or `NOT APPLICABLE` |
| Reviewer | name and date/time |
| Exceptions | secure review-file path and owners |

## 11. Data-Ready Checklist

- [ ] Correct school and role scope verified.
- [ ] Required source domains are available or explicitly not applicable.
- [ ] School profile, classrooms, capacities, ratios, and staff assignments are accurate.
- [ ] Every active child has a stable identity, current family, classroom, status, and evidence-backed schedule.
- [ ] Guardians, payers, emergency contacts, pickups, and custody restrictions are verified separately.
- [ ] Allergies, medical conditions, medications, and action plans are verified or director-confirmed none.
- [ ] Tuition amount, cadence, description, and effective date are verified per child.
- [ ] Opening balances use a dated source and family/agency responsibility is separated.
- [ ] Current staff have stable evidence and correct school/classroom assignments.
- [ ] All exceptions have evidence, owner, due date, decision, and retest.
- [ ] At least 10 representative family chains were spot-checked.
- [ ] Final import reconciliation has no unresolved/disposed/error rows affecting required domains.
- [ ] Source exports and review evidence remain recoverable.
- [ ] Invitations, access, kiosk, attendance, billing, payments, messaging, and cutover remain separate decisions.

The school is data-ready only when the director can explain what each required value means, where it came from, how it was verified, and what remains held.
