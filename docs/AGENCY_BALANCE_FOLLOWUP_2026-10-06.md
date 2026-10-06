# Agency balances and collection follow-up

## Current state

Inspected from `origin/main` at `357bbaee`. Agency Claim Queue already records payments received outside BEE Suite, supports receipt dates and external references, and retains claims, remittances, reversals, and controlled reconciliation history. The toolbar balance drawer showed only current-family accounts. Its print report ignored the selected filter and search, and rows offered only a ledger shortcut.

## Implemented behavior

- Balances opens to families owing, with All, Needs follow-up, Overdue, Processing, Credits, and Current views. Search and the matching-view total apply together. Print balances uses the same rows and totals as the selected view.
- Needs follow-up excludes unsettled ACH payments. Processing rows offer payment review. Family rows offer their statement; billing writers can send a payment reminder directly from the drawer.
- The reminder dialog loads fresh, authorized current-family data. Staff select saved recipients and review the existing secure tuition payment email. Sending reuses the established payment-link and notification service. The server rejects changed balances, settled balances, and processing ACH payments. The dialog prevents repeat submission and distinguishes email acceptance from delivery. No recipients are selected automatically.
- Agency receivables is available to existing agency billing readers. It summarizes all service periods, including claims for former families, by school and agency. It shows claim amounts outstanding, recorded receipts, claims needing submission, claims overdue, posted agency ledger balances, pending reviews, and unapplied deposits. The corresponding filters, search, and print report share the same rows.
- Reconcile agency payments opens the existing school-scoped Agency Claim Queue. Staff record actual externally received money there using the existing evidence, permission, review, and reversal controls.
- Submitted claims awaiting approval count as claim amounts outstanding; draft/ready claims count only as needing submission. Posted ledger balances and unapplied deposits are separately labeled and must not be added to claim amounts. Family and agency totals remain separate.

## Validation

- Focused tests cover filtering, net/credit totals, processing-payment exclusion, school-specific action links, agency follow-up views, preview authentication and school/tenant scope, and stale-balance/processing-payment rejection before sending.
- Synthetic browser checks exercised the actual drawer components, nested reminder preview, explicit recipient selection, one mocked send, repeat-send disabling, agency views, and desktop/phone layouts. No real recipients, links, notifications, or provider sends were used.
- The generated agency SELECT ran successfully against the connected BEE Suite schema with a nonexistent school ID, returning no records. Synthetic PostgreSQL CTE fixtures using the same query verified partial/overpaid/paid claims, pending approval, draft/denied/void exclusions, same-day due dates, reversed deposits and adjustments, allocation review counts, cross-school exclusion, and distinct ledger totals.
- `npm run vercel-build` passed: lint, typecheck, all 2,619 tests, optimized compilation, final TypeScript checks, and static page generation.

No schema migration, financial posting, access change, agency reconciliation activation, or real message was performed. Local database environment files were unsuitable for the schema probe; connected read-only SQL verified the query instead.
