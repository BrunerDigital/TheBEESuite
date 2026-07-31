# Operator Launch Handbook

Last updated: July 29, 2026

This is the central operator-facing index for launching and supporting The BEE Suite with Kid City USA and future childcare operators.

## Core Runbooks

- `docs/PRODUCTION_RELEASE_CHECKLIST.md` - release process before production changes.
- `docs/RELEASE_NOTES_2026-07-24.md` - exact commit, deployment, verification, and unchanged gates for the July 24 release.
- `docs/PRODUCTION_READINESS_AUDIT_MATRIX_2026-07-24.md` - current role, feature, workflow, security, and data-integrity status.
- `docs/PRODUCTION_READINESS_MASTER_EXECUTION_TASK_2026-07-20.md` - current staged production-readiness execution and independent launch gates.
- `docs/ROLE_SMOKE_TEST_CHECKLIST.md` - role-by-role production smoke testing.
- `docs/SUPPORT_ESCALATION_GUIDE.md` - support severity, triage, and data safety.
- `docs/OWNER_ACTION_ITEMS.md` - decisions, approvals, and data BrunerDigital needs from ownership/operators.
- `docs/SECURITY_PRIVACY_OPERATIONS.md` - RLS/table access documentation, retention, encryption plan, and backup/restore.
- `docs/KIDCITY_CRM_CUTOVER.md` - Kid City CRM cutover workflow.
- `docs/KIDCITY_CUTOVER_OWNER_CHECKLIST.md` - owner-side Kid City cutover actions.
- `docs/PROCARE_LOCATION_MIGRATION_RUNBOOK.md` - per-location final migration sequence for switching off ProCare.
- `docs/PROCARE_EXPORT_VALIDATION_2026-07-24.md` - current Oakleaf and Canton preparation results and unresolved-link gates.
- `docs/in-school-testing-runbook.md` - in-school pilot testing.
- `docs/BRAND_AND_GUIDE_STYLE.md` - current app, screenshot, instructional graphic, and printable style standard.

## Module Guides

- `docs/INQUIRY_INTAKE.md` - inquiry form, CRM routing, notifications, and Google Sheet backup.
- `docs/FTE_REPORTING.md` - weekly FTE submission and executive review.
- `docs/PROCARE_FIELD_COVERAGE.md` - ProCare import field coverage.
- `docs/KIOSK_PARENT_ENGAGEMENT.md` - kiosk and parent engagement foundation.
- `docs/STRIPE_CONNECT.md` - payment architecture.
- `docs/STRIPE_CONNECT_SETUP.md` - Stripe setup and payout onboarding.
- `docs/PAYMENT_PROCESSING_RECOVERY_REVIEW.md` - finalized payment processing recovery copy, legal/accounting review checklist, and live approval gate.
- `docs/user-feature-access-map.md` - role/module access map.

## Role Guides

- `docs/sops/SCHOOL_SYSTEM_OPERATING_MANUAL.md` - current cross-role operating manual.
- `docs/sops/EXECUTIVE_ADMIN_SOP.md` - executive and corporate workflow.
- `docs/sops/DIRECTOR_SOP.md` - director and location workflow.
- `docs/sops/BILLING_ADMIN_SOP.md` - billing workflow.
- `docs/sops/TEACHER_SOP.md` - classroom workflow.
- `docs/sops/PARENT_PORTAL_INSTALL_GUIDE.md` and `docs/sops/PARENT_PORTAL_SOP.md` - parent access and daily use.

## Launch Order For A New School

1. Confirm the school exists as a center with correct location ID.
2. Confirm director/location user account and access scope.
3. Prepare, validate, and separately authorize any import, or manually create classrooms, staff, families, children, and balances. A software release does not authorize a ProCare preview or import.
4. Validate location-scoped CRM lead visibility.
5. Configure the inquiry embed and verify routing/CORS without a mutation. Submit a synthetic inquiry only when a named test location and provider side effects are separately approved.
6. Configure FTE reporting access and submit a test weekly report.
7. Configure kiosk/PIN workflow and test one family check-in/check-out.
8. Keep payment checkout disabled until Stripe connected account onboarding is complete, and keep parent-paid processing recovery disabled until `docs/PAYMENT_PROCESSING_RECOVERY_REVIEW.md` is approved for the school.
9. Run the full-feature rollout checklist for the school.
10. Run the role smoke test checklist.
11. Document any exceptions or known limitations before school staff use the module live.

## Current Pilot Boundaries

- Kid City USA is the first live pilot account.
- CRM inquiry intake and FTE workflows are live operational priorities.
- Parent portal, teacher workflows, kiosk, documents, billing, and messaging foundations exist, but full school use is gated by real school data, role-by-role validation, training, and school signoff.
- Parent payments stay disabled per school until Stripe connected account onboarding, fee disclosures, refund/dispute handling, and legal/accounting approval are complete. Parent-paid processing recovery stays at `$0` until `STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED=true` is approved.
- The July 24 software release is live and verified, but it did not activate ProCare imports, billing, payments, invitations, communications, kiosk, or any wider-school gate.
- Do not claim legal/licensing compliance. Use `compliance-ready workflows` and `documentation support`.
