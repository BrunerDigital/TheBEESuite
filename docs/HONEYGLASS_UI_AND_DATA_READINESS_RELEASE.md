# Honeyglass UI and Data Readiness release

## Scope and current-state inventory

This release modernizes presentation and adds a Director Data Readiness Center. It does not migrate or rewrite existing operational records. The existing responsive App Shell, role-scoped navigation, light/dark theme bootstrap, shared glass tokens, dashboard cards, and guarded ProCare import route remain the foundation.

The requested `BEE_Suite_ProCare_Data_Readiness_Workbook.xlsx` was not present in the repository or supplied attachment. Field coverage and known gaps therefore use the maintained repository evidence in `docs/PROCARE_FIELD_COVERAGE.md` and `docs/BEE_SUITE_SCHOOL_DATA_IMPORT_AND_PARENT_LAUNCH_EMAILS.md`. No unsupported field is described as mapped.

## Role experience

| Role surface | Before | After |
| --- | --- | --- |
| Director and executive | Full desktop navigation and conventional KPI tiles | Bold Honeyglass shell, tablet icon rail, role-aware mobile navigation, honeycomb KPI cluster, and scoped readiness status |
| Teacher and parent | Existing task-focused cards and mobile navigation | Warmer Clear Bento treatment with the same permissions and underlying actions |
| Billing and regional roles | Desktop navigation, limited mobile destinations | Role-aware mobile destinations and tablet rail without expanding module access |
| Data review | ProCare import review inside Operations | Dedicated readiness overview, queue, evidence drawer, safe decisions, CSV export, and the unchanged guarded ProCare onboarding panel |

## Data Readiness Center

- Statuses: `BLOCKED`, `CONFIRM`, `READY`, `EXCLUDED`, `IMPORTED`, `VERIFIED`, and `FAILED`.
- Priority order: safety/custody, access/identity, billing/balances, enrollment/classroom, staff, parent communication, then historical/informational data.
- The queue supports search, category/status/risk filters, sorting, pagination, responsive table/cards, row-level comparison, source filename/row/IDs, parsing confidence, related records, downstream impact, and CSV export.
- Director decisions are append-only `AuditLog` evidence. They do not update families, children, staff, enrollment, access, invitations, messages, invoices, payments, balances, or import rows.
- Bulk confirmation is fail-closed and limited to low-risk `CONFIRM` rows with stable source IDs. Safety/custody, access/identity, billing/balances, and communication readiness are never bulk eligible.
- School and tenant scope comes from the authenticated user and authorized center set. Platform roles retain their existing all-center scope.

## ProCare onboarding and field coverage

The new center embeds the current guarded import path instead of creating a competing importer. The workflow retains source inventory confirmation, SHA-256/review fingerprints, duplicate review, preview-before-commit, resumable chunks, retained raw source fields, per-row results, recoverable backups, reconciliation exports, and the explicit separation between import completion and school activation.

Confirmed source areas include location, family, guardian, child, classroom and staff identifiers; contact and relationship data; schedules, enrollment and classroom placement; emergency contacts, authorized pickups, allergy/medical/permission evidence; balances, attendance, check-in/out evidence; raw fields and provenance.

Guarded gaps remain immunization detail, tuition contracts/recurring charge assignments, fees/credits/discounts/subsidy responsibility, employee certifications, and detailed/high-volume ledger history. These remain visible as gaps and are not silently inferred.

## Accessibility and responsive behavior

The implementation preserves semantic controls, keyboard focus, minimum touch targets, labels, status text in addition to color, mobile card fallbacks for dense tables, tablet navigation, dark mode, reduced-motion behavior, and forced-color fallbacks. Decorative honeycomb geometry is presentation-only and collapses to readable cards on narrow screens.

## Feature flags and rollback

- `NEXT_PUBLIC_HONEYGLASS_UI_ENABLED=false` returns the shell and KPI cards to their existing rectangular treatment.
- `NEXT_PUBLIC_DATA_READINESS_ENABLED=false` hides navigation/context badges and makes the page/API unavailable.
- The flags are independent. Disabling the readiness center does not disable the guarded ProCare import in Operations.
- If a deployment rollback is required, redeploy the immediately previous production commit after confirming its Vercel deployment is Ready, then verify canonical aliases and `/api/health`. No database rollback is required because this release adds no schema migration.

## Validation evidence

The release requires focused readiness and ProCare tests, RBAC/tenant-isolation tests, lint, typecheck, the repository production build gate, protected-branch CI, Vercel Ready on canonical aliases, healthy `/api/health`, clean relevant logs, and changed-flow checks. Authenticated role checks must use an authorized safe session; public health alone is not evidence of role-specific behavior.
