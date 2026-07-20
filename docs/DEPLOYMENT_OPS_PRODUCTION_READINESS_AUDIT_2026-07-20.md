# Deployment And Ops Production Readiness Audit

Date: July 20, 2026  
Accountable human: Brenden until explicitly delegated  
Decision: **NO-GO for the wider school wave. Kokomo may continue normal production use.**

## Production-ready definition

This workstream is production-ready only when the final intended release commit passes `npm run vercel-build`; every pending Prisma migration is reviewed, backed up, applied through the approved process, and has a tested forward-recovery or compensating rollback plan; the deployment reaches Vercel `READY`; public health and authenticated readiness pass; role and changed-flow production smoke pass; runtime logs are reviewed; uptime/error monitoring and alert routing are proven; every scheduled cron has recent successful execution evidence; and named release, incident, database, and after-hours escalation owners accept the release.

## Audit findings

### BLOCKER

- Wider-wave ownership and release authorization are not complete. Owner: Brenden. Exact retest: record the selected wave, release approver, database/migration owner, incident commander, and after-hours support owner, then obtain the required cross-workstream signoffs.
- Production uptime/error monitoring and alert delivery are not evidenced. Structured, redacted API logs and server-side client error capture exist, but logs are not an alerting system. Owner: Brenden. Exact retest: trigger an approved synthetic failure in a safe environment and retain alert receipt, acknowledgement time, routing, and escalation evidence.
- Backup/restore and migration recovery are not proven for the final migration set. Owner: Brenden. Exact retest: record a current backup, run `npx prisma migrate status` against the approved target, rehearse restore or forward recovery in an isolated environment, and attach timestamps/results. Do not apply or reverse production migrations as part of this audit.

### REQUIRED BEFORE WAVE

- Run `npm run vercel-build` on the final intended commit. The July 20 audit attempt stopped during `prisma generate` with Windows `EPERM` replacing `node_modules/.prisma/client/query_engine-windows.dll.node`. A later coordination check confirmed multiple workstreams were still actively running Next, Prisma, lint, typecheck, and focused validation jobs. No process was stopped because none was verified stale. The readiness orchestrator centrally deferred the single clean build until all 17 workstreams settle. Owner: readiness orchestrator for the consolidated run; technical release owner (Brenden until delegated) for acceptance. Exact retest: freeze the consolidated candidate, confirm no active workspace jobs, stop only verified stale workspace processes if necessary, then run one long-timeout `npm run vercel-build`. Until that passes, candidate build status is **DEFERRED / NOT YET CLEAN**.
- Prove Vercel `READY`, aliases, `/api/health`, authenticated `/api/system/readiness`, runtime log review, role smoke, and changed workflows after the authorized deployment. Owner: technical release owner (Brenden until delegated).
- Prove successful production execution and expected result counts for all eight cron handlers: FTE reminders, integration retries, campaign scheduler, tuition billing, tuition reminders, document expirations, payment dunning, and autopay. Repository configuration and `CRON_SECRET` checks do not prove execution. Owner: operations owner (Brenden until delegated).
- Define migration rollback per change. Prefer backward-compatible schema changes and forward fixes; never reverse a migration that could discard Kokomo writes. Owner: database owner (Brenden until delegated). External decision: approve restore-versus-forward-fix criteria and maximum acceptable recovery time/data loss.
- Complete an escalation roster with actual contact methods, coverage hours, acknowledgement targets, vendor escalation paths, and authority to pause invitations/billing or return affected modules to ProCare. Owner: Brenden.

### FOLLOW-UP

- Remove duplicated CI work: the workflow runs lint, typecheck, and tests separately and then repeats them inside `vercel-build`. Owner: technical release owner. This is build-time optimization, not a launch gate.
- Consider a dedicated external uptime probe for `/api/health` plus authenticated/synthetic coverage for critical workflows; `/api/system/readiness` must remain access-controlled. Owner: operations owner.
- Add a cron execution ledger/dashboard with last start, last success, duration, processed count, failure count, and request/deployment ID. Owner: operations engineering.

## Repository evidence completed

- `vercel.json` schedules eight distinct cron handlers; all implemented cron routes are scheduled and require bearer authorization using `CRON_SECRET`.
- `npm run vercel-build` includes Prisma generation, lint, typecheck, the unit suite, and Next production build.
- `/api/health` performs a database query and returns HTTP 503 when unavailable.
- `/api/system/readiness` is restricted to platform/brand/regional roles and checks database plus key service configuration; warnings still require human review.
- API request/response logging emits request IDs, status, duration, and privacy-oriented redaction. Operational errors have a separate structured event.
- The production smoke script covers public and protected entry points, public embed/API checks, CORS, browser errors, and optional credentialed login. It does not replace per-role/per-school workflow smoke.
- `npm run ops:check` now performs a read-only static check for build-gate contents, cron manifest/handler parity, cron secret enforcement, and Prisma migration file completeness.
- Latest `npm run ops:check` passed: 8 cron handlers matched 8 configured paths and 31 Prisma migration directories contained `migration.sql`; its focused test passed 2 of 2. The migration count increased while other workstreams were active, so the consolidated release owner must freeze and review the final set before the central build.

## Release sequence and stop conditions

1. Freeze the exact commit and migration set; name owners and affected modules.
2. Confirm backup/restore evidence and review each migration for locking, destructive changes, tenant scope, compatibility, and forward recovery.
3. Run `npm run ops:check`, `npm audit --omit=dev`, and `npm run vercel-build` on the frozen commit.
4. In an approved safe environment, apply migrations and smoke old/new compatibility before production authorization.
5. Only after separate authorization, apply the approved production migration plan and promote the exact validated artifact.
6. Require Vercel `READY`, correct aliases, health/readiness, logs, role smoke, changed-flow smoke, cron evidence, and alert observation before release signoff.
7. Stop rollout for health/readiness failure, migration uncertainty, cross-school exposure, payment misrouting, missing monitoring/support coverage, or any P0/P1 defect without an accepted workaround. Preserve live writes and use a forward fix or approved restore plan; keep/return affected school workflows to ProCare as directed.

## External decisions required

- Brenden must name and obtain acceptance from the technical release, database/migration, incident-command, monitoring/alerts, and after-hours support owners.
- Brenden must choose and configure the monitoring/alert provider, recipients, severity routing, response targets, and coverage schedule.
- The database owner must approve backup retention, recovery point objective, recovery time objective, and forward-fix versus restore criteria.
- Release signatories must authorize any future production migration or deployment separately; this audit grants neither authorization.

## Exact next action

The readiness orchestrator waits for all 17 workstreams to settle, freezes the consolidated candidate, verifies no active workspace jobs remain, and runs one clean `npm run vercel-build`. Separately, Brenden names the technical release, database/migration, monitoring/alerts, incident-command, and after-hours owners; those owners run the approved alert and recovery drills before production authorization.

## Operational packet index

- `MONITORING_ALERT_TEST_PLAN.md`
- `DATABASE_MIGRATION_RECOVERY_DRILL_PACKET.md`
- `CRON_EXECUTION_EVIDENCE_TEMPLATE.md`
- `INCIDENT_ESCALATION_MATRIX.md`
- `RELEASE_STOP_CONDITIONS_AND_ROLLBACK_DECISION.md`
- `POST_RELEASE_SMOKE_CHECKLIST.md`
