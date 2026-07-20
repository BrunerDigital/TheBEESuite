# Performance and QA Production Readiness Audit

Date: July 20, 2026  
Workstream priority: P2  
Accountable human: Brenden until explicitly delegated  
Decision: **NO-GO for the wider school wave. Kokomo may continue normal production use.**

## Production-ready definition

This workstream is production-ready only when the repository quality gate (`npm run vercel-build`) passes from the release candidate; credentialed corporate, director/billing, teacher, parent, and kiosk smoke tests pass for every selected school with tenant-isolation evidence; agreed target phones, tablets, and desktop browsers pass critical flows without clipping, dead ends, or relevant console errors; critical recovery paths are exercised; and explicit performance/load thresholds pass with retained evidence. This workstream cannot declare another domain or a school ready.

## Findings

### BLOCKER

1. **Credentialed role smoke is incomplete.** The June 5 role report records executive, director, teacher, parent, kiosk transaction, and billing transaction coverage as blocked or incomplete. The July 20 production smoke is unauthenticated and validates route behavior only.
   - Owner: Brenden until he delegates credential provisioning and per-school QA.
   - Exact retest: identify non-customer smoke accounts scoped to each selected school, then execute `docs/ROLE_SMOKE_TEST_CHECKLIST.md` for corporate, director/billing, teacher, linked parent, and kiosk; retain school, role, route, expected scope, observed scope, device, timestamp, and result.

### REQUIRED BEFORE WAVE

1. **No current target-device critical-flow evidence.** The retained responsive evidence is dated June 2 and covers only the public landing page at 1440x1200, 768x1024, and 390x900. It does not prove authenticated operational flows on real launch devices.
   - Owner: Brenden until a device-QA owner is delegated.
   - Exact retest: run selected-school critical flows on the actual director desktop/browser, classroom tablet/browser, parent iOS/Android targets, and kiosk hardware; check clipping, overlap, keyboard behavior, touch targets, rotation, scroll traps, loading, and console errors.

2. **No approved load model, thresholds, or retained load-test result exists.** Unit coverage is broad, but no script or report establishes concurrency, latency percentiles, error-rate limits, saturation behavior, or recovery for attendance, kiosk, daily reports, media, parent portal, or billing reads.
   - Owner: Brenden until a technical performance owner and school concurrency assumptions are delegated.
   - Exact retest: approve per-school and wave concurrency assumptions plus p50/p95/p99 latency and error-rate thresholds; run a non-production or explicitly authorized test-environment load plan with no real billing or customer-data mutation; retain configuration, dataset, timestamps, results, and bottlenecks.

3. **The full `npm run vercel-build` command is not yet evidenced in this checkout state.** Prisma generation failed with Windows `EPERM` while a separately owned Stripe payout-preparation process was using the Prisma engine. That process was deliberately left untouched. Independent lint, typecheck, unit tests, and `next build` passed.
   - Owner: Brenden until a release/build owner is delegated.
   - Exact retest: after the external Prisma-using process completes, confirm no workspace Next/Prisma process holds the engine and rerun `npm run vercel-build` without changing the release candidate.

4. **Recovery evidence is narrow.** The automated recovery test asserts clear connection-failure copy and retry entry points for login, parent setup, and payment-method setup. It does not exercise offline queue replay, interrupted kiosk/attendance writes, upload retry, session expiry, duplicate submission, or partial network recovery in a rendered client.
   - Owner: Brenden until a recovery-QA owner is delegated.
   - Exact retest: execute rendered failure-injection cases for each selected critical flow, verify preserved user input/idempotency/audit state, and retain screenshots plus resulting record IDs in an approved test environment.

### FOLLOW-UP

1. **Cross-browser coverage is not current.** Next.js 16.2.6 documents support for Chrome 111+, Edge 111+, Firefox 111+, and Safari 16.4+, but the current automated smoke uses Chromium only.
   - Owner: Brenden until browser support policy and QA ownership are delegated.
   - Exact retest: publish the supported-browser policy and run the selected critical flows on every supported engine/device combination.

2. **The browser-plugin evidence path was unavailable for this audit.** Chrome rejected the required named QA session because the selected window did not support grouping, so the repository Playwright smoke was used as the permitted fallback. No in-app screenshot or interaction artifact is claimed.
   - Owner: Brenden until browser tooling ownership is delegated.
   - Exact retest: rerun the public interaction and responsive checks in a Browser-compatible window, collecting page identity, meaningful DOM, framework-overlay check, console logs, interaction state, and desktop/mobile screenshots.

## Evidence completed July 20

| Check | Result | Evidence |
| --- | --- | --- |
| Unit/regression suite | PASS | `npm test`: 438 passed, 0 failed |
| TypeScript | PASS | `npm run typecheck` |
| ESLint | PASS | `npm run lint` |
| Production Next.js build | PASS | `npx next build`: compiled; 151 static pages generated |
| Full release-candidate gate | INCOMPLETE | `npm run vercel-build` stopped at Prisma generation with Windows engine-file `EPERM` caused by a concurrent Prisma process |
| Recovery assertions | PASS, limited scope | `tests/critical-flow-recovery.test.ts` passed inside the 438-test suite |
| Unauthenticated production smoke | PASS after harness correction | `SMOKE_BASE_URL=https://thebeesuite.io npm run test:smoke` |
| Credentialed per-role smoke | NOT RUN / BLOCKER | No approved role-specific smoke credentials were used |
| Target-device critical flows | NOT RUN | Existing June 2 responsive artifact covers only the public landing page |
| Load/performance threshold test | NOT RUN | No approved model or thresholds found |

## Safe repository fix

The production smoke harness previously inspected protected-route text immediately after `domcontentloaded`. Next.js can first render the route loading boundary and then perform a one-second protected-route redirect. `/billing-invoices` therefore produced a false failure while returning a valid redirect to `/login?next=%2Fbilling-invoices`. The harness now waits up to three seconds for a URL change only after the first expected-text check misses, then reads the rendered text again. The production smoke passed after this change.

## External decisions required

1. Brenden must name the selected first wave, dates, live modules, and one accepted human owner for role QA, device QA, performance/load, and release/build retesting.
2. Brenden and the technical owner must approve the target-device/browser matrix and measurable latency, error-rate, concurrency, and recovery thresholds.
3. School/corporate owners must authorize and provide dedicated scoped smoke accounts and non-customer test records; this audit did not create accounts or mutate production data.
4. A safe test environment and dataset must be approved before write-heavy load or failure-injection testing. Production billing and customer workflows are excluded without separate authorization.

## Exact next action

After the concurrent Prisma process finishes, the named release/build owner reruns `npm run vercel-build` on the unchanged release candidate. In parallel, Brenden names the role/device/performance owners and selected-school test matrix so the credentialed smoke blocker can be executed without production customer-data mutation.

