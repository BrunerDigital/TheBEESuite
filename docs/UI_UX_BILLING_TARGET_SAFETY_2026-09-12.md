# Exact billing targets and role-correct flows — September 12, 2026

## Baseline before changes

- Isolated branch `work/billing-target-flow-safety-20260912` was created from current `origin/main` (`7e36706c`), then fast-forwarded to the locally verified PR #355 candidate `581187e1` to retain shared UI recovery components. This wave must not release until #355 is merged and its production deployment verified.
- Workbench explicit missing family IDs fall back twice: the initial selection and derived effective selection both choose another family. An explicit school/family mismatch also permits a different family to appear. The payment-terminal initial selection has the same fallback.
- Terminal and ledger components are not keyed to URL selection changes, so client navigation can retain a previous family. Ledger initial selection already fails closed and must retain that behavior.
- Billing-only users receive family-profile/enrollment links they cannot use; the child-setup button posts to an operations-only endpoint. Billing permission is not enrollment permission. Invoice-number links can automatically substitute a matched current family while a separate explicit current-family link already exists.
- Current-family/owing-account caps can exclude authorized paid historical targets. Exact-target reachability and read-only historical eligibility must be reviewed without broadening charge, payment-method, or enrollment authority.

## Boundaries

Code, fake-component navigation, and mocked requests only. No charges, refunds, invoices, ledger entries, enrollment, roles, identities, or provider settings will be changed. Explicit unresolved targets must show a recovery state until a user deliberately selects a valid authorized family. No fallback to a different family is acceptable for a requested exact ID.

## Implemented and released through PR #356

- Exact family/school links never substitute a different account in the workbench or terminal. Exact child links are also exact-or-unselected. Terminal and ledger remount for a changed URL selection using collision-safe keys.
- Capped eligible family lists receive only an exact authorized, still-eligible supplement through the identical Prisma predicate and selector. Settled historical accounts use existing authorized ledger-account metadata, including accounts with no entries; they never mount the writable workbench or terminal. Historical invoice links preserve their original account and status filter. A separate current-family suggestion remains an explicit action, not an identity substitution.
- Profile/enrollment links reflect actual role capabilities. Billing-only users can continue authorized billing tasks and see who must handle enrollment changes. Auditor payment actions remain hidden.
- Confirmed family/school changes reset every family-bound financial draft and receipt-copy context. Date-only and selector-only edits participate in the discard guard. Child switches separately guard affected tuition/profile drafts. Pending writes disable the entire billing form and explicit target handlers.
- Ordinary link navigation, invoice changes, and tuition-rate changes ask before discarding the affected draft. Selecting a different invoice/rate does not discard unrelated check/cash input. Browser Back and arbitrary programmatic routing are not claimed to be guarded by this shared hook.
- Reader targets lock before request dispatch; async completions continue through the mounted component so obsolete targets do not overwrite new state. Family/invoice/amount/reader/presence remain fixed through pending or uncertain outcomes. Malformed HTTP success or server errors without a payment receipt stay in review. A completed receipt cannot issue the same charge again. No live reader or Stripe account was used.
- Read-only reader/amount quotes have a separate loading state, 300 ms debounce, and abort on superseded target. Slow quotes do not disable custom-amount typing; payment and reader-registration POSTs still lock synchronously. Confirmed failure status receipts now include the exact payment ID, matching the existing success receipt.
- Shared uniform constants are now client-safe; database-backed product provisioning remains server-side. Prices and server behavior are unchanged.
- Initial/reset billing dates use the selected school's local calendar. Other cadence-editor defaults remain a separate follow-up; this is not a claim that every historical date path was reworked.

## Verification

The real-component localhost harness passes existing recovery cases plus exact/mismatched targets, deliberate recovery, A-to-missing-to-B navigation, history without ledger rows, role-correct links, child targeting, affected-draft confirmation, full family-draft clearing, date-only guards, held reader requests, invoice/rate discard confirmations, link navigation cancel/accept, and sequential amount typing while a quote is held. Eighteen mocked requests are intercepted locally across the entire harness; none reach a database/provider. Browser screenshots under `output/playwright/ui-flow-recovery/billing-target-*.png` use fake data only. The final harness rerun also includes merged PR #354's shared navigation guard.

Typed helper tests and existing role/auditor/terminal/uniform regressions run without production writes. Static native readiness passes both apps; no native project settings changed. Full production gate is rerunning after the final safeguards. Prior failures were correctly reported: a React Compiler memoization diagnostic, a fixture type annotation, and a stale assertion for the old inaccurate terminal eligibility copy; no checks were disabled.

The final `npm run vercel-build` passed Prisma generation, lint, typecheck, all 1,995 tests, and the optimized Next.js build after the slow-quote correction and ordinary incorporation of PR #354 (`d4b12d49`, merge `3962b8f4`). Existing manual-payment clock and navigation assertions were updated to validate their shared helpers, preserving local-time and unload/link coverage. Independent read-only review passed 43 focused tests and found no remaining release-blocking issue in this diff. Both static mobile-store checks and `git diff --check` pass. Deployment and authorized billing-role production verification remain distinct gates.

PR #355 was merged and production-verified before this wave: `40c48a9a`, Ready `dpl_73M8wfzhCChdcktnrJF4RxHGJC3Z`, healthy database, 20 navigation and two teacher-control checks, zero product writes. It was incorporated by ordinary merge `4d747bc4`. General billing-role authenticated production verification still needs working credentials in the secure local environment; no password reset or role change is inferred.

Current official reference: [Stripe server-driven Terminal collection](https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=server-driven), checked September 12, 2026. Reader acknowledgement is asynchronous and is not itself proof of a completed payment. This wave changes local targeting/feedback, not Stripe API versions, payment intents, webhooks, or provider configuration.

### Final release evidence

- PR #356 passed protected checks (CI `34674178053`, CodeQL `34674177596`), then squash-merged candidate `c74227318b059121319b5bc0484623df6e1ac864` as main `0698eda62d6eab286e6d128037a2dacfc7cf4533` at 04:57:10 UTC on September 12.
- Production `dpl_HRXNJGDx5wHC2n3vzjDawBRPSsdB` is Ready on that exact main commit at 05:00:01.308 UTC. All five expected aliases are assigned; canonical `thebeesuite.io` is public, www/beta redirect there, and generated project/branch aliases remain Vercel SSO-protected.
- Canonical health at 05:02:31.549 UTC returned HTTP 200, `ok:true`, `database:connected`. Deployment-scoped error/fatal and 5xx queries through 05:05:09 returned no entries; build review found no failure.
- Fresh isolated fake-review scope proof at 05:03:49 preceded 20/20 Parent/Teacher navigation checks and two teacher-control checks at phone/desktop sizes. Zero page/HTTP errors, overflow, or product writes; only two login and twelve session-heartbeat POSTs. Sanitized evidence is `output/playwright/app-review-production-after-pr356/results.json` with 22 screenshots.
- Billing-specific production authentication remains **not verified** because the existing general role-QA credentials are invalid. Local targeting, draft, and financial-receipt tests are not a substitute for that remaining authenticated production check. No passwords or roles were changed.
