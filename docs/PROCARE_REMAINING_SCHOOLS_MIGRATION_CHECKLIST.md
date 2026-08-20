# Remaining Schools ProCare Migration Checklist

Use this list once per school. A wave is only as ready as its least-ready school. Technical preparation does not activate access, invitations, attendance, billing, payments, staff identities, or ProCare cutover.

## Existing BEE Suite migrations

- [ ] If the school previously imported data, open **Continue an existing migration** instead of starting another import.
- [ ] Select the school and its prior import batch. The prior batch remains the source-evidence baseline while reconciliation reads the school's current BEE Suite records.
- [ ] Download the current-state reconciliation, continued-verification packet, and source-evidence backup.
- [ ] Use the reported differences as the correction list. Do not re-import, overwrite, invite, bill, activate, or archive anything from this continuation step.
- [ ] Older batches without the refined inventory remain usable for current-state reconciliation; their verification packet must identify the missing source-inventory evidence until it is separately supplied and confirmed.

## 1. Assign and schedule

- [ ] Record the school name, stable BEE Suite center ID, ProCare location ID, timezone, director, corporate approver, technical owner, rollback owner, and first-week support owner.
- [ ] Record which modules are intended for day one. Keep roster, staff access, parent access, invitations, PIN/kiosk, attendance, billing, payments, messaging, and cutover as separate approvals.
- [ ] Give each school its own secure source folder, review folder, evidence packet, cutover decision, and exception list.

## 2. Request clean source exports

- [ ] Export untouched, unencrypted CSV/TSV files directly from ProCare; do not copy/paste through Excel or Google Sheets.
- [ ] Include stable Family Account ID, Child ID, Person ID, Classroom ID, and Employee ID columns. Names, email addresses, and phone numbers are not identity keys.
- [ ] Include enrollment status, start/end dates, classroom assignment, account-person records, child relationships, current signed account balances, child information tracking, classroom capacity/ratio setup, current staff, and child tuition contracts.
- [ ] Require tuition evidence to contain Child ID, positive amount, weekly cadence, description, and effective date. Do not use employee pay rates, monthly totals divided by weeks, account-level totals shared by multiple children, or payment history as a rate.
- [ ] Include attendance, subsidy/agency, document, or historical-ledger exports only when those modules are part of the approved scope.
- [ ] Record file names, export timestamps, secure custody location, and SHA-256 evidence. Never edit the originals.

## 3. Run the file-only preflight

```powershell
npm.cmd run procare:preflight-location -- --location "<school>" --source-dir "<secure-source-folder>" --output-dir "<separate-review-folder>"
```

- [ ] Confirm the source and output folders are different and outside Git.
- [ ] Require `READY_FOR_PREVIEW_REVIEW` in both `manifest.json` and `READINESS.md`.
- [ ] Review `18-bee-field-reconciliation.csv`. Every BEE Suite destination is listed whether or not the export supplied a value, with its source report, source column/cell, physical row number or stable row key, exact exported `Source Cell Value`, separate `BEE Normalized Value`, and `source_cell_present` or `source_cell_not_supplied` status. This sheet is traceability evidence, not a new activation gate.
- [ ] Review the detected source inventory. Replace every ignored, ambiguous, malformed, or missing required report.
- [ ] Require zero unresolved enrolled-child account links, zero enrolled children without relationship-backed guardians, zero unknown active classrooms, one current balance row per active account, and one positive weekly tuition rate, description, and valid effective date keyed to each enrolled Child ID. Rendered name matches and recurring statement history stay blocked until replaced by stable child-contract evidence.
- [ ] Review guardian contact collisions and cross-account Person IDs. Do not auto-merge people merely because names, email addresses, or phone numbers match.
- [ ] Review current versus historical/withdrawn families separately. Historical balances and old accounts do not become current families by implication.
- [ ] Correct source data and re-export when blocked. Do not delete warning rows or manually turn a blocked packet into an import file.

## 4. School and corporate review before preview

- [ ] Director checks every exception plus at least 10 representative families, or all families when fewer than 10.
- [ ] Director confirms child status, classroom, schedules, guardians, emergency contacts, authorized pickups, custody/medical/allergy facts, and staff roster.
- [ ] Corporate/accounting confirms one signed opening balance per active account, credits, tuition amount/cadence/effective week, discounts, fees, and subsidy responsibility.
- [ ] Record approved corrections against stable IDs. Obtain a corrected ProCare export whenever the source can be fixed.
- [ ] Create the school evidence packet and record all intentionally excluded modules. No exclusion authorizes invented data.

## 5. Guarded application preview

- [ ] Select exactly one school and upload the exact reviewed packet.
- [ ] Confirm center ID, detected source inventory, SHA-256, review fingerprint, total counts, duplicate groups, warnings, and field correlations.
- [ ] Stop for any wrong-school mapping, source hash change, ignored source, unresolved row, duplicate ambiguity, missing relationship, missing weekly rate, or incomplete required domain.
- [ ] Obtain explicit import approval. Import approval remains separate from every activation and cutover gate.

## 6. Commit and reconcile

- [ ] Commit only the unchanged approved source through the guarded importer; retain the batch ID and backup.
- [ ] Download the automated source-to-target reconciliation and Fleet Verification Packet.
- [ ] Require `READY_FOR_DIRECTOR_REVIEW`; `completed_with_errors`, disposed/excluded/error rows, unavailable measures, or mismatches keep the school blocked.
- [ ] Reconcile families, children, guardians, emergency contacts, pickups, classrooms, staff evidence, signed balances, opening credits, and opening-balance invoices.
- [ ] Reconcile tuition assignments in a separate preview before enabling recurring billing. Do not generate invoices or collect payment as part of data import.

## 7. Independent launch gates

- [ ] Staff identities, roles, grants, classroom access, and login testing approved.
- [ ] Parent application/Auth linkage approved; invitations and delivery are separately approved.
- [ ] PIN/QR and kiosk flows approved for the correct school and family.
- [ ] Attendance state and first-day reconciliation approved.
- [ ] Billing assignments, first invoice-cycle preview, credits, discounts, fees, and agency responsibility approved.
- [ ] Stripe connected-account and business billing approval complete before payments or autopay.
- [ ] Messaging templates, recipients, and delivery monitoring approved before any live send.

## 8. Cutover, rollback, and first week

- [ ] Capture director, corporate, technical, rollback, and module-specific written decisions.
- [ ] Freeze ProCare writes for the approved window, take the final export, rerun preflight/preview, and confirm the source fingerprint.
- [ ] Keep a rollback record of both systems' writes, last-known-good time, batch ID, backup, owners, and stop conditions.
- [ ] Monitor logins, roster corrections, guardian access, attendance, tuition/balance disputes, payments, messages, and tenant isolation daily for five operating days.
- [ ] After verified cutover, archive original ProCare exports as recoverable backups. Do not delete them or leave them as active import inputs.

## Wave-level go/no-go

- [ ] Every school has its own `READY_FOR_DIRECTOR_REVIEW` packet and written decisions.
- [ ] Every blocked school is removed from the wave rather than waived silently.
- [ ] Owners, dates, support coverage, rollback coverage, and module activation decisions are complete per school.
- [ ] The production release and health checks are current before the first cutover; each changed flow is verified after release.

Related controls: `PROCARE_FLEET_VERIFICATION_GATE.md`, `PROCARE_LOCATION_MIGRATION_RUNBOOK.md`, and `PROCARE_MIGRATION_EVIDENCE_PACKET_TEMPLATE.md`.
