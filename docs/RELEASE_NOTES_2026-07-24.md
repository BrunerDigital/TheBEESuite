# The BEE Suite Production Release - July 24, 2026

## Release identity

- Commit: `7e64b9269ec83ffba7adc5ca987846da912b2dbf`
- Branch: `main`
- Vercel production deployment: `dpl_2BT7bvLnNSdrBRmHXez4kbnbGpcw`
- Deployment URL: `https://the-bee-suite-d6pziaqal-brunerdigitals-projects.vercel.app`
- Production aliases: `https://thebeesuite.io`, `https://www.thebeesuite.io`
- Prior Ready rollback deployment: `dpl_88aRRVZhxBqZb7KtUgwT4p2oGFhs`
- Result: `READY`; rollback was not required.

## User-visible changes

### Billing and weekly tuition

- The assigned child billing record is the canonical weekly tuition rate.
- Family records show the total active weekly tuition and the per-child breakdown.
- Child profiles show the assigned rate, plan, active state, and start period.
- Enrollment and billing views show the same assigned rate instead of requiring a duplicate family-level rate.
- Opening Billing from a selected family/child preserves that context.
- Recurring tuition creates a Friday invoice for the following week once the assignment is active and eligible. A saved payment method is required for automatic collection, not for invoice creation.
- `Charge This Child Now` is an immediate manual invoice action and must not be used as a substitute for assigning recurring tuition.

### Family and enrollment records

- The family editor now keeps the current school, family, child, guardian, billing account, and record counts visible while editing.
- Directors can move directly between a family record, the selected child's billing context, and the complete family profile.
- Weekly tuition is visible in the family and child context without creating another editable tuition field.
- Enrollment directory records expose the assigned weekly rate where available.

### Dashboard and homepage

- Dashboard context passing was updated so family and child selection is retained when moving into the affected billing and family workflows.
- The public homepage and role entry routes were included in the production smoke test and remained healthy after deployment.

### Public survey security

- Public survey submissions are accepted only for active surveys.
- Center and family identifiers must belong to the survey tenant.
- Persistent request throttling limits repeated submissions.
- Survey rollups, the response, and the audit entry are written atomically under a serialized survey-row update.
- Public responses never return prior comments or respondent details.

### Inquiry origins

- The trusted production origins are always retained:
  - `https://kidcityusa.com`
  - `https://www.kidcityusa.com`
  - `https://thebeesuite.io`
  - `https://www.thebeesuite.io`
- `INQUIRY_ALLOWED_ORIGINS` extends that list; it does not replace the trusted defaults.

### ProCare preparation tooling

- Raw and prepared ProCare export directories are excluded from Git.
- `npm run procare:prepare-rendered` creates a review package without importing or writing production data.
- The prepared CSV retains a source-coverage manifest so reviewers can prove which source datasets were present.
- The preparation tool refuses to write into the source directory.
- Oakleaf currently has 8 unresolved child/account links.
- Canton currently has 7 unresolved links: 6 missing from the account report and 1 requiring authoritative DOB resolution.
- These results do not authorize preview, commit, activation, cutover, or ProCare retirement.

## Verification

- Prisma Client generation: passed.
- Lint: passed.
- TypeScript typecheck: passed.
- Node test suite: 584 tests, 579 passed, 5 skipped, 0 failed.
- Next.js 16.2.11 production build: passed.
- Static page generation: 153 of 153 pages.
- Production browser smoke: passed.
- `/api/health`: HTTP 200 with database connected.
- Homepage, login, and both hosted inquiry scripts: HTTP 200.
- Approved inquiry-origin preflights: HTTP 204 with the exact requesting origin returned.
- Initial Vercel production error, warning, and HTTP 500 log checks: no matching events.

## Explicitly unchanged gates

This release did not:

- Run or approve a ProCare import.
- Change ProCare's source-of-truth status.
- Activate billing, live payments, refunds, payouts, invitations, communications, kiosk, or a school rollout.
- Change a school, family, child, guardian, billing responsibility, payout account, or role assignment.
- Apply a database migration.
- Change production environment variables or provider configuration.

Kokomo may continue its previously approved normal production use. The wider school wave and every held module still require their own dated approval and evidence.

## Operator follow-up

- Use the updated role SOPs for future training.
- Use `docs/PROCARE_EXPORT_VALIDATION_2026-07-24.md` before any Oakleaf or Canton preparation review.
- Use `docs/POST_RELEASE_SMOKE_CHECKLIST.md` for future releases; do not submit a live inquiry, survey, charge, invitation, message, or import merely to prove a deployment.
- Continue monitoring survey `4xx`, `429`, `5xx`, transaction latency, and database lock timeouts.
