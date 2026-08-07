# Current Per-School Module Needs - 2026-08-04

Generated: 2026-08-05T01:19:46.529Z

Source: read-only `scripts/pilot-readiness-check.ts --all --module setup --module parent-invitations --module kiosk --module billing` against the configured Supabase database. No invitations, billing, access, PINs, provider settings, or rollout states were changed.

## Summary

- Overall status: BLOCKED
- Selected schools: 73
- Schools with rollout gaps: 73
- Failures: 1
- Warnings: 10
- Child/classroom center mismatches: 0

## Module Counts

| Module | Status Counts |
| --- | --- |
| setup | BLOCKED: 55; DATA READY: 18 |
| parent-invitations | BLOCKED: 73 |
| kiosk | BLOCKED: 72; MANUAL APPROVAL REQUIRED: 1 |
| billing | BLOCKED: 55; MANUAL APPROVAL REQUIRED: 18 |

## Per-School Needs

### Kid City USA - Altamonte - Douglas

- Location ID: Kid City USA - FL | Altamonte - Douglas
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Altamonte - Fruitland

- Location ID: Kid City USA - FL | Altamonte - Fruitland
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Altamonte - Maitland

- Location ID: Kid City USA - FL | Altamonte - Maitland
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Apopka

- Location ID: Kid City USA - FL | Apopka
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Avon

- Location ID: Kid City USA - IN | Avon
- Counts: classrooms 8, staff 1, families 84, children 99, guardians 49, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import is not complete and error-free.; 1 guardian(s) need a valid invitation email; 1 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 49 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Bargersville

- Location ID: Kid City USA - IN | Bargersville
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Beach Blvd

- Location ID: Kid City USA - FL | Jacksonville - Beach
- Counts: classrooms 11, staff 10, families 135, children 224, guardians 51, guardian logins 38, guardian PINs 40, director/billing grants 2
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: 13 guardian(s) need a valid invitation email Requires separate approval.
- kiosk: BLOCKED: 11 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Brownsburg

- Location ID: Kid City USA - IN | Brownsburg
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Canton

- Location ID: Kid City USA - NC | Canton
- Counts: classrooms 12, staff 19, families 65, children 75, guardians 69, guardian logins 56, guardian PINs 67, director/billing grants 2
- setup: BLOCKED: 1 currently enrolled child(ren) without classroom assignment
- parent-invitations: BLOCKED: 1 currently enrolled child(ren) without classroom assignment; 10 guardian(s) need a valid invitation email; 1 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 1 currently enrolled child(ren) without classroom assignment; 2 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: BLOCKED: 1 currently enrolled child(ren) without classroom assignment Requires separate approval.

### Kid City USA - College Park

- Location ID: Kid City USA - FL | College Park
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Columbia

- Location ID: Kid City USA - TN | Columbia
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Cordera (Colorado Springs)

- Location ID: Kid City USA - CO | Colorado Springs - Cordera
- Counts: classrooms 6, staff 7, families 395, children 461, guardians 98, guardian logins 62, guardian PINs 70, director/billing grants 2
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import is not complete and error-free.; The linked ProCare import still has errors, unresolved warnings, or disposed source rows.; The ProCare source package still contains unresolved account, child, or relationship coverage warnings.; 13 guardian(s) need a valid invitation email; 10 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 28 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Corpus Christi

- Location ID: Kid City USA - TX | Corpus Christi
- Counts: classrooms 6, staff 1, families 75, children 42, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 2
- setup: BLOCKED: no guardian records
- parent-invitations: BLOCKED: no guardian records; The linked ProCare import is not complete and error-free.; The linked ProCare import still has errors, unresolved warnings, or disposed source rows.; The ProCare source-file inventory was not confirmed before import.; Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no guardian records Requires separate approval.

### Kid City USA - Daytona Beach East

- Location ID: Kid City USA - FL | Daytona Beach East
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - DeLand - Ameila

- Location ID: Kid City USA - FL | Deland - Amelia
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - DeLand - Orange

- Location ID: Kid City USA - FL | Deland - Orange
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Deltona - Howland

- Location ID: Kid City USA - FL | Deltona - Howland
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Durbin

- Location ID: Kid City USA - FL | Jacksonville - Durbin
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Elkhart

- Location ID: Kid City USA - IN | Elkhart
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Friendswood

- Location ID: Kid City USA - TX | Friendswood
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Fruit Cove

- Location ID: Kid City USA - FL | Jacksonville - Fruit Cove
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Garland

- Location ID: Kid City USA - TX | Garland
- Counts: classrooms 7, staff 1, families 241, children 327, guardians 96, guardian logins 56, guardian PINs 88, director/billing grants 2
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import is not complete and error-free.; The linked ProCare import still has errors, unresolved warnings, or disposed source rows.; The rendered ProCare package was not fully reviewed or did not exclude every unresolved row.; The rendered ProCare account, registration, and enrollment-status reports are not all present.; The ProCare source package still contains unresolved account, child, or relationship coverage warnings.; 38 guardian(s) need a valid invitation email; 7 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 8 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Glen St. Mary

- Location ID: Kid City USA - FL | Glen Saint Mary
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Granbury

- Location ID: Kid City USA - TX | Granbury
- Counts: classrooms 6, staff 1, families 237, children 200, guardians 122, guardian logins 105, guardian PINs 116, director/billing grants 2
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import is not complete and error-free.; The linked ProCare import still has errors, unresolved warnings, or disposed source rows.; Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; 7 guardian(s) need a valid invitation email; 1 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 6 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Grand Junction

- Location ID: Kid City USA - CO | Grand Junction
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Greenwood

- Location ID: Kid City USA - IN | Greenwood
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Hampton

- Location ID: Kid City USA - FL | Hampton
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Highlands Ranch

- Location ID: Kid City USA - CO | Highlands Ranch
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Holly Hill

- Location ID: Kid City USA - FL | Holly Hill
- Counts: classrooms 16, staff 1, families 283, children 120, guardians 102, guardian logins 71, guardian PINs 91, director/billing grants 2
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; 15 guardian(s) need a valid invitation email; 5 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 11 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Jasper - Baden Strasse

- Location ID: Kid City USA - IN | Jasper - Baden Strasse
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Jasper - Truman

- Location ID: Kid City USA - IN | Jasper - Truman
- Counts: classrooms 8, staff 1, families 1023, children 1341, guardians 175, guardian logins 150, guardian PINs 162, director/billing grants 1
- setup: BLOCKED: 1 currently enrolled child(ren) without classroom assignment
- parent-invitations: BLOCKED: 1 currently enrolled child(ren) without classroom assignment; The linked ProCare import is not complete and error-free.; The ProCare source-file inventory was not confirmed before import.; Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; 18 guardian(s) need a valid invitation email; 8 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 1 currently enrolled child(ren) without classroom assignment; 13 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: BLOCKED: 1 currently enrolled child(ren) without classroom assignment Requires separate approval.

### Kid City USA - Kokomo

- Location ID: Kid City USA - IN | Kokomo
- Counts: classrooms 12, staff 16, families 20, children 30, guardians 34, guardian logins 33, guardian PINs 34, director/billing grants 2
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: 1 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Lake City

- Location ID: Kid City USA - FL | Lake City
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Lake Wales

- Location ID: Kid City USA - FL | Lake Wales
- Counts: classrooms 6, staff 2, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Lees Summit

- Location ID: Kid City USA - MO | Lees Summit
- Counts: classrooms 5, staff 1, families 187, children 222, guardians 41, guardian logins 27, guardian PINs 27, director/billing grants 2
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import is not complete and error-free.; The ProCare source-file inventory was not confirmed before import.; Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; 13 guardian(s) need a valid invitation email; 12 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 14 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Leesburg

- Location ID: Kid City USA - FL | Leesburg
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Lewisburg

- Location ID: Kid City USA - TN | Lewisburg
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Longmont

- Location ID: Kid City USA - CO | Longmont
- Counts: classrooms 8, staff 1, families 358, children 528, guardians 131, guardian logins 68, guardian PINs 105, director/billing grants 2
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import is not complete and error-free.; The ProCare source-file inventory was not confirmed before import.; Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; 16 guardian(s) need a valid invitation email; 2 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 26 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Longwood

- Location ID: Kid City USA - FL | Longwood - SR 434
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - MacClenny

- Location ID: Kid City USA - FL | Macclenny
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Melbourne

- Location ID: Kid City USA - FL | Melbourne
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Middleburg

- Location ID: Kid City USA - FL | Middleburg
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - North Richland Hills

- Location ID: Kid City USA - TX | North Richland Hills
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 2
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Oakleaf

- Location ID: Kid City USA - FL | Jacksonville - Oakleaf
- Counts: classrooms 17, staff 4, families 45, children 60, guardians 62, guardian logins 44, guardian PINs 58, director/billing grants 2
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: 14 guardian(s) need a valid invitation email; 4 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 4 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Oviedo

- Location ID: Kid City USA - FL | Oviedo
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Palatka

- Location ID: Kid City USA - FL | Palatka
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Palm Bay

- Location ID: Kid City USA - FL | Palm Bay
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Paradise

- Location ID: Kid City USA - IN | Newburgh - Paradise
- Counts: classrooms 5, staff 1, families 29, children 37, guardians 63, guardian logins 48, guardian PINs 52, director/billing grants 1
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import is not complete and error-free.; The linked ProCare import still has errors, unresolved warnings, or disposed source rows.; The ProCare source-file inventory was not confirmed before import.; Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; 10 guardian(s) need a valid invitation email; 9 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 11 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Petersburg

- Location ID: Kid City USA - IN | Petersburg
- Counts: classrooms 6, staff 1, families 132, children 154, guardians 57, guardian logins 42, guardian PINs 48, director/billing grants 1
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import is not complete and error-free.; The linked ProCare import still has errors, unresolved warnings, or disposed source rows.; The ProCare source-file inventory was not confirmed before import.; Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; The ProCare source package still contains unresolved account, child, or relationship coverage warnings.; 9 guardian(s) need a valid invitation email; 5 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 9 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Pilot Point

- Location ID: Kid City USA - TX | Pilot Point
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Pisgah Forest

- Location ID: Kid City USA - NC | Pisgah Forest
- Counts: classrooms 10, staff 20, families 123, children 141, guardians 91, guardian logins 81, guardian PINs 84, director/billing grants 2
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import is not complete and error-free.; The linked ProCare import still has errors, unresolved warnings, or disposed source rows.; The ProCare source-file inventory was not confirmed before import.; Parent invitations require a complete guarded ProCare import package.; The ProCare source package still contains unresolved account, child, or relationship coverage warnings.; 10 guardian(s) need a valid invitation email; 2 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 7 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Port Orange

- Location ID: Kid City USA - FL | Port Orange
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Pulaski TN

- Location ID: Kid City USA - TN | Pulaski
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Sanford

- Location ID: Kid City USA - FL | Sanford
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Sarasota

- Location ID: Kid City USA - FL | Sarasota
- Counts: classrooms 12, staff 1, families 57, children 61, guardians 79, guardian logins 58, guardian PINs 75, director/billing grants 1
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; 7 guardian(s) need a valid invitation email; 4 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 4 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Soddy Daisy

- Location ID: Kid City USA - TN | Soddy Daisy
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - South Daytona

- Location ID: Kid City USA - FL | South Daytona
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Southpointe

- Location ID: Kid City USA - IN | Southpointe
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - St. Cloud

- Location ID: Kid City USA - FL | Saint Cloud
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Starke

- Location ID: Kid City USA - FL | Starke
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Terrell

- Location ID: Kid City USA - TX | Terrell
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Tyler

- Location ID: Kid City USA - TX | Tyler
- Counts: classrooms 14, staff 21, families 406, children 488, guardians 178, guardian logins 138, guardian PINs 169, director/billing grants 1
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import is not complete and error-free.; The ProCare source-file inventory was not confirmed before import.; Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; 39 guardian(s) need a valid invitation email Requires separate approval.
- kiosk: BLOCKED: 9 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Vero Beach

- Location ID: Kid City USA - FL | Vero Beach
- Counts: classrooms 0, staff 0, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no staff/teacher profiles; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no staff/teacher profiles; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no staff/teacher profiles; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no staff/teacher profiles; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Wekiva

- Location ID: Kid City USA - FL | Longwood - Wekiva
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Westfield

- Location ID: Kid City USA - IN | Westfield
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Whitestown

- Location ID: Kid City USA - IN | Whitestown
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Winter Park

- Location ID: Kid City USA - FL | Winter Park
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Winter Springs

- Location ID: Kid City USA - FL | Winter Springs
- Counts: classrooms 17, staff 1, families 943, children 1300, guardians 138, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import is not complete and error-free.; The ProCare source-file inventory was not confirmed before import.; Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; 6 guardian(s) need a valid invitation email; 12 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 138 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Kid City USA - Woodland Park - East Midland

- Location ID: Kid City USA - CO | Woodland Park - East Midland
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Kid City USA - Woodland Park - Forest Edge

- Location ID: Kid City USA - CO | Woodland Park - Forest Edge
- Counts: classrooms 0, staff 1, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: no classrooms; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: school EIN/tax receipt details are not configured; no classrooms; no imported families; no imported children; no guardian records Requires separate approval.

### Miss Honey's Learning Center - Centennial

- Location ID: Miss Honey's Learning Center - CO | Centennial
- Counts: classrooms 6, staff 14, families 166, children 160, guardians 93, guardian logins 84, guardian PINs 81, director/billing grants 1
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import still has errors, unresolved warnings, or disposed source rows.; The ProCare source-file inventory was not confirmed before import.; Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; 4 guardian(s) need a valid invitation email; 6 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 12 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Miss Honey's Learning Center - Lincolnton

- Location ID: Miss Honey's Learning Center - NC | Lincolnton
- Counts: classrooms 18, staff 1, families 256, children 260, guardians 37, guardian logins 10, guardian PINs 10, director/billing grants 1
- setup: DATA READY: No automated data gaps.
- parent-invitations: BLOCKED: The linked ProCare import still has errors, unresolved warnings, or disposed source rows.; The ProCare source-file inventory was not confirmed before import.; Parent invitations require a complete guarded ProCare import package.; The ProCare enrollment, parent, relationship, and child-information reports are not all present.; 24 guardian(s) need a valid invitation email; 14 guardian(s) need a phone with at least four digits Requires separate approval.
- kiosk: BLOCKED: 27 guardian(s) do not have kiosk PINs Requires separate approval.
- billing: MANUAL APPROVAL REQUIRED: No automated data gaps. Requires separate approval.

### Miss Honey's Onion Sprouts - Lyons

- Location ID: Miss Honey's Learning Center - GA | Lyons - Onion Sprouts
- Counts: classrooms 0, staff 0, families 0, children 0, guardians 0, guardian logins 0, guardian PINs 0, director/billing grants 1
- setup: BLOCKED: missing school phone; no classrooms; no staff/teacher profiles; no imported families; no imported children; no guardian records
- parent-invitations: BLOCKED: missing school phone; no classrooms; no staff/teacher profiles; no imported families; no imported children; no guardian records; no guardians available for invitation review Requires separate approval.
- kiosk: BLOCKED: missing school phone; no classrooms; no staff/teacher profiles; no imported families; no imported children; no guardian records; no guardians available for kiosk credential review Requires separate approval.
- billing: BLOCKED: missing school phone; no classrooms; no staff/teacher profiles; no imported families; no imported children; no guardian records Requires separate approval.
