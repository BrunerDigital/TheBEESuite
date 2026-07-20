# Reporting and Analytics Production Readiness

Audit date: July 20, 2026

Accountable human: Brenden until explicitly delegated

Decision: **NO-GO for the wider school wave.** Kokomo may continue normal production use. This workstream is not production-ready until the required source reconciliations, complete-export checks, and credentialed role/school scope tests are evidenced for the selected wave.

## Production-ready definition

Reporting and analytics is production-ready when source totals reconcile for every selected school; date, school, tenant, and role filters return only the intended records; CSV/PDF exports are complete and identify their scope and generation time; FTE dashboard links open the intended school and week; metric definitions and source systems are approved; and freshness expectations plus an exception owner are documented.

## Evidence completed

- Traced `/analytics` through `buildAnalyticsReportData`, the report builder, and `/api/reports/export` for lead funnel, attendance, billing, messages, and staff-hours reports.
- Confirmed analytics center queries derive their school set from `getLeadScopeWhere(user)` and reject an inaccessible requested center by returning an empty scoped result.
- Traced FTE dashboard aggregation, `centerId`/`weekStart` deep-link initialization, FTE history filters, JSON/CSV export, and create/correction authorization.
- Corrected the FTE API so both requested report filters and save/correction targets must exist in the database-derived visible-center set. Tenant-wide roles can no longer pass an arbitrary center ID from another tenant through this endpoint.
- Added a regression test covering visible and cross-tenant center IDs.
- Corrected quick date ranges so “Last 30 days” covers 30 inclusive calendar dates instead of 31.
- Added visible report generation time beside the loaded date range.
- Added a reusable per-school reconciliation packet and automated evaluator for approved totals, cutoff dates, definitions, filters, scope, export equivalence, FTE links, and freshness.
- Added synthetic two-school isolation and CSV export-equivalence tests. Export metadata now records the selected center scope rather than every center accessible to the user.
- Added visible report definitions/data-as-of context and traceability metadata to analytics CSV/PDF exports; clarified FTE calculation and per-row freshness in the explorer.
- Focused tests passed: `node --import tsx --test tests/fte-report-deadline.test.ts tests/reporting-analytics.test.ts` (9 passed, 0 failed).

## Findings and ownership

### BLOCKER

1. **Per-school source reconciliation is not evidenced.** No retained comparison currently proves analytics totals against ProCare/source exports for the selected wave (families/children/attendance), CRM source totals (leads/tours/enrollments), billing ledger totals (invoices/payments/open balances), staff time records, and weekly FTE submissions. Owner: **Brenden**. Exact retest: select the launch schools and date cutoffs, run each source-to-report comparison, record totals/exceptions, and obtain director plus corporate approval.
2. **Credentialed scope tests are not evidenced for the selected wave.** Static query tracing is positive, and the FTE cross-tenant defect was fixed locally, but corporate, director, and school-scoped accounts have not executed the filters, deep links, and exports against safe test data. Owner: **Brenden**. Exact retest: for each selected school, use approved scoped accounts to test all-centers, one-school, inaccessible-school, date-range, FTE `centerId`/`weekStart`, CSV, and PDF behavior.

### REQUIRED BEFORE WAVE

1. **Large datasets can be silently incomplete.** Analytics queries cap leads at 5,000, attendance/check logs/invoices/payments/messages at 10,000, and staff at 5,000 without returning a truncation indicator. FTE JSON is capped at 250 rows, FTE CSV at 1,000 rows, and analytics PDF rendering only emits the first page of rows. Owner: **Brenden**. Exact retest: approve pagination or server-side aggregation requirements, implement completeness metadata or complete pagination, and verify exports above every current threshold.
2. **Billing/AR definitions mix activity and balance concepts.** Invoice selection includes records created or due in the range, groups them by creation period, and only counts open/overdue amounts among those selected records. This is not a true as-of open-AR balance and can display a period outside the selected range for an older invoice due inside it. Owner: **Brenden**. Exact retest: obtain accounting approval for “activity in period” versus “as-of balance,” implement separate measures, and reconcile both against the billing ledger.
3. **Message response metrics need an approved business definition.** The current calculation pairs each parent message with the next non-parent message in the same `threadKey`; unread counts include every unread message in the selected period. Owner: **Brenden**. Exact retest: approve thread identity, business-hours handling, automated/system-message exclusions, and unread audience semantics, then validate with representative threads.
4. **Freshness service levels are not approved.** Analytics now exposes the database query time and FTE rows expose their Updated time, while the external Google Sheet snapshot still depends on source availability. There is no approved stale-data threshold or named exception response. Owner: **Brenden**. Exact retest: approve freshness targets per report and test stale/error states with the reconciliation harness.

### FOLLOW-UP

1. **Custom date validation should be explicit.** Invalid date strings currently fall back to defaults, and start-after-end has no user-facing validation message. Owner: **Brenden**. Exact retest: define validation behavior, add route/UI errors, and cover invalid, reversed, and daylight-saving date inputs.
2. **FTE source-of-truth transition remains open.** `docs/FTE_REPORTING.md` correctly states that the sheet remains the backup/source of truth until Kid City approves the internal workflow. Owner: **Brenden**. Exact retest: record the approved source, cutover date, reconciliation owner, and rollback rule.

## External decisions required

- Name the selected first-wave schools and reporting cutoff dates.
- Accounting must approve invoice activity, collected revenue, open AR, and overdue AR definitions.
- Corporate operations must approve lead conversion, attendance, message response, staff-hours, and FTE definitions.
- Corporate and each school director must sign the retained source reconciliation.
- Brenden must explicitly delegate any owner change; until then every open item above remains his.

## Release boundary

No production data was read or changed, no users were contacted, and nothing was deployed. The wider wave remains NO-GO until this workstream and all shared readiness signoffs pass. Kokomo may continue normal production use.
