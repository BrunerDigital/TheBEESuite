# Production and iOS completion matrix

Status date: September 8, 2026 (America/New_York)

This is the current release-candidate truth record. `Verified in production` means the named behavior was exercised against the canonical deployment; a public HTTP 200 is not treated as authenticated workflow evidence. `iOS verified` means execution in Xcode Simulator or on a physical device, not a browser-sized preview.

## Verified release evidence

- Protected product PR: [#325](https://github.com/BrunerDigital/TheBEESuite/pull/325), merged September 8, 2026 at `7bed3daeb796a5daa38f7e50882b95f031446adf`.
- Protected post-release verification PR: [#326](https://github.com/BrunerDigital/TheBEESuite/pull/326), merged September 8, 2026 at `2933808eb58bc7e8846b3bfd5f58a3f29c15b11b`. It pins patched development-only `js-yaml` 4.3.2 and makes redirect-aware, multi-viewport production smoke verification deterministic.
- Protected prospective-family billing PR: [#328](https://github.com/BrunerDigital/TheBEESuite/pull/328), merged September 8, 2026 at `c982a9a1946c057b6de7abdf3fbe866a4066313d`. It adds expected-child/due-date handling and permits guarded one-time prospective-family charges without widening recurring tuition or receivable scope.
- Current exact product deployment: `dpl_9grc6vWVVKnwZqDpcixNvGmkMmD8`, Ready and promoted, built from `c982a9a1946c057b6de7abdf3fbe866a4066313d`.
- Canonical aliases: `https://thebeesuite.io`, `https://www.thebeesuite.io`, and `https://the-bee-suite-beta.vercel.app` resolve to the promoted deployment; `www` redirects to the canonical apex.
- Protected GitHub CI passed lint, typecheck, all 1,817 tests with no failures or skips, Next.js 16.3.4 compilation, and generation of all 166 static pages. The promoted Vercel build independently passed lint and typecheck, reported 1,812 passed and five intentionally skipped native-source checks because `.vercelignore` excludes `ios/`, then compiled with Next.js 16.3.4 and generated all 166 static pages.
- `GET https://thebeesuite.io/api/health` returned HTTP 200 with `ok: true` and `database: connected` after the deployment.
- Public production routes `/`, `/parents`, `/teachers`, `/privacy`, `/terms`, `/eula`, `/support`, `/resources`, and `/registration` returned HTTP 200.
- Production Playwright smoke passed the public/protected route checks, inquiry embed/API and CORS checks, and Parent/Teacher/Privacy/Support rendering without horizontal overflow at 390 x 844, 768 x 1024, and 1440 x 900.
- Unauthenticated changed-route probes failed closed: message reporting, Asset Hub signed-upload/finalize, AI command, and privacy review returned 401; forged Twilio inbound/status callbacks returned 403. No live mutation or message was performed.
- Vercel error-level and HTTP 500 runtime-log queries returned no entries in the post-deployment window. The full Vercel build log ends `Deployment completed` and `Ready`.
- The exact released dependency graph reports zero known npm vulnerabilities.
- No approved synthetic production password or saved authenticated BEE Suite browser session was available. Accordingly, authenticated production workflows are not claimed as verified; automated authorization/isolation coverage and fail-closed production boundary probes are the available evidence.
- A read-only production query on September 8 confirmed that the Parent review identity has one active application user, one active Parent grant, one confirmed Auth identity, and one fake-review Guardian marker. It did not validate the password or inspect reviewer-visible data. The Teacher review identity is absent and must not be created without the separate identity/access authorization.

## Product release candidate

| Area | Built/configured | Locally tested | Verified in production | iOS verified | External gate or remaining evidence |
| --- | --- | --- | --- | --- | --- |
| Public site, inquiry, legal, privacy, support | Yes | Responsive/smoke checks | Verified on canonical production across public routes, CORS checks, and three viewport classes | Not applicable | None |
| Authentication, invitations, recovery, session boundaries | Yes | Automated authorization and route coverage | Protected routes fail closed; authenticated UI not exercised because no approved synthetic session was available | Simulator/device required for continuity and password-manager behavior | Do not mutate real identities or send invitations |
| Parent portal, profiles, reports, media, documents, incidents | Yes | Automated tests plus synthetic responsive UI | Public entry verified; active fake-review identity/grant confirmed read-only, but authenticated workflow not exercised | Simulator/device required | Retrieve or rotate the review password outside Git, then validate the fake-data boundary |
| Teacher classroom, roster, attendance, activities, media, notes | Yes | Automated tests plus synthetic responsive UI | Public entry verified; authenticated workflow not exercised; no production review identity currently exists | Simulator/device required | Exact authorization to create the prepared fake reviewer identity, then validate its fake-data boundary |
| Messaging and announcements | Tenant/current-family scoped; unsafe content screening and report workflow added | Focused regression tests pass | Unauthenticated report boundary returned 401; no real send performed | Simulator/device required | Authenticated fake-data verification; no real bulk sends |
| Billing, Checkout, connected-account boundaries, webhooks | Retry/idempotency and global telemetry controls hardened | Focused Stripe regressions pass | Read-only provider and production-log verification required | External Checkout return requires device test | No charges, refunds, payouts, or account changes |
| Operations, reporting, FTE, executive and multi-location scope | Yes; platform telemetry isolated | Focused authorization tests pass | Release-candidate verification required | Not a v1 native target | One production function repair requires separately authorized migration |
| Asset Hub and file storage | Private storage, content binding, size/type/quota checks | Focused upload regressions pass | Unauthenticated signed-upload/finalize boundaries returned 401; no live object created | Picker/upload interruption requires device test | Authenticated synthetic upload; Supabase policy/config changes remain separately gated |
| Twilio/SMS callbacks | Tenant-scoped credential and guardian attribution | Focused inbound/status tests pass | Forged production inbound/status callbacks returned 403 | Not applicable | No real SMS sends |
| AI summaries and suggestions | Tenant/center scope enforced | Focused regressions pass | Safe authenticated release-candidate verification required | Not applicable | Provider availability is operational, not a store gate |
| Account deletion | Parent request plus platform-owner review/execution workflow; provider-first and recoverable | Focused policy/concurrency/recovery tests pass | Unauthenticated review boundary returned 401; no account changed | Simulator/device request-path test required | Authenticated fake-account rehearsal; never execute against a real account during QA |
| ProCare import/cutover | Existing guarded tooling retained | Existing full suite covers import paths | No cutover performed | Not applicable | Cutover, backfill, and archival remain separate business gates |
| Observability, health, recovery | Health, deployment checks, audit history and runbooks present | Ops readiness checks | Exact commit/deployment Ready, aliases and database health verified; post-release error/500 log queries empty | Not applicable | Production backup/restore drills are operational evidence, not an App Review requirement |

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
| Fake review account | Active app/Auth identity and grant confirmed read-only; password and fake-data UI validation still required | Absent in production; idempotent preparation command exists and requires exact identity/access authorization |

Director, executive, billing, and support experiences remain responsive web targets for v1. No separate thin-wrapper iOS submissions are planned because current product value does not justify additional store listings.

## App Review account truth

- Parent: the production identity exists and is active with the expected Parent role/grant and fake-review Guardian marker. Password validity, login, and displayed fake-data isolation remain unverified. The hardened script lists and accepts targets only in the isolated demo tenant and designated synthetic school, rejects empty or non-demo child scope, and requires a read-only `--preflight`, exact tenant/center/family IDs and family external ID, an email-bound fresh target fingerprint, and the explicit confirmation flag before it may upsert the application/Auth identity and Guardian, reassign the Guardian to the selected fake demo family, create or reactivate the school access grant, and rotate the password. Running it requires exact authorization for the email and all four production changes, not password-only approval.
- Teacher: no matching application user, active grant, Auth user, or fake-review Staff marker exists in production. The hardened script lists and accepts targets only in the isolated demo tenant and designated synthetic school, proves the classroom is same-school demo data, and requires a read-only `--preflight`, exact tenant/center/classroom/source-Staff IDs, an email-bound fresh target fingerprint, and the explicit confirmation flag before it may create the Auth identity/password, Prisma application user with the Teacher role, classroom-bound Staff profile, and school access grant. Running it requires exact authorization covering the email and every one of those production changes, with the password supplied outside Git/chat.
- After either authorized preparation action, verify the exact role, tenant, school, family/classroom scope, and absence of real child, family, staff, or financial data before entering credentials in App Store Connect.

## Production database repair held behind authorization

Migration `20260908200500_agency_child_scope_guard_repair` fixes the alias used by `protect_agency_child_parent_scope()` and skips the guard when neither relationship field changes. It contains no data backfill. The SQL is mirrored in Prisma and Supabase migration directories and has a focused regression test. Applying it to production is intentionally excluded until exact confirmation because production migrations are an independent gate.

## Evidence rules for closeout

- Record the source branch commit, protected PR/merge result, Vercel deployment ID, canonical aliases, health response, log window, and changed-flow checks in the release evidence.
- Final App Store screenshots must come from the signed Release/TestFlight build with fake data. The browser-generated drafts and responsive checks are planning evidence only.
- Do not call either app archived, TestFlight-verified, submitted, or App-Store-ready until the matching Apple evidence exists.
- Never commit reviewer passwords, signing material, provider secrets, child data, or production screenshots containing real people or financial information.
