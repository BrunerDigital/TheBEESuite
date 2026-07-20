# Release Stop Conditions And Rollback Decision Record

## Mandatory stop conditions

Stop promotion or the affected rollout when any of these is true:

- Candidate commit, migration set, owner acceptance, backup, recovery drill, monitoring, or support coverage is missing.
- Build, migration status, `READY`, alias, health, authenticated readiness, log scan, role smoke, or changed-flow smoke fails.
- Cross-tenant/school/family visibility, custody/medical exposure, payment/payout misrouting, or destructive data behavior is suspected.
- A migration is unexpected, irreversible without accepted loss, incompatible with the prior/new app, or cannot meet approved RPO/RTO.
- A critical cron has no recent success, produces unexpected counts, duplicates side effects, or lacks failure ownership.
- A P0 or unresolved P1 exists without an explicitly accepted safe workaround.
- The incident commander, database owner, monitoring owner, or after-hours owner is unavailable.

## Rollback decision hierarchy

1. Pause promotion or affected module; preserve logs, request/deployment IDs, and all live writes.
2. If schema remains compatible, re-point the Vercel production alias to the last known-good deployment only after authorization.
3. Prefer a forward/compensating migration for database defects. Never edit an applied migration or reverse data-bearing schema changes casually.
4. Restore a database only when the authorized database owner accepts the RPO/data-loss and reconciliation plan; preserve/export post-backup writes first where possible.
5. Pause invitations/billing and keep or return affected school workflows to ProCare under the approved source-of-truth decision.

## Decision record

- Incident/release ID and time: ____________________
- Candidate and last-known-good deployment: ____________________ / ____________________
- Affected schools/modules/data: ____________________
- Stop condition triggered: ____________________
- Options considered: hold / alias rollback / feature disablement / forward fix / restore / ProCare fallback
- Selected option and why: ____________________
- Expected data loss or reconciliation: ____________________
- Technical release approval: ____________________
- Database approval when applicable: ____________________
- Business/stop-authority approval: ____________________
- Communication owner: ____________________
- Re-entry checks and evidence: ____________________
- Final outcome/date: ____________________
