# Supabase error repair - October 14, 2026

Target: TheBEESuite, project nqjrlktoewiueiwrubas, stripe-worker version 9.

## Observed cause

The last 24-hour log window contained 1,519 Postgres P0001 errors from stripe.check_rate_limit and four edge-worker CPU-budget failures. The throwing rate limiter was polled every 20-50 ms by ten workers. The worker omitted the chunk-planning argument, inheriting a default of 100 and creating 201 chunks per time-filtered object even for tables with only a few records. The latest weekly run eventually completed at 11:18 UTC with all 1,418 chunks complete.

Six undefined-column errors came from one-off MCP management queries, not application code. Schema inspection must precede ad hoc SQL; Guardian/Child use fullName, BillingAccount uses balanceCents, Center uses status, and Classroom uses ratioRule. Rejected external PostgreSQL/TLS connections and invalid user passwords must not be "fixed" by weakening authentication.

The public health endpoint returned ok=true/database=connected. Supabase advisors reported INFO items only, with no security ERROR or WARNING. Do not grant browser table access or remove indexes simply to clear INFO notices.

## Scoped fix

scripts/patch-supabase-stripe-worker.mjs applies a hash-checked patch to the exact deployed bundle. It replaces exception-based polling with an atomic conditional upsert on the existing private rate-limit table. Denied permits return zero rows and sleep one second; database failures still propagate. PostgreSQL row locking preserves the shared request budget across instances.

The worker uses at most two workers and four pages per worker per invocation, pages of 25 objects, and passes workerCount to chunk planning. It awaits worker shutdown before reporting totals, preserving cursor checkpointing.

No schema migration, Auth change, provider-credential change, cron change, charge, refund, or message send is part of this repair. The Stripe webhook and application payment handlers are unchanged.

## Recovery and validation

Original and patched bundles are retained in ignored outputs/supabase-errors-20261014/stripe-worker-v9.js and stripe-worker-v10.js. The source hash is checked before patching; do not reapply after an upstream integration update without a fresh review.

Run node --test tests/supabase-stripe-worker-patch.test.mjs. Generate the patch with patchWorker, then run node --check on the generated bundle. The replacement SQL is validated against the real schema with EXPLAIN (without ANALYZE or mutation). Production deployment and post-deployment evidence are recorded below once complete.

The local .env.local database password fails authentication. Vercel's environment export omits sensitive database values, so it cannot safely repair that local credential. Production connectivity is working; no database password was rotated.

References: [Supabase CPU limits](https://supabase.com/docs/guides/functions/limits), [PostgreSQL conditional upsert semantics](https://www.postgresql.org/docs/17/sql-insert.html).

