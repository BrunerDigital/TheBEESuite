# Disposable PostgreSQL tuition verification

The October 7 Mac run used PostgreSQL 18.3 in a separate cluster bound to loopback port 55437. Production runs PostgreSQL 17.6: this is bounded real-database concurrency evidence, not exhaustive production equivalence. The actual current tuition route, Prisma queries, locks, invoice helper, ledger and balance writes run against synthetic local records. Only the Next request-context logging wrapper is replaced. No production environment file is loaded. Autopay is suppressed and no provider request is made.

Start a disposable cluster with `initdb` and `pg_ctl`, bound to `127.0.0.1` on an unused non-default port. Create a fresh empty database named `bee_tuition_rehearsal_<suffix>`. Apply `prisma db push --skip-generate` only with an explicit local `DATABASE_URL` for that disposable database. Never use a production URL or the existing user PostgreSQL service. Retain failed fixtures and use a fresh database on rerun.

```sh
TUITION_REHEARSAL_DATABASE_URL=postgresql://local_user@127.0.0.1:55437/bee_tuition_rehearsal_fresh \
TUITION_REHEARSAL_CONFIRM=synthetic-disposable-local \
TUITION_REHEARSAL_SOURCE_COMMIT="$(git rev-parse HEAD)" \
node --import tsx --experimental-test-module-mocks scripts/rehearse-tuition-cron-postgres.mjs
```

The runner rejects remote hosts, port 5432, ordinary database names, missing disposable confirmation and nonempty tenant data. It verifies:

- Dry run reports true, zero created, zero cents and no invoices; persisted invoice count stays zero.
- Two concurrent cron requests covering two families at one school create exactly two invoices, two tuition ledger entries and the expected family balances; neither request fails.
- Missing biweekly and four-week anchors create no invoices and report a configuration review failure.
- Committed school pause, family transfer and child withdrawal each race the actual invoicing transaction. The harness first observes the cron blocked on the relevant PostgreSQL row lock, then commits the competing change. No invoice is created.

Evidence is written to `output/audit/tuition-postgres-rehearsal.json`. Fixture databases remain recoverable in their disposable cluster. Stop only the cluster you created when finished. The production dry-run check is separate and requires the existing approved cron bearer credential. October 7 Mac access returned 401; Vercel lists the secret as sensitive and does not return its plaintext. Do not rotate it or treat redaction as a missing secret.
