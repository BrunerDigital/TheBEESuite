# BEE Suite platform billing

Lane: build and verify. Starting source: origin/main d3f76a422b3ec27f89d5cb3193dfb49f0a39c6b3.

## Inspected state

The shared checkout is dirty and behind origin/main. Implementation uses the isolated `feature/platform-tenant-billing-20261105` worktree. Existing school software subscriptions use Center custom fields and fixed school fee policies. Family invoices and payments belong to school billing accounts. Neither represents a general tenant or customer charge payable to The BEE Suite. The connected Stripe account inventory identifies The BEE Suite; no live customers, invoices, subscriptions, payment links, or charges were created during development.

## Behavior

Platform owners in the platform-wide workspace get **BEE Suite Billing** under Administration. They can register a tenant payer or another customer, enter a description and USD amount, and create either a one-time payment request or a tenant monthly subscription authorization. Checkout handles card entry and the payer's recurring authorization. Opening or copying a link does not send an email. Monthly subscriptions start when the payer completes Checkout and renew monthly through Stripe Billing. Existing school subscriptions continue separately.

Platform billing uses its own accounts, charges, and invoice history. It never writes family balances or school payout settings. Tenant, regional, school, parent, and auditor roles cannot access this desk or its API. Each payer belongs to the platform owner's identity tenant, independently of the currently selected tenant. Only one outstanding monthly request/subscription is allowed per tenant payer. Request IDs and provider idempotency keys preserve retry safety.

## Production release

The approved additive migration was applied on November 5, 2026. On November 11, the production catalog and both migration histories were checked again. Supabase records version `20261105144411`, and the completed Prisma migration `20261105120000_platform_billing` matches the reviewed SQL checksum. The repository's [Supabase mirror](../supabase/migrations/20261105144411_platform_billing.sql) uses that deployed version and the original schema SQL. [Production release evidence](https://github.com/BrunerDigital/TheBEESuite/pull/520).

Use the platform merchant key in `STRIPE_PLATFORM_SECRET_KEY` (or existing platform `STRIPE_SECRET_KEY`). Never use a tenant key here. Optional `STRIPE_PLATFORM_PAYMENT_METHOD_CONFIGURATION_ID` selects a platform payment method configuration with cards enabled; otherwise Checkout uses the platform's dynamic payment methods. The existing platform webhook destination must deliver checkout session lifecycle, invoice paid/failed/action-required, and subscription lifecycle events. Its signing secret is `STRIPE_PLATFORM_WEBHOOK_SECRET` or the existing platform webhook secret. Connected-account and tenant-signed events cannot settle platform charges.

Before live use, verify card availability, the intended merchant, the migration, an approved test payment and recurring cycle, duplicate delivery/retries, cancellation, canonical aliases, health, logs, and the authenticated changed flow. Stripe Tax is not enabled by this patch; review applicable tax registrations and pricing before collecting tax.

## Validation evidence

The focused suite uses an ephemeral PGlite PostgreSQL instance with the real generated Prisma client and the actual additive migration. Stripe responses are simulated; it makes no external payment calls. Scenarios cover database constraints and RLS, amount validation, platform and tenant boundaries, competing monthly reservations, lost provider responses, payment processing and settlement, duplicate and out-of-order events, provider outages, invoice failure/recovery, expiration, cancellation, refunds, and keeping old active agreements manageable after more than 100 recent charges. A seeded family balance stays unchanged. PGlite serializes its underlying database connection; the competing-request test proves the unique reservation and retry behavior, not production PostgreSQL lock scheduling under load.

Browser plugin not available; regular Playwright used Chromium against a temporary local QA wrapper with simulated billing API responses. The wrapper was removed before the release build. Desktop 1440 x 1100 and mobile 390 x 844 both verified payer creation, custom-amount validation, one-time and monthly review/checkout, backing out without billing, scheduled cancellation, and invoice links. Page identity and meaningful content passed; no framework overlay, browser errors, horizontal overflow, or axe WCAG A/AA violations were found. The real local anonymous API returned 401 for GET and POST. Public submitted/canceled return states were checked and do not assert that a query parameter proves payment.

Local screenshots, browser results, and the full-gate log are retained under `outputs/platform-billing-verification/`. A generated type cache initially retained references to the deleted QA wrapper; starting/stopping the local dev server and `npx next typegen` regenerated the route types without deleting the cache. Automatic approval review rejected cache deletion and cleanup of one extra screenshot produced at an encoded Windows path outside the worktree, returning `blocked by policy`. Those extra artifacts were retained.

Read-only live Stripe inspection on November 5, 2026 identified The BEE Suite merchant with charges and payouts enabled, card payments active, and zero currently due account requirements. The enabled canonical webhook destinations include every checkout, subscription, invoice, and refund event used here. This checks the connector account and webhook inventory; production application key mapping, signing-secret delivery, and an authorized real payment remain release verification steps.

### Commands and limits

Focused verification: `node --import tsx --test tests/platform-billing-policy.test.ts tests/platform-billing-integration.test.ts`.

Full repository gate: `npm run vercel-build` (Prisma client generation, lint, typecheck, all tests, Next.js production build).

Browser QA used the repository's Playwright 1.59.1 with a temporary script retained locally in the verification output directory. The local UI checks use synthetic payers, not production identities. No authenticated production billing mutation, real card payment, production migration, invitation, message, or provider configuration change was performed.
