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
