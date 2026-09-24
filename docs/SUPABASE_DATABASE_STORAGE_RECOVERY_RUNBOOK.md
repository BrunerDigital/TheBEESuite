# Supabase Database And Storage Recovery Runbook

Status: implemented recovery tooling and bounded synthetic drill completed July 20, 2026. A separate Pro recovery project was created September 23, 2026, and all 49 checked-in SQL migrations were applied there. Production Storage backups are **not operational** until an approved encrypted, versioned off-platform destination and schedule runner are recorded. A full production-sized database-and-Storage restore remains unverified. See [current completion status](CURRENT_COMPLETION_STATUS.md).

Supabase database backups include Storage metadata, not the object bodies. Recovering The BEE Suite therefore requires a database restore point and a separately retained Storage archive from the same recovery window.

The current physical daily backups are available for Supabase-managed restoration but are not a downloadable off-platform logical archive. A separate logical export is required for the independent vault. Production's saved local database credentials are stale. Supabase's temporary database access could avoid resetting the existing password, but it requires SSL enforcement; that setting is off in production and must not be changed without confirming all live database clients are compatible. Keep the live application's connection path unchanged during a rehearsal.

## Owners and response targets

- Primary technical release/database owner and stop authority: Brenden Bruner, accepted July 20, 2026.
- Backup technical owner: **REQUIRED — no second human has accepted this role.** Codex is not an owner.
- P0 technical incident target: acknowledge within 15 minutes; stop the affected rollout or module immediately; decide rollback versus restore within 30 minutes; begin the approved recovery path within 60 minutes.
- P1 technical incident target: acknowledge within 30 minutes; establish an owned recovery plan within 60 minutes.
- Recovery planning target: database RPO 24 hours under the current daily Supabase backup tier; Storage RPO 24 hours after the nightly archive is operating; combined service RTO 4 hours.
- Until the off-platform Storage archive is operating and monitored, actual Storage RPO is unbounded and deleted objects remain unrecoverable. The 4-hour combined RTO is a target, not a current production guarantee.

## Storage backup method

Run the exporter from a restricted administrative runner with a server-only key and encrypted, access-restricted temporary storage. Treat the logical database dump and object archive as sensitive production data until the verified vault copy is complete; remove temporary copies under the recorded retention procedure. Never place a service-role key in a browser, repository, archive, console transcript, or evidence packet.

1. At least nightly, after the normal database backup window, export every private application bucket:

   ```powershell
   $env:SUPABASE_STORAGE_URL='https://<project-ref>.supabase.co'
   $env:SUPABASE_STORAGE_ADMIN_KEY='<server-only-key>'
   npm run storage:backup -- --output <new-empty-archive-directory>
   npm run storage:verify -- --input <archive-directory>
   ```

2. The exporter enumerates each object through the Storage API, downloads its bytes, calculates SHA-256, stores bytes under a hash-addressed path, and writes a versioned manifest containing private-bucket configuration, object path, size, content type, and hash. It refuses public buckets, unsafe paths, duplicate object identities, mismatched totals, and non-empty output directories.
3. Move the complete archive to a company-approved backup vault that is off-platform from Supabase, encrypted at rest and in transit, access-logged, versioned or immutable, and unavailable to the application runtime. Record the destination owner, access-recovery procedure, and successful transfer/verification result without exposing child, family, staff, or payment data.
4. Target retention is 35 daily archives and 12 month-end archives, subject to the approved legal retention and deletion policy. A legal hold overrides normal deletion only when counsel or the privacy owner records it.
5. Alert the primary and backup technical owners when export, verification, transfer, retention, or scheduled execution fails. A backup is not successful until the destination copy verifies.

The following narrower command exports one approved bucket or prefix during a drill:

```powershell
npm run storage:backup -- --output <new-empty-archive-directory> --bucket <bucket-id> --prefix <optional-prefix>
```

## Storage restore method

Always restore into an isolated target first. Do not modify `storage.objects`, `storage.buckets`, or another Storage schema table directly.

The current production database has an active `stripe-sync-worker` `pg_cron` job scheduled every minute and `pg_net` enabled. Supabase's binary "Restore to a new project" copies database jobs that can run immediately, Auth records, and the encryption root key. It is therefore not the chosen rehearsal path while external effects cannot be stopped before clone startup. Use a reviewed logical export/restore into an isolated target, with outbound jobs and production integration credentials withheld throughout. Preserve source-to-target access isolation.

**A data-only import into a fully migrated target is not trigger-safe by default.** The existing `BEE Suite Recovery Lab` (`hptrlvbciwkceqifjnbt`) already has application triggers: the `Center` agency-reconciliation guard can reject historical rows with an enabled state, and the `Notification` web-push trigger can create extra delivery rows during import. Before importing data, use a reviewed restore order that installs application triggers only after loading and reconciling data, or a transaction-scoped trigger-suppression procedure that is proven to work with the target's privileges. Re-enable normal trigger behavior after the load, then explicitly validate foreign keys, row counts, hashes, financial and audit invariants, and any rows that bypassed trigger checks. Suppressing triggers also suppresses foreign-key enforcement during the load; do not assume that an already-valid constraint flag retroactively checks imported rows. Roll back or discard the isolated attempt on any mismatch. Do not enable outbound provider credentials while validating.

**Keep Storage metadata and object bytes in one reviewed restore order.** Retain the source `storage.buckets` and `storage.objects` records as encrypted comparison evidence, but exclude or defer those rows (and dependent Storage-owned rows) when loading the database into the rehearsal target. This restore tool creates private buckets and uploads objects through the Storage API; if bucket/object rows are already present, its collision check correctly refuses the upload even though the object bodies may be missing. Restore the database's application and Auth records first, then restore Storage through the API and compare the resulting bucket/object metadata with the source snapshot. Record every difference, including owner and timestamps; if a required field or access behavior cannot be recovered through a supported API path, the full-equivalence drill fails and needs a revised recovery procedure. Never repair the gap by directly editing Storage schema tables.

Recovery Lab's schema differs from production in one column default and 21 tables' indexes, and its migration service assigned new version timestamps to the 49 applied files. Reconcile schema and both Supabase/Prisma migration ledgers in the restore plan. Include the Supabase `auth` schema in the encrypted source export, but restore durable users, identities, MFA factors, and other required account records separately from transient sessions, refresh tokens, one-time recovery tokens, and challenges. Exclude transient Auth records from the target load or revoke them through a reviewed provider-supported procedure before any production re-entry; application tables alone cannot recover sign-in, while old tokens can resurrect access lost after the snapshot. Review Auth configuration, MFA/provider dependencies, JWT signing and session behavior, and any Vault/column-encryption key requirements separately because a logical database copy does not automatically transfer project configuration or root keys. Do not copy production signing or provider secrets into a rehearsal target merely to preserve existing sessions. Do not treat schema-only migration success as restored-data evidence.

1. For an actual incident, stop affected writes and external side effects under the named stop authority and preserve request, deployment, audit, and backup identifiers. For a rehearsal, keep production serving traffic and block external side effects only in the isolated target.
2. Select the approved database restore point and the closest successful Storage archive at or before it. Record the expected RPO and any writes requiring reconciliation.
3. Restore or reconstruct the database in an isolated target, including durable Auth records and application data while excluding or deferring Storage bucket/object metadata and transient Auth tokens as described above. Disable email, SMS, push, webhooks, cron jobs, billing, payments, payouts, and production integration credentials.
4. Verify the Storage archive before upload:

   ```powershell
   npm run storage:verify -- --input <archive-directory>
   ```

5. Preview the restore through the Storage API with a target-only server credential:

   ```powershell
   $env:SUPABASE_RESTORE_URL='https://<isolated-project-ref>.supabase.co'
   $env:SUPABASE_RESTORE_ADMIN_KEY='<isolated-server-only-key>'
   npm run storage:restore -- --input <archive-directory> --target-project <isolated-project-ref>
   ```

   The default is read-only. The URL must match the explicit project reference; the source project and known production project are rejected. If reviewed private buckets already exist, add `--allow-existing-buckets`. All selected buckets are checked for public access and object collisions before the first write. Review the returned counts, source, target and fingerprint, then apply that exact plan:

   ```powershell
   npm run storage:restore -- --input <archive-directory> --target-project <isolated-project-ref> --apply --expected-plan <reviewed-fingerprint>
   ```

   Repeat `--allow-existing-buckets` on apply if it was used for preview. Changed archive or target state invalidates the fingerprint. Existing objects are never overwritten. Runtime failures or concurrent changes can still interrupt a restore; retain the result for investigation and use a fresh isolated target rather than overwriting or deleting partial evidence. Production re-entry is a separately controlled recovery operation, not an override flag on this rehearsal tool.
6. Reconcile database object references to the manifest and compare source Storage metadata with the API-created target metadata. Verify representative tenant/center/family/child relationships, object counts, sizes and SHA-256 values, private bucket settings, short-lived signed access, and denial of direct unauthenticated access. Compare source and target Auth users and identities by their internal stable IDs without exposing password hashes. Separately perform a complete bidirectional reconciliation of normalized emails between Auth users and Prisma `User` records expected to sign in; account for inactive, invitation-only, and other intentionally excluded records, and check scoped grants for every matched active user. The application login resolves the Prisma record by email, not by a stored Auth user ID. Use an isolated app deployment connected only to the restored target, with no production alias or outbound provider credentials, to prove an approved test account can authenticate through target Auth and resolve to the intended application user and school while another school's data stays denied. Verify snapshot-era Supabase sessions require re-authentication under the target's signing configuration. A complete row count without a working login or required Storage metadata is a failed recovery drill.
7. Before any **production re-entry**, reconcile credentials and access changes made after the selected snapshot against independent, current evidence. An older Auth password hash can reinstate a password rotated after compromise even when all sessions are revoked. Replay verified post-snapshot password, MFA, identity, disabled-account, and grant changes through a provider-supported controlled procedure; if the complete credential-change history cannot be established, block sign-in until every restored Auth password is force-reset through the approved recovery process. Reconcile application-native kiosk credentials too: restored guardian `checkInPinHash` and `checkInPinSetAt` can revive an old PIN and its QR token, and staff kiosk PIN hashes in `StaffProfile.customFields` can revive an old staff code. Replay verified post-snapshot PIN rotations and revocations, or keep kiosk check-in/out disabled until affected guardian and staff PINs and QR tokens are reset under the separately approved PIN/access gate. Verify an approved test account's old password and rotated test PIN/QR token are rejected before permitting those flows. Do not send reset messages or change real identities or PINs during a rehearsal.
8. Invalidate application sessions restored from the older database snapshot. The `bee_suite_session` cookie is signed with the application's `AUTH_SECRET` and checked against Prisma `User.sessionVersion` and `DeviceSession`; a Supabase JWT change alone does not revoke it. Under the named stop authority, review and execute a tracked target-only transaction that increments every restored user's session version and revokes every still-active restored device session without overwriting earlier revocation history. Independently verify that no snapshot-era Supabase session, refresh token, recovery token, or challenge is usable, and reconcile Auth as well as application access revocations made after the restore point. Reconcile application-issued setup, invitation, and payment-method links against later issued, used, and revoked evidence; invalidate restored links that cannot be proven current, preserving their history and routing any reissue through its own approval gate. Verify a pre-restore app cookie and old refresh, recovery, and setup tokens are denied, while a fresh approved login works with the intended grants. If credential, token, session, or access reconciliation cannot be proven, keep the restored target isolated.
9. Before reconnecting production providers, cron schedules, or webhooks, inventory every restored scheduled or pending outbound item, including campaigns, email/SMS, web push, integration deliveries, and payment-related jobs. Compare each item with post-snapshot provider receipts, current delivery state, and application audit history. Record an exact-item cancel, suppress, or replay decision with the owner; preserve delivery and financial history and require the separate real-send or money approval gate for any replay. Verify that items completed after the restore point cannot dispatch a second time and that approved pending items retain their intended recipients and idempotency keys. If a queue cannot be reconciled, keep its worker and provider credentials disabled; do not infer that a restored `pending` or `scheduled` status means the action never happened.
10. Record achieved RPO/RTO, exceptions, missing writes, reconciliation ownership, and technical review. Under the approved retention plan, destroy the disposable target or clear the restored rehearsal data from a retained lab and verify that no production Auth users, application records, or object bytes remain. Production re-entry requires the named human stop authority.

## Completed bounded drill

The July 20 packet at `docs/SECURITY_DATABASE_STORAGE_RESTORE_EVIDENCE_PACKET.md` records a no-production-data logical database-and-Storage drill. It restored one synthetic tenant-to-child relationship graph and one private child-media object, preserved the logical record hash and object SHA-256, passed signed/private access checks, and destroyed the paid branch and local synthetic archive.

That drill validates the archive format and representative record/object recovery path. It does not certify a full physical database snapshot, a production off-platform archive, every object class, a migration-ready replacement environment, or the wider-school E7 gate.
