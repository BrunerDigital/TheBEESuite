# Supabase Database And Storage Recovery Runbook

Status: implemented recovery tooling and bounded synthetic drill completed July 20, 2026. Production Storage backups are **not operational** until an approved encrypted, versioned off-platform destination and schedule runner are recorded.

Supabase database backups include Storage metadata, not the object bodies. Recovering The BEE Suite therefore requires a database restore point and a separately retained Storage archive from the same recovery window.

## Owners and response targets

- Primary technical release/database owner and stop authority: Brenden Bruner, accepted July 20, 2026.
- Backup technical owner: **REQUIRED — no second human has accepted this role.** Codex is not an owner.
- P0 technical incident target: acknowledge within 15 minutes; stop the affected rollout or module immediately; decide rollback versus restore within 30 minutes; begin the approved recovery path within 60 minutes.
- P1 technical incident target: acknowledge within 30 minutes; establish an owned recovery plan within 60 minutes.
- Recovery planning target: database RPO 24 hours under the current daily Supabase backup tier; Storage RPO 24 hours after the nightly archive is operating; combined service RTO 4 hours.
- Until the off-platform Storage archive is operating and monitored, actual Storage RPO is unbounded and deleted objects remain unrecoverable. The 4-hour combined RTO is a target, not a current production guarantee.

## Storage backup method

Run the exporter from a restricted administrative runner with a server-only key. Never place a service-role key in a browser, repository, archive, console transcript, or evidence packet.

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

1. Stop affected writes and external side effects. Preserve request, deployment, audit, and backup identifiers.
2. Select the approved database restore point and the closest successful Storage archive at or before it. Record the expected RPO and any writes requiring reconciliation.
3. Restore or reconstruct the database in an isolated target. Disable email, SMS, push, webhooks, cron jobs, billing, payments, payouts, and production integration credentials.
4. Verify the Storage archive before upload:

   ```powershell
   npm run storage:verify -- --input <archive-directory>
   ```

5. Restore through the Storage API with a target-only server credential:

   ```powershell
   $env:SUPABASE_RESTORE_URL='https://<isolated-project-ref>.supabase.co'
   $env:SUPABASE_RESTORE_ADMIN_KEY='<isolated-server-only-key>'
   npm run storage:restore -- --input <archive-directory>
   ```

   If reviewed private buckets already exist, add `--allow-existing-buckets`. Existing objects are never overwritten; an object collision stops the restore for investigation.
6. Reconcile database object references to the manifest. Verify representative tenant/center/family/child relationships, object counts, sizes and SHA-256 values, private bucket settings, short-lived signed access, and denial of direct unauthenticated access.
7. Record achieved RPO/RTO, exceptions, missing writes, reconciliation ownership, technical review, and destruction of the isolated target. Production re-entry requires the named human stop authority.

## Completed bounded drill

The July 20 packet at `docs/SECURITY_DATABASE_STORAGE_RESTORE_EVIDENCE_PACKET.md` records a no-production-data logical database-and-Storage drill. It restored one synthetic tenant-to-child relationship graph and one private child-media object, preserved the logical record hash and object SHA-256, passed signed/private access checks, and destroyed the paid branch and local synthetic archive.

That drill validates the archive format and representative record/object recovery path. It does not certify a full physical database snapshot, a production off-platform archive, every object class, a migration-ready replacement environment, or the wider-school E7 gate.
