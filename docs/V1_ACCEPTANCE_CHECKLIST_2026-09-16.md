# The BEE Suite v1 acceptance checklist — 2026-09-16

Current source baseline: `b16cb892ee04fe08718c9d51ced13086ddf3eb50` (`origin/main` at worktree creation). Current release worktree: `work/v1-finish-current-20260916`.

## Completed with evidence

- [x] Current-main Parent and Teacher iOS projects compile from the approved source.
- [x] Current-main web gate passes: `npm test` reports 2,485 passed and `npm run vercel-build` completes through Prisma generation, lint, typecheck, tests, and Next production build.
- [x] Parent and Teacher version `1.0`, build `4` archives are signed with Apple Distribution identity for team `BMYUFLTU52`.
- [x] Both archives pass strict codesign verification and Xcode Organizer App Store validation. See [`IOS_CURRENT_MAIN_RELEASE_EVIDENCE_2026-09-16.md`](IOS_CURRENT_MAIN_RELEASE_EVIDENCE_2026-09-16.md).
- [x] Current-main Debug builds install and launch on the paired physical iPhone; fresh Parent and Teacher screenshots are recorded in the evidence output directory.
- [x] The current remote-main web baseline contains the previously recorded protected production gate and current billing handoff; no production financial, messaging, invitation, provider, or destructive action was performed by this work.

## Remaining defects or gates

- [ ] Authenticated physical-device Parent and Teacher scenario matrix: approved synthetic account provenance, recovery, session persistence/revocation, isolation, camera/photo/file selection, interrupted upload, offline/reconnect, attendance, updates, documents, messaging, payment presentation, external handoffs, accessibility, and enlarged-text checks.
- [ ] Required-role MFA activation and real enrollment/recovery/revocation drill. Current policy remains unactivated; recommended roles remain a proposal until owner approval and lockout/recovery ownership are confirmed.
- [ ] Staging Supabase project, encrypted versioned/immutable off-platform database and private Storage backups, alerts, ownership, and an isolated database-plus-Storage restore rehearsal. Production project remains `nqjrlktoewiueiwrubas`; no staging or backup destination was created here.
- [ ] School/business readiness: pilot school and representative, monitoring responders, source-backed configuration/financial/access confirmations, kiosk checks, safe delivery/reply recipients, payroll reconciliation, support/training acceptance.
- [ ] App Store Connect upload, TestFlight distribution, App Review submission, or public release. Signed artifacts are ready, but these remain separate consequential actions.

## Owner inputs or approvals required

- Apple/App Store Connect owner: authorize the exact next action for Parent and Teacher (`upload`, `TestFlight`, `App Review`, or `public release`) after reviewing metadata and screenshots.
- Product/security owner: provide approved synthetic Parent and Teacher accounts and authorize the controlled authenticated device matrix; do not share credentials in chat.
- Security owner: approve required MFA roles and name primary/backup recovery owners before enforcement.
- Infrastructure/data owner: provide an approved backup destination, retention/immutability decision, recovery-key access, and restore-drill authorization.
- Operations/school owner: identify the pilot school, representative, coordinators/responders, and business/financial/access evidence owners.

## Deliberately outside v1

- Android app.
- Native push notifications.
- Universal links.
- New expansion modules beyond the existing web suite plus Parent and Teacher iOS apps.
