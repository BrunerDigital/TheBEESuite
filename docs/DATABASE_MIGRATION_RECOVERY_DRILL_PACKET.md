# Database Migration Backup, Restore, And Forward-Recovery Drill Packet

Complete this packet in an isolated, approved environment using sanitized or approved data. Never run destructive reset, rollback, seed, or restore commands against production. Kokomo writes must be preserved.

## Control record

- Candidate commit: ____________________
- Migration range: ____________________
- Database owner: ____________________  Accepted/date: ____________________
- Release owner: ____________________  Accepted/date: ____________________
- Environment: ____________________
- Approved RPO/RTO: __________________ / __________________
- Backup identifier, timestamp, retention, and encryption owner: ____________________
- Evidence folder/link: ____________________

## Preflight

- [ ] Review every SQL migration for locks, destructive operations, defaults/backfills, tenant scope, RLS/grants, indexes, and old/new application compatibility.
- [ ] Record `npx prisma migrate status` from the approved target without applying changes.
- [ ] Confirm backup completes and a separate operator can locate and decrypt/access it.
- [ ] Record row-count/control totals for selected non-sensitive fixtures and schema version.
- [ ] Choose recovery strategy for each migration: forward fix, compensating migration, application rollback with schema retained, or restore.
- [ ] Define the point of no return and who may authorize restore.

## Drill A: restore validation

1. Restore the approved backup into a new isolated target.
2. Verify connection, schema/migration state, selected counts, constraints, RLS/grants, and application read-only smoke.
3. Record start/end time, achieved RTO, data timestamp, achieved RPO, errors, and remediation.

Result: PASS / FAIL  Evidence: ____________________

## Drill B: migration and forward recovery

1. Apply the candidate migration set only to the isolated target through the approved command/process.
2. Verify migration status, schema, constraints, tenant isolation, critical reads/writes using fixtures, and old/new application compatibility.
3. Introduce or simulate the documented failure condition.
4. Apply the prepared forward/compensating migration; do not edit an already-applied migration.
5. Re-run controls and confirm no accepted writes were lost.

Result: PASS / FAIL  Evidence: ____________________

## Decision record

- Failure scenario: ____________________
- Chosen recovery: forward fix / compensating migration / app rollback / restore
- Reason and data-loss analysis: ____________________
- Writes requiring reconciliation: ____________________
- Authorizer: ____________________  Date/time: ____________________
- Re-entry criteria: ____________________

Release eligibility requires both drills to pass within accepted RPO/RTO or a written NO-GO decision.
