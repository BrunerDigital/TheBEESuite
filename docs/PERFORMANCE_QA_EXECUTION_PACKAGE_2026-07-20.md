# Performance and QA Execution Package

Date: July 20, 2026  
Status: Recommended defaults; Brenden approval is required before they become the launch contract.  
Safety boundary: Synthetic load and responsive scripts refuse production-like hosts. Use only local, `.test`, preview, or staging targets. Do not point write scenarios at customer data or billing.

## Commands and retained evidence

```powershell
npx next start --hostname 127.0.0.1 --port 4177
npx tsx scripts/qa-synthetic-load.ts --base-url http://127.0.0.1:4177 --requests 100 --concurrency 10
npx tsx scripts/qa-responsive.ts --base-url http://127.0.0.1:4177
node --import tsx --test tests/qa-standards.test.ts tests/classroom-offline-queue.test.ts tests/critical-flow-recovery.test.ts
```

JSON, screenshots, timestamps, thresholds, and failures are written under ignored `outputs/qa/`. Copy the selected run into the approved school evidence location and record the commit SHA, environment identifier, data-fixture revision, tester, browser/device, and result. Never attach secrets or unredacted child/family data.

## Recommended launch thresholds

| Surface | Recommended default | Failure classification |
| --- | --- | --- |
| Public page synthetic GET | p95 <= 1,000 ms; p99 <= 2,000 ms; errors <= 1% | REQUIRED BEFORE WAVE; Performance and QA |
| Health API synthetic GET | p95 <= 300 ms; p99 <= 750 ms; errors <= 0.1% | BLOCKER when health/database readiness fails; Deployment and Ops owns service recovery |
| Public API synthetic GET | p95 <= 500 ms; p99 <= 1,000 ms; errors <= 0.5% | REQUIRED BEFORE WAVE; owning API workstream plus Performance and QA retest |
| Critical rendered route | meaningful page within 3,000 ms in approved test conditions | REQUIRED BEFORE WAVE; owning feature workstream |
| Responsive layout | 0 horizontal overflow; 0 clipped interactive controls | REQUIRED BEFORE WAVE; owning experience workstream |
| Browser console | 0 relevant errors per critical flow | REQUIRED BEFORE WAVE; owning feature workstream |
| Recovery | 0 duplicate committed writes; 0 lost acknowledged/queued actions | BLOCKER for attendance, custody, payment, or cross-scope corruption; owning operational workstream |
| Offline queue | retain at most 50 valid actions; malformed records ignored | REQUIRED BEFORE WAVE; Teacher Experience owns behavior, Performance and QA owns regression evidence |

The default synthetic profile is 100 requests per scenario at concurrency 10. Before a wave, add a soak profile based on approved peak usage: recommended starting point is 30 minutes at expected peak concurrency plus a 5-minute burst at twice peak. Write-heavy scenarios require an isolated approved dataset and explicit authorization.

## Synthetic load scenarios

| Scenario | Safe automated baseline | Authorized staging extension | Owning workstream if it fails |
| --- | --- | --- | --- |
| Public landing and login | Concurrent GET, status/latency/error rate | Navigation plus asset/cache inspection | User Experience and Flows |
| Health/readiness | Concurrent GET to `/api/health` | Database latency and dependency degradation drill | Deployment and Ops |
| Public school locations | Concurrent GET to `/api/public/kidcity-locations` | Validate active-school correctness under load | Enrollment CRM / School Setup |
| Protected route redirect | Unauthenticated redirect smoke | Credentialed route-ready timing by role | User and Role Permissions plus affected role workstream |
| Attendance/kiosk writes | Not executed by baseline | Test-fixture check-in/out, duplicate and retry burst | Teacher Experience / User and Role Permissions |
| Daily reports/incidents/media | Not executed by baseline | Concurrent test-fixture submissions and upload recovery | Teacher Experience / Communications / Security |
| Parent portal/billing reads | Not executed without credentials | Linked test-family reads; Stripe test mode only | Parent Experience / Payments |

## Role and device regression matrix

| Role | Minimum device/browser | Required critical sequence | Stop conditions / owner |
| --- | --- | --- | --- |
| Corporate | 1440x1000 Chrome or Edge | Login, multi-school dashboard, school filter, CRM, FTE, reports, audit visibility | Cross-school/tenant leakage: BLOCKER, User and Role Permissions |
| Director/billing | 1280x800 approved office browser | Dashboard, family/child, attendance, incident, documents, billing readiness and exports | Wrong family/payment/scope: BLOCKER, Director or Payments workstream |
| Teacher | 768x1024 portrait and 1024x768 landscape on actual tablet | Login, roster, attendance, location, daily report, incident, media restriction, offline queue/replay | Wrong roster, lost/duplicate attendance, permission bypass: BLOCKER, Teacher Experience |
| Parent/guardian | 390x844 plus selected iOS and Android devices | Setup/reset, linked children, reports, incident, documents, preferences, billing disabled/approved state | Wrong family/child/invoice: BLOCKER, Parent Experience / Payments |
| Kiosk/front desk | Actual kiosk tablet in both used orientations | Center selection, lookup, valid/invalid PIN, custody warning, duplicate check-in, checkout-before-checkin | Wrong-center result or accepted wrong PIN: BLOCKER, User and Role Permissions / Teacher Experience |
| Public | 360x800, 430x932, and desktop | Landing, registration, inquiry location, support/privacy, failure feedback | Wrong school routing: BLOCKER, Enrollment CRM |

Every selected school needs its own evidence for corporate visibility, director/billing, teacher, linked parent, and kiosk. A pass at Kokomo does not substitute for another school's scope or device evidence.

## Recovery and offline cases

| Case | Expected result | Required evidence | Owning workstream |
| --- | --- | --- | --- |
| Login network failure | Clear retry copy; no password logged; entry retained where safe | Screenshot, console/network result, retry pass | User Experience / Security |
| Parent setup interruption | Entries remain; resubmission is safe and family-scoped | Before/after screenshot and resulting test record | Parent Experience |
| Payment-method setup interruption | No payment starts until confirmed; safe retry; test mode only | Stripe test event and app state | Payments |
| Teacher offline attendance | Action queues once, visibly remains pending, replays once, audit state is correct | Queue state, network trace, resulting attendance ID | Teacher Experience |
| Duplicate kiosk action | Duplicate or invalid state is rejected without corrupting attendance | Two attempts and final state | Teacher Experience |
| Daily report/incident retry | One logical record; draft/input preserved; correct child and review state | Record IDs and role views | Teacher Experience / Parent Experience |
| Media upload loss/retry | Failure is visible; no unauthorized sharing; retry respects permission | Upload status, review state, parent visibility | Teacher Experience / Security |
| Session expiry mid-form | Safe reauthentication/recovery; no cross-user draft exposure | Expiry screenshot and resumed/abandoned result | User and Role Permissions |
| Partial dependency outage | Readiness/error state identifies the dependency without leaking secrets | Response, logs, recovery timestamp | Deployment and Ops |

## Responsive targets and evidence record

Automated baselines: 1440x1000, 1280x800, 1024x768, 768x1024, 430x932, 390x844, and 360x800. These are layout probes, not replacements for selected physical devices. Test tablet workflows in both orientations and parent flows on the selected minimum iOS/Safari and Android/Chrome versions.

For every run record: evidence ID, candidate commit, environment and fixture, school, role, account alias, device/viewport, OS/browser version, scenario, threshold, timestamps, observed metrics, result, defect ID/severity, owning workstream, owner, workaround, retest, and approver. Never record passwords.

## Exact credentialed/device/load sequence

1. Brenden approves thresholds, selected schools, role/device matrix, account aliases, test environment, fixture dataset, and owners.
2. Release owner runs `npm run vercel-build` on the exact candidate; any failure returns to its owning workstream.
3. Performance and QA runs the guarded public synthetic baseline and responsive matrix on the non-production candidate.
4. User and Role Permissions runs corporate, director/billing, teacher, parent, kiosk, and public isolation smoke for the first school, then negative cross-school checks against a second school.
5. Role owners run the critical device sequence on actual approved hardware, including both tablet orientations and selected parent devices.
6. Recovery owners execute offline, retry, duplicate, expiry, and dependency-failure cases on isolated fixtures.
7. Performance owner runs approved peak, burst, and soak profiles; write-heavy flows remain isolated and Stripe stays in test mode.
8. Each defect is assigned to one owning workstream, fixed there, and the affected scenario plus cross-role regression is rerun.
9. Brenden and named signoff owners review retained evidence. Performance and QA can close only its own gate; wider-wave approval remains separate.

