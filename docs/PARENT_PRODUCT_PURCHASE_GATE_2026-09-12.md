# Parent product-order creation boundary — September 12, 2026

## Current state recorded before changes

- Isolated branch `work/parent-product-purchase-gate-20260912` starts at protected PR #369 main `8ad3169c92a00f978d6b5171af57f1246414f946`. That release is deploying; latest fully verified production remains PR #368 until the separate live Updates check completes.
- Parent SSR supplies `uniformProducts={[]}`. The only client caller of `/api/parent/products/purchase` is dormant ParentWorkspace code; the director billing workbench uses a separate authorized invoice route.
- Despite the hidden catalog, the POST endpoint accepts a current parent's valid Product ID and creates a new invoice. Each request creates a random purchase ID, so its dedupe key cannot deduplicate retries. Audit logging happens after the invoice transaction, allowing a committed invoice followed by an ambiguous failure. There is no durable request fingerprint or concurrency-safe replay contract.
- The dormant UI multiplies unit price by quantity, while the server applies the existing five-shirt discount. These totals differ for five or more individually selected shirts. The existing source/quantity tests do not prove a safe end-to-end order contract.
- Existing product invoices, payment history, shared invoice Checkout, webhooks, balances and director one-time invoicing must remain available and unchanged. This work must not activate a shop, alter catalog prices, create invoices, send messages or mutate provider configuration.

## Scoped correction

Close NEW parent product-order creation in code before parsing a purchase body or performing family/product/billing/audit work. Preserve authentication, reserved-review and role denials, and the already-empty production catalog. Do not introduce an environment switch capable of reviving the known-unsafe order implementation. Preserve existing invoices and all ordinary payment/reconciliation paths.

This is containment of an unadvertised dormant endpoint, **not** completion of product-order idempotency or approval to activate parent shopping. Re-enabling requires reviewed implementation and tests for trusted mutation origins, strict quantity validation, atomic purchase/audit claims, transaction-time current guardian/tenant/family/school/product authorization, non-null financial school attribution, immutable actor/family/school/product/price/quantity fingerprints, concurrent/ambiguous retries, truthful totals, strict response/Checkout correlation, existing-invoice recovery, and an approved per-school catalog/fulfillment/refund/support plan.

## Required verification

Actual-handler tests must prove unauthenticated, reserved-review, non-parent and ordinary-parent outcomes, including malformed bodies, foreign IDs and concurrent retries, without reading request bodies or touching family/product/invoice/audit/provider boundaries after the closed gate. Keep current-family scope tests for the dormant implementation and prove the SSR catalog remains empty. Run focused tests, full production gate, protected release, exact Ready aliases/health/logs and guarded fake-account navigation. No live product POST, order creation, card charge, account mutation or activation is required.

## Implemented candidate and local evidence

The code-only availability helper returns false without reading environment flags, request values or tenant configuration. The route retains its original authentication, reserved-demo and role guards, then returns private/no-store `403 PRODUCT_PURCHASE_UNAVAILABLE` before parsing the purchase body or accessing purchase data. Its error explicitly directs orders to the school and preserves Payments for existing invoices. Request/response bodies are explicitly omitted from route logging, including error paths. The old implementation and its current-family guards remain behind the closed gate for a separately reviewed repair; no feature flag or deployment variable can activate it.

All 44 focused tests pass. The three new outer tests include an actual-handler module-mock suite with 30 attempts: original four authentication/role denials, six normal/malformed/foreign-target bodies and 20 concurrent identical retries. Request JSON, family scope, Prisma delegates, invoice transaction, billing-period and audit boundaries throw if called; none were reached. Source tests preserve the empty SSR catalog and confirm that existing invoice/payment and director invoice routes do not use this gate. Independent read-only review reran all three new tests and found no blocker. Static Parent/Teacher store readiness passes. The full `npm run vercel-build` passed Prisma generation, lint (zero errors, one existing unrelated warning), TypeScript, all 2,182 tests and optimized Next.js build. Logs: `output/wave17-focused.log`, `output/wave17-vercel-build.log`, `output/wave17-mobile-store-check.log`. Protected release and post-release verification remain pending.
