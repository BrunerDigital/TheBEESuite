# Workflow configuration safety — September 12, 2026

## Current state before edits

Work starts on isolated branch `work/automation-workflow-safety-20260912` at teacher candidate `03e40d13`. Teacher PR #358 must merge through its protected checks and be reconciled before this follow-up release. Unrelated main-checkout edits and all real user/provider/financial/message state remain untouched.

Verified source defects in `automation-workflow-builder.tsx`: New workflow clears only the selected ID, retaining prior fields/status; initial nullable fields are populated with unrelated tour-template defaults; workflow selection and inputs remain editable during a save; any HTTP success clears the uncertainty even without an exact receipt; network exceptions and unsaved navigation lack recovery. Applying a template can silently replace entered message text.

The operations API omits empty conditions instead of clearing them, drops unknown JSON fields, and changes an existing workflow's brand to the first tenant brand. Conflicting tenant/brand ownership passes the old OR scope. The displayed Active/Auto-run/Execution wording implies a dispatcher that is not implemented for these saved workflow records; seeded run records are not evidence of live dispatch.

## Scoped correction and verification plan

Use one canonical draft mapping and explicit new draft, lock save target and pending inputs, validate the exact normalized save receipt, preserve drafts after uncertain outcomes, guard destructive form transitions and ordinary navigation, preserve unrelated JSON and ownership, and make configuration-only behavior explicit. Add fake-data unit/API/browser regression coverage and complete protected build/release verification. This work must not activate dispatch, send a message, change billing/access, or mutate a provider.

Implementation and release evidence will be recorded below after verification. General management-role production QA remains dependent on a valid approved synthetic session; reserved parent/teacher accounts cannot prove this management-only editor.

## Implemented correction

- One account-scoped ownership predicate serves the list, totals, history joins, and transactional save. Consistent direct ownership and legacy brand-only ownership remain supported; conflicting or absent ownership is rejected. Empty tenant scope is rejected before a transaction, and reusable scope clauses cannot be overwritten by an ID.
- Existing tenant/brand ownership is never rewritten. New records belong directly to the actor's tenant with no arbitrary first-brand selection. The established director/assistant management permissions remain unchanged; the page explicitly explains that this configuration is account-wide, not limited to the selected school.
- Saves recheck the current active actor and management role inside a serializable transaction. A deterministic full-record signature prevents stale page edits; full persisted-snapshot compare-and-set protects the transaction. The audit commits atomically, and configuration saves return early without creating runs, dispatching messages, or invoking generic notifications.
- Shared normalization distinguishes new from existing records. New drafts start blank with explicit manual/task defaults and Draft status. Saved missing/null fields do not become unrelated examples or invented actions. Existing unknown nested JSON survives; incompatible non-object legacy JSON fails closed. Clearing editable condition values writes explicit nulls and a review boolean, never an omitted update. Name-only edits preserve legacy action keys, including absent/null type and channel.
- The editor has one captured draft/target/baseline. Record, New, template, discard, and ordinary page transitions protect unsaved input. Pending controls, including the Base UI switch and pagination, are disabled; an immediate in-flight guard prevents duplicate clicks.
- A receipt must prove the exact entity, mode, record, normalized fields, complete merged JSON, and configuration-only status. Unknown responses retain entries and disable Save. Users can refresh the saved list without losing those entries, then explicitly select a saved record or discard/start a fresh draft. No database-level exactly-once create guarantee is claimed; the UI prevents automatic or immediate ambiguous retries and clearly requires review before a new draft.
- Saved workflows are reachable through counted 50-record pages with stable status/name/ID ordering, repeatable-read totals, and only one historical event per row. Page-key remounting prevents App Router navigation from carrying a prior page's editor onto the next page. Same-page refresh retains the confirmed receipt.
- Runtime/auto-run claims were replaced by configuration-only wording. Historical event statuses are not delivery proof. Preview data no longer invents completed/sent runs.

## Local verification

- Final `npm run vercel-build` passed: Prisma generation, lint, typecheck, **2,027 tests with zero failures**, and optimized Next.js production build. Log: `output/wave6-vercel-build-final.log`.
- Full recovery harness passed in Chromium and WebKit: **30 explicitly intercepted fake writes per engine**, zero client exceptions. This includes unknown existing/new saves, full JSON receipts, same-tick duplicate prevention, all pending controls, template/record/navigation discard guards, and App Router-style page changes. No backend, provider, or real record was written.
- The settled WebKit workflow screenshot was separately inspected after the pending state cleared: `output/playwright/ui-flow-recovery-webkit/workflow-confirmed-390-stable.png`. The main harness's earlier screenshot can capture the success message before transition controls settle; it is not used as settled-state evidence.
- Both Parent and Teacher `mobile:store:check` passed. Independent critical-only code review and `git diff --check` passed.
- Independent review drove regressions for missing tenant scope, locale-independent signatures, App Router prop transitions, unconfigured legacy actions, and uncertain creates.

Protected release and production verification remain required. General management-role production saves cannot be tested with the current invalid general-QA credentials; working reserved parent/teacher accounts do not have permission to exercise this editor. Native/device workflow behavior is not claimed.

## PR #359 corrections and final candidate verification

- Actual AppShell/device-preview checks caught an implicit grid track expanding to 578px at 200% text while an ancestor concealed page overflow. Explicit zero-minimum single-column tracks, wrapping review controls, full selected labels, auto-height buttons, and fixed mobile gutters now pass **8/8** Chromium/WebKit cases at 320/390px and 100%/200% text. Shared portaled Select options now retain a 44px minimum independent of AppShell ancestry. Evidence: `output/playwright/workflow-actual-geometry-fixed/results.json`.
- Four axe checks report zero violations. Chromium contrast checks include manual-review/incomplete items; zero automated violations is not a full accessibility certification. The small 320px/200% director shell still has limited vertical room from persistent chrome; this remains a separate consolidation task, not hidden form overflow.
- PR review caught structured legacy condition rules/audiences being replaced with null during a name-only edit. Objects, arrays, numbers, and booleans now remain unchanged unless explicitly replaced by text. Incompatible legacy review-flag formats fail closed before mutation. Exact receipt regressions cover retained and altered structured values.
- Browser Back/Forward protection now tracks existing history entries from the root layout, preserving every opaque framework state field. A trusted `beforeInteractive` listener runs before Next hydration because Chromium does not guarantee capture priority for Window-target events. Cancel restores the exact existing entry with `history.go`; no sentinel, duplicate history entry, guessed foreign-entry offset, draft serialization, or local/session storage is used. Cross-document exits retain their existing unload guard.
- **9/9 actual Next.js history checks per browser** passed in Chromium and WebKit: cancel/accept Back and Forward, multi-entry traversal, repeated same-URL entries, exact visible draft/URL retention, unchanged history length, no downstream router event on cancellation/restoration, ordinary link cancellation, hash-only navigation, and opaque Next state retained with native null push/replace. One initial document navigation per run; all other transitions used Next client navigation. No API/provider requests or writes. Evidence: `output/playwright/unsaved-history-{chromium,webkit}/results.json`.
- Both full recovery harnesses passed again with **30 intercepted fake writes each** and zero client exceptions. Their emitted CSS modules now load in the fixture; the confirmed screenshot waits for controls to settle.
- Final correction gate `npm run vercel-build` passed: Prisma, lint, typecheck, **2,034 tests**, and optimized production build. Both mobile store checks and final independent critical review passed. Log: `output/wave6-vercel-build-review-corrections.log`.

Parent home-fit work is safely retained separately and is not part of this candidate. PR #359 must complete fresh protected checks and exact production verification before being described as live.
