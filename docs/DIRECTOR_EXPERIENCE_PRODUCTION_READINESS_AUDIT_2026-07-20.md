# Director Experience Production Readiness Audit

Date: July 20, 2026  
Accountable human: Brenden until explicitly delegated  
Decision: **NO-GO for the wider school wave. Kokomo may continue normal production use.**

## Production-ready definition

The Director experience is production-ready for a selected school only when a credentialed director or billing user can operate and reconcile school setup, CRM, families and children, classrooms and staff, attendance and daily reports, incidents, documents, messages, tuition and invoices, payments and refunds, FTE, reports, and alerts without cross-school exposure or unreconciled financial/operational state. The same flow must pass on the school's actual desktop/mobile devices, with approved data, Stripe state where billing is enabled, alert recipients, ownership, rollback, and written signoff.

Passing repository tests is necessary evidence, not school go-live approval.

## Audit scope and evidence completed

- Reviewed the workstream register and school rollout checklist.
- Inventoried Director routes, consolidated workspaces, RBAC, APIs, domain helpers, tests, and SOP/readiness documentation.
- Reviewed school setup authorization and tenant/center checks.
- Reviewed CRM center scoping and inquiry-to-enrollment helper coverage.
- Reviewed family billing access, invoice creation/correction, manual payments, Stripe refund allocation, ledger updates, audit records, partial-failure reporting, and the credit/manual-reimbursement boundary.
- Reviewed attendance state, incident review, document review/checklists/expiration reminders, FTE deadlines/escalations/import/rollups, reporting exports, staff scheduling/time cards, and Director notification recipient audit coverage.
- Confirmed the API smoke inventory covers every current route file and exported HTTP method through the full test suite.
- Did not access or mutate production data, send messages, enable billing, rotate credentials, deploy, or make external changes.

## Findings

### BLOCKER

1. **Credentialed per-school Director smoke evidence is missing.** A real scoped director/billing account must prove the complete operating loop and cross-school isolation for every selected school. Repository tests cannot prove production account grants, imported records, device behavior, storage access, or actual notification delivery. Owner: **Brenden**. Exact retest: sign in as the named school Director and exercise every workflow in the production-ready definition, recording pass/fail, school, account role, device, timestamp, and evidence.

2. **Selected-school setup and reconciliation signoff is missing.** The shared checklist still requires the actual wave, named school owners, reconciled ProCare data, classrooms/staff/families/children/guardians, Director access, balances, stop conditions, rollback, and written cutover approval. Owner: **Brenden**. Exact retest: run the approved per-school readiness report after setup/import, reconcile source totals and at least 10 families (or all when fewer), then obtain Director and corporate signoff.

3. **Billing/refund reconciliation is not proven for schools where payments will be enabled.** Code guards and unit tests pass, but each school still needs connected-account readiness, approved billing preview, a test payment/webhook/receipt/ledger cycle, an approved partial refund to the original charge, payout reconciliation, and named dispute/refund ownership. Owner: **Brenden**. Exact retest: use an approved test family and refundable charge for the selected connected account, reconcile Stripe, invoice/payment state, family balance, ledger entry, audit record, receipt, and payout before enabling billing.

### REQUIRED BEFORE WAVE

1. **Target-device rendered validation remains open.** No authorized credentialed Director session was available, so desktop/mobile page identity, console health, framework-overlay checks, interaction recovery, and screenshots were not collected. Owner: **Brenden**. Exact retest: run `DIRECTOR_SELECTED_SCHOOL_SMOKE_AND_SIGNOFF_PACKET.md` on the actual launch desktop/tablet/mobile devices and retain screenshots plus console/error evidence.

2. **Alert delivery and scheduled-job ownership remain open.** Recipient selection, dedupe, FTE timing, document expiration logic, and reminder rules have unit coverage, but production cron execution, sender/reply path, delivery/bounce/suppression, alert recipients, and after-hours escalation require external evidence. Owner: **Brenden**. Exact retest: trigger approved non-customer test notifications for one selected school, verify provider delivery events and in-app alerts, and document the cron/support owner.

### FOLLOW-UP

1. **Director training and first-week reconciliation drills are not evidenced.** Owner: **Brenden**. Exact retest: complete the Director SOP walkthrough, refund/incident/document exception drills, day-1 review, first-billing reconciliation, and week-1 review with named follow-up owners.

2. **Global product and tuition-plan catalogs deserve a future ownership review.** The current schema intentionally stores these as global records. No defect was filed because the UI and API are consistent with that design, but a future multi-tenant catalog decision should be explicit. Owner: **Brenden**. Exact retest: decide whether catalogs remain platform-wide or become tenant/center scoped, then add policy tests matching the decision.

## Safe repo-scoped fix completed

- Updated the CRM Director test fixture with `assignedClassroomId: null` so it satisfies the current `CurrentUser` contract. This is test-only and does not change runtime or external state.
- Reconciled the teacher daily-report child lookup guard; the current route now narrows a missing child before classroom authorization and typecheck passes.
- Added Director authorization/error-recovery coverage for school setup, CRM, family/staff operations, attendance, incidents, documents, FTE, reports, alerts, billing, refunds, and reconciliation boundaries.
- Added `DIRECTOR_SELECTED_SCHOOL_SMOKE_AND_SIGNOFF_PACKET.md` with a reusable two-school isolation, reconciliation, device, defect, and signoff sequence.
- Preserved encrypted offline-queue behavior while converting Web Crypto inputs to owned `ArrayBuffer` values for type-safe browser encryption/decryption.
- Normalized parent setup-link failure returns to a discriminated `ok: false` contract so invitation, registration approval, and document-request callers fail closed and typecheck safely.
- Split client-safe report definitions from the server-only reporting module so the Director analytics UI no longer pulls `next/headers` into the browser bundle.

## Tests run

- Director/domain subset: **88 passed, 0 failed**.
- Full `npm test`: **512 passed, 0 failed**.
- `node --import tsx --test tests/crm.test.ts`: **3 passed, 0 failed** after the fixture repair.
- Director/offline focused retest: **11 passed, 0 failed**.
- `npm run typecheck`: **passed**.
- `npm run lint`: **passed with 0 errors and 1 pre-existing React hook dependency warning** in `src/components/teacher-mobile-workspace.tsx`.
- `npm run vercel-build`: Prisma generation, lint, typecheck, and all 512 tests passed; the first Next build exposed a server/client reporting import boundary, which was fixed. The post-fix `npx next build` then passed and generated all 153 static pages. This workstream did not deploy.
- Credentialed browser/live Director smoke: not run; no authorized scoped account/evidence context was provided.

## External decisions required

- Select the first wave, launch dates, and enabled modules.
- Explicitly delegate or retain the Director, billing/refund, data reconciliation, technical release, training, and first-week support owners.
- Approve the per-school ProCare cutover/rollback and billing enablement gates.
- Provide authorized scoped test accounts, approved test families/payment artifacts, target devices, and notification recipients.
- Obtain Director, corporate, billing/accounting, technical/release, and ProCare cutover signoffs.

## Files changed by this workstream

- `tests/crm.test.ts`
- `tests/director-readiness.test.ts`
- `src/lib/classroom-offline-queue.ts`
- `src/lib/parent-portal-setup-links.ts`
- `src/lib/reporting-analytics-shared.ts`
- `src/lib/reporting-analytics.ts`
- `src/components/analytics-report-builder.tsx`
- `docs/DIRECTOR_SELECTED_SCHOOL_SMOKE_AND_SIGNOFF_PACKET.md`
- `docs/DIRECTOR_EXPERIENCE_PRODUCTION_READINESS_AUDIT_2026-07-20.md`
- `docs/BRENDENS_TASKS.md`

No unrelated dirty or untracked files were edited, reverted, staged, or committed.

## Exact next action

Brenden should select one non-Kokomo candidate school and intended modules, authorize the real scoped Director/billing accounts and financial evidence, and record accepted signoff owners. Then execute `DIRECTOR_SELECTED_SCHOOL_SMOKE_AND_SIGNOFF_PACKET.md` in order before considering any wider-wave approval.
