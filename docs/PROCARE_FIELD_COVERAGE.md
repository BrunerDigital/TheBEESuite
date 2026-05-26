# ProCare Field Coverage for Kid City USA Cutover

This note documents how The Bee Suite maps the ProCare data areas visible in the Longmont environment and in the installed ProCare report catalog. It avoids storing private child, family, or staff details in documentation.

## Sources Reviewed

- Active ProCare window title: `Procare - [S32] Kid City USA Longmont`.
- Visible module areas: `Family Data & Accounting`, `Employee Data & Payroll`, `Expenses & Ledger`, account list, account summary, payer summary, child summary, classroom/status fields.
- Installed ProCare report catalog under `C:\Program Files\Procare\Client\Reports`, including family data, child enrollment, relationships, immunizations, FTE, rollcall, schedules, sign-in/out, employee records, attendance, account balances, aging, charge/credit activity, statements, deposits, tuition variance, and payment reports.
- Uploaded Longmont `.v10` export structure. The file is encrypted; the provided app login did not unlock the archive payload, so final field validation still requires the actual export password or a CSV export.

## Current Bee Suite Coverage

| ProCare area | Bee Suite destination |
| --- | --- |
| Location / school / center identifiers | `Center.crmLocationId`, `Center.locationId`, `Center.sourceSystem`, `Center.externalId`, `Center.customFields` |
| Franchise / owner grouping | `Tenant`, `Brand`, `Organization`, `OwnerGroup`, `UserAccessGrant`, `BrandCustomization`, `BrandAsset` |
| Family / account record | `Family`, `Family.sourceSystem`, `Family.externalId`, `Family.customFields` |
| Primary payer / parent / guardian | `Guardian` with billing contact flag and ProCare source metadata |
| Secondary payer / guardian | Additional `Guardian` linked to same `Family` |
| Guardian employer / phone / email / communication | `Guardian.employer`, `Guardian.phone`, `Guardian.email`, `Guardian.preferredCommunication` |
| Child record | `Child` linked to `Family` and optionally `Classroom` |
| Child DOB, status, start date, schedule | `Child.dateOfBirth`, `Child.enrollmentStatus`, `Child.startDate`, `Child.schedule` |
| Classroom / room / age group / capacity | `Classroom` with ProCare source metadata |
| Child tracking / user-defined fields | Preserved in `customFields.rawData` and `customFields.userDefined` |
| Medical notes / medications / physician / health notes | Restricted `ChildMedicalNote` |
| Allergy notes / severity / action plan | `Allergy` |
| Authorized pickups | `AuthorizedPickup` linked to `Family` |
| Emergency contacts | `EmergencyContact` linked to `Family` |
| Staff / teacher / employee rows | `User` plus `StaffProfile`, with optional classroom assignment |
| Background check status | `StaffProfile.backgroundCheckStatus` |
| Account balance | `BillingAccount.balanceCents` and `LedgerEntry` |
| Opening parent balance invoice | `Invoice` and `InvoiceItem` when imported balance is positive |
| Attendance / absence rows | `AttendanceRecord` with ProCare metadata |
| Sign-in / sign-out rows | `CheckInOutLog` with center, classroom, child, time, pickup name, and ProCare metadata |
| FTE reporting | `FteReport`, weekly center submissions, executive rollups, Google Sheet backup |
| Import auditability | `ProcareImportBatch`, `ProcareImportRow`, `AuditLog` |

## Import Behavior

- Directors can import for their own center.
- Executive users can import for one center or bulk auto-map rows when the export includes a school, center, location ID, or CRM location ID column.
- Re-imports match by ProCare external IDs when available, then by center-scoped family/child/guardian identifiers.
- All unmapped ProCare columns are preserved in `customFields.rawData` or row-level import records so no export data is silently discarded.
- User-defined, tracking, custom, and school-field columns are additionally collected under `customFields.userDefined`.
- Missing child DOBs are flagged in `Child.customFields.dateOfBirthMissing`; directors should correct those rows before live operations.

## Remaining Validation Needed

- Obtain the actual `.v10` export password or a CSV export from ProCare.
- Run one Longmont import into production or a staging database and review `ProcareImportRow` errors.
- Confirm exact ProCare column names for schedules, immunizations, tuition contracts, subsidy/agency payments, and employee certifications.
- Add any high-volume ledger transaction imports after the accounting export format is confirmed.
