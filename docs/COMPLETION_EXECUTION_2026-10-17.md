# BEE Suite completion execution — October 17, 2026

Evidence captured October 17 Eastern / October 18 UTC. Scope: the existing web product and Parent/Teacher iOS apps. Android, native push, universal links and expansion modules retain the existing separate scope decisions. This checkpoint supersedes September's inventory for the observations below; it does not grant school activation or permission to repair identities, change money, send messages or publish apps.

## Current production and preserved work

Canonical production is `024cbb83c736205f8f7716b1ac28892502a6f440`, Vercel `dpl_DYdTQPxMcZH9xzKJXS76wVM6bohr`, READY with apex, www, beta, project and main-branch aliases. The public health endpoint returned HTTP 200, `ok: true`, `database: connected`. Current-main GitHub CI and unsigned iOS verification succeeded. Vercel's 24-hour runtime-error query returned no clusters; error/fatal logs for that deployment were empty in the queried window. These bounded observations do not prove every authenticated workflow.

The shared main checkout contains unrelated dirty work and is behind current remote main. It and its running processes were preserved. This work uses an isolated current-main worktree. There were no open PRs at the start. Older worktrees remain retained until their dirty files, branch ancestry, financial archives and active ownership are reviewed; a merged branch alone does not authorize deleting its working files.

## Completed technical verification

- Public production Playwright smoke passed: protected-route sign-in boundaries, inquiry embeds/API and trusted-origin preflights, plus Parent/Teacher/Privacy/Support rendering at phone, tablet and desktop sizes.
- Canonical local database read access passed. Prior notes that the local credential is unusable are historical; no password, provider key or production setting was rotated.
- Static operations check passed: 10 configured cron handlers, 46 Prisma migration files with mirrors, 49 deployable Supabase migrations, no held migration files. This does not apply migrations or prove scheduled execution. Live Prisma ledger has 31 entries, none unfinished; the file count and applied ledger count are separate populations.
- Parent/Teacher repository store checks passed. The latest exact-main unsigned native workflow is green. Physical-device, signing, TestFlight and App Store acceptance remain separate.
- Production dependency audit returned zero known production vulnerabilities at the time checked.
- Real disposable PostgreSQL 18.3 rehearsal passed all seven scenarios: dry run; two concurrent tuition runs across two families; missing biweekly/four-week anchors; and observed row-lock races against committed pause, family transfer and child withdrawal. No production database or provider was contacted. This is bounded PostgreSQL 18 evidence; production uses PostgreSQL 17.6.1.121. The isolated loopback cluster was stopped and retained locally.
- Chromium browser fixtures passed school setup saves (four success/failure cases) and family/billing intake (six desktop/mobile success/network/rejection cases), with fake API interception.
- Parent payment browser verification passed 44 layout/status cases and eight interrupted-payment recovery scenarios, nine intercepted fake posts and 48 intercepted read-only observations, with zero backend requests. A stale selector was updated from the retired `Buy with Link` name to the current uniform purchase's scoped `Link or card` button.
- The Windows full gate exposed a CRLF-sensitive import-removal expression in the offline-payment atomicity harness. It left an import inside a generated function, preventing all scenarios from executing. The corrected expression supports CRLF and LF; the focused test executes all 29 transaction/idempotency/rollback scenarios successfully. Application payment behavior is unchanged.
- The next Windows gate exposed Unix-only route discovery/allowlist paths in the FTE inventory. Route discovery now uses the filename and normalizes relative paths before comparison. All 166 FTE access/UI/inventory tests pass, including the complete 169-route / 140-authenticated-surface inventory. Authorization behavior is unchanged.
- A scoped `xcode` dependency override replaces development-only UUID 7.0.3 with patched CommonJS-compatible 11.1.1 for [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). Both real native projects passed UUID generation plus parse/write/parse round-trip checks, and the patched UUID API rejects the advisory's undersized buffer case. No native project, app version, signing, distribution or runtime dependency was changed.

- Canonical nine-role production QA completed with **Director desktop/mobile cases passing**. The other eight synthetic roles (executive, regional, assistant, billing, teacher, parent, pickup and auditor) returned HTTP 401 for their saved credentials; the aggregate run is **not passed**. No unexpected writes or page-runtime exceptions were recorded. Platform owner was excluded.
- The separate protected Teacher reviewer passed eight read-only checks across desktop/phone portal, roster and quick-log routes, forbidden import access and logout. Its screenshots were visually inspected. The saved Parent reviewer credential returned 401; parent authenticated acceptance remains unverified.
- The existing synthetic Director passed four API checks: concurrent own-school import history 200, Kokomo 403, Centennial 403, then old-cookie replay after logout 401. These establish negative access boundaries, not positive real-school workflow acceptance.
- Credentialed QA now records the sanitized login HTTP status and fails promptly on a rejected credential. An exact designated executive rerun recorded 401 with no unexpected writes. Credentials/provider response bodies remain omitted; no account was reset or provisioned.

Full-gate results are recorded in the final validation section after completion. Never infer a pass from a running command.

## Fresh school-readiness evidence

The canonical fleet inventory selects **45 operational active schools**, while the raw `Center.status = active` count is 51 across the database. These are different populations. The fleet checker reports **180 blocked module gates** (setup, invitations, kiosk and billing for all 45 selected schools). Both school business profiles await explicit confirmation. A blocked readiness signal is not an instruction to stop existing approved operations.

Use the [redacted per-school module worklist](COMPLETION_SCHOOL_GATES_2026-10-17.csv). It contains school-level counts and gaps, no household identities or credentials. The readiness command is read-only; no source import, PIN, invitation, billing flag or rollout state changed.

| Evidence | Kokomo | Centennial |
| --- | --- | --- |
| Family / child records | 39 / 61 | 123 / 146 |
| Classroom / staff-profile records | 12 / 23 | 7 / 14 |
| Active staff with no normalized-email Auth match | 0 | 14 |
| Guardians in the module-gap population | 65 | 73 |
| Linked guardian logins / kiosk PINs in that population | 58 / 60 | 67 / 64 |
| Contact gaps | 3 invalid/missing invitation emails; 1 phone gap | 1 invalid/missing invitation email; 3 phone gaps |
| PIN gaps | 5 | 9 |
| Source review | Business profile confirmation pending | Business profile and complete guarded source-package/report review pending |

No selected child/classroom cross-school mismatch was found. The checker also reports one pending incident review and 12 media permission reviews across the pair. These are school-review items, not permission to approve care records or publish photos. The school owner must classify intentionally uninvited staff and excluded guardians rather than having missing identities or contacts invented.

## Fresh security, provider and recovery evidence

- **Identity/MFA:** zero verified Auth MFA factors. Across the database, 44 active Prisma users have no normalized-email Auth match: 35 teachers, three directors, two regional managers, two billing admins, one brand admin and one platform owner. An unmatched record can be intentionally uninvited; classify exact records before changing access. Human primary/backup enrollment, lost-device recovery and required-role policy remain open.
- **Database boundary:** production is ACTIVE_HEALTHY. Security advisors report 13 INFO notices for RLS-enabled server-only agency tables without policies; zero explicit browser-role public-table grants were found. No warning/error advisor result, browser grant or schema change was introduced.
- **Development dependency still open:** the full dependency audit now has five high findings in the lint/glob chain, all rooted in the single [braces stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The advisory and current registry report no patched release (latest 3.0.3). Production dependency audit remains clean. Track a patched upstream release or reviewed replacement; no automatic audit fix or incompatible Next.js downgrade was applied. This remains an engineering follow-up, not a clean all-dependency audit.
- **Payment receipts:** 45 pending and nine manual-review `StripeWebhookEvent` records remain. Pending records span July 21–October 1; manual-review records span September 2–8. These are stored application-receipt states, not a declaration that 54 payments failed. Each needs event/account/object/provider and local payment/ledger reconciliation before a disposition or replay.
- **Stripe worker:** deployed `stripe-worker` is ACTIVE version 11. The latest recorded weekly sync completed October 14 at 11:18 UTC with all 1,418 chunks complete and no errors; this preceded the repair deployment, so it does not prove the next scheduled full workload on the repaired worker. The queried 24-hour Postgres log inventory showed authentication/connection FATAL records, no SQL ERROR records; function log levels were info/log. Preserve valid production credentials and investigate exact connection sources without weakening authentication.
- **Delivery:** the rolling 14-day application-delivery inventory contains 107 failed SendGrid records across multiple purposes and 52 failed Twilio payout-notification SMS records, with two SMS records pending. Twilio failures classify as 44 unregistered-sender `30034` and eight unreachable-number `30006`. These are delivery-row counts, not event counts or distinct recipients. No retry, suppression removal, registration, provider change or send occurred. Prepare exact recipient/template/consent/deduplication previews before any resend.
- **Private files:** current Storage metadata lists 315 corporate-assets objects / 170,028,804 bytes and 425 child-media objects / 816,368,365 bytes. These counts establish inventory, not complete byte backup or independent custody. The September 28 combined recovery drill remains historical bounded evidence. A company vault/account, independent key recovery, second human owner, restricted schedule, retention and tested failure alerts remain unconfirmed.

## Work shipped since the older completion queue

Merged source and protected PR history establish implementation, with the verification limits above:

| Area | Released work |
| --- | --- |
| Training and help | Narrated director library #472, Resources navigation #473 and chaptered director overview #478 |
| School setup/imports | Owner-scoped setup/access tools #468, preserved allergy evidence #469 and tracking-row deduplication #477 |
| School/role access | Authorized closed-school history/payment access #474, reviewed parent payer access #480 and FTE access/recovery #486 |
| Tuition | Persistent child-rate edits #475, preserved delayed coverage #476, director invoice timing #479 and transition coverage #483 |
| Payment recovery | Atomic offline receipts #481, billing history/recovery #485, interrupted parent Checkout recovery #487 and overlapping-client recovery #489 |
| Agency/operations | Read-only service-period register #488, school/account-bound payout setup #470 and Supabase worker repair #482 |

Do not reopen these as missing features merely because an older checklist has unchecked boxes. Confirm current behavior and retain the distinct operational decisions.

## Concrete remaining handoffs

1. **Recovery/operations owner:** name a second human owner and select the company-controlled vault/account. Then review an exact destination, encryption/key-custody, retention, runner and alert preview before external configuration or costs. Existing local encrypted staging is not independent recovery.
2. **Kokomo/Centennial school owners:** review each school's business profile, source package, contact/PIN exceptions and Centennial's 14 unmatched staff; record exact dispositions and separate module decisions. Existing operations remain live.
3. **Finance/provider owners:** reconcile the 54 historical receipt exceptions individually, current school payout requirements and any still-open exact-family cases. No blanket refund, retry, ledger correction or collection is authorized by this checkpoint.
4. **Security and QA owners:** enroll primary/backup authenticators and supply current synthetic test credentials through the approved secure store. Do not reset the reserved reviewers or other users merely to make QA green.
5. **Apple/device owner:** provide a physical iPhone tester and current Mac/App Store Connect access for the existing Parent/Teacher apps. Review exact archives/builds before distribution, submission or release. Current CI and browser screenshots do not replace device acceptance.

The [remaining-task queue](REMAINING_TASKS.md) carries acceptance requirements. Exact identities, household exceptions, credentials and raw school reports stay in ignored private evidence, not this document.

## Final validation

Pending completion of the final full gate and current credentialed role run. Local evidence is under `output/audit/completion-20261017/`; it is ignored and is not supplied by a fresh clone. The source correction and this redacted checkpoint can be reviewed through the protected PR.
