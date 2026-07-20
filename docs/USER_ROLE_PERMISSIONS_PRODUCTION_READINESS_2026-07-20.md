# User and Role Permissions Production Readiness

Date: July 20, 2026

Decision: **NO-GO for the wider school wave. Kokomo may continue normal production use.**

Accountable human: Brenden until explicitly delegated and accepted.

## Production-ready definition

Credentialed executive, director/billing, teacher, parent, authorized-pickup, kiosk, and public tests pass for two distinct schools and every selected launch school. There is no cross-tenant, cross-school, cross-family, or cross-classroom disclosure or mutation. Access grants, authentication state, session invalidation, and audit identity match the intended account.

## Completed repo evidence

- Central application sessions require an active user, matching email and session version, active device session when present, and completion of the applicable password-reset gate.
- Center access is resolved through tenant, access-grant, or staff-profile scope and is enforced through shared helpers.
- Teacher attendance, daily-report, incident, and media mutations now require the teacher's assigned classroom in addition to school access.
- Parent operations require the authenticated user to be linked to the target guardian/family; center access alone does not authorize a parent.
- Guardian kiosk credentials are school-bound, and submitted children must belong to the verified family at that school.
- Guardian kiosk lookup/check, staff kiosk, and public trial onboarding now use the database-backed rate limiter. It falls back to the existing in-process limiter if the database is unavailable so an infrastructure failure does not make the endpoint unrestricted.
- Automated isolation coverage is in `tests/user-role-isolation.test.ts`.
- The reusable credentialed matrix and evidence record is `docs/USER_ROLE_TWO_SCHOOL_CREDENTIALED_TEST_PLAN.md`.

## Findings and recommended decisions

### BLOCKER: Credentialed two-school evidence is not complete

No repository test can prove the deployed account, grant, Supabase Auth, real route, and production/staging data combination. Brenden must authorize the two schools or safe tenants, accounts, test window, and mutation boundaries. Recommended default: use staging or synthetic test tenants; do not use real family data unless separately authorized.

### BLOCKER: Executive role-only tenant fallback

`getCurrentUser()` currently grants tenant-wide access to `BRAND_ADMIN`, `REGIONAL_MANAGER`, and `READ_ONLY_AUDITOR` users with no active grants and no staff center assignment. This conflicts with the documented rule that role alone does not imply global access.

Recommended default: **fail closed**. Require an active tenant/brand/organization/owner-group/center grant for every non-platform executive. Before changing the fallback, audit current executive accounts and create an approved grant-remediation list; otherwise a correct security change could unexpectedly lock out legitimate operators. Do not preserve a permanent environment-variable bypass. `PLATFORM_OWNER` remains the explicit platform-wide exception.

Exact retest: deactivate or omit a non-platform executive's grants, increment session version, sign in again, and prove no center or executive module is accessible; restore one approved scoped grant and prove only that scope becomes visible.

Owner: Brenden for policy approval and production-account audit authorization; technical release owner for the subsequent code change and retest.

### REQUIRED BEFORE WAVE: Persistent kiosk credential throttling

Repo-safe implementation is complete. Kiosk and onboarding credential attempts now use `RateLimitBucket` through `checkPersistentRateLimit()`, with the local limiter as a defensive availability fallback.

Recommended default: retain the current per-center and IP keys and limits, alert on sustained 429 responses, and test from two app instances before enabling kiosk at another school.

Exact retest: submit invalid School A credentials until 429, repeat through a second application instance with the same key, verify it remains blocked, then prove a School B key is independent.

Owner: technical release owner for deployment/observability evidence; Brenden for kiosk activation approval.

### REQUIRED BEFORE WAVE: Public trial-tenant creation policy

The public onboarding endpoint can create an isolated tenant and a `BRAND_ADMIN`, then initiate password setup. The tenant boundary is deliberate, but unrestricted self-service creation is a commercial and abuse-risk decision.

Recommended default: **approval-gated trials**. Keep persistent throttling, add verified-email proof before activating the admin, and require an allowlisted invitation or staff approval before production access. Until that product decision is implemented, do not advertise or rely on public trial creation for the school wave.

Exact retest: an unapproved request may be recorded but cannot obtain an active admin session; an approved, verified request creates only a new isolated trial tenant and cannot reference an existing tenant, center, user, or grant.

Owner: Brenden for self-service versus approval-gated policy; technical release owner for implementation after approval.

### REQUIRED BEFORE WAVE: Authorized-pickup account routing

RBAC excludes `AUTHORIZED_PICKUP` from messages, documents, billing, notifications, and school operations, but currently permits the `parent-portal` module and parent-login routing. Parent APIs generally require `PARENT_GUARDIAN`, so the route is confusing and does not represent a complete pickup-account workflow.

Recommended default: **kiosk credential only**, without a standalone authenticated portal, until an authorized-pickup-to-family/child authorization model and restricted workspace exist. Do not redirect these accounts to the full parent portal. Because existing account usage has not been audited, the routing change requires Brenden's policy confirmation and an account inventory first.

Exact retest: the pickup identity can act only for explicitly authorized children at the correct school and cannot access family profile, messages, documents, media, incidents, billing, preferences, or other children.

Owner: Brenden for account-model policy; parent/kiosk product owner and technical release owner for implementation and retest.

### REQUIRED BEFORE WAVE: Executive/admin MFA

Recommended default: require MFA for `PLATFORM_OWNER`, `BRAND_ADMIN`, `REGIONAL_MANAGER`, `CENTER_DIRECTOR`, `ASSISTANT_DIRECTOR`, and `BILLING_ADMIN`; define enrollment, recovery, break-glass custody, and enforcement dates before the wider wave.

Owner: Brenden for policy and recovery owner assignment; security/release owner for enforcement evidence.

## Remaining exit gate

Complete `USER_ROLE_TWO_SCHOOL_CREDENTIALED_TEST_PLAN.md`, resolve every BLOCKER, attach sanitized evidence, and repeat the applicable matrix for each selected school. Parent invitations, kiosk activation, billing, and cutover remain independent approvals.
