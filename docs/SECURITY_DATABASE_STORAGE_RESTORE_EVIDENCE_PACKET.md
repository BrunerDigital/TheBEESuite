# Database And Storage Restore Evidence Packet

Status: **PASS for the bounded synthetic logical-record plus child-media drill.** This is not a full production snapshot restore, operational off-platform backup proof, or wider-school E7 signoff.

## Authorization and scope

- Accountable owner: Brenden Bruner, primary technical release/database owner and stop authority.
- Backup technical owner: not accepted; remains a human readiness blocker.
- Technical operator: Codex, acting under Brenden's July 20 request to fix the Storage recovery method and run the database-plus-Storage drill.
- Source environment: no-production-data Supabase development branch `restore-drill-20260720`, project ref `fvhkwdnriucegnmqkmfa`.
- Isolated restore target: the same disposable branch after explicit deletion of the synthetic source rows and object.
- Window: branch created `2026-07-20T21:08:51Z`; archive manifest created `2026-07-20T21:17:07.266Z`; final verification `2026-07-20T21:18:25.564Z`; branch deleted immediately afterward.
- Database backup type: deterministic logical synthetic fixture covering Tenant, Organization, Center, Family, Child, and ChildMedia.
- Storage backup identifier: schema-v1 manifest created `2026-07-20T21:17:07.266Z`, one private bucket, one object, 68 bytes.
- Storage retention for drill: transient local hash-addressed archive; integrity verified before restore and archive deleted after evidence capture.
- Target RPO/RTO: 24-hour database and Storage RPO after the nightly off-platform archive is activated; 4-hour combined RTO. Current database tier has daily restore points and no PITR. Production Storage RPO remains unbounded until the off-platform destination and schedule are operating.
- Achieved drill RPO/RTO: zero synthetic fixture loss; less than 79 seconds from archive-manifest creation through destructive deletion, database and object restore, and final verification.
- Data minimization/destruction: only invented names/IDs and a 1x1 PNG; no production row or object was copied; branch ID `f8118563-7742-431e-ad3b-87df35d7bc9b` and local archive were deleted.

## Pre-restore controls

| Control | Expected | Result | Evidence reference | Owner |
| --- | --- | --- | --- | --- |
| Target is isolated from production | No shared writable database or Storage target | PASS — Supabase branch had no production data | Branch `f8118563-7742-431e-ad3b-87df35d7bc9b` | Brenden / Codex execution |
| Outbound communications disabled | No email, SMS, push, webhooks, or campaigns | PASS — no application deployment or communication credential was attached | Drill command record | Brenden |
| Billing disabled | No live Stripe calls, autopay, invoices, refunds, or payouts | PASS — synthetic SQL and Storage API only | Drill command record | Brenden |
| Scheduled jobs disabled | No billing, dunning, reminders, or integration retries | PASS — no Vercel application or cron target was attached | Drill command record | Brenden |
| Access restricted | Only named drill operators can access restored data | PASS — temporary branch and prefix-scoped drill policy; target destroyed | Branch/policy record | Brenden |
| Sensitive evidence sanitized | No credentials or real child/family/payment/medical data | PASS — synthetic IDs, hashes, counts, and status codes only | This packet | Codex |

## Database restore evidence

The source graph contained exactly one row in each of Tenant, Organization, Center, Family, Child, and ChildMedia. All six records and the Storage object were deleted before restore; post-delete counts were zero. The records were restored in referential order.

| Domain | Expected | Actual | Result |
| --- | --- | --- | --- |
| Tenant/center | Tenant → organization → center preserved | Relationship validation `true` | PASS |
| Family/child/media | Center → family → child → media preserved | Relationship validation `true` | PASS |
| Logical fixture integrity | Pre/post canonical hash identical | `8d67d8f3b8ef501386b575094402eac3` before and after | PASS |
| Storage metadata reference | One ChildMedia record and one matching object row | `storage_metadata_rows: 1` | PASS |
| Custody/medical, attendance/incidents, billing/ledger, audit/privacy request domains | Outside bounded synthetic drill | Not exercised | NOT CERTIFIED |

## Storage-object restore evidence

Supabase database backups contain Storage metadata, not deleted object bodies. The object was recovered from the separate archive through the Storage API; no Storage schema row was manually restored.

| Object class | Private bucket | Metadata reconciles | Signed access | Direct unauthenticated access | Integrity | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Child media synthetic PNG | `public: false` | One row and one file | HTTP `200` | Private and public-form URLs both HTTP `400` | 68 bytes; SHA-256 `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460` before/after | PASS |
| Family/staff documents and signed forms/incidents | Not exercised | Not exercised | Not exercised | Not exercised | Not exercised | NOT CERTIFIED |

## Recovery and isolation validation

- Archive verification: manifest v1, one private bucket, one object, 68 bytes; file size and SHA-256 passed.
- Database relationship result: `true`; pre/post logical hash identical.
- Signed-URL result: short-lived signed request returned `200`; direct unauthenticated object requests returned `400`.
- Production impact: none. Production database, Storage policies, buckets, objects, credentials, and application deployment were not changed.
- Cleanup: Supabase branch deletion returned `success: true`; a subsequent branch inventory no longer contained the branch; local synthetic archive existence returned `false`.
- Exception: the disposable preview reported `MIGRATIONS_FAILED` even though it was `ACTIVE_HEALTHY` and contained the required application and Storage schemas. The normal migration tool returned an internal error for the temporary policies, so tightly prefix-scoped drill-only policies were created with SQL on the disposable branch. This exception prevents treating the drill as a full migration-ready replacement-environment certification.
- Technical decision: PASS for the bounded logical database plus private child-media recovery method; NOT SUFFICIENT for full E7, production backup operation, or wider-school activation.
- Brenden authorization: July 20, 2026 request to complete these readiness items. Separate human acceptance is still required for the backup technical owner and approved off-platform destination.

Any missing Storage object, cross-school exposure, live external side effect, unreconciled ledger entry, or failed audit-history recovery remains a **BLOCKER** for a full recovery certification.
