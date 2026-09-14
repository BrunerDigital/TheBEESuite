# Controlled iOS launch - 2026-09-14

Decision: **NO-GO for public iOS launch** until the evidence gates below close. Publishing an honest onboarding website is independent of releasing binaries, enabling payments, or authorizing a school pilot.

## App status

| App | Role | Version/build | App Store status | Public URL | Devices | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| BEE Suite Parent Portal | Parent/guardian | Source 1.0 (1); approved build unknown | Unverified; Connect requires login | None verified | Source: iPhone, iOS 16+; approved binary unknown | US public lookup returned zero results |
| BEE Suite Teacher Portal | Teacher | Source 1.0 (1); approved build unknown | Unverified; Connect requires login | None verified | Source: iPhone, iOS 16+; approved binary unknown | US public lookup returned zero results |
| BEE Suite Director | Director | No approved native build identified | Unverified | None verified | Web fallback | Repository portal definition only |
| BEE Suite Executive | Executive/corporate | No approved native build identified | Unverified | None verified | Web fallback | Repository portal definition only |
| Kiosk | Authorized lobby device | Web workflow | No separate store app identified | Not applicable | School-managed browser | Do not imply a native kiosk release |

Parent bundle: `com.brunerdigital.thebeesuite.parent`. Teacher bundle: `com.brunerdigital.thebeesuite.teacher`. Director/executive definitions use the same prefix with `.director` / `.executive`. App Store numeric IDs, approved archive commits, approval states, privacy labels, screenshots, description, support metadata, and supported public devices remain unknown. Source metadata is not approved-binary evidence.

Read-only public checks: `https://itunes.apple.com/lookup?bundleId=com.brunerdigital.thebeesuite.parent&country=us` and the corresponding teacher query both returned `resultCount: 0` on September 14. This does not establish availability in every region or prove Apple rejection. App Store Connect redirected to its login page. A bounded September Apple-email search found no matching approval evidence. No release action was taken.

## Production baseline and compatibility

Launch-critical live QA: all four existing synthetic accounts passed active/role/isolated-tenant/marker preflight, but production login returned 401 for executive, director, teacher, and parent. The refreshed Vercel production environment does not contain the synthetic QA password key. No credential was changed and no replacement user was created. Authentication, session persistence/logout, school isolation, child/classroom associations, authenticated mobile layouts, and payment-interface checks remain blocked pending working designated credentials. Password-reset delivery and physical kiosk attendance were not exercised. Public `/app`, `/check-in`, `/privacy`, `/terms`, `/support`, and `/api/health` returned 200; health reported database connected. The internal tracker contains 97 active directory entries, including any demo entries; zero pilot approvals are inferred.

Production branch `main`; canonical deployment at preflight: `22105d8af8a0798458549a011dd1e2308208e51d`, deployment `dpl_fkUx5uyDfV5WmuxjvAUxVYaUEEgd`, Vercel Ready. Aliases include `thebeesuite.io`, `www.thebeesuite.io`, and `the-bee-suite-git-main-brunerdigital.vercel.app`.

The source Capacitor wrappers load `https://thebeesuite.io`, with `/parents` and `/teachers` start paths. This confirms the configured backend destination, not compatibility of the Apple-approved binaries. Match each approved archive to a Git SHA and smoke-test that exact build against production before GO.

PR #310 is already MERGED as `087236b7c5a9eddc18f846399e4f944e79f1ce2f`; its description retains a migration hold. Read comments include a migration rehearsal and separately required backup/authorization gate; this task did not establish closure of that gate. No migration, schema change, or PR #310 action is part of this release.

## Go/no-go evidence checklist

| Gate | Required evidence | Classification if missing |
| --- | --- | --- |
| Public links | Apple URLs load logged out; names, icon, screenshots, description, privacy/support links, version and devices checked | Blocker |
| Build identity | Apple approval/state, version/build, archive Git SHA, signing identity, release region | Blocker |
| Backend compatibility | Exact approved binary on physical supported iPhone against recorded production SHA | Blocker |
| Authentication | Existing synthetic login, recovery, persistence, logout, correct role portal | Critical |
| Permissions | Authorized-school allow and cross-school denial; correct parent-child and teacher-classroom relationships | Critical |
| Core workflows | Demo attendance/kiosk, updates, messages, navigation/profile, mobile layouts and web fallback | Critical |
| Financial safety | Balance presentation, one-time/custom UI without charge, explicit autopay consent, no implicit enrollment | Critical |
| Legal/help | Public privacy, terms, support and deletion instructions work | Critical |
| Monitoring | Health/database, scoped Vercel errors, auth failures, payment/webhook issues; named responder and native crash coverage | Critical |
| Support | Intake review/copy/email works; mailbox receipt and responder acknowledgment evidenced | Critical |
| Materials | Download page, role guides/PDFs, FAQ, drafts and scripts verified | Major |
| Controlled pilot | One specific school approved with test accounts, staff owner, support owner, readiness evidence and pause plan | Blocker |

GO requires every gate above, no Blocker/Critical defect, and at least one approved controlled pilot. CONDITIONAL GO cannot be used to waive a missing public-link, isolation, financial-safety, or build-identity gate. Unknown is not passed.

Severity: **Blocker** prevents release or evidence needed to authorize it. **Critical** risks data/access/payment integrity or blocks a core workflow without a safe workaround. **Major** materially impairs a workflow with a safe workaround. **Minor** is limited inconvenience. **Documentation** is an instruction/label gap without incorrect product behavior.

## Support triage and monitoring

Existing intake destination: `support@thebeesuite.io`. `/mobile-apps#support` prepares a report locally for user review; it does not persist a ticket or automatically upload screenshots. Users attach redacted screenshots in their email client or request a secure upload path. No support test email was sent by this task. Mailbox routing/receipt and a named responder must be confirmed before pilot GO.

1. Record receipt time, school, role, app/device version, occurrence time/time zone, web fallback result, impact, and a redacted reproduction.
2. Assign severity, one owner, next action and next update time. Never request a password, PIN, full bank/card information, or unnecessary child data.
3. For unexpected access, wrong child association, unsafe payment behavior, or a blocked school, pause expansion and escalate to Brenden. Preserve logs; do not alter financial/attendance history to hide symptoms.
4. Reproduce with existing synthetic demo data; verify exact tenant/school scope and the approved build. Check `/api/health`, Vercel deployment/error logs, Supabase observability, and relevant integration delivery records without sending retries.
5. Link the fix and regression evidence; validate with the reporter, record resolution, and obtain owner approval before resuming rollout.

Preflight Vercel production error/fatal query for the preceding 30 minutes returned no matching logs. This is a sample, not proof of complete monitoring coverage. Native crash monitoring and acknowledgment ownership remain to be confirmed in App Store Connect.

## School readiness tracker

Run `node --import tsx scripts/qa-mobile-launch.ts --directory-only` with the existing database environment to create a fresh read-only directory snapshot at `outputs/ios-launch/school-readiness-<UTC timestamp>-<unique run ID>.csv`. The command prints the exact path. Omit `--directory-only` to additionally run designated synthetic HTTP smoke checks. This file is internal and intentionally excluded from Git/public deployment. School IDs/names come from the Prisma Center source of truth; director/owner/contact/approver fields are deliberately blank until verified. `Not Started` means this launch review has not begun, not a claim about the school's historic operations. Never overwrite a manually maintained tracker: keep each dated export as a directory snapshot and merge new IDs into the owned working copy.

Allowed status progression: **Not Started → Director Review → Staff Testing → Parent Pilot → Ready for Full Launch → Fully Launched**. Use **Data Correction Needed** for unresolved record discrepancies and **Paused** for withdrawn approval or safety issues. Record evidence before advancing; never infer approval from successful code tests.

Fields: School ID, School, Status, Director, Correct access confirmed, Classrooms confirmed, Staff confirmed, Families/children confirmed, Tuition and balances confirmed, Billing readiness, Staff onboarding, Parent pilot, Open issues, Owner, Next action, Target date, Final approval, Launch date.

## Maintain the package

Canonical content: `src/lib/mobile-launch.ts`. Set a public URL and verification timestamp only after opening the actual Apple listing. QR codes are generated from that same verified URL. Regenerate PDFs and scripts with `node --import tsx scripts/export-mobile-guides.ts`; do not hand-edit derived PDFs or walkthrough prose. Web content is `/mobile-apps`; `/app` links to it. [Gmail drafts](gmail-drafts.md) have no recipients and remain unsent. [Walkthrough scripts](walkthroughs.md) require only demo data and no finished video production.

## Pause and rollback

Pause: stop new pilot invitations and announcements; record school status Paused in the internal tracker with owner/reason. Keep existing approved web access available. Do not delete accounts, attendance, invoices, payments, audit entries, or provider records.

Website rollback: revert the focused launch commit through a new protected PR, pass the production gate, and verify the reverted SHA is Ready on canonical aliases, health and logs are clean, and `/app` still works. If urgent, the authorized release owner can use the established Vercel rollback workflow to the preflight deployment above and then reconcile Git through a protected revert PR. No database rollback or migrations are required by this package.

Native rollback: an already-installed binary cannot be replaced by this website change. Keep web fallback available; use Apple-authorized availability/version controls only after the owner verifies the affected build and approves the store action.
