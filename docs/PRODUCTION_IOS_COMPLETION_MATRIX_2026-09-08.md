# Production and iOS completion matrix

Status date: September 8, 2026 (America/New_York)

This is the current release-candidate truth record. `Verified in production` means the named behavior was exercised against the canonical deployment; a public HTTP 200 is not treated as authenticated workflow evidence. `iOS verified` means execution in Xcode Simulator or on a physical device, not a browser-sized preview.

## Product release candidate

| Area | Built/configured | Locally tested | Verified in production | iOS verified | External gate or remaining evidence |
| --- | --- | --- | --- | --- | --- |
| Public site, inquiry, legal, privacy, support | Yes | Responsive/smoke checks | Current public routes healthy; release-candidate recheck required after deployment | Not applicable | None after deployment verification |
| Authentication, invitations, recovery, session boundaries | Yes | Automated authorization and route coverage | Safe authenticated release-candidate verification required | Simulator/device required for continuity and password-manager behavior | Do not mutate real identities or send invitations |
| Parent portal, profiles, reports, media, documents, incidents | Yes | Automated tests plus synthetic responsive UI | Safe authenticated release-candidate verification required | Simulator/device required | Final fake reviewer account validation on production |
| Teacher classroom, roster, attendance, activities, media, notes | Yes | Automated tests plus synthetic responsive UI | Safe authenticated release-candidate verification required | Simulator/device required | Final fake reviewer account validation on production |
| Messaging and announcements | Tenant/current-family scoped; unsafe content screening and report workflow added | Focused regression tests pass | Safe authenticated release-candidate verification required | Simulator/device required | No real bulk sends during verification |
| Billing, Checkout, connected-account boundaries, webhooks | Retry/idempotency and global telemetry controls hardened | Focused Stripe regressions pass | Read-only provider and production-log verification required | External Checkout return requires device test | No charges, refunds, payouts, or account changes |
| Operations, reporting, FTE, executive and multi-location scope | Yes; platform telemetry isolated | Focused authorization tests pass | Release-candidate verification required | Not a v1 native target | One production function repair requires separately authorized migration |
| Asset Hub and file storage | Private storage, content binding, size/type/quota checks | Focused upload regressions pass | Safe upload verification with synthetic fixture required | Picker/upload interruption requires device test | Supabase policies/config remain read-only unless separately approved |
| Twilio/SMS callbacks | Tenant-scoped credential and guardian attribution | Focused inbound/status tests pass | Read-only log/config verification required | Not applicable | No real SMS sends |
| AI summaries and suggestions | Tenant/center scope enforced | Focused regressions pass | Safe authenticated release-candidate verification required | Not applicable | Provider availability is operational, not a store gate |
| Account deletion | Parent request plus platform-owner review/execution workflow; provider-first and recoverable | Focused policy/concurrency/recovery tests pass | Safe non-destructive UI verification required | Simulator/device request-path test required | Never execute against a real account during QA |
| ProCare import/cutover | Existing guarded tooling retained | Existing full suite covers import paths | No cutover performed | Not applicable | Cutover, backfill, and archival remain separate business gates |
| Observability, health, recovery | Health, deployment checks, audit history and runbooks present | Ops readiness checks | Deployment Ready, aliases, health, logs required after merge | Not applicable | Production backup/restore drills are operational evidence, not an App Review requirement |

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
| Fake review account | Preparation command exists; final production validation required | Preparation command exists; final production validation required |

Director, executive, billing, and support experiences remain responsive web targets for v1. No separate thin-wrapper iOS submissions are planned because current product value does not justify additional store listings.

## Production database repair held behind authorization

Migration `20260908200500_agency_child_scope_guard_repair` fixes the alias used by `protect_agency_child_parent_scope()` and skips the guard when neither relationship field changes. It contains no data backfill. The SQL is mirrored in Prisma and Supabase migration directories and has a focused regression test. Applying it to production is intentionally excluded until exact confirmation because production migrations are an independent gate.

## Evidence rules for closeout

- Record the source branch commit, protected PR/merge result, Vercel deployment ID, canonical aliases, health response, log window, and changed-flow checks in the release evidence.
- Final App Store screenshots must come from the signed Release/TestFlight build with fake data. The browser-generated drafts and responsive checks are planning evidence only.
- Do not call either app archived, TestFlight-verified, submitted, or App-Store-ready until the matching Apple evidence exists.
- Never commit reviewer passwords, signing material, provider secrets, child data, or production screenshots containing real people or financial information.
