# Portal response-time repair — approval required

Status: LOCAL PREPARATION ONLY. Do not push this branch, trigger its Vercel preview, merge, or deploy before Brenden confirms the provider-region change below. A push creates a deployment through the existing integration. No provider setting has been changed by this preparation.

## Current verified state

Inspected September 11, 2026. Source baseline: `586ce1bf3fb6dba80ba3620459c321e9ede29f19` (UI PR #343, merged and live).

- Vercel project: `the-bee-suite`, `prj_7hJhGdgUtCmonOXuOudqm7D48dmz`, owner `team_h6ZwzwfpcrqR0oglI4xFdnaM`.
- Current Ready production: `dpl_Bcgn64J1XasvzuPZZghyWFhLLRxH`, `https://the-bee-suite-fi9ub57a2-brunerdigital.vercel.app`; deployment API reports runtime region `iad1` (Virginia).
- Canonical application: `https://thebeesuite.io`; `www.thebeesuite.io` redirects to the canonical host.
- Supabase project: `TheBEESuite`, `nqjrlktoewiueiwrubas`, `ACTIVE_HEALTHY`, region `us-west-1` (Northern California). No database move, replica, migration, credentials or provider connection change is proposed.
- On approved parent/teacher accounts, two browser samples each show HTML response completion around 21.2 seconds / 17.1–17.5 seconds. Initial paint occurs in 0.16–0.36 seconds, while the route is still loading. Public JavaScript downloads are below 300 ms. HTTP cache was disabled by the mutation-blocking browser harness; these are not warm-cache or native-device benchmarks.
- A separate Windows-host Prisma probe uses an explicitly read-only transaction. Two samples show ~169 ms per SELECT, 32 sequential queries (~5.46 s) for the parent safety scope and 41 (~7.00 s) for the teacher safety scope. No storage-backed user/child profile photos are present in those approved fixtures. This measures Windows-to-database latency, not an instrumented Vercel SQL trace.

The verified cross-region placement plus query amplification makes colocating functions the smallest first repair. It is an evidence-backed hypothesis; the precise production improvement remains unverified until deployment. Do not remove safety checks, change financial transactions, add cross-request authorization caches, or enable preview ORM behavior to hide the delay.

## Exact approval request

- **Who:** Brenden authorizes; Codex executes the protected release.
- **Action and target:** Publish `"regions": ["sfo1"]` in this repository's `vercel.json` for the existing Vercel `the-bee-suite` project. This changes the default runtime location for its server functions, including API routes and scheduled handlers, from `iad1` to `sfo1` in preview and the next production deployment. It does not manually invoke scheduled handlers or change their schedules.
- **Why / expected effect:** Place server execution beside the existing database and reduce repeated cross-country database round trips. Preserve the global static CDN and all application, identity, tenant, billing and messaging behavior.
- **Cost:** No new project, database, service or plan upgrade. Regional unit rates differ: current published Fluid rates are CPU $0.177/hour and memory $0.0147/GB-hour for `sfo1`, versus $0.128 and $0.0106 for `iad1` (about 38% higher per unit). Shorter database waits may reduce provisioned-memory time; total cost improvement is not guaranteed. Other regional resource rates also differ. Recheck current pricing before publishing if this approval is delayed.
- **Recovery:** Before release, reverify the healthy incumbent deployment. If the candidate regresses, use Vercel's production rollback to that exact healthy incumbent (currently the deployment above), then revert the region commit through a protected PR. No database rollback is needed. Do not blindly restore a stale deployment if unrelated production work has landed meanwhile.
- **If deferred:** The released UI fixes remain live; the measured portal loading delay is still open. This branch stays local and no hosting configuration is published.
- **Proof of completion:** Protected CI and review pass; exact merge commit is Ready; deployment reports `sfo1`; canonical aliases, health and error logs pass; approved parent/teacher flows remain functional; repeat timing samples improve materially. Check approved director/executive sessions when available without resetting identities.
- **Can Codex resume immediately after approval?** Yes. Existing provider access is available. No password, API key, certificate or verification code is needed in chat.

## Prepared change and validation

Branch `work/portal-region-readiness-20260911` is isolated from current `origin/main`. The runtime change is one JSON property; application source, schema, dependencies, permissions, cron paths/schedules and integrations are unchanged. Regression coverage requires the colocated region and rejects conflicting/deprecated Next route overrides. Next 16.3.4's installed documentation marks `preferredRegion` deprecated, so the deployment setting is used instead.

- Fresh `npm ci --no-audit --no-fund`: passed, with no lockfile/dependency changes.
- Focused deployment-region, deployment-operations and project-link tests: 10 passed, 0 failed.
- `npm run vercel-build`: passed Prisma generation, lint, typecheck, all 1,896 tests (0 failures/skips), optimized compilation and static generation. Log: local `output/playwright/ui-focus-recovery-20260911/region-preparation-build.log` in the main checkout.
- `npm run mobile:store:check`: parent/teacher static checks passed. No new simulator/device/archive/signing evidence.
- `git diff --check`: passed. Application source, schema and dependency diff is empty.
- The live official Vercel `regions` property's JSON subschema accepts the prepared value. Whole-schema validation with the installed validator could not run because the current upstream schema declares draft-04 but uses a newer `exclusiveMinimum` form in unrelated experimental trigger definitions. No validation rules or upstream schema were relaxed; full provider acceptance remains for the approval-gated preview.
- Local environment provenance was compared privately: both API and database target the exact Supabase project above; the runtime pooler is `us-west-1`. No credential values were printed.

No preview, protected CI, production region change or post-change performance verification has been performed. The commit remains local until exact approval.

## Official references checked

- [Vercel function region configuration](https://vercel.com/docs/functions/configuring-functions/region)
- [Vercel region mapping: sfo1 / us-west-1](https://vercel.com/docs/regions)
- [Fluid compute regional pricing](https://vercel.com/docs/functions/usage-and-pricing)
- [San Francisco regional pricing](https://vercel.com/docs/pricing/regional-pricing/sfo1)
- [Supabase changelog](https://supabase.com/changelog)

Private local timing artifacts contain only timings, counts and public asset names; credentials, SQL parameters, actual records and signed URLs were not logged. Printable fake-data UI captures remain valid because this prepared change does not alter rendering.
