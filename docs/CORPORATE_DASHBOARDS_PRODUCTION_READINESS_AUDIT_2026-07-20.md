# Corporate Dashboards Production-Readiness Audit

Audit date: July 20, 2026  
Accountable human: Brenden until explicitly delegated  
Decision: **NO-GO for the wider school wave. Kokomo may continue normal production use.**

## Production-ready definition

Corporate dashboards are production-ready when an authorized corporate user can see only the schools and records allowed by the user's tenant and grants; school filters and KPI totals reconcile to source records; readiness, CRM, FTE, billing, imports, users/grants, reports, and audit events are visible and actionable; missing or failed work links to the correct scoped follow-up surface; credentialed role smoke passes on supported desktop and mobile devices; and every selected launch school has named owners and corporate, director, billing, and technical signoff.

## Findings

### BLOCKER

1. **Some tenant-wide corporate module queries can omit tenant/center scope.** `canAccessAllCenters()` is true for tenant-scoped executive roles, while several branches in `src/app/[slug]/page.tsx` use `allCenters ? {}` instead of the already-computed `scopedCenterIds`. Examples include child profiles, enrollment/application rows, messaging classrooms, attendance records/check logs, and form submissions. A `BRAND_ADMIN` or similar tenant-wide user can therefore reach queries that are not constrained to that user's tenant when more than one tenant exists. This must be corrected and proven with a two-tenant isolation test before wider-wave corporate signoff. **Owner: Brenden until a security/authorization owner explicitly accepts delegation.**
2. **Credentialed corporate/executive smoke has not been evidenced.** The readiness checklist still requires real scoped-account validation of school filters, KPIs, CRM, FTE, billing oversight, reports, imports, users/grants, readiness, and audit logs. Static and unit evidence does not replace this. **Owner: Brenden.**

### REQUIRED BEFORE WAVE

1. **Select the actual first school wave and its modules/dates.** Corporate readiness cannot be signed against an undefined rollout population. **Owner: Brenden.**
2. **Reconcile KPI definitions and freshness.** The dashboard currently labels invoice totals as revenue in comparison/trend views while the top KPI correctly labels family balances as outstanding balances. Finance must approve the intended definitions, time windows, and source-of-truth labels. **Owner: Brenden until a finance owner accepts delegation.**
3. **Evidence the authenticated readiness surface.** `/api/system/readiness` remains unchecked for an authorized launch owner, and the corporate workflow lacks retained evidence connecting readiness exceptions to a named school owner. **Owner: Brenden.**
4. **Validate actionable paths end to end.** FTE links, CRM school queries, billing oversight, import batches, access-grant changes, report exports, and audit-log filters need credentialed verification using at least a tenant-wide executive and a restricted regional user. **Owner: Brenden.**
5. **Approve the corporate access and MFA policy.** Authority to add/remove locations, assign tenant/owner-group/center grants, reset credentials, import data, edit FTE, and manage billing must be recorded. **Owner: Brenden.**
6. **Retain per-school rollout evidence.** Re-run `npm run pilot:check -- --all` after setup/import work and retain the school-level output; 69 of 70 active centers had gaps in the July 18 snapshot. **Owner: Brenden.**

### FOLLOW-UP

1. Add automated integration coverage around corporate page loaders and API handlers using two tenants and tenant-, owner-group-, and center-scoped users. **Owner: Brenden until a QA owner accepts delegation.**
2. Add a corporate readiness/action queue that joins school readiness, failed imports, missing FTE, Stripe readiness, and audit exceptions with an owner and due state. **Owner: Brenden.**
3. Document dashboard metric source, time zone, refresh/freshness, and export parity directly in the reporting guide. **Owner: Brenden.**

## Safe fix completed

The current-week FTE panel previously rendered only the first 12 visible schools in database order even though the summary counted every visible school. It now retains every visible school in a scrollable list, prioritizes missing submissions first, and sorts peers by school name. The pure prioritization helper has regression coverage and does not mutate its input.

## Evidence completed

- Reviewed the corporate dashboard workstream definition and July 18 school rollout checklist.
- Read the installed Next.js 16.2.6 authentication and route-handler guidance before changing App Router code.
- Traced `/dashboard`, `/multi-location-dashboard`, `/fte-reports`, `/crm-leads`, `/corporate-billing`, `/audit-logs`, `/developer-dashboard`, executive administration, RBAC, center scope, access-grant guardrails, reporting helpers, and related tests.
- Confirmed `/dashboard`, multi-location metrics, and FTE loaders derive their primary datasets from visible center IDs.
- Confirmed executive administration requires authenticated operational, all-center access and rejects read-only auditors; center and user mutations validate tenant ownership and emit audit records.
- Confirmed the focused corporate unit suite passed before the fix: 32 tests, 0 failures.
- Added and passed the FTE follow-up regression test.
- No production data, billing configuration, credentials, users, deployments, or external systems were changed.

## External decisions required

- Brenden must name the first-wave schools, dates, live modules, and one accepted owner for corporate launch, school signoff, data/import, billing/Stripe, technical release, training, and first-week support.
- Brenden and the security owner must decide whether `PLATFORM_OWNER` is intentionally cross-tenant and document the boundary; all other tenant-wide corporate roles must remain tenant-isolated.
- Finance/accounting must approve KPI terminology and calculation windows for revenue, invoices, balances, payouts, and FTE billing/payroll fields.
- Corporate leadership must approve the executive/admin MFA and privileged-action policy.

## Files changed

- `src/components/dashboard.tsx`
- `src/lib/corporate-dashboard.ts`
- `tests/corporate-dashboard.test.ts`
- `docs/CORPORATE_DASHBOARDS_PRODUCTION_READINESS_AUDIT_2026-07-20.md`

## Tests run

- `node --test --import tsx tests/dashboard-widgets.test.ts tests/fte-report-rollups.test.ts tests/kidcity-corporate-rollout.test.ts tests/corporate-billing-rbac.test.ts tests/executive-admin-validation.test.ts tests/executive-bulk-import.test.ts tests/reporting-analytics.test.ts tests/crm.test.ts tests/import-center-mapping.test.ts` — 32 passed, 0 failed.
- `node --test --import tsx tests/corporate-dashboard.test.ts` — 1 passed, 0 failed.
- `npm run typecheck` — failed on unrelated dirty-worktree errors: `src/app/api/teacher/daily-reports/route.ts:55` (`child` possibly undefined) and four `tests/crm.test.ts` errors where existing fixtures omit required `assignedClassroomId`. No corporate-dashboard changed file produced a type error.

## Exact next action

Correct every tenant-wide `allCenters ? {}` query in `src/app/[slug]/page.tsx` to preserve the intended tenant/visible-center boundary, add a two-tenant regression fixture covering corporate child, enrollment, messages, attendance, and forms views, then rerun typecheck and the focused corporate suite before any credentialed corporate smoke.

## Isolation continuation completed

The unsafe empty-filter pattern has been replaced with visible-center constraints across enrollment/application submissions, child and family views, parent workspace selection, messaging families/classrooms/internal threads, billing invoices/payments, analytics, attendance, forms, daily reports, media review, incident reports, documents, compliance data, and compliance export. Tenant-wide corporate visibility remains available across every center returned by the authenticated tenant scope; limited and empty grants fail closed.

Additional evidence:

- Two-tenant, full-tenant, limited-grant, empty-grant, stale-filter, invalid-filter, and tenant-scoped internal-message tests pass.
- Focused corporate suite: 30 passed, 0 failed.
- Final isolation regression subset: 5 passed, 0 failed.
- Focused ESLint: 0 errors and 0 warnings after removing the obsolete local child-scope helper.
- `git diff --check`: passed.
- Typecheck reached unrelated concurrent-work failures after workstream type errors were corrected. The remaining observed errors were in parent-portal concurrent edits and `src/lib/classroom-offline-queue.ts`; no `corporate-view-scope.ts`, message-visibility, compliance-export, or corporate isolation test error remained.

The next action is now the credentialed corporate smoke and human signoff sequence recorded in `docs/BRENDENS_TASKS.md`; no account credentials or production mutations were created by this workstream.
