# Review imported ProCare records

Category: Setup and support

Before you start: confirm the correct school and role. Use approved source records; perform live changes only within your assigned authority.

The director or approved ProCare administrator must confirm that the export package belongs to the correct location and contains the records the school relies on.

Use `DIRECTOR_PROCARE_DATA_CLEAN_START_GUIDE.md` as the required director procedure. The private source packages live under `docs/procare-exports/<LOCATION>/`; `raw/` is immutable source evidence and `review/` contains derived working files.

1. Confirm the export date, school name, and ProCare location.
2. Confirm the required family, child, relationship, classroom, staff, balance, tuition, and safety reports were included.
3. Confirm the BEE Suite implementation team accepted the package or documented any missing reports.
4. Confirm an import-complete notice or reviewed exception list exists for the school.
5. Compare aggregate family, child, classroom, staff, balance, and enrollment counts with ProCare.
6. Review all records with custody, pickup, allergy, medical, or other safety restrictions.
7. Spot-check at least 10 representative families across different classrooms and billing situations.
8. Record each domain as `VERIFIED`, `NEEDS CORRECTION`, `MISSING SOURCE`, or `NOT APPLICABLE`, with the exact raw source path, counts, reviewer, and exception owner.

For every spot-check, verify:

- Children are linked to the correct family and classroom.
- Guardians, payers, email addresses, and phone numbers are correct.
- Emergency contacts and authorized pickups are correct.
- Custody, medical, allergy, medication, and permission information is accurate.
- Enrollment status, schedule, start date, and classroom assignment are correct.
- The current balance, credits, open invoices, and tuition information match the approved source records.

Stop and hold the affected records if a guardian, payer, pickup, emergency contact, family relationship, date of birth, classroom, balance, or safety field is missing or ambiguous. Do not invent a value to make the import appear complete.

Skip this section only when the saved starting point is `START WITH A CLEAN WORKSPACE` and the school has confirmed that no prior records are expected.

## Verify the result

Reconcile source records, relationships and balances before readiness signoff.

## If something goes wrong

Keep recoverable source exports; do not treat import success as verification. Wait for pending actions; reopen the record before retrying an uncertain save or send.

Source: sources/SCHOOL_TRANSITION_SETUP_AND_CUTOVER_SOP.md — 3. Director ProCare Export And Import Review. Prepared October 8, 2026. SOP snapshot e06ad8d5; current source corrections are identified above. Written procedure; not a recording of a completed live action.
