# BEE Suite Mac testing handoff — October 7, 2026

## Live application and evidence

Use https://thebeesuite.io. Parent sign-in: https://thebeesuite.io/parents. Teacher sign-in: https://thebeesuite.io/teachers. Director/billing: https://thebeesuite.io/directors. Executive: https://thebeesuite.io/executives. School imports: https://thebeesuite.io/data-readiness?tab=procare. Public transfer instructions: https://thebeesuite.io/resources/family-billing-transfer.

This audit started from current main/production `e3d02a0fee211d5c9892e1cc2c9d0f57dcaba730`, PR #462, deployment `dpl_FGABFcwc61upHoFgMGfMwFHaALW6`. Canonical/www/beta health returned 200 with the database connected. The protected follow-up release adds a disposable PostgreSQL verification runner and this refreshed evidence; it does not activate a school, alter production records or replace any shipped feature. The final exact deployment record is supplied with the Mac closeout package after protected merge and post-release checks.

## Roles: actual checks and limits

| Role | Status | October 7 Mac evidence | Remaining acceptance |
| --- | --- | --- | --- |
| Director | VERIFIED for listed interactions | Existing isolated account signs in; click View enrollment status opens analytics enrollment report; migration shortcut opens School migration setup; mapped synthetic flat-file preview returns HTTP 200 / ok / dryRun and opens Migration Review; forbidden Kokomo import-history request returns 403 | Persisted correction and a reviewed real school package remain separate checks; no import commit |
| Parent | VERIFIED for listed interactions | Existing protected App Review account signs in at 390×844; Message School opens its private synthetic conversation; Payments navigation opens account/payment view; unsent message retains text on blur; no browser runtime exception | Actual software keyboard is native-test evidence; physical camera, notification and network recovery still require device acceptance |
| Teacher | VERIFIED for listed interactions | Existing protected App Review account signs in at 390×844; attendance, daily report, incident, photo and roster sections expand/collapse; Messages opens family message workspace; unsaved note survives Daily Report collapse/reopen | Submission/media persistence and delivery are not certified by opening controls; no operational submission |
| Executive | BLOCKED | Application/Auth identity and active grants exist in isolated demo tenant; saved Mac shared QA credential returns 401 | Current approved credential; workspace selection, all-location and positive/negative school isolation |
| Billing | BLOCKED | Application/Auth identity and active school grant exist; saved Mac shared QA credential returns 401 | Current approved credential; claims, external reconciliation, historical families, statements and reminder recipient previews |
| Pickup/kiosk | BLOCKED | Pickup application/Auth identity exists; saved Mac shared QA credential returns 401 | Current approved pickup/kiosk test access and safe synthetic attendance targets; no real PIN or pickup changes |

Browser evidence is under `output/playwright/mac-live/` in the isolated Mac checkout. Playwright was used because the Browser plugin is absent. Non-read requests were blocked except the intended isolated-account sign-in; login's normal session/audit records were retained. No real message, payment, attendance or import was submitted. Screenshots represent synthetic accounts and do not prove school-specific live acceptance.

## Safe test accounts, without passwords

| Role | Existing account | Credential source/status |
| --- | --- | --- |
| Director | ux-qa-director@synthetic.thebeesuite.io | Existing secured Mac QA environment; works |
| Parent | app-review-parent@thebeesuite.io | Existing secured Mac App Review environment; works |
| Teacher | app-review-teacher@thebeesuite.io | Existing secured Mac App Review environment; works |
| Executive | ux-qa-executive@synthetic.thebeesuite.io | Current credential needed; saved shared value rejected |
| Billing | ux-qa-billing@synthetic.thebeesuite.io | Current credential needed; saved shared value rejected |
| Pickup | ux-qa-pickup@synthetic.thebeesuite.io | Current credential needed; saved shared value rejected |

The Mac environment's direct PostgreSQL credential is stale; the database connector supplied read-only identity evidence. No identity, password, role or grant was repaired. Do not paste passwords into chat or put them in guides.

## Exact safe steps

1. Director: sign in, confirm Little Harbor / Center Director / one school. Click View enrollment status: expect Reporting and Analytics with enrollment status selected. Return and open School migration setup: expect one authorized location and no evaluated migration evidence. Open Start migration and wait for prior-import history to finish loading before opening source-format controls. A fully synthetic mapped flat-file preview was verified; no import was committed. Open Review and correct; do not interpret an empty queue as complete school readiness. Use a reviewed synthetic preview before testing a real package; import commit remains school-approved.
2. Parent: sign in using the protected review account. Expect Little Harbor and its one synthetic child. Click Message School: expect the private demo conversation. Type an unsent synthetic draft, focus/dismiss input, and check it survives the supported in-page view changes. Do not send. Click Payments with no draft: expect the protected account/payment screen; do not create checkout or pay. Home quick actions must stay family-scoped.
3. Teacher: sign in using the protected review account. Expect Toddler Hive / Little Harbor / 13 synthetic roster children. Expand Attendance, Daily Report, Incident report, Photo and Roster. Expect visible labeled fields and selected-child context. Enter an unsaved synthetic note and collapse/reopen the panel; expect retention. Navigate Messages: expect the scoped message workspace. Do not submit attendance, reports, incident, media or messages.
4. Executive/billing/pickup: obtain current credentials through the approved store first. Test selection/isolation or billing preview controls in the isolated tenant. A loading page is insufficient: record the selected school, actual interaction, expected result and forbidden-school outcome. Never use real reminders, charges or pickup records as tests.
5. Native: use the signed local Parent/Teacher package for review, or the verified simulator builds. Both are iPhone-only, version 1.0/build 5. Signed package preparation is not TestFlight distribution. Connect an approved iPhone with synthetic accounts for camera/media permission, notification availability, navigation, keyboard, cold/relaunch and offline/recovery acceptance. No physical iPad was available; iPad support is not claimed. Android retains the HTTPS web fallback, with no Android store release claimed.

Parent native verification passed both SDK builds, cold/relaunch and actual synthetic software-keyboard focus, visibility, dismissal, draft retention and portrait lock on an isolated iPhone 17 / iOS 27 simulator. Teacher verification also passed both SDK builds, cold/relaunch and the same keyboard suite. Relaunch needed bounded delayed-screen sampling before the sign-in heading appeared. Neither simulator run proves physical-device or authenticated native acceptance. Both local signed archives and exported IPAs passed code-signature checks; no upload or distribution occurred.

## Schools, recovery, providers and guides

[MAC_SCHOOL_READINESS_2026-10-07.csv](MAC_SCHOOL_READINESS_2026-10-07.csv) records all 45 operational active schools, 16 explicitly billing-enabled, current record/access/import inventory, owner roles, next steps and separate gates. These counts are not readiness approvals. Kokomo needs authorized positive attendance/media acceptance. Centennial needs exact staff/Auth reconciliation. Longmont and Tyler already read closed; closure authority and access/retention decisions need confirmation, not replay.

[TUITION_POSTGRES_REHEARSAL.md](TUITION_POSTGRES_REHEARSAL.md) documents real disposable PostgreSQL concurrency verification. Production dry run remains UNVERIFIED: saved credential 401; existing sensitive Vercel secret cannot be retrieved through available access. The owner supplies the existing bearer securely; do not rotate it.

[MAC_RECOVERY_AND_PROVIDER_READINESS_2026-10-07.md](MAC_RECOVERY_AND_PROVIDER_READINESS_2026-10-07.md) distinguishes refreshed Storage/delivery evidence from missing backup-management, independent byte backup, second-owner and alert evidence. No retries or provider changes were performed. Granbury's exact family financial evidence and approval preview are private in the local closeout package; no refund or ledger adjustment was made.

The current guide packet remains `output/pdf/TEAM_SHARE_GUIDES_CURRENT/`: 15 PDFs / 103 pages, October 7 publication date. All PDF hashes were rechecked against SOURCE_REFRESH_MANIFEST_2026-10-07.json. No guide-covered workflow changed in this technical release. Existing synthetic screenshots do not certify current end-to-end acceptance. Preserve source reports as recoverable backups after school/data verification once school/data verification is complete; retain recoverable source backups.
