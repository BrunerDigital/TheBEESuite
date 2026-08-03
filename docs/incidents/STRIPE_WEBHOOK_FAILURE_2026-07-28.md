# Stripe webhook delivery failure report — 2026-07-28

Status: **diagnosis and local patch prepared; no production data, secret, Stripe setting, deployment, or event delivery was changed or replayed.**

Incident window: `2026-07-28T12:18:41Z` onward  
Platform account: `acct_1T84IEGk8ncxY2N9`  
Route: `POST /api/billing/stripe-webhook`  
Live URL: `https://thebeesuite.io/api/billing/stripe-webhook`

## Executive conclusion

The primary cause is a signing-secret mismatch for the live Stripe **Your account** snapshot destination `we_1TbiOaGk8ncxY2N9VwGXAl6c`. Confidence is **high**.

The application is configured with at least one webhook secret, but none of the live candidates matches that destination's unique `whsec_` secret. Stripe deliveries therefore fail before JSON parsing, durable receipt, or any payment/ledger/fulfillment work. The public response is consistently HTTP 400 with `Invalid payment processor signature.` This is not a missing-secret condition: the route returns HTTP 503 when no candidate is configured.

The failure was not introduced by the deployment that overlapped the first incident minute. The first observed 400 was served by the preceding deployment while the next deployment was still building, and the scoped files were identical between those commits.

The local patch also closes integrity gaps that were not the initiating cause: it reserves the event durably before processing, makes every duplicate a 2xx, records unsupported/unmatched events, converts authenticated handler failures to `manual_review` after receipt, prevents request-body logging, uses event identity for dedupe, and handles Accounts v2 thin events.

Stripe requires signature verification against the exact raw body and the secret belonging to that specific endpoint. It also states that endpoint secrets differ across Dashboard endpoints, CLI listeners, test/live modes, and multiple destinations. See [Stripe webhook security](https://docs.stripe.com/webhooks) and [signature troubleshooting](https://docs.stripe.com/webhooks/signature).

## Evidence

### Live destination inventory

Read-only Stripe Workbench inspection on 2026-08-01 showed three active destinations pointing to the same URL:

| Destination | Scope / payload | API version | Subscriptions | Observed deliveries |
| --- | --- | --- | --- | --- |
| `we_1TbiOaGk8ncxY2N9VwGXAl6c` | Your account / snapshot | `2026-02-25.clover` | 8 | 142 deliveries, 142 failures this week |
| `we_1TlunrGk8ncxY2N9v1IiLjUp` | Connected accounts / snapshot | `2026-05-27.dahlia` | 25 | 36 deliveries, 0 failures this week |
| `ed_61UvIlEE6qukBHhzu16UHSFbB3SQonG9nfK27NN60OMq` | Connected accounts / thin | unversioned v2 style | 15 | 0 deliveries, 0 failures this week |

The failing destination listens to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
payment_intent.payment_failed
charge.refunded
charge.dispute.created
account.updated
```

The successful connected-account destination using the same URL is strong evidence against a global route outage, middleware redirect, or raw-body mutation. Stripe documents that account and Connect destinations have distinct scopes and each destination has its own signature secret; connected events also carry a top-level account identifier. See [Connect webhooks](https://docs.stripe.com/connect/webhooks).

### Secret evidence

- Failing destination fingerprint, computed in memory from its revealed secret and never printing the secret: `5d8145a492e0`.
- Local configured `STRIPE_WEBHOOK_SECRET` fingerprint: `869f8ea3203a`.
- Vercel reports `STRIPE_WEBHOOK_SECRET` as present, Production-only, sensitive, created `2026-05-27T14:25:36.080Z`, and last updated `2026-06-24T19:00:01.697Z`.
- Vercel does not reveal/export the sensitive value, so its current fingerprint could not be compared directly. This limits the conclusion from “proven exact value” to “high-confidence live candidate-set mismatch.”
- An unsigned live POST returned HTTP 400 `Invalid payment processor signature`, not the route's HTTP 503 missing-configuration response.
- No secret appeared in terminal output, logs, tests, source, or this report.

### First failure and deployment chronology

All times are UTC.

| Time | Evidence |
| --- | --- |
| 2026-07-27 22:00:17 | Commit `8379572d` deployment began |
| 2026-07-27 22:04:07 | Commit `8379572d` deployment Ready |
| 2026-07-28 12:17:07.780 | Commit `297f8775` deployment began |
| 2026-07-28 12:18:39 | Stripe created `evt_1Ty9xzGk8ncxY2N9l36bIHi5` (`checkout.session.expired`) |
| 2026-07-28 12:18:39.848 | Vercel logged the first 400 on the older `8379572d` deployment |
| 2026-07-28 12:18:41 | Incident window supplied for this investigation begins |
| 2026-07-28 12:21:05.699 | Commit `297f8775` deployment became Ready |
| 2026-07-28 13:18:33.893 | A later retry failed on the new deployment |

`git diff 8379572d..297f8775` is empty for the webhook route, Stripe integration verifier, credential resolver, request logger, proxy, Vercel configuration, Prisma schema, and migrations. The last route change before the incident was `58a7321d` on 2026-07-18; the next route change was `b8be44da` on 2026-07-31. Request/response logging was introduced by `9aa2b158` on 2026-06-09. No scoped code, middleware, redirect, schema, API-version, or environment update landed at the incident boundary.

The canonical live POST did not redirect. `src/proxy.ts` only applies the canonical-host redirect when the host is noncanonical, and `vercel.json` has no webhook redirect.

### Event and BEE Suite reconciliation

The Stripe v1 read-only query with `delivery_success=false` found 24 matching platform events created since 2026-07-01 that still report an unsuccessful delivery. The core incident set is:

- 22 event IDs: the event created two seconds before the supplied window whose first failure opened the incident, plus 21 events created after the supplied timestamp.
- 19 `checkout.session.expired` events for school software payment-method setup.
- 3 `account.updated` events for the platform account.
- 0 matching `StripeWebhookEvent` receipts in production.
- 0 referenced payments or invoices in those expired-session metadata records.
- All referenced centers exist; their software customers are configured and their software payment methods remain absent.
- No center is mapped to the platform account ID, so the three account updates have no center mutation to apply.

Two additional pre-window expired events remain `delivery_success=false` and are retained in the manifest as excluded candidates until an in-window delivery attempt is proven. The exact 24-row manifest is `docs/incidents/stripe-webhook-replay-manifest-2026-07-28.csv`.

For the 19 in-scope expired school setup events, the patched result is an `ignored` receipt with reason `school_software_payment_method_setup_expired`; there is no payment, invoice, ledger, fulfillment, billing account, or center change. For the three platform account updates, the patched result is an `ignored` receipt with reason `No center matched the connected account.`

## Current implementation findings

### Signature boundary

- `request.text()` is the first request-body consumption in the POST handler.
- The exact string is verified before `JSON.parse`.
- The verifier requires a decimal timestamp, at least one `v1`, a five-minute tolerance, a 64-hex HMAC-SHA256 digest, and `timingSafeEqual` over decoded 32-byte buffers.
- Missing, malformed, stale, non-hex, or mismatched signatures return non-2xx.
- Multiple `v1` signatures are accepted, supporting Stripe secret-roll overlap.
- The request logging wrapper now receives `{ omitRequestBody: true }`; it never clones or samples the Stripe payload and never includes `Stripe-Signature` in its header set.

Stripe states that raw-body alteration breaks verification, its default recency tolerance is five minutes, and it creates a fresh signature/timestamp for retries. See [Stripe webhook documentation](https://docs.stripe.com/webhooks) and [signature error guidance](https://docs.stripe.com/webhooks/signature).

### Secret ownership and readiness

The patch defines explicit candidates:

- `STRIPE_PLATFORM_WEBHOOK_SECRET`: preferred owner for the live **Your account** production destination.
- `STRIPE_WEBHOOK_SECRET`: legacy compatibility candidate retained for safe migration/rollback.
- Tenant `IntegrationCredential` values: accepted only for explicitly inventoried tenant/Connect destinations.

A connected account ID or API key is not a webhook signing secret. A Stripe CLI listener secret, test endpoint secret, another Dashboard destination's secret, and the live platform destination secret are not interchangeable.

`scripts/stripe-webhook-readiness.ts` outputs candidate source, owner, tenant ID where applicable, and a 12-character one-way SHA-256 fingerprint. It never outputs secret material. The preferred new variable allows the exact platform secret to be staged without overwriting the unreadable legacy Vercel value; an instant code rollback therefore fails closed rather than losing the previous candidate.

Vercel documents that Production variables apply only to new deployments and that a redeployment is required after a variable change. See [Vercel environment variables](https://vercel.com/docs/environment-variables) and [managing environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).

### Durable receipt and acknowledgement

The patch's sequence is:

```text
raw body -> signature verification -> JSON/event validation
         -> unique durable receipt(status=received)
         -> dispatch business handler
         -> processed / pending / ignored / manual_review
         -> 2xx acknowledgement
```

If durable receipt insertion fails, the route returns 503 so Stripe retries. Once receipt insertion succeeds, unsupported events and valid events that cannot be safely applied return 2xx and are labeled `ignored` or `manual_review` with a bounded reason. A downstream API failure, audit failure, enrichment failure, or handler exception cannot turn the durable receipt into a failed Stripe delivery; it becomes `manual_review` and returns 202.

This deliberately uses the existing database receipt as the durable queue boundary. It does not claim that every business handler is asynchronous. Stripe recommends quickly returning 2xx and using asynchronous processing for complex work; a future outbox/worker is still the stronger long-term design. See [Stripe webhook best practices](https://docs.stripe.com/webhooks#best-practices).

### Idempotency

- Production catalog inspection confirmed unique indexes `StripeWebhookEvent_eventId_key` and `StripeWebhookEvent_dedupeKey_key`.
- `event.id` is now the dedupe key. The prior checkout key `${type}:${objectId}` could collapse distinct Stripe event objects for the same Checkout Session and obscured whether dedupe represented delivery or business-object identity.
- The first insert wins atomically. A concurrent unique conflict is considered a duplicate only if the conflict targets `eventId`/`dedupeKey` and the same `eventId` exists.
- Every duplicate returns HTTP 200 before any handler, including invoice and subscription handlers.
- Post-transaction audit failure marks the already-received event `manual_review`; retries return duplicate 200 and cannot repeat the committed payment/ledger mutation.
- Stripe does not guarantee event order and may deliver duplicate events. Handlers must continue to use current-state guards and reconciliation rather than assuming order. See [Stripe webhook handling](https://docs.stripe.com/webhooks).

### Accounts v2

The existing route listed Accounts v2 event types but assumed snapshot `data.object`. Thin events use top-level `related_object`; they would have been rejected as malformed. The patch routes `v2.core.account.updated` and `v2.core.account[requirements].updated` from `related_object`, while still accepting snapshot `account.updated`. Unsupported thin events are durably ignored with 2xx. Stripe distinguishes snapshot events from lightweight v2 thin events and requires v2 event retrieval for full details. See [Stripe event destinations](https://docs.stripe.com/event-destinations).

## Patch inventory

- `src/app/api/billing/stripe-webhook/route.ts`: durable reservation, response finalization, event-ID dedupe, 2xx-after-receipt policy, explicit ignored expired setup flow, thin-event normalization, and body-log opt-out.
- `src/lib/integrations.ts`: strict Stripe header parsing, decoded-byte timing-safe comparison, and one-way fingerprint helper.
- `src/lib/stripe-webhook-readiness.ts`: endpoint-secret ownership, matching, and masked diagnostics.
- `src/lib/stripe-webhook-receipts.ts`: atomic duplicate classification used by production and concurrency tests.
- `src/lib/stripe-webhook-event-types.ts`: complete supported-event matrix and snapshot/thin object routing.
- `src/lib/request-response-logging.ts`: sensitive-route request-body omission.
- `scripts/stripe-webhook-readiness.ts`: read-only masked configuration diagnostic.
- `scripts/reconcile-stripe-webhooks.ts`: read-only Stripe/BEE receipt reconciliation without full payloads.
- `tests/stripe-webhook-hardening.test.ts`: signed raw fixtures, malformed/stale checks, dedupe, concurrency, event matrix, thin events, and route ordering.
- Deployment/Stripe documentation and `.env.example`: explicit endpoint ownership and redeployment rules.

## Migration impact assessment

No database migration is required or included.

The existing production table already has nullable `error`/`processedAt`, a free-form `status`, and unique indexes on both `eventId` and `dedupeKey`. New receipts use `dedupeKey = eventId`; existing rows retain their historical values and remain valid. There is no backfill in this patch. No production migration or write was run during the investigation.

## Automated validation

Focused command:

```powershell
node --import tsx --test tests/stripe-webhook-hardening.test.ts tests/request-response-logging.test.ts tests/security-readiness.test.ts tests/billing-setup-safety.test.ts tests/account-credit-autopay.test.ts tests/integration-setup.test.ts tests/tenant-integration-credentials.test.ts
```

Final focused result: 62 passed, 0 failed. TypeScript validation also passed. The full production gate was then run:

```powershell
npx tsc --noEmit
npm run vercel-build
```

`npm run vercel-build` passed in 132.7 seconds: Prisma generation, lint, typecheck, all 759 repository tests, and the Next.js production build completed successfully. An initial build invocation was interrupted by a one-second command-harness timeout; the complete rerun passed. No test uses a production webhook secret or production Stripe mutation.

## Read-only reconciliation commands

Use an approved read-only environment source. The script calls Stripe `GET /v1/events` and Prisma `findMany` only:

```powershell
node --env-file=<approved-read-only-env> --import tsx scripts/reconcile-stripe-webhooks.ts --since=2026-07-28T12:18:41Z --expected-account=acct_1T84IEGk8ncxY2N9
```

Masked readiness check:

```powershell
vercel env run -e production -- node --import tsx scripts/stripe-webhook-readiness.ts --expected-platform-fingerprint=5d8145a492e0
```

Database-only receipt query after supplying the Stripe event IDs as a parameterized array:

```sql
SELECT
  "eventId",
  "type",
  "objectId",
  "status",
  "error",
  "createdAt",
  "processedAt"
FROM "StripeWebhookEvent"
WHERE "eventId" = ANY ($1::text[])
ORDER BY "createdAt", "eventId";
```

Production index verification:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'StripeWebhookEvent'
ORDER BY indexname;
```

## Approval gate A — production configuration and deployment

**STOP. No step below is authorized by this report. Obtain explicit deployment/configuration approval first.**

1. Create an isolated worktree from current `origin/main`; apply only this scoped patch and preserve unrelated work.
2. Run the focused tests, `npx tsc --noEmit`, and `npm run vercel-build` with non-production test secrets.
3. Create a Preview deployment and exercise signed fixtures against Preview using only a test/Preview endpoint secret. Confirm invalid/missing/stale signatures are non-2xx; supported, unsupported, duplicate, and concurrent valid events are 2xx after receipt.
4. In Stripe Workbench under account `acct_1T84IEGk8ncxY2N9`, open destination `we_1TbiOaGk8ncxY2N9VwGXAl6c`. Confirm URL, **Your account** scope, snapshot payload, API version, enabled event list, and the masked secret fingerprint `5d8145a492e0`. Do not roll the secret or change the destination.
5. Add the exact revealed destination secret as new Vercel Production sensitive variable `STRIPE_PLATFORM_WEBHOOK_SECRET`. Do not overwrite or delete `STRIPE_WEBHOOK_SECRET` during this release. Example command, to be executed only after approval:

   ```powershell
   vercel env add STRIPE_PLATFORM_WEBHOOK_SECRET production --sensitive
   ```

6. Run the masked readiness command in the Production environment. It must report a matching platform source without printing secret material.
7. Commit the scoped patch, push without force, and create a new Production deployment so the new environment value is embedded. Environment changes do not affect old deployments.
8. Require Vercel `Ready`, canonical aliases including `thebeesuite.io`, healthy `/api/health`, no new error logs, and a direct unsigned webhook probe returning 400 without redirect. Do not send a valid synthetic event to production unless that receipt write is separately included in the approval.
9. Observe the next organic Stripe retry read-only. Require 2xx, a single receipt, correct status/reason, and no unexpected payment/invoice/ledger/center mutation. The connected snapshot destination must remain successful.
10. Do not manually resend any incident event in this gate.

## Rollback plan

1. If the new deployment shows signature, receipt, or business-mutation regressions, immediately roll the canonical aliases back to the preceding known deployment. Do not delete the new deployment or branch until evidence is retained.
2. The preceding code does not read `STRIPE_PLATFORM_WEBHOOK_SECRET`; platform deliveries therefore fail closed with 400 rather than being processed by unverified code. The legacy secret remains untouched.
3. Do not change, rotate, or delete any Stripe destination secret during rollback.
4. Verify `/api/health`, aliases, and logs. Confirm no partial event processing by querying `StripeWebhookEvent`, payments, invoices, ledger entries, center custom fields, and audits for any event IDs received by the new deployment.
5. If a receipt is `manual_review`, reconcile it; do not delete it to force another attempt. Event-ID uniqueness is the integrity boundary.
6. Note that instant rollback does not rebuild an old deployment with new environment values. This fail-closed behavior is intentional until a corrected patch is approved.

## Approval gate B — event replay

**STOP. Deployment approval does not authorize replay. Obtain a separate explicit replay approval after the new deployment is proven healthy.**

1. Refresh `docs/incidents/stripe-webhook-replay-manifest-2026-07-28.csv` immediately before replay. Re-query each event's receipt, payment/invoice/ledger/center state, Stripe delivery state, and whether Stripe already retried automatically.
2. Remove any event that now has a receipt. Do not assume a manual resend cancels Stripe's automatic retry; Stripe explicitly says it does not, which is why the event-ID unique claim is mandatory.
3. Exclude the two pre-window rows unless delivery-attempt evidence places them inside the incident scope.
4. Default the three platform `account.updated` rows to no replay because they have no center mapping and no business mutation. Replay only if durable receipt completeness is explicitly required.
5. If approved, resend one remaining event at a time from the exact failing destination's delivery view. Do not use “resend all.”
6. After each event, require one `StripeWebhookEvent` row with `dedupeKey = eventId`, status `ignored`, the expected reason, and no payment, subscription, invoice, ledger, fulfillment, center, or audit mutation beyond the receipt. A second delivery must return 200 duplicate and create no second row.
7. Stop immediately on any unexpected status or mutation. Retain the remaining manifest without replay.

## Actual stopping point

Investigation, production read-only reconciliation, documentation, local code changes, and focused tests were performed. Production data and configuration remain unchanged. No secret was rotated or updated, no Stripe destination was changed, no deployment was created or promoted, and no event was replayed.
