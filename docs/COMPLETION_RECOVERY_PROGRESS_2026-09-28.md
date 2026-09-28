# Completion and recovery progress

September 28, 2026. This supersedes the local-access blocker in the earlier same-day checkpoint. It does not approve school activation.

## Access and canonical QA

The owner's existing dashboard session refreshed the expired CLI login through Supabase's official authorization flow. The isolated completion checkout now connects through managed `cli_login_postgres` access. Production's application password, SSL-enforcement setting, normal connection path, browser grants, school identities and access grants were preserved.

A single-connection Prisma session assumed `postgres`, set `default_transaction_read_only=on`, and passed the canonical synthetic-account preflight for all nine non-platform roles. This is local verification access, not an application runtime credential.

The canonical browser run passed 16 of 18 cases, with no unexpected writes, HTTP errors, console errors or page errors. Its two pickup cases incorrectly expected `/parent-portal?view=home` to redirect to `/parent-portal`. The route selects the restricted pickup workspace before loading the parent workspace and retains the query string. The corrected harness passed both pickup cases at 1440px and 390px. These results span the original full run and the focused corrected run. Positive Kokomo/Centennial role tests and physical-device tests remain open.

## Current school gates

The canonical Prisma readiness checker ran for Kokomo and Centennial with setup, invitations, kiosk and billing selected. Result: **BLOCKED**, covering eight school/module gates. Configuration and connectivity checks passed; local configuration presence does not establish provider activation.

Both schools have classrooms, staff profiles and director/billing grants. Neither has current children missing classroom assignments or cross-school child/classroom assignments. Both require an explicit current business-profile confirmation.

| Review evidence | Kokomo | Centennial |
| --- | --- | --- |
| Business profile | Awaiting confirmation | Awaiting confirmation |
| Guardians needing a valid invitation email | 1 | 2 |
| Guardians needing a phone with at least four digits | 1 | 4 |
| Guardians without kiosk PINs | 12 | 8 |
| Source package | No additional source-package blocker in this report | Import errors/warnings/dispositions; unconfirmed inventory; incomplete enrollment, parent, relationship and child-information report package |

These are review populations, not approved invitation or PIN populations. Do not guess contact details or certify an import from counts. Centennial's separate 14 unmatched active staff Auth identities still require classification.

## Encrypted recovery staging

PostgreSQL 18 `pg_dump` streamed directly into AES-256-GCM encrypted local staging over verified TLS with Supabase's CA. The valid database archive contains **45,618,555 encrypted bytes**, passes full GCM authentication, and has a readable PostgreSQL catalog of 1,697 lines. These establish archive integrity, not a successful restore.

The database snapshot's Storage inventory contains **632 objects / 780,477,675 metadata bytes**. It was extracted in memory and retained encrypted. Private-file export is in progress with decrypted SHA-256 and size checks. The database snapshot, final file manifest and current Storage metadata must reconcile before a matched recovery window is claimed.

Staging is limited to the Windows owner and SYSTEM. Filesystem encryption was unsupported, so payloads are explicitly encrypted before disk writes. The random archive key is protected locally through Windows DPAPI. The local encrypted envelope requires its reviewed decrypt/verification procedure; it is not a plaintext archive accepted directly by the standard Storage restore command. Company vault transfer, independent key custody, versioning/retention, scheduling, alerts and a second human recovery owner remain open. Local staging is not an operational backup vault.

Fresh schema comparison still finds one `FteReport.updatedAt` default difference and index differences on 21 tables, excluding production's Prisma migration-ledger table. `postgres` cannot set `session_replication_role` in either project. Do not use that trigger-suppression approach. Review a schema-before-data/constraints-and-triggers-after-data restore plan, durable Auth handling, transient-token exclusion, provider quarantine, supported Storage recreation and all runbook reconciliation checks. No production rows were restored into Recovery Lab.

## Remaining decisions

Company vault/account and key custodian, backup human responder, school source reviewers and business confirmations, exact school QA identity scope, delivery recipients/sender registration, hosted Stripe representatives, human MFA enrollment and physical iOS/device evidence remain open. Technical execution authorization does not supply those facts or replace human enrollment and source/legal signoffs.
