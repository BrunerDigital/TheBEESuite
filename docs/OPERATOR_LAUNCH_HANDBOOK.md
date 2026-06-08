# Operator Launch Handbook

Last updated: June 8, 2026

This is the central operator-facing index for launching and supporting The BEE Suite with Kid City USA and future childcare operators.

## Core Runbooks

- `docs/PRODUCTION_RELEASE_CHECKLIST.md` - release process before production changes.
- `docs/SCHOOL_FULL_FEATURE_ROLLOUT_CHECKLIST_2026-06-08.md` - full-feature school rollout tracker covering build gaps, per-school setup, validation, approvals, and go/no-go.
- `docs/ROLE_SMOKE_TEST_CHECKLIST.md` - role-by-role production smoke testing.
- `docs/SUPPORT_ESCALATION_GUIDE.md` - support severity, triage, and data safety.
- `docs/OWNER_ACTION_ITEMS.md` - decisions, approvals, and data BrunerDigital needs from ownership/operators.
- `docs/SECURITY_PRIVACY_OPERATIONS.md` - RLS/table access documentation, retention, encryption plan, and backup/restore.
- `docs/KIDCITY_CRM_CUTOVER.md` - Kid City CRM cutover workflow.
- `docs/KIDCITY_CUTOVER_OWNER_CHECKLIST.md` - owner-side Kid City cutover actions.
- `docs/in-school-testing-runbook.md` - in-school pilot testing.

## Module Guides

- `docs/INQUIRY_INTAKE.md` - inquiry form, CRM routing, notifications, and Google Sheet backup.
- `docs/FTE_REPORTING.md` - weekly FTE submission and executive review.
- `docs/PROCARE_FIELD_COVERAGE.md` - ProCare import field coverage.
- `docs/KIOSK_PARENT_ENGAGEMENT.md` - kiosk and parent engagement foundation.
- `docs/STRIPE_CONNECT.md` - payment architecture.
- `docs/STRIPE_CONNECT_SETUP.md` - Stripe setup and payout onboarding.
- `docs/EXECUTIVE_ADMIN.md` - executive admin capabilities.
- `docs/user-feature-access-map.md` - role/module access map.

## Role Guides

- `docs/SCHOOL_DIRECTOR_QUICK_START.md` - director/location user workflow.
- `docs/EXECUTIVE_ADMIN_QUICK_START.md` - executive/corporate admin workflow.

## Launch Order For A New School

1. Confirm the school exists as a center with correct location ID.
2. Confirm director/location user account and access scope.
3. Import or manually create classrooms, staff, families, children, and balances.
4. Validate location-scoped CRM lead visibility.
5. Configure inquiry embed and submit a test inquiry.
6. Configure FTE reporting access and submit a test weekly report.
7. Configure kiosk/PIN workflow and test one family check-in/check-out.
8. Keep payment checkout disabled until Stripe connected account onboarding and fee disclosures are approved.
9. Run the full-feature rollout checklist for the school.
10. Run the role smoke test checklist.
11. Document any exceptions or known limitations before school staff use the module live.

## Current Pilot Boundaries

- Kid City USA is the first live pilot account.
- CRM inquiry intake and FTE workflows are live operational priorities.
- Parent portal, teacher workflows, kiosk, documents, billing, and messaging foundations exist, but full school use is gated by real school data, role-by-role validation, training, and school signoff.
- Parent payments stay disabled per school until Stripe connected account onboarding, fee disclosures, refund/dispute handling, and legal/accounting approval are complete.
- Do not claim legal/licensing compliance. Use `compliance-ready workflows` and `documentation support`.
