# Director billing workspace review — October 30, 2026

This change prioritizes Centennial's director workflow. All screenshots and browser tests use synthetic families, `example.com` contacts and demo account IDs. No live account or financial mutations were used for validation.

## Baseline and resulting behavior

The isolated branch started at `origin/main` commit `5b31c4a354b73383c41e2ccbbb3747f475d92526` (PR #510). At inspection, that commit was Vercel Production Ready in deployment `dpl_CuJZAH74H4BgD9ptpLF4QgYHng28`, with `thebeesuite.io` and `www.thebeesuite.io` aliases. The shared checkout contained unrelated work and was preserved.

The baseline workbench and ledger owned independent family selections. The initial demo desktop document was 4,446 pixels tall. Customer statement called `window.print()` and mounted a report hidden outside print media; it had no onscreen preview. The reported cloud-browser print result therefore did not establish a printing defect.

The resulting workspace has:

- One exact family/school selection driving workbench actions, ledger and statements. URL context preserves the family, category and section across refresh. Empty categories and mismatched exact links never substitute another account.
- A persistent account header with school, family, category, identifying details and posted balance. Overview, Tuition & Fees, Payments, and Ledger & Statements keep tasks within reach.
- A collapsible family browser with local search, searchable options, a scrollable browse list and separate server search. Counts describe loaded households. Duplicate names remain distinguishable by email, child and exact account reference.
- Compact account information with separate posted, pending and collectible values. The read-only account overview reuses the existing authorized checkout snapshot and calculation. Responsibility holds remain explicit. Ordinary balance checkout uses this projection; the server still rechecks before collection.
- Preserved draft guards and a synchronous request lock. Cancelled family changes keep edits, section changes retain them, and confirmed family changes reset family-bound drafts. Cancelled, late and mismatched summary responses cannot replace the current account.
- Focused payment and tuition tasks. School rate editing, child profile setup, extra recurring lines, recurring credits and less common corrections open explicitly. School reports and the school invoice list remain in separate collapsed panels.
- An explicit statement preview with family/account, school, selected period, current-balance meaning and history-coverage limits. Preview precedes Print / Save PDF. Printing failures have actionable feedback; closing the preview cancels pending print work.

The scoped change does not alter database schema, financial calculation implementations, ledger history, provider processing, billing permissions, audit persistence, enrollment activation or autopay consent. Existing past-account and pending-family restrictions remain in effect. The generated one-line AGENTS.md heading update comes from the installed Next.js dev server.

## Screenshots

| View | Before | After |
| --- | --- | --- |
| Desktop billing workspace | [Long workbench and separate ledger](before-desktop.png) | [Compact account overview](after-desktop-overview.png) |
| Phone billing workspace | [Initial stacked controls](before-mobile.png) | [Persistent family context and sections](after-mobile-overview.png) |
| Phone ledger | Separate selector appears in the desktop baseline | [Ledger follows the chosen family](after-mobile-ledger.png) |
| Customer statement | Immediate browser print request; no onscreen preview | [Visible statement review](after-desktop-statement-preview.png) |

The before images were captured before changing the workbench, using the same synthetic family and account balances. The after shell identifies the synthetic Centennial director explicitly. Phone screenshots show the viewport of the app's scrollable workspace; desktop before/after images capture the document. These are demo observations, not a production usability session or timing study.

## Validation

- Focused behavioral and regression checks: 117 passed, including exact selection, checkout-summary authorization and response identity, stale response cancellation even when abort is ignored, ledger date/history semantics, current/past/pending restrictions, auditor boundaries, child setup and existing atomic tuition-rate saves.
- Browser QA: [retained results](browser-results.json). All four sections tested at 1440 × 1000, 834 × 1112, 390 × 844 and 320 × 740. No horizontal document overflow; section targets are at least 44 pixels tall. Persistent context was checked while scrolling the actual workspace.
- Review follow-up regressions: a $250 weekly rate shows a $500 biweekly invoice and a $1,000 four-week invoice; a pending ACH update refreshes the actual overview hook without changing the posted balance; pay-ahead inputs warn before switching and reset only after confirmed discard. Standalone ledger options match an explicit school filter, retain cross-school choices when no school filter is selected, and explain an empty school.
- Keyboard selection of a duplicate household, category changes, missing-family and empty-category states, refresh recovery, cancelled/confirmed draft loss, ledger synchronization and date-range retention were exercised.
- The financial review/lock check used an in-memory response. The browser emitted zero API requests and zero application runtime errors.
- Axe WCAG A/AA checks of the changed workbench: zero violations in all four sections on desktop and mobile. A recurring-tuition panel ID that broke its tab's `aria-controls` was corrected.
- Statement, ledger, charge/credit summary and director receipt previews were checked, including invalid ranges, explicit print invocation, print failure feedback and browser PDF output. The exported statement text and rendering were inspected; it contains the selected family, school, reporting period and balance, with workspace controls excluded. Native printer delivery and the original cloud browser's print UI remain unverified. Director receipts use the new preview opt-in; parent receipt behavior remains on its existing path.
- Full repository gate: `cloud:validate` passed. Production dependency audit found zero vulnerabilities; lint, TypeScript, 2,991 main tests, seven cron tests, 167 access tests and the optimized Next.js production build all passed. Validation used the Node installation's bundled npm 11.12.1 to avoid a local npm 11.17 configuration-forwarding error. The repository's normal web-push postinstall patch was applied after the initial `npm ci --ignore-scripts`; no dependency versions or global configuration were changed.

Repeat the fixture browser check with the local dev server on port 3057:

```powershell
npm run dev -- --port 3057
node scripts/qa-billing-director-ux.mjs
```

The QA runner rejects non-local origins. `/device-preview` remains development-only and retains its API/navigation guard. No authenticated production-director, parent, live checkout, real send or physical-device behavior is claimed from these fixtures.

## Release and rollback

Implementation, fixture verification and local repository validation are complete. Remote checks and preview deployment status are recorded with the PR. This change has not been merged or promoted to production. Publication and school activation remain separate from this review.

Rollback after an approved release is a protected revert of this PR's complete change followed by the normal deployment, canonical-alias, health, log and changed-flow checks. There are no schema, environment or data changes to reverse. The inspected production deployment and base commit above provide the pre-change reference; recheck the actual production target before any future promotion or rollback.
