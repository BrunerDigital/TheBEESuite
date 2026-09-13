# Billing actor identity and selected-school authority — September 13, 2026

## Current state before changes

Isolated branch `work/billing-actor-identity-20260913` was created from current `origin/main` at protected PR #372 (`136d0d60eff90dbe612e5d63fbefed712ca245cf`) while independently validated UI PR #373 completes protected checks. It will incorporate that main release before this candidate is committed. The primary dirty checkout, unrelated PR #311 and recoverable history are preserved.

Source-confirmed defect: `getCurrentUser` changes effective `tenantId` when a platform operator selects another company's school. The persisted application User and DeviceSession remain in the identity's home tenant. Authenticated invoice Checkout's transactional authorization mistakenly queries those records using the effective school tenant, rejecting a legitimate selected-school payment attempt. Existing route mocks ignore the queried predicates and incorrectly model the platform user with its home tenant as its effective tenant, hiding the false denial.

The transactional actor query also omits current session version, staff password-reset state, and fresh school assignment/grant checks. The outer request resolver rechecks access, but a subsequent actor/session/grant change should fail closed at the claim boundary too. Family has a scalar `centerId`, not a `center` relation or `tenantId`; target ownership must be proven through a separate Center/Organization query.

## Scope and safety contract

Expose server-derived identity tenant and session version independently of selected workspace context. Add a shared transaction authorization helper that checks the exact identity, session, allowed billing role, effective school context, target account/family/school topology and current school assignment or active dated CENTER grant. Cross-tenant selection remains platform-only and must explicitly select that school. Parent authority remains an exact current guardian/family relationship. Preserve existing legacy sessions without a device-session ID and the existing Parent password-reset exception.

Wire only authenticated invoice Checkout in this release; retain target tenant for provider/audit attribution and all existing amount, school readiness, responsibility, idempotency and signed-link boundaries. No user, grant, session, billing data, provider configuration or production migration is changed. Fake predicate-matching regression must demonstrate legitimate foreign-school selection and deny changed/revoked/ambiguous authority before payment creation or provider writes.

Legacy family-balance payment preparation, replay containment and durable recovery remain a separate technical wave. This release must not be described as completing that path.

## Implemented and focused verification

Protected UI PR #373 was merged at main `a6394f8af9d7cc2bc41d5703efd5be8ecb71d79f` and incorporated by fast-forward without disturbing this independent work. The helper and authenticated Checkout integration are implemented. Auth's pre-existing identity/session/workspace resolution is unchanged except for the two separately derived output fields. No schema, cookie payload, provider attribution, permission grant or saved identity is modified.

Focused authorization, actual route and real checkout-service suites passed 102 tests (`output/wave21-financial-focused.log`); identity/workspace/CRM passed 66 (`output/wave21-actor-focused.log`). These totals overlap and must not be added. The fixture matches real nested Prisma predicates, including grant dates and tenant relations, rather than blindly returning an actor. The actual route models a home-tenant platform identity with a different selected target tenant. Real claim composition rejects stale authority; the actual checkout service additionally proves zero Payment creation, audits, Customer creation and Checkout creation after denial. Final strengthened service assertions passed all 49 service cases (`output/wave21-service-final.log`). Two independent read-only reviews found no material blocker under the stated strict grant contract.

`npm run vercel-build` passed (`output/wave21-vercel-build.log`): Prisma generation, lint with zero errors and one pre-existing unrelated warning, TypeScript, all 2,249 tests and optimized Next.js build. `mobile:store:check` passed (`output/wave21-mobile-store-check.log`). No live financial POST, setup, identity/grant edit or provider write was used for verification. Authenticated management financial execution remains unverified in production without approved synthetic management access and a safe provider test context.

## Protected release

PR [#374](https://github.com/BrunerDigital/TheBEESuite/pull/374), candidate `e31f21faa8f655e8cf3f72dc022727d4442dbf9b`, merged at `12612f539a6287e1332683202e9a74a13a3358d9` at 23:32:30 UTC after CI `34789701307`, CodeQL and exact preview Ready, with no unresolved review threads or protection bypass. Exact production `dpl_A8XMKBzibpi86Hg3gdkpx5ycKxHX` was Ready at 23:35:04.437 UTC on `thebeesuite.io`, `www.thebeesuite.io`, `the-bee-suite-beta.vercel.app`, `the-bee-suite-brunerdigital.vercel.app` and `the-bee-suite-git-main-brunerdigital.vercel.app`.

Guarded reserved Parent/Teacher regression passed at 23:40:46.672 UTC with the complete 20-route, responsive, navigation, Updates, message-history, report/picker, invoice-date and demo-billing checks retained. Two matched logins, 95 verified heartbeats, six empty-body denial probes and explicitly scoped read probes only; no blocked requests, HTTP errors or client exceptions. Evidence: `output/playwright/app-review-production-after-parent-updates-pr374/results.json` and `output/wave21-production-verification.log`. Health was database-connected at 23:41:24.465 UTC. Scoped post-Ready error/fatal and 5xx logs were empty; error-filtered build logs showed only completion. This regression does not constitute a live management payment or provider execution test.
