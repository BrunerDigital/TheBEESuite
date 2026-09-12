# School UI and workflow readiness — September 12, 2026

## Current baseline (before edits)

This is an active completion record, not a claim that all schools are activated or every feature is verified.

- Clean isolated branch: `work/school-ui-flow-completion-20260912`, starting at `2cadf48c47da929bdbf596b4a9580caed5803a6c` (`origin/main`).
- Baseline production: Vercel Ready deployment `dpl_HSEAvXPmvDb9NsfB3zxj9TXhZwuy` on that commit.
- Existing dirty primary checkout, active existing-location setup work, other worktrees, and draft PR #311 are preserved.
- Dependency installation: locked `npm ci` passed; zero reported vulnerabilities. Prisma client generation passed.
- Parent/Teacher native startup and public simulator verification from PR #349 remain historical verified evidence; this web-flow work does not constitute new signing, device, authenticated native, or store evidence.
- Three independent read-only audits are rechecking current code; only the primary integrator edits or releases.

## Completion matrix

`Pending` means not yet verified in this run. Code review alone is not browser or production evidence.

| Area / role flow | Built | Correct configuration / scope | Local tests / browser | Production | iOS device | External gate |
| --- | --- | --- | --- | --- | --- | --- |
| Parent/guardian home and compact primary navigation | Yes | Recheck | Pending | Pending | Pending | Signed device |
| Teacher roster and daily task navigation | Yes | Recheck | Pending | Pending | Pending | Signed device |
| Director / assistant / executive next-action links | Yes; query defect found | Recheck selected context | Pending | Pending | N/A | None for code |
| FTE school/week deep links and historical review | Yes; explorer/editor mismatch found | Fail-closed target fix needed | Pending | Pending | N/A | No report mutations authorized |
| Auditor read-only reporting controls | Yes; editable UI found | API denial exists; UI must match | Pending | Pending | N/A | None for code |
| Parent incident acknowledgment feedback | Yes; stale UI found | Preserve family boundary | Pending | Pending | Pending | No real acknowledgments |
| Parent reply drafts and earlier announcements | Yes; draft/visibility defects found | Preserve recipients and data | Pending | Pending | Pending | No real messages |
| Teacher profile/photo network recovery | Yes; rejection gaps found | Retain drafts; uncertain upload must not imply failure | Pending | Pending | Pending | No identity or real media changes |
| Older parent reports/documents/messages/media | Yes; silent caps found | Bounded family-scoped continuation needed | Pending | Pending | Pending | None for read-only code |
| Shared search and navigation state | Yes | Recheck stale responses and scope | Pending | Pending | N/A | None for code |
| Billing and administrative recovery/draft safety | Yes | Separate financial outcome from transport failure | Pending | Pending | N/A | No charges/refunds/provider changes |
| Authorized pickup and restricted/expired access | Yes | Fail closed | Pending | Pending | Pending | No access changes |
| School onboarding / data setup | Separate PR #351 plus active follow-up | Preserve concurrent work | Not changed here | Baseline Ready | N/A | School rollout separate |

## Verification and release contract

Use fake fixtures for screenshots and mocked writes. Production checks use only existing verified synthetic accounts, with non-read requests blocked except login and the existing session heartbeat. Do not create/reset accounts, send messages, acknowledge real incidents, change billing, migrate data, or activate schools.

For each material fix: focused regression tests, browser behavior at phone/tablet/desktop widths and enlarged text as applicable, preview no-write boundary, full `npm run vercel-build`, protected PR checks/merge, exact-commit Vercel Ready, aliases, health/log review, and changed-flow verification. Preserve failure evidence; never weaken a gate to pass it.

## Remaining external boundary

Mac/Xcode access, signing-team selection, physical-iPhone authenticated checks, final privacy/legal/store metadata approval, archive validation, and separately approved TestFlight/App Review publishing remain distinct from this web UI release. No broad school activation is implied.

## Wave 1 — implemented and under release validation

- Parent replies retain unsent text/files when changing reply context, with a cancelable confirmation. Earlier announcements are reachable in a collapsed disclosure. Incident acknowledgment updates the visible receipt immediately after a successful response. Update grouping uses the school timezone.
- Teacher profile/photo transport failures retain inputs and explain that the outcome is uncertain; no automatic retry or duplicate upload is triggered.
- Dashboard notices open their intended workflow without treating the sentence as a search query. Incident and follow-up destinations are explicit.
- FTE report links use one validated authorized-school/date target. An exact historical lookup supplements the bounded recent list; historical entries never inherit current enrollment/billing prefills. Existing report IDs, selected ranges, notes, explicit zero FTE and zero billing values remain intact.
- FTE school/week changes and ordinary page-leaving links protect drafts; failed saves keep entries. Approved director reports disable editing. Executive approval capability follows the actual role even in a single-school workspace; auditors retain history/printing without write or forbidden-export controls.
- Real components run in a localhost-only transport harness with fake props and intercepted requests (`npm run qa:ui-flow-recovery`). It has no credentials/backend access and is not an application route. Twelve workflow groups passed, including five explicitly intercepted write attempts and zero automatic retries.
- Chromium 48/48 and WebKit 48/48 homepage density cases passed (320/390/768px, 100%/200% text, eight scenarios). Every primary action retained a 44px target; no horizontal overflow, client exception, API call, off-origin call, or write occurred. These are browser captures, not native-device evidence.
- Current static Parent/Teacher `mobile:store:check` passed. It does not prove signing, archive, device, TestFlight, or App Review acceptance.
- General role-QA accounts passed fake-data/tenant/role scope verification, but the saved password failed authentication. No identities were reset. Separate reserved App Review Parent and Teacher credentials authenticated successfully; their scoped navigation-only production checks are being prepared.
- Initial full gate stopped on a stale exact-source test after adding the approved-report restriction. The assertion now requires both original restrictions and the additional lock; focused tests pass. The complete gate is being rerun, not bypassed.
- Final local production gate passed: Prisma generation, ESLint, TypeScript, all **1,967 tests**, and optimized Next.js build (166 static pages). Independent final review found no remaining blocker in this wave.
- Baseline authenticated production checks passed **Parent 10/10 and Teacher 10/10** across phone/desktop navigation with strict write blocking (only login/session heartbeat allowed). Both accounts passed the full isolated App Review runtime scope check. Deployment and post-release checks remain required.

Still actionable after this wave: older parent-record continuation, billing date/draft context safety, complete Team Permissions directory pagination, automation draft recovery, and remaining cross-screen navigation checks. These are not labeled human-only or complete.

### PR review corrections before merge

- Both unsigned Parent and Teacher macOS CI compile/public-launch checks passed on the initial PR head. Signing, archive, physical device, authenticated native behavior, and TestFlight were not performed.
- Review caught readable-versus-writable FTE school scope for directors with multiple grants. The editor now receives only schools accepted by the existing save guard, including its history and prefills. A readable secondary-school deep link stays read-only without silently opening the primary school. Executive capability remains independent of workspace layout.
- Parent date grouping and display now prefer the selected family's school timezone over the shell default. A real-component fake-data browser regression exercises two reports around midnight in New York and Tokyo.
- These corrections require fresh focused/browser and full production validation before the PR can merge. The protected review-conversation gate is not bypassed.
- Corrected code passed the full gate: lint, types, **1,968 tests**, and optimized production build. The real-component browser harness passed again, including director picker locking and selected-family timezone day counts. Independent read-only review found no blocker. Exact deployment and post-release verification are still required.
