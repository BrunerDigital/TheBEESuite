# ProCare Fleet Verification Gate

Use this gate for every Kid City USA school before requesting director review or a ProCare source-of-truth cutover decision. It is evidence-only: it does not activate billing, payments, invitations, parent access, PINs, attendance, staff identities, or cutover.

## Required school verification sources

The exact reviewed package must provide stable source evidence for all eight required domains:

1. Family Account ID.
2. Child ID.
3. Guardian/payer and child relationship records.
4. Enrollment status and classroom assignment.
5. One current signed opening balance per approved account.
6. Child safety information, including child-information tracking, allergies, medical notes, custody information, emergency contacts, and authorized pickups.
7. Staff identifiers and staff records.
8. Tuition amount, cadence, and effective-date evidence for every enrolled child.

Attendance history, subsidy/agency responsibility, documents, and other modules are reported as separate gates. Supply those exports when the module is intended for launch; absence does not authorize inference or silent activation. Staff access and tuition activation still remain separate approval gates even though their source evidence is required for whole-school verification.

Files are classified by headers and stable identifiers, not filenames. Ignored files and evidence-only files keep the school `NOT_VERIFIED` until the source is replaced, safely mapped, or covered by a written approved exclusion.

## Required workflow

1. Keep the untouched ProCare exports in the approved secure handoff.
2. Prepare and preview the exact package for one school.
3. Confirm the detected inventory and retain the SHA-256/review fingerprint.
4. Resolve source problems before import. Never invent family ownership, guardian authority, classroom assignment, safety information, or financial responsibility.
5. Commit only the unchanged reviewed package through the guarded importer.
6. Download the source-to-target reconciliation and Fleet Verification Packet from the import workspace.
7. Correct every mismatch or unavailable required measure. `completed_with_errors`, unresolved rows, ignored files, evidence-only files, or excluded rows remain blockers.
8. Have the director spot-check at least 10 representative families, or every family when fewer than 10.
9. Record director, corporate/accounting, technical/rollback, and written ProCare cutover decisions in the school evidence packet.
10. After verified cutover, archive the original ProCare exports as recoverable backups. Do not delete them or leave them as active import inputs.

## Exception evidence

Bulk disposal is prohibited. Each excluded row requires:

- one approved category;
- a specific reason;
- a secure source/correction evidence reference;
- the authenticated reviewer;
- a resolution timestamp.

An excluded row always keeps the Fleet Verification Packet at `NOT_VERIFIED` until the signed school-specific exception review is complete. High-risk identity, custody, safety, enrollment, and financial exceptions should normally be corrected at the source and re-exported.

## Machine statuses

- `NOT_VERIFIED`: one or more technical or evidence blockers remain.
- `READY_FOR_DIRECTOR_REVIEW`: the exact source is fingerprinted, required domains are present, no source file is ignored or awaiting mapping, the batch completed without unresolved/excluded/error rows, and every automated source-to-target measure matches.

There is intentionally no automatic `APPROVED_FOR_CUTOVER` status. Cutover always requires the school-specific written approvals and module gates in the migration runbook.

## Financial scope

Automated import reconciliation verifies:

- signed current opening-balance totals;
- opening credits derived from negative approved account balances;
- positive opening-balance invoices created by the guarded importer.

It does not recreate historical payments, Stripe charges, refunds, deposits, or high-volume ledger activity. Tuition assignments, discounts, subsidies, agency responsibility, invoice-cycle preview, payment routing, and first-cycle reconciliation remain separate approvals.
