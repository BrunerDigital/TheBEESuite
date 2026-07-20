# ProCare Migration Production-Readiness Audit

Date: July 20, 2026  
Accountable human: Brenden until explicitly delegated  
Decision: **NO-GO for the wider wave. Kokomo may continue normal production use.**

## Production-ready definition

A selected school is ready for ProCare cutover only when its approved secure exports can be previewed and committed repeatably; the exact reviewed source is traceable by filename, timestamp, and SHA-256; mappings, exclusions, duplicates, row errors, and batches are approved; families, children, guardians, staff, classrooms, balances, credits, and open invoices reconcile; required spot checks and director validation pass; backups, stop conditions, rollback, support, and written director/corporate/technical/ProCare cutover approvals are retained. ProCare remains the source of truth until that written decision.

## Evidence completed

- Audited the shared workstream register and July 18 school-readiness checklist.
- Audited the migration runbook, field-coverage map, importer API, importer UI, schema audit models, duplicate matching, field normalization, and related tests.
- Confirmed preview/diff, center mapping, warning review, duplicate candidates, import-batch records, row records, JSON backup export, and audit logging exist.
- Added an exact-export review guard: commit requires the fingerprint returned for the same source content, selected center, and duplicate mode.
- Added source SHA-256 to preview and committed batch summaries for evidence custody.
- Changed the existing over-500-row behavior from silent duplicate-scan bypass to fail closed at commit.
- Added a per-school evidence packet for secure custody, mappings, batches, reconciliation, spot checks, rollback, and written approvals.
- ProCare field and duplicate tests passed (9 tests total, 0 failures), including two new exact-source fingerprint tests.

## Findings

### BLOCKER

1. **No actual first wave, school dates, module scope, or accepted per-school owners are recorded.** Owner: Brenden. Exact retest: name the wave and complete the ownership section of one evidence packet per selected school.
2. **Approved secure ProCare exports and exact report/column mappings have not been supplied for each selected school.** Owner: Brenden. Exact retest: preview each export through the approved safe environment and retain filename, export timestamp, SHA-256, mapping/exclusion review, warnings, and duplicate decisions.
3. **No per-school dry-run/import/reconciliation evidence exists for the selected wave.** Owner: Brenden. Exact retest: use the evidence packet to reconcile families, children, guardians, staff, classrooms, balances, credits, and open invoices; spot-check at least 10 families; retain all batch IDs and backups.
4. **No written director, corporate, technical, and ProCare cutover approvals exist.** Owner: Brenden. Exact retest: record all four decisions after reconciliation, role isolation, training, rollback, and support gates pass.

### REQUIRED BEFORE WAVE

1. **Financial coverage is not proven against actual exports.** Field coverage still calls out tuition contracts, subsidy/agency payments, and high-volume ledger formats as needing validation. Owner: Brenden. Exact retest: obtain approved accounting exports, map every required field, and reconcile balances, credits, and open invoices to zero or signed exceptions.
2. **The importer may complete with row errors and writes rows independently.** A `completed_with_errors` batch is evidence of an exception, not a successful cutover, and rollback is operational rather than an automatic all-or-nothing reversal. Owner: Brenden. Exact retest: require zero row errors for cutover or a signed exception/correction record for every error; prove the rollback drill in a safe environment.
3. **Post-import role and sensitive-data spot checks remain external execution.** Owner: Brenden. Exact retest: director validates roster, schedules, allergies/medical notes, custody warnings, pickups, documents, tuition, discounts, balances, and history; scoped parent/teacher/director accounts pass isolation checks.
4. **The final export freeze and rollback window are not scheduled.** Owner: Brenden. Exact retest: record freeze start, emergency-write procedure, stop conditions, rollback owner, support contact, and reconciliation responsibility.

### FOLLOW-UP

1. Add a dedicated reconciliation report/download that calculates source-versus-target counts and financial totals from retained import evidence. Owner: Brenden.
2. Add a first-class reversal workflow only after product, accounting, and audit requirements define how post-import writes and externally visible records must be handled. Owner: Brenden.
3. Confirm and document retention/deletion requirements for raw ProCare rows and downloaded backups. Owner: Brenden.

## Continuation safeguards completed

- Large exports now receive complete database duplicate analysis across bounded review windows while one full-export identity set preserves family, child, and staff relationships. Ambiguous duplicates and cleanup warnings remain commit blockers.
- Authorized operators can download a read-only source-versus-target reconciliation report for a retained batch. It verifies linked families/children and batch opening-balance ledger totals; unsupported guardian/staff/classroom/credit/open-invoice source totals remain explicitly `not_available` and therefore fail closed for cutover.
- Rollback evidence has a tested minimum set covering source identity, backup, scope, timing, post-import writes, ownership, and human decisions.
- Raw rows receive a 90-day retention-review date. Deletion is not automatic and requires separately authorized, audited cleanup after reconciliation, rollback, audit, and legal needs are closed.

## External decisions required

- Brenden must select the first wave, dates, enabled modules, secure handoff location, retention owner, and one accepted human for each school-level responsibility.
- ProCare/school administrators must provide approved unencrypted exports and confirm the report catalog/column meanings.
- Directors and corporate/accounting must approve mappings, exceptions, counts, balances, spot checks, and cutover.
- Technical/release ownership must approve the safe environment, rollback drill, final release, and production execution separately.

## Exact next action

Brenden selects one non-Kokomo pilot school and names its director/data owner, then the data owner places untouched exports in the approved secure handoff. Run preview only in an approved safe environment, copy `PROCARE_MIGRATION_EVIDENCE_PACKET_TEMPLATE.md` for that school, and record source filenames, timestamps, SHA-256 values, mappings, exclusions, warnings, duplicate decisions, and expected totals. Do not commit an import or change the source of truth until the preview packet is reviewed and separately authorized.
