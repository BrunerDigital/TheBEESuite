# Parent home and document flow — September 12, 2026

## Current baseline before changes

Started on isolated branch `work/parent-document-home-flow-20260912` from current `origin/main` (`d4b12d49`) and incorporated the validated billing candidate `c7422731`. That candidate is protected PR #356; it must be merged and deployment state reconciled before this wave releases. Unrelated main-checkout work is untouched.

The current production fake-parent home was visually inspected from `output/playwright/app-review-production-after-pr355/parent-mobile-home.png`. The one-child screen is compact, but all child cards precede the four everyday shortcuts. Multiple children therefore push primary tasks downward. The current document query caps all statuses together at 20; old approved records can hide required requests. `SUBMITTED` is incorrectly counted as a parent action, and stale signature markers can override completion status. Expanding the client list cannot recover rows omitted by the server.

## Intended scoped correction

- Put the existing everyday shortcuts before the child list without removing any features or reducing touch targets.
- Use shared status-first document state, distinguishing action required, awaiting school review, and complete. Keep optional replacement submissions explicit.
- Add scoped, counted, priority-first document pagination and exact-request recovery while signing only fetched rows. Preserve native document-link navigation, family selection, and server-side authorization.
- Guard unsent document/message/contact drafts across ordinary links and document pages.
- Add fake-data behavior, scope, paging, and responsive regression coverage, then run protected release gates.

No production records, signatures, messages, family access, or school configuration are changed during implementation or QA. Older report/message/media continuation remains a separate follow-up. This wave now also corrects the bounded-list attention-count defects described below.

## Implemented; release validation in progress

- Parent shortcuts precede the sibling list. Required actions precede today’s children; a quiet “caught up” panel follows them. Family subviews use specific headings, and the duplicate Home header button is hidden only while mobile bottom navigation is available.
- Required documents lead stable, counted 20-record pages; every page is reachable. An exact linked document outside the current page is separately scoped and loaded, never replaced with another document. Missing links show a recovery state. Submitted work says “Awaiting school review,” with replacement optional; complete records never reopen because of a legacy signature marker.
- Open-invoice and unacknowledged-incident counts come from complete scoped queries inside the same repeatable-read snapshot as the bounded lists. Their next required record is included first, so the home action actually leads to a rendered record. Confirmed acknowledgments are not subtracted twice after refresh. Payment-continuity invoices remain accessible; classroom incidents/documents do not.
- Current children are independently bound to the actor’s tenant. Document reads and writes require matching family/child ownership; moved, inactive, cross-tenant, ownerless, and conflicting dual-owner links fail closed. Family-only, child-only, and consistent restricted records remain supported.
- Document submission rechecks current actor, guardian link, tenant/school and child scope, then performs an exact snapshot compare-and-set, note, and audit in a serializable transaction. Missing upload files and string-valued false consent are rejected. Known conflicts clean up only the newly uploaded object; ambiguous failures retain it, never deleting an existing document version. Post-commit notification failure cannot manufacture a failed submission; recipients must have current tenant/role/school access and dated grants.
- The client clears a draft only for the exact submitted receipt. Pending controls lock. Optimistic submissions apply only to the original record snapshot; freshly received server decisions always win, including a newly rejected document that needs correction. Ordinary links/unload guard document, message, and contact drafts; browser Back and arbitrary programmatic routing are not claimed to be covered.
- Enlarged parent navigation wraps into at most two readable rows at 320/390px. At 320px/200% text, document fields increased from 142 to 246px; nested padding and decorative icons stay compact, while fonts and interactive labels retain their size. Parent message edge-to-edge margins share the same page gutter to avoid an enlarged-text overflow regression.
- Real cross-browser testing reproduced a shared teacher shortcut race: click plus hashchange queued two focus frames, and the stale frame could steal focus before the next Enter key. Navigation now deduplicates those events, cancels superseded frames, and respects newer focus intent, prevented navigation, modifier keys, and different query routes.

## Evidence and limitations

- Focused scope/status/paging/submission/attention/navigation tests pass, including real API module mocks proving transactional rollback and exact receipts. The localhost real-component recovery harness passes with 20 intercepted fake writes and zero backend/provider requests. It includes a deterministic delayed-frame focus regression, 25+ document histories, explicit unavailable targets, unsent draft cancellation, malformed success receipts, and older invoice/incident actions.
- The first full gate reached 2,009 tests with four stale source assertions (old labels/authorization shapes). Each was updated to assert the new behavior and retained or stronger scope requirements; the affected 38 tests pass. No rule or gate was disabled.
- Fresh post-resume source verification under `output/playwright/parent-document-source-localhost/` passes 48 Chromium plus 48 WebKit density cases, eight document cases, eight message cases, two deterministic focus cases, and eight document-geometry cases. Both engines verify 246px fields, a 114px submit button, and an unbroken Documents heading at 320px/200% text. There were zero backend/provider requests, layout overflows, or client errors. The restarted Next development server must use its matching `localhost:3224` origin; earlier 127.0.0.1 HMR failures were environmental and are not passing evidence.
- A full-gate retry caught an overly narrow inferred union in the fake-document fixture state. The fixture now explicitly uses the real component's document prop type; production types and rules were not weakened. The complete gate is rerunning before PR #357 can merge.
- Static `mobile:store:check` passes both apps. This web wave does not establish signing, archive, physical-device, authenticated-native, TestFlight, or submission approval.
- Prior PR #356 is merged as `0698eda6` and Ready with healthy production checks; its exact evidence is in `UI_UX_BILLING_TARGET_SAFETY_2026-09-12.md`. Wave4 production release remains pending until its own full gate and protected workflow complete.
