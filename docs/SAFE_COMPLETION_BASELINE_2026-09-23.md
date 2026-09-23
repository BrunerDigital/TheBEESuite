# Live web preservation and recovery baseline — September 23, 2026

## Contract

The web app is actively used. Completion work must preserve continuous availability, existing features and workflows, identities and access, records, billing history, messages, integrations, and shared web/mobile backend compatibility. Intentional behavior changes require explicit authorization. Develop and validate in isolation; do not run rehearsal restores or test financial/messaging actions against production.

## Fresh read-only evidence

- Remote main: `e59688ee5156ff37670dcbbb05bd1495c0187da4`. No open GitHub PRs at inspection.
- Canonical Vercel deployment: `dpl_3YmnfXYWHLuL39gtYERoPWoErjsb`, READY, matching remote main. Apex, www, beta, project and main-branch aliases are attached.
- Health at `2026-09-23T11:00:59.686Z`: `ok: true`, database connected.
- `/login`, `/parents`, `/teachers`, `/support`, `/privacy`, `/terms`, `/eula`, `/mobile-apps`: HTTP 200. These public checks do not certify authenticated workflows.
- GitHub validate, three CodeQL checks and Supabase Preview check: success for this commit. A successful preview check does not prove environment isolation.
- Supabase production reports ACTIVE_HEALTHY. Accessible inventory has four projects; none is designated BEE Suite staging. BEE Suite branch inventory contains only main.
- Static operations check: nine cron paths match handlers; 46 Prisma migrations have ledger mirrors; 49 Supabase migrations deployable. This does not prove live cron execution or backup recoverability.
- Shared checkout is three commits behind remote main and has an unrelated `.codex/config.toml` modification. It was preserved. This report is prepared in a separate current-main worktree.

## Runtime findings that remain open

The last-24-hour HTTP 5xx query on the current deployment returned two POST `/api/billing/family-payment` requests with HTTP 502 (September 22, 21:48:29 and 23:23:18 UTC). A subsequent read-only payment query found FAILED Checkout records matching both times, each with Stripe HTTP 400 and the instant-bank method. Twelve failed bank Checkout records were found since September 22, including ACH. The route also has a connected-account lookup 502 path, but the matching records instead support the shared payment service's Checkout-rejection path. The precise provider rejection text was not retained in those records. No payment was retried or changed. Financial reconciliation requires exact current evidence.

The error-cluster query returned recovery-token verification failures, password-update rejections with provider status 422, and terminal web-push delivery rejections with status 400. Cluster first-seen dates predate the query window; do not interpret their displayed counts as a precise new-incident count. The token-verification path logs without a status but returns HTTP 400, so the cluster's 500 classification does not itself prove a server HTTP 500. The provider cause of the password-update rejection is unknown. No identity reset or message retry was performed.

## Staging implementation specification

1. Confirm the Supabase organization, obtain its actual project/branch price, and approve the concrete cost before provisioning. Do not repurpose an unrelated existing project.
2. Provision a persistent isolated database/Auth/Storage target with no production data. Validate migrations in that target before attaching any application deployment.
3. Use separate target-only credentials and an access-restricted staging application. Verify both public Auth endpoint and server database/Storage endpoints resolve to the isolated target. Reject production project references.
4. Use synthetic school, family, teacher and billing fixtures. Withhold live Stripe, SendGrid, Twilio, push and integration credentials. Disable scheduled jobs and outbound delivery; use mocks or provider sandboxes as appropriate.
5. Exercise role isolation, login/recovery, uploads, documents, attendance, messages and payment presentation against synthetic fixtures. Confirm that no request reaches production data or live transactional providers.
6. Keep production aliases, credentials, jobs and traffic unchanged. Do not migrate development/preview settings until the isolated target is verified and the exact configuration diff is reviewable.

## Backup and restore implementation specification

The existing recovery runbook proposes 35 daily and 12 month-end archives, a 24-hour recovery-point target and a four-hour recovery-time target. These are proposed operational objectives, not achieved production guarantees.

1. Select an approved private off-platform destination and runner. Record primary/backup human owners, region, expected cost, encryption/key recovery, versioning or immutability, retention and failure-alert recipient. Do not copy production records into an unapproved destination.
2. Pair database backups with independently exported private Storage object bytes and manifests. Provider database backups alone do not restore uploaded-file bytes. Refresh provider backup inventory before choosing a recovery window; September 17 backup observations are historical.
3. Run exports with restricted server-only credentials, bounded concurrency, and production load monitoring. Verify the destination copy and manifest hashes; a local archive or successful upload alone is insufficient.
4. Schedule only after a verified manual run. Alert on missed schedules and export, verification, transfer or retention failures. Record a verified destination restore point, not merely job success.
5. Rehearse database plus Storage recovery into an explicitly selected isolated target with outbound effects disabled. Begin with synthetic fixtures; any use of production records requires a reviewed sensitive-data scope and access controls.
6. Validate relationships, balances/history, audit records, document/media bytes, private access and school/family isolation. Record measured recovery time and data-loss window, exceptions and approval. Never redirect production to the drill target as part of this work.

## Status

Focused validation on the exact source baseline: 15/15 tests passed across `storage-restore-plan`, `storage-recovery-archive`, `storage-recovery-cli` and `deployment-ops-check`. The executable CLI test uses a simulated provider and synthetic bytes; it is not a live backup or restore.

Follow-up patch preserves recovery HTTP responses and payment submission behavior while carrying provider status into recovery diagnostics and logging fixed, allowlisted Checkout failure categories/parameter names/types. No provider message, submitted value, customer/account identity, token, password, or redirect URL is added to logs. Unknown provider labels are replaced with `unclassified`. The new evidence does not certify the historical bank Checkout failures as fixed.

Subsequent user decisions: use BrunerDigital's paid organization, accept staging cost when needed, and release routine compatible fixes through isolated validation directly to production. Reserve staging for substantial additions/changes and isolated recovery drills. Do not require a staging deployment for this diagnostic patch.

Baseline inspection complete with the exceptions above. Staging provisioning, operational off-platform backups, a full restore rehearsal, authenticated production regression evidence and incident closure remain outstanding. No production deployment, configuration, access, data, payment or communication mutation was made.
