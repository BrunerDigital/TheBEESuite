# Production and iOS completion matrix

Status date: September 9, 2026 (America/New_York)

This is the current release-candidate truth record. `Verified in production` means the named behavior was exercised against the canonical deployment; a public HTTP 200 is not treated as authenticated workflow evidence. `iOS verified` means execution in Xcode Simulator or on a physical device, not a browser-sized preview.

## Verified release evidence

- Protected product PR: [#325](https://github.com/BrunerDigital/TheBEESuite/pull/325), merged September 8, 2026 at `7bed3daeb796a5daa38f7e50882b95f031446adf`.
- Protected post-release verification PR: [#326](https://github.com/BrunerDigital/TheBEESuite/pull/326), merged September 8, 2026 at `2933808eb58bc7e8846b3bfd5f58a3f29c15b11b`. It pins patched development-only `js-yaml` 4.3.2 and makes redirect-aware, multi-viewport production smoke verification deterministic.
- Protected prospective-family billing PR: [#328](https://github.com/BrunerDigital/TheBEESuite/pull/328), merged September 8, 2026 at `c982a9a1946c057b6de7abdf3fbe866a4066313d`. It adds expected-child/due-date handling and permits guarded one-time prospective-family charges without widening recurring tuition or receivable scope.
- Protected completion PR: [#327](https://github.com/BrunerDigital/TheBEESuite/pull/327), merged September 8, 2026 at `dac12a1660c5c5652abbb62a91a6ad1082994434`. It completes fail-closed Parent and Teacher App Review targeting, reviewer-identity lifecycle controls, demo-only storage/write boundaries, provider suppression, current-recipient delivery accounting, native submission preparation, and the final regression set.
- Protected production-gate closeout PR: [#332](https://github.com/BrunerDigital/TheBEESuite/pull/332), merged September 9, 2026 at `d64ec9d0b860b07985d56d2985fc5dcb77a4dfaa`. It records the applied repair in the deployable Supabase ledger, extends the bounded serializable transaction window used by both reviewer provisioning workflows, adds regression coverage, and updates the App Store packets to the verified production identities.
- Verified runtime-change deployment: `dpl_94WpkkBwkoE7x9KSBp5ZA7ePdLcN`, Ready and promoted, built from `d64ec9d0b860b07985d56d2985fc5dcb77a4dfaa`.
- Canonical aliases: `https://thebeesuite.io`, `https://www.thebeesuite.io`, and `https://the-bee-suite-beta.vercel.app` resolve to the promoted deployment; `www` redirects to the canonical apex.
- Local and protected GitHub CI validation passed Prisma generation, lint, typecheck, all 1,846 tests with no failures or skips, Next.js 16.3.4 compilation, and generation of all 166 static pages. The promoted Vercel build independently completed the configured `vercel-build` gate, compiled with Next.js 16.3.4, and generated all 166 static pages.
- `GET https://thebeesuite.io/api/health` returned HTTP 200 with `ok: true` and `database: connected` at `2026-09-09T18:38:17.600Z` after the deployment.
- Public production routes `/`, `/parents`, `/teachers`, `/privacy`, `/terms`, `/eula`, `/support`, `/resources`, and `/registration` returned HTTP 200.
- Production Playwright smoke passed the public/protected route checks, inquiry embed/API and CORS checks, and Parent/Teacher/Privacy/Support rendering without horizontal overflow at 390 x 844, 768 x 1024, and 1440 x 900.
- Unauthenticated changed-route probes failed closed: message reporting, Asset Hub signed-upload/finalize, AI command, and privacy review returned 401; forged Twilio inbound/status callbacks returned 403. No live mutation or message was performed.
- Vercel reported no runtime error clusters and no error/fatal log entries for the exact deployment after health and authenticated reviewer checks. The status breakdown contained no 5xx responses; the observed 401 notification polling and 409 conflict-safe lead traffic were unrelated expected boundaries. The build log ends `Deployment completed`, and deployment state is `READY` with no alias error.
- The exact released dependency graph reports zero known npm vulnerabilities.
- Exact authorization on September 9 provisioned the two reserved App Review identities with unique temporary passwords stored only in the ignored local environment. Parent is bound to Murphy Family; Teacher is bound to Toddler Hive through the Mia Patel fake source profile. Each identity has one active center grant, verified App Review/Auth markers, no kiosk/time-clock capability, and no active web-push subscription.
- Canonical production authentication was exercised for both accounts with the hidden local credentials. Parent returned role `PARENT_GUARDIAN` and `/parent-portal`; Teacher returned role `TEACHER` and `/teacher-portal`. Both portal requests returned HTTP 200 without an access-blocked state, both logout requests returned HTTP 200, and the verification device sessions were revoked.
- Supabase's security advisor still reports leaked-password protection disabled. Enabling `Prevent use of leaked passwords` in Authentication > Providers > Email and saving is a provider security-setting change reserved for Brenden; the 13 informational RLS-with-no-policy findings are the intentional fail-closed posture for service-role-only agency tables.

## Product release candidate

| Area | Built/configured | Locally tested | Verified in production | iOS verified | External gate or remaining evidence |
| --- | --- | --- | --- | --- | --- |
| Public site, inquiry, legal, privacy, support | Yes | Responsive/smoke checks | Verified on canonical production across public routes, CORS checks, and three viewport classes | Not applicable | None |
| Authentication, invitations, recovery, session boundaries | Yes | Automated authorization and route coverage | Parent and Teacher synthetic reviewer logins, role redirects, portal loads, and logout/session revocation verified on canonical production | Simulator/device required for continuity and password-manager behavior | Do not mutate real identities or send invitations |
| Parent portal, profiles, reports, media, documents, incidents | Yes | Automated tests plus synthetic responsive UI | Reserved reviewer authenticated successfully and is bound only to the verified Murphy fake-family graph | Simulator/device required | Copy the temporary credential into App Store Connect; rotate or disable it after review |
| Teacher classroom, roster, attendance, activities, media, notes | Yes | Automated tests plus synthetic responsive UI | Dedicated reviewer authenticated successfully and is bound only to Toddler Hive in the synthetic demo school | Simulator/device required | Copy the temporary credential into App Store Connect; rotate or disable it after review |
| Messaging and announcements | Tenant/current-family scoped; unsafe content screening and report workflow added | Focused regression tests pass | Unauthenticated report boundary returned 401; no real send performed | Simulator/device required | Authenticated fake-data verification; no real bulk sends |
| Billing, Checkout, connected-account boundaries, webhooks | Retry/idempotency, family-graph revalidation, reserved-identity provider filtering, and global telemetry controls hardened | Focused Stripe regressions pass | Health/logs clean and unauthenticated mutations fail closed; no charge or authenticated Checkout was attempted | External Checkout return requires device test | No charges, refunds, payouts, or account changes |
| Operations, reporting, FTE, executive and multi-location scope | Yes; platform telemetry isolated and reserved review identities protected across ordinary mutations | Focused authorization tests pass | Exact release is live; child agency parent-scope repair applied and catalog-verified | Not a v1 native target | Per-school operational activation remains a separate business gate |
| Asset Hub and file storage | Private storage, content binding, size/type/quota checks | Focused upload regressions pass | Unauthenticated signed-upload/finalize boundaries returned 401; no live object created | Picker/upload interruption requires device test | Authenticated synthetic upload; Supabase policy/config changes remain separately gated |
| Twilio/SMS callbacks | Tenant-scoped credential and guardian attribution | Focused inbound/status tests pass | Forged production inbound/status callbacks returned 403 | Not applicable | No real SMS sends |
| AI summaries and suggestions | Tenant/center scope enforced | Focused regressions pass | Safe authenticated release-candidate verification required | Not applicable | Provider availability is operational, not a store gate |
| Account deletion | Parent request plus platform-owner review/execution workflow; provider-first and recoverable | Focused policy/concurrency/recovery tests pass | Unauthenticated review boundary returned 401; no account changed | Simulator/device request-path test required | Authenticated fake-account rehearsal; never execute against a real account during QA |
| ProCare import/cutover | Existing guarded tooling retained | Existing full suite covers import paths | No cutover performed | Not applicable | Cutover, backfill, and archival remain separate business gates |
| Observability, health, recovery | Health, deployment checks, audit history and runbooks present | Ops readiness checks | `d64ec9d0` / `dpl_94WpkkBwkoE7x9KSBp5ZA7ePdLcN` Ready on all aliases; database health connected; post-release runtime-error and 5xx queries empty | Not applicable | Production backup/restore drills are operational evidence, not an App Review requirement |

## Native target truth

| Check | Parent | Teacher |
| --- | --- | --- |
| Intended v1 app | Yes | Yes |
| Bundle ID | `com.brunerdigital.thebeesuite.parent` | `com.brunerdigital.thebeesuite.teacher` |
| Launch path | `/parents` | `/teachers` |
| Native source | `ios/` | `ios-teacher/` |
| Capacitor packages | 8.4.1 family | 8.4.1 family |
| Role-distinct release assets | Ready; deterministic 1024 x 1024 no-alpha icon and splash | Ready; deterministic 1024 x 1024 no-alpha icon and splash |
| Shared Release scheme | Ready | Ready |
| Debug server / cleartext exception | No development URL and no cleartext allowance; production HTTPS remote shell is intentional | Same |
| Privacy manifest | Present; final SDK/archive scan still required | Present; unused finance declaration removed; final SDK/archive scan still required |
| Unused v1 capabilities | Push, Face ID, Universal Links, and iPad support are not declared/enabled | Same |
| Windows static/store check | Ready | Ready |
| Capacitor sync | Ready on Windows | Ready on Windows |
| Simulator / physical device | Not performed; macOS/Xcode required | Not performed; macOS/Xcode required |
| Release archive / signing | Not performed; Apple Team/signing on macOS required | Not performed; Apple Team/signing on macOS required |
| TestFlight build | Not uploaded; separate publishing authorization required | Not uploaded; separate publishing authorization required |
| Metadata packet | Draft updated to current implementation | Draft updated to current implementation |
| Screenshot plan | Five exact-size synthetic drafts; native replacements required | Three exact-size synthetic drafts; native replacements required |
| Fake review account | Ready: dedicated identity, sole demo-center grant, Murphy fake-family link, Auth metadata, production login, portal load, and logout verified | Ready: dedicated identity, sole demo-center grant, App Review Staff marker, Toddler Hive assignment, Auth metadata, production login, portal load, and logout verified |

Director, executive, billing, and support experiences remain responsive web targets for v1. No separate thin-wrapper iOS submissions are planned because current product value does not justify additional store listings.

## App Review account truth

- Parent: `app-review-parent@thebeesuite.io` was re-preflighted against the complete Murphy Family graph and provisioned after exact authorization. It has the required App Review application/Auth/Guardian markers, exactly one active Parent center grant, no kiosk PIN, no active push subscription, and only the isolated demo tenant/school/family scope. Canonical production login, `/parent-portal` rendering, and logout passed.
- Teacher: `app-review-teacher@thebeesuite.io` was freshly preflighted against Mia Patel and Toddler Hive and provisioned after exact authorization. It has the required App Review application/Auth/Staff markers, exactly one active Teacher center grant, no kiosk/time-clock state, no active push subscription, and only the isolated demo tenant/school/classroom scope. Canonical production login, `/teacher-portal` rendering, and logout passed.
- Temporary credentials remain only in the ignored local `.env.local`; they are not in Git or this packet. Copy them into App Store Connect through the authenticated Apple workflow, then rotate or disable both identities after review.

## Production database repair applied and verified

The child-scope repair was applied through the authorized Supabase migration writer on September 9, 2026 as production version `20260909180912_agency_child_scope_guard_repair`. It fixes the alias used by `protect_agency_child_parent_scope()` and skips the guard when neither relationship field changes; it contains no data backfill. Post-apply catalog verification confirmed one trigger, four canonical `center_id` aliases, security-invoker execution, an empty locked search path, and no execute grant for `PUBLIC`, `anon`, or `authenticated`. The deployable Supabase file is byte-identical to the Prisma mirror and remains covered by focused regression tests.

## Supabase migration-history reconciliation

The September 8 closeout identified the already-applied agency receivable and reconciliation migrations and renamed their deployable Supabase mirrors to the production-recorded versions (`20260908161144` and `20260908161154`). After exact authorization on September 9, the unchanged child-scope repair bytes were applied as Supabase version `20260909180912` and promoted from the held directory to the deployable ledger path. Prisma history and SQL bytes remain unchanged; the Supabase and Prisma version prefixes intentionally differ while their repair contents match exactly.

## Evidence rules for closeout

- Record the source branch commit, protected PR/merge result, Vercel deployment ID, canonical aliases, health response, log window, and changed-flow checks in the release evidence.
- Final App Store screenshots must come from the signed Release/TestFlight build with fake data. The browser-generated drafts and responsive checks are planning evidence only.
- Do not call either app archived, TestFlight-verified, submitted, or App-Store-ready until the matching Apple evidence exists.
- Never commit reviewer passwords, signing material, provider secrets, child data, or production screenshots containing real people or financial information.
