# Integrated candidate validation — October 6, 2026

Coordinator branch: `rollout/coordinator-20260928`. Source candidate `b19d3e0f33f13e8fb1476a4dd17a2e0bae731e59`; report-only billing count correction `6aa88430` followed. Base production/main `9b50b470c1fff93751356147ee207cc3c5fe18a3`. No release PR or production deployment had occurred at this checkpoint.

The coordinator bridge ran `npm run vercel-build` to completion in the integrated checkout, exit 0: Prisma Client 6.19.3 generated, ESLint and TypeScript passed, `npm test` passed 2,649/2,649, Next.js 16.3.8 compiled and generated 180 static pages. The documentation-only count correction was cherry-picked while this run was underway; it did not alter application source or tests. `git diff --check` passed after integration.

Focused validation in the same checkout: 100/100 TypeScript access/billing/ops/mobile tests passed. The two `.mjs` cron route suites required Node's `--experimental-test-module-mocks` option and then passed 3/3 checks, including a mocked two-invoice same-school path. This is not a PostgreSQL concurrency test.

Two local invocations are diagnostic, not application failures: (1) the first `node --import tsx --test` command omitted the module-mocks flag and could not initialize the `.mjs` mocks; (2) the first sandbox `npm run vercel-build` passed 2,647 tests but was denied temporary Git config and hard-link writes; a later duplicate full build encountered an `EPERM` Prisma DLL rename while the coordinator bridge's full run was active. The serially completed bridge run passed the canonical gate. Do not run concurrent builds in this worktree.

Remaining release gates: push this candidate, protected PR checks and review, exact production SHA/rollback recheck, intended merge SHA Ready on all aliases, canonical health, relevant runtime/cron/webhook logs, and safe changed-flow evidence. Authenticated positive school checks need designated existing sessions; do not create identities, send invitations or invoke a live billing run for smoke testing.
