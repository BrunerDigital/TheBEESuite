# Current BEE Suite completion status

Last verified: September 23, 2026 (Eastern). This file is the current technical and operational status, not a school launch approval. Earlier dated audits remain historical evidence.

## Live-service boundary

The web app remains in production on the existing BrunerDigital Vercel and Supabase projects. Its public `/api/health` check returned `ok: true` and `database: connected` after the recovery organization upgrade. The separate recovery project is not attached to a live web alias. No production records, credentials, roles, payments, messages, invitations, or provider routes were moved to it.

## Completed and verified

- Created `BEE Suite Recovery Lab` (`hptrlvbciwkceqifjnbt`) in the separate `brunerdigital's projects` Supabase organization. The owner approved the Vercel checkout for Supabase Pro; Vercel shows a $25/month base plan excluding overages, plus applicable tax and fees. Supabase reports the organization as `tier_pro` and the project as `ACTIVE_HEALTHY`.
- Applied all 49 checked-in Supabase SQL migrations to Recovery Lab. It has 103 application tables with RLS enabled, 1,165 application columns, zero Auth users, zero Storage objects, and no browser-role table grants. Application table names and column counts match production. The migration service assigned new timestamp versions in Recovery Lab, so its 49 ledger entries are not version-identical to production's 49 entries. Prisma's `_prisma_migrations` table is absent because these files were applied through the Supabase migration service rather than Prisma's deployment ledger. Reconcile both ledgers in the restore plan.
- Compared schema details with production. The one column-definition difference is `FteReport.updatedAt` (`CURRENT_TIMESTAMP` default in production, no default in Recovery Lab). Index definitions differ on 21 tables. These differences require review before calling a restored environment production-equivalent; they are not evidence of missing user data.
- Verified the configured production Storage server key can list the two private application buckets without exposing its value. An empty-prefix exporter/manifest verification passed with zero objects; this proves connectivity and guard behavior only, not a backup of any file bytes.
- Re-ran Supabase security advisors. Both projects report 13 informational RLS-without-policy findings on server-only agency tables; no browser-role table grants were observed. The production performance advisor reports 11 informational unindexed foreign keys, which require query-impact review before any production DDL.

## Recovery work still open

1. Select a company-controlled encrypted, versioned or retention-locked off-platform vault, confirm its access-recovery owner, and configure a restricted backup runner and failure alerts. The proposed retention is 35 daily and 12 month-end archives, subject to the approved retention/deletion policy.
2. Obtain a current production database export credential through a controlled provider path. Existing local database connection values fail connection checks, and the values pulled from Vercel are blank. Do not rotate the production database password merely to run a drill while the app is live.
3. Export and verify a matched database snapshot and all private Storage bytes. Production currently reports about 542 MB of database storage and 619 Storage objects (about 740 MB by metadata). Sizes are planning estimates, not verified exported bytes.
4. Restore into an isolated target with outbound jobs and provider side effects disabled, then verify record relationships, counts, financial and audit history, private object hashes, access isolation, and measured RPO/RTO. The current Recovery Lab has schema only. No production data has been copied and a full restore has not been claimed.

**Do not use Supabase's one-click binary clone for this drill without a separate stop plan.** Production has an active `stripe-sync-worker` `pg_cron` job scheduled every minute and `pg_net` enabled. Supabase states that cloned database jobs can start immediately, while the clone also carries Auth records and the encryption root key. A logical restore into a prepared isolated target is the safer route because external effects can be excluded or disabled before import. See the [recovery runbook](SUPABASE_DATABASE_STORAGE_RECOVERY_RUNBOOK.md) and [Supabase's clone documentation](https://supabase.com/docs/guides/platform/clone-project).

## Other independent finish-line gates

- **Account security:** enroll and test primary and backup authenticators, confirm a human recovery owner and lost-device procedure, then approve and enable required-role MFA. The latest production inventory found zero enrolled factors.
- **School readiness:** reconcile exact source data, staff/guardian identities and grants, tuition and ledger history, ProCare exceptions, and director decisions for each chosen school. Setup, invitations, kiosk/PIN, billing, payments/payouts, communications, and ProCare retirement require separate recorded GO/NO-GO decisions.
- **Cross-role verification:** use approved synthetic accounts in at least two schools to test isolation, attendance, parent and teacher flows, communications and delivery, billing and settlement, reporting/payroll, degraded modes, and real-device/kiosk operation.
- **Operations:** name primary and backup human responders, confirm alert delivery and on-call coverage, train affected roles, verify provider reply/failure paths, and record school-specific support and rollback plans.
- **iOS:** current-main Parent and Teacher repository configuration passes `npm run mobile:store:check`. Authenticated physical-device scenarios, TestFlight, App Store content/review and release decisions remain independent gates. Android, native push, universal links and unrequested expansion modules are outside the current v1 finish line.

For the full role-by-role inventory, use the [master completion checklist](PRODUCT_COMPLETION_CHECKLIST_2026-08-31.md) as a worklist and re-verify each item against current production before marking it complete. A checked-in implementation, green build, or healthy public route does not establish business activation or authenticated flow success.
