# ProCare Location Migration Runbook

Last updated: June 9, 2026

Purpose: move one school location at a time from ProCare to The BEE Suite as the operational source of truth for families, children, guardians, classrooms, staff, attendance, documents, billing setup, FTE, communications, and reporting.

This runbook is per location. Do not cut over a group of schools until every location in the group has its own completed evidence packet and signoff.

## Source Of Truth Rules

- Before final cutover, ProCare remains the source of truth for live school operations.
- During the cutover window, ProCare should be treated as read-only except for emergency corrections approved by the cutover lead.
- After go-live approval, The BEE Suite becomes the source of truth for the enabled modules at that location.
- Parent payments remain disabled until Stripe Connect onboarding, payment terms, `docs/PAYMENT_PROCESSING_RECOVERY_REVIEW.md`, refund/dispute handling, and test payments are approved for that location.
- Google Sheets backups for inquiry and FTE workflows are operational backups only. They are not the system of record after The BEE Suite is approved as the source of truth.

## Roles

| Role | Owner |
| --- | --- |
| Cutover lead | BrunerDigital or assigned implementation lead |
| Business approver | Kid City USA corporate/operator owner |
| Location approver | School director or authorized assistant director |
| ProCare export owner | ProCare admin with access to unencrypted exports |
| Technical owner | Engineer with production deploy/import access |
| Support owner | First-week support contact listed for the location |
| Payment approver | Stripe/business owner, only if payments are enabled |

## Required Inputs Engineering Cannot Safely Infer

Collect these before scheduling a final cutover window:

- Official school name, `Center.crmLocationId`, `Center.locationId`, address, phone, school email, director email, and notification recipients.
- Confirmation that the location is open, active, and should appear in public inquiry location lists.
- Unencrypted ProCare CSV exports, or the actual `.v10` export password.
- Final ProCare datasets used by the school: family accounts, children, guardians/payers, relationships, authorized pickups, emergency contacts, classroom roster, staff, attendance/sign-in-out, balances/ledger, tuition contracts, schedules, immunization/medical/allergy fields, and FTE.
- School-specific classroom names, capacities, age groups, ratios, programs, tuition rates, fees, discounts, subsidy/agency rules, and billing cadence.
- Decision on whether existing parent PINs are imported, reset by directors, or created by guardians in the parent portal.
- Final parent-facing launch date, staff training time, and parent communication date.
- Confirmation of modules going live on day one: CRM, families, attendance/kiosk, teacher portal, parent portal, billing, payments, documents, compliance, FTE, messaging, and reporting.

## Evidence Packet

Create one evidence packet per location and keep it with the support/cutover records:

- Location name and IDs.
- Cutover date, cutover window, and timezone.
- ProCare source file names and export timestamps.
- Import preview summary and final committed `ProcareImportBatch` IDs.
- Post-import backup/export file names.
- Count comparison table.
- Director validation notes.
- Stop conditions checked.
- Go/no-go decision and approver names.
- Any exceptions, intentionally excluded fields, or follow-up cleanup tasks.

## Timeline

### T-10 To T-7 Business Preflight

1. Confirm the location is in The BEE Suite as an active center with correct tenant, brand, organization, owner group, CRM location ID, and location ID.
2. Confirm director, assistant director, billing, teacher, and corporate access requirements.
3. Confirm the modules planned for first-day use.
4. Confirm parent payments are either disabled or fully approved for the location.
5. Confirm support hours and escalation contacts for the first week.

### T-7 To T-3 Export And Dry Run

1. Export ProCare data in unencrypted CSV format, or provide the `.v10` password.
2. Run an import preview/diff for the location.
3. Review `ProcareImportRow` errors and warnings.
4. Confirm unmapped fields are either mapped, stored in `customFields.rawData`, or intentionally excluded.
5. Resolve duplicate family, child, guardian, staff, and lead records using the duplicate matching controls.
6. Run staging or pilot-environment validation before production import.

### T-2 Director Validation

The director validates:

- Family account count.
- Child count and active enrollment status.
- Guardian/payer count and billing contacts.
- Authorized pickups and emergency contacts.
- Classrooms, room assignments, capacities, ratios, and schedules.
- Staff profiles, roles, classroom assignments, and teacher login readiness.
- Medical notes, allergies, custody warnings, and restricted visibility.
- Account balances, open invoices, tuition plans, and ledger opening balances.
- Attendance/check-in history if imported.
- Kiosk route and guardian PIN/QR readiness.

Any critical mismatch blocks go-live until corrected.

### T-1 Freeze Notice

Send the location a written freeze notice:

- Export timing.
- ProCare write freeze start time.
- The BEE Suite login URL.
- First-day modules enabled.
- Emergency support contact.
- Explicit instruction not to use The BEE Suite kiosk for live check-in/out until final go-live approval.

## Final Cutover Procedure

### 1. Production Preflight

1. Confirm the deployed build is the approved release.
2. Confirm `/api/health` and `/api/system/readiness` are healthy.
3. Confirm production backups are current.
4. Confirm no active incident or deployment rollback is in progress.
5. Confirm the location's feature flags match the planned launch scope.
6. Confirm parent payments are disabled unless payment approval is complete.

### 2. Final ProCare Export

1. Take the final export after the school has stopped writes in ProCare for the cutover window.
2. Record export timestamp and source file names.
3. Store the export in the approved secure location.
4. Do not paste child, family, staff, billing, medical, custody, or payment data into chat or public tickets.

### 3. Import Preview

1. Open the ProCare import page for the correct location.
2. Upload the final file or choose the approved source.
3. Run preview/diff.
4. Confirm the selected center is the intended school.
5. Review new, matched, warning, and error counts.
6. Stop if the import maps rows to the wrong center or creates unexpected duplicate groups.

### 4. Commit Import

1. Commit only after preview is approved.
2. Record the final import batch ID.
3. Export/download the committed import backup.
4. Save source file, preview summary, final batch ID, and backup path in the evidence packet.

### 5. Post-Import Validation

Validate counts and samples before staff use the system:

| Area | Required check |
| --- | --- |
| Center | Correct name, IDs, address, email, active status |
| Families | Count matches expected active accounts or documented exceptions |
| Guardians | Primary/billing contacts, phone/email, relationship labels |
| Children | Name, DOB, status, classroom, schedule, start date |
| Classrooms | Room names, capacity, ratios, assigned teachers |
| Staff | Profiles, roles, center/classroom access, teacher login usernames |
| Medical/allergy/custody | Restricted notes visible only to allowed staff |
| Pickups/emergency contacts | Names, phones, relationship, verification notes |
| Attendance/check logs | History imported if required, current-day state clean |
| Billing | Opening balances, invoice state, ledger entries, tuition plans |
| Parent portal | Linked guardians see only their own family |
| Teacher portal | Teachers see only assigned center/classroom rosters |
| Kiosk | Valid PIN/QR, invalid PIN, duplicate check-in, checkout-before-checkin |
| Reporting | Dashboard, FTE, attendance, billing, and export views scoped correctly |

### 6. Director Signoff

The director must approve:

- Roster and classroom accuracy.
- Guardian/contact accuracy.
- Billing balance readiness.
- Staff access readiness.
- Kiosk readiness if attendance is going live.
- Known exceptions that will be corrected after launch.

Do not announce go-live until this signoff is captured.

### 7. Switch Daily Workflows

When signoff is complete:

1. Tell staff The BEE Suite is now the source of truth for approved modules.
2. Keep ProCare read-only for lookup during the retention/parallel-check period.
3. Route new inquiries, tours, family edits, attendance, incidents, documents, messages, FTE, and billing work into The BEE Suite according to the enabled module list.
4. Disable or archive old ProCare-dependent forms, webhooks, and duplicate intake processes that could create split records.
5. Confirm support is monitoring the location for the first operating day.

## Module Activation Order

Use this order unless the business approver signs off on a different sequence:

1. CRM/inquiry routing and director login.
2. Families, guardians, children, pickups, emergency contacts, classrooms, and staff.
3. FTE reporting.
4. Attendance and kiosk.
5. Teacher portal and daily reports.
6. Parent portal, documents, messaging, and incident acknowledgements.
7. Billing workbench, tuition plans, ledger, and invoice generation.
8. Parent checkout and autopay only after Stripe/payment approval.

## Stop Conditions

Stop cutover and keep ProCare as source of truth if any of these happen:

- Any user can see another location's child, family, staff, billing, attendance, document, medical, custody, or message data.
- Import preview maps rows to the wrong center.
- Critical counts do not reconcile and the director cannot approve the exception.
- Guardian, child, or family duplicate groups cannot be resolved safely.
- Kiosk accepts the wrong center, wrong guardian, wrong child, or wrong current attendance state.
- Billing balances or invoices appear on the wrong family.
- Parent portal exposes the wrong family.
- The production app, database, auth, storage, or notification service is unhealthy.
- A production deployment rollback is underway or recent release confidence is low.

## Rollback And Fallback

### Before Go-Live Approval

- Do not switch source of truth.
- Keep ProCare as the operational system.
- Disable location feature flags that would allow live BEE Suite writes for the affected modules.
- Keep the import batch, backup, and source files for diagnosis.

### Same-Day After Go-Live

1. Stop new writes in the affected BEE Suite module.
2. Capture location, user, timestamp, URL, import batch ID, and screenshots.
3. Decide whether the issue is row-level repair, import rollback, feature disablement, or full source-of-truth rollback.
4. If ProCare must resume as source of truth, record every BEE Suite write since go-live so it can be reconciled later.
5. Notify the director and corporate approver of the fallback decision.

### After The First Operating Day

- Prefer targeted corrections over full rollback.
- Full rollback requires business approver approval because staff may already have created live attendance, incident, document, billing, or message records in The BEE Suite.
- Reconcile any ProCare emergency entries into The BEE Suite before closing the incident.

## First-Week Monitoring

Check these daily for the first five operating days:

- Login failures by role.
- Director-reported roster or guardian corrections.
- Attendance/kiosk errors and end-of-day reconciliation.
- Parent portal access issues.
- Teacher roster and daily report issues.
- Billing balance disputes.
- FTE submission status, especially Friday before 8:00 AM ET and after the Friday noon deadline.
- Notification delivery failures.
- Import cleanup tasks and duplicate merges.

## Location Signoff Template

```text
Location:
CRM location ID:
Location ID:
Cutover date/time:
Final ProCare export timestamp:
Final import batch ID:
Modules enabled:
Known exceptions:

Director approval:
Corporate/operator approval:
Technical approval:
Support owner:

Go-live decision: GO / NO-GO
```

## Related Docs

- `docs/PROCARE_FIELD_COVERAGE.md`
- `docs/KIDCITY_CUTOVER_OWNER_CHECKLIST.md`
- `docs/SCHOOL_FULL_FEATURE_ROLLOUT_CHECKLIST_2026-06-08.md`
- `docs/in-school-testing-runbook.md`
- `docs/SECURITY_PRIVACY_OPERATIONS.md`
- `docs/SUPPORT_ESCALATION_GUIDE.md`
