# Mac, production stack and iOS candidate reconciliation — September 28, 2026

This checkpoint records completed checks and work still required. It does not certify Apple approval, physical-device acceptance or school rollout readiness. No live payment, outgoing school communication, production migration or access mutation was performed during this reconciliation.

## Source and production

| Component | Verified checkpoint |
| --- | --- |
| GitHub | `BrunerDigital/TheBEESuite`, main `622aa8491a3ac03ef2a3db7bfae96527ad5cbd0b`; latest CI and Push on main succeeded |
| Mac release checkout | `/Users/brunerdigital/Developer/TheBEESuite-ios-review-20260928`, branch `work/ios-review-response-20260928`, fast-forwarded to that commit before validation |
| Vercel | `dpl_B1CCo9KBu3BoN2hn8BkvHqRmLBXt`, Ready, production, same Git commit |
| Canonical aliases | `thebeesuite.io`, `www.thebeesuite.io`, and the existing production Vercel aliases point to that deployment |
| Supabase | `nqjrlktoewiueiwrubas`, TheBEESuite, ACTIVE_HEALTHY, us-west-1 |

The dirty older Mac checkout and earlier release checkouts were preserved. Windows PC local files are not accessible from this host. GitHub alignment proves only pushed work; confirmation of any unpushed Windows work remains pending.

The Vercel project uses Node 24, Next.js, `npm ci`, `npm run vercel-build`, repository root and sfo1. Production health returned HTTP 200 with database connected at `2026-09-29T01:49:07.484Z`. Public role sign-in, support, privacy, terms and mobile-app pages returned HTTP 200. The inspected one-hour runtime log window had no errors for role sign-in, authentication or deletion-request paths. This is a bounded observation, not a guarantee of future availability.

## Mac configuration and checks

- Node 24.21.0, npm 11.19.0, Xcode 27.0 (27A266a), iOS SDK 27.0, GitHub CLI 2.96.0, Vercel CLI 56.3.1 and Supabase CLI 2.109.1 are installed. GitHub and Vercel CLI account access works.
- The checkout is linked to the existing Vercel project. The repository Supabase MCP configuration targets the correct project in read-only mode.
- Locked dependency installation, the repository postinstall patch and both Capacitor role syncs completed. The untracked generated SwiftPM lock files are not part of the audited source change.
- Both Parent and Teacher current Release builds succeeded for the generic iOS Simulator target with signing disabled. Compiled identities are 1.0 (4), SDK 27.0, minimum iOS 16 and iPhone-only. This compile check does not validate runtime behavior or the installed TestFlight candidates.
- `npm run vercel-build` passed lint, typecheck, all 2,544 tests, and the production build. The first attempt exposed a missed `web-push` postinstall patch; running the existing postinstall repaired local dependencies before the successful gate.
- `npm audit --omit=dev` returned zero vulnerabilities. Operations cron/migration consistency and both mobile store configuration checks passed.
- The ignored mode-0600 `.env.local` contains existing working review passwords and public application/Supabase configuration. No secret values are included in this report.

Vercel's production environment pull returned redacted placeholders for sensitive values. Older local database credentials failed authentication. They and unverified old provider/admin secrets were excluded from the new workspace environment; original credential files were left untouched. Native compilation does not need production database/admin secrets. Local database-backed development still needs current credentials delivered securely through the existing trusted account/secret workflow. Do not substitute redacted values, rotate shared credentials merely to obtain access, or treat the older environment as current.

## Supabase consistency and security

- All 49 local Supabase migration files match deployed SQL after normalizing comments, whitespace and terminal semicolons. The Prisma ledger has 31 completed records and no unfinished migration; the remaining source changes are accounted for in the Supabase migration ledger. Historical ledger/checksum differences were inspected rather than repaired by blindly replaying migrations.
- Compared all 102 Prisma models and 1,162 scalar fields with production: zero missing mapped columns and zero type/nullability differences.
- All 103 public application tables have RLS enabled. No direct anon/authenticated application-table grants, unsafe public security-definer functions or unsafe public views were found.
- `child-media` and `corporate-assets` buckets are private. The child-media bucket accepts image types with an 8 MB limit.
- Security advisors returned no warning/error findings. Thirteen informational RLS-without-policy entries concern server-only agency/subsidy tables; broad browser grants were not added to silence those notices.
- Both reserved reviewer Auth identities are confirmed and unbanned, with active matching application roles.

Postgres is 17.6. The current Supabase changelog documents newer managed maintenance versions. No affected GiST index was present for the reviewed maintenance advisory, and no engine/extension update or reindex was performed. Managed database maintenance is separate from this iOS candidate reconciliation.

## Candidate parity and Apple requirements

| App | Candidate | App ID | Build UUID |
| --- | --- | --- | --- |
| Parent | 1.0 (4) | 6811279592 | 58b4f3bf-3160-43ec-8d6b-421ae7791aad |
| Teacher | 1.0 (4) | 6811280080 | c501aea4-4e13-421b-ada7-3696efe88de2 |

Both candidates finished Apple processing, are assigned to the existing internal QA groups, and are saved as the selected version-1.0 builds. Both signed archives passed `codesign --verify --deep --strict`. Their native runtime/dependency source matches current main: comparing archive checkpoint `b16cb892ee04fe08718c9d51ced13086ddf3eb50` with current main finds only build-number changes in the native projects and no runtime/native dependency changes. The apps load the canonical HTTPS production service, so current server/web changes are served by the uploaded shell.

Compiled candidates use SDK 27.0, minimum iOS 16, iPhone-only targeting, correct role/bundle IDs, accurate camera/photo purpose text, bundled offline resources, no cleartext server and disabled WebView debugging. The app privacy manifests contain 17 Parent and 14 Teacher data categories with tracking disabled. Published privacy category counts match; final workflow/vendor reconciliation remains required.

The toolchain exceeds Apple's current Xcode/iOS SDK upload minimum. Store age ratings are populated at 4+ with regional exceptions, and the apps are not in the Kids category. These configuration checks do not resolve Apple's discretionary minimum-functionality review or replace evidence of actual behavior.

Existing review accounts pass production login, role/scope, portal-read and logout/replay checks. No real family/school data was used. Full native interactions remain unverified. The isolated iOS-27 simulator automation timed out; the stalled task-owned calls were stopped, generic-target compilation passed, and only the task-created simulator was shut down/deleted afterward. No simulator UI pass or physical recording is claimed.

## Remaining release gates

1. Connect and unlock the paired physical iPhone; install both selected TestFlight build-4 candidates and verify the actual latest public OS. The September 28 device inventory still reports the physical device unavailable.
2. Complete role workflows, permissions/denial, offline/reconnect, keyboard/safe areas, background/resume and logout checks on those exact candidates. Produce the two launch-to-workflow recordings specifically requested in Apple's September 24 rejection.
3. Verify or replace the three existing screenshots per app against current candidate behavior. Existing filenames identify build-2 assets; current screenshot accuracy has not been certified.
4. Demonstrate moderation/reporting and abusive-access removal. Reports notify authorized school leaders and preserve an audit trail; users have no self-service block button. Apple's guideline 1.2 requires blocking abusive users, so the school-admin mechanism and response process must be demonstrated/assessed before marking this gate complete. Do not claim a block control that does not exist.
5. Finish privacy/vendor/content-rights and deletion/retention workflow verification, update the pending-evidence notes with completed recordings and exact answers, and submit the complete response/resubmissions.
6. Verify Apple's receipt and status. After actual approval, verify the public download URLs before publishing them.

Production provider keys are configured, but this audit did not execute SendGrid/Twilio deliveries, a Stripe transaction, live finance onboarding or school activation. School-specific migration/finance/communications gates remain in the repository's remaining-work queue. App Store readiness and operational rollout readiness must be reported separately.

## Resume from this Mac

Use this checkout for further source work, not the older iCloud/Documents checkouts:

```sh
cd /Users/brunerdigital/Developer/TheBEESuite-ios-review-20260928
npm run ios:parent:open
npm run ios:teacher:open
```

The selected distribution archives remain in `~/Library/Developer/Xcode/Archives/2026-09-16/`, named `BEE-Suite-Parent-1.0-4-current.xcarchive` and `BEE-Suite-Teacher-1.0-4-current.xcarchive`. Do not upload another build solely because the repository has advanced; compare native source/dependencies first and bump the build only for a replacement candidate.

Local detailed evidence is retained under `output/audit/mac-stack-reconciliation-20260928/`. It contains sanitized migration/schema comparisons and validation logs, not review passwords or provider secrets.

## References

- [Current GitHub CI](https://github.com/BrunerDigital/TheBEESuite/actions/runs/36472125815)
- [Review recovery and recording protocol](IOS_APP_REVIEW_RECOVERY_2026-09-28.md)
- [Build-4 archive evidence](IOS_CURRENT_MAIN_RELEASE_EVIDENCE_2026-09-16.md)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Supabase changelog](https://supabase.com/changelog)
