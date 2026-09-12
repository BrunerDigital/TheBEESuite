# Parent home and family navigation fit — September 12, 2026

## Current state before changes

Isolated branch `work/parent-home-fit-20260912` starts at verified workflow candidate `1674fc57`. PR #359 must complete protected release before this follow-up is merged. Unrelated primary-checkout changes and production data remain untouched.

Fresh Chromium/WebKit checks of the actual `/device-preview` page reproduced three defects that the existing page-overflow tests missed:

- Enlarging text or resizing from desktop leaves the active Family section partially or completely outside its horizontal strip. At 320px with 200% text, the Notifications & Privacy tab itself is wider than the strip. The existing effect runs only on section/view changes and can scroll the whole page.
- The Home payment link clips its own label at 200% text (56px at 320px and 21px at 390px), despite zero whole-page overflow. It uses button styling without the shared wrapping behavior.
- An otherwise quiet account card consumes 198px at normal text and up to 730px at 200% text. Decorative icon, duplicated headings, oversized gutters, and redundant balance/footer copy compound the height. Missing accounts are currently presented like a zero balance.

## Scope

Keep the active tab visible after layout changes without changing focus or vertical scroll. Allow every tab and payment link to wrap with a minimum 44px target. Consolidate the quiet account summary only when complete server counts prove no open invoice or pending payment, with no provisional credit, bank verification, responsibility review, reauthorization, transition, or continuity warning. Preserve payment destinations, permissions, history, and all balances; no financial mutation or new payment action is authorized.

Use fake local scenarios for screenshots and browser regressions, then full protected build/release and guarded production checks. This is UI/read-only query preparation, not evidence that all school billing is settled or activated.

## Implemented and locally verified

- Family navigation observes its container and every tab, batches one animation frame, and adjusts only the strip's horizontal scroll when the active item is clipped. All six tabs wrap within the strip's width; desktop-to-phone resize and 100%/200% text changes preserve focus and vertical scroll.
- Home payment links use the shared wrapping button treatment. The quiet account summary is one clearly labeled, family-scoped link; every tap target remains at least 44px. Duplicate headings/footer copy and text-scaled decoration were removed, not readable text.
- A real billing account, complete zero open-invoice count, complete zero DRAFT-payment count, zero provisional ACH credit, and absence of every active billing notice are required before compaction. The DRAFT count is a read-only aggregate within the existing account query, not the bounded payment history. It intentionally keeps stale/manual DRAFT accounts expanded rather than declaring them settled. No payment eligibility, balances, history, or provider behavior changed.
- Missing accounts now explicitly say details are unavailable instead of implying a current $0 balance. Expanded cards and existing destinations remain for pending, ACH, open-invoice, credit, responsibility-review, reauthorization, transition, bank-verification, and continuity states. The neutral compact copy says only the amount currently due.
- Chromium **76/76** and WebKit **76/76** actual-preview fit cases passed, plus every desktop-return tab check: no page or internal payment-link overflow, no focus/vertical-scroll theft, zero API calls/writes/client errors.
- Chromium **48/48** and WebKit **48/48** broader mobile-density cases passed at 320/390/768px and 100%/200% text. All four parent and six teacher shortcuts remain accessible; default-size phone actions fit above navigation. Teacher keyboard focus checks passed.
- Quiet card height: **198px to 98px** at default text; **730px to 298px** at 320/200%; **546px to 258px** at 390/200%. Fresh fake-data captures and metrics are under `output/playwright/parent-home-fit-{chromium,webkit}/` and `mobile-density-wave7-{chromium,webkit}/`.
- Focused regression selection passed **32/32**. Final `npm run vercel-build` passed Prisma, lint, typecheck, **2,039 tests**, and optimized Next.js build. Lint retains one pre-existing non-failing unused-parameter warning in the preceding workflow test fixture; no rule was weakened. Both mobile store checks passed. Log: `output/wave7-vercel-build.log`.

Protected release and authenticated production changed-flow checks remain required. This wave does not resolve the separately identified account-level pending-payment recovery copy or older parent history continuation; those remain actionable follow-ups, not human-only gates.

## Protected release and live verification

- PR #360 merged September 12 at 16:08:46 UTC: candidate `1e4e6ef0ee1d3d1a49588c18c6747d642da02b76`, main `e414dc3d59385ea9dccec6da82d1eacd8f1ede61`. CI `34704002301`, CodeQL `34704001140`, preview and independent review passed; no unresolved review threads.
- Production `dpl_8ySg1CTQNHRn7rcdSMgqrBxLWbwA` was explicitly Ready at the exact main SHA on all five canonical aliases. Build-error output had no errors; health at 16:17:49 UTC returned `ok: true`, database connected. Post-flow error/fatal and 5xx counts were empty.
- Fresh fake scope proved at 16:15:12 UTC; authenticated checks completed at 16:17:06 UTC. **52 new fit cases passed**: all six Family tabs at 320/390px through 100→200→100→200 text changes and desktop returns, preserving focus/vertical scroll, plus four actual compact account-card cases with exact family-scoped payment links. The live 390px Home and 320px/200% Family captures were visually reviewed.
- The prior 20 Parent/Teacher navigation, profile, report-control, document, attention, layout, shortcut and unsent-history checks passed again. Only two reserved-account login POSTs and 40 session heartbeats were allowed; zero product writes, blocked requests, HTTP/client errors or downloads.
- Evidence: `output/playwright/app-review-production-after-pr360/results.json` and fake-data screenshots. The first probe measured immediately after a font style write without waiting for ResizeObserver/render frames; its failure is preserved in `failure-before-layout-settle.json`. The corrected probe waits three animation frames, matching the local browser test, then applies the same geometry/focus/scroll assertions. No application fix or weakened assertion was needed for that timing failure.
- These are authenticated browser results, not signed native, physical-device, TestFlight or App Store evidence. Pending-payment clarity and older parent history remain separate actionable work.
