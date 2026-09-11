# Mobile feature UI verification — September 11, 2026

Scope: parent and teacher feature screens, with shared help and navigation-clearance fixes. This is a web UI release, not an App Store submission or a claim that physical iOS testing is complete.

## Authenticated production follow-up

PR #345 reached Ready production at `a50427e9`. All ten parent screens passed at normal text size, health and public routes passed, and runtime error logs were empty. Enlarging the actual fake App Review parent's home to 200% exposed a 7px overflow inside the expanded day-details summary (the page itself did not overflow). The rotated plus icon extended outside its box; announcement disclosures had the same pattern. Shrinkable labels and separate plus/minus states eliminate the protrusion without clipping focus rings or content.

The approved fake teacher's 320px/200% live header also overflowed by 156px: the full authenticated toolbar includes controls intentionally omitted by the earlier preview. The follow-up keeps mobile icon targets at 44px, constrains the account avatar, and adds disabled search/notification counterparts to the no-network preview. Bottom navigation reflows enlarged labels into readable rows with 48px-minimum targets. The feature matrix now includes the single-child home, header controls, bottom navigation and reserved content clearance. No authenticated tool, destination, permission or business behavior is removed.

This follow-up uses `work/mobile-home-disclosure-20260911` from current `origin/main` at `a50427e9`. Final production verification is required after its protected release; earlier successful checks are not a waiver of a later failure.

## Current-state evidence and fixes

Baseline: `origin/main` at `24f86b8a5f9302664efca06477677f7ea81297a6` (PR #344). The primary checkout contained unrelated work, so implementation and validation use `work/mobile-feature-polish-20260911` in an isolated worktree. No database, identity, role, access, provider, financial, messaging, or native-entitlement changes are included.

The initial 20 normal-size mobile screenshots passed simple page bounds. Opening the actual forms with enlarged text exposed failures that those screenshots missed:

- Parent profile/document summaries, PIN actions, payment receipts, and nested form buttons could overflow or clip. Scoped reflow rules now allow labels, badges, grids, selectors, and actions to grow.
- A long classroom recipient could consume the chat history area; a long draft could push the send control outside the phone. The history keeps a minimum scrollable area and the composer stays in document flow with shrinkable fields. Opaque chat surfaces and explicit self-message metadata colors improve dark-mode contrast.
- Family documents stopped after five entries. The list now reveals every already-loaded document, five at a time, with a visible count and keyboard focus continuing at the first newly revealed item. The existing server query limit remains unchanged; this does not introduce unlimited historical pagination.
- Empty updates displayed duplicate explanations and reports repeated the same anchor ID. Empty states are now singular and the legacy first-report anchor remains unique.
- Sticky teacher shortcuts covered enlarged forms. They remain available at the top of the workspace without overlaying the fields. Long roster names and attendance/report badges reflow.
- Tablet `sm:p-6` overrode bottom clearance, hiding the final profile control beneath fixed navigation. Explicit tablet bottom padding preserves clearance. Short phone viewports let the portal header scroll with the document.
- Inline help could remain over form fields and extend outside a phone. The shared InfoTip now uses the installed Base UI popover: touch-sized trigger, bounded scrollable content, Escape/outside dismissal, visible close action, and focus restoration. No new dependency was added.

## Verification matrix

| Area | Implemented | Local verification | Production verification |
| --- | --- | --- | --- |
| Updates / daily reports | Reflow, unique anchor, meaningful empty state | Synthetic long-content and empty fixtures; selectors and expanded reports | Required after deployment |
| Messages | History/composer sizing, readable dark surfaces | Reply/cancel, long unsent draft, local attachment/remove, recipient options | Required with approved fake parent account |
| Payments / billing settings | Wrapping cards, receipts, invoice history, dismissible help | Expanded history and settings; no collection or payment-method changes | Read-only UI checks required; no money movement |
| Children / check-in | Reflowing summary/status and PIN form | Expanded child records and credential panel; no PIN save | Read-only UI checks required |
| Documents / requests | Reveal loaded documents, count, focus continuation, clearer disclosure | 5 → 10 → 12 keyboard progression; unsigned signature draft; no submission | Inspect actual fake-account document availability |
| Profile / notifications | Reflowing forms and help | Expanded forms and account-deletion explanation; no request or save | Read-only UI checks required |
| Teacher | Non-overlaying shortcuts, roster reflow, final-control clearance | Expanded panels; meal add/remove, nap recovery, unsaved note; eight selectors | Approved fake teacher account; no reports sent |
| Other role shells / parent homes | Shared spacing preserved | Director, executive, regional, billing, auditor, pickup and five parent home scenarios | No approved director/executive session added or changed |
| Parent / teacher native projects | No native source or capability changes | `mobile:store:check` passes | macOS archive, signing and physical-device testing not performed here |

## Repeatable local checks

Original PR #345 verification: 200 feature layout/interaction cases (160 light + 40 dark), 40 supplementary accessibility cases across both browser engines/themes, 33 cross-role/home responsive cases, 63 focused regressions, and all 1,904 repository tests. No attempted writes, unexpected API requests, or client exceptions were recorded in those synthetic feature matrices. The complete `npm run vercel-build` gate (Prisma generation, lint, typecheck, tests, optimized Next build) and both-app static store checks passed. Intermediate failing source-contract assertions were updated to guard the new non-overlaying layouts; browser assertions were not weakened.

Follow-up local browser verification: 220 feature cases (176 light + 44 dark), plus 44 repeated 320px cases after the final navigation-label spacing adjustment, all pass without attempted writes, API requests or client exceptions. All 44 supplementary accessibility cases (both engines, both themes, including home) and 33 role/home responsive cases pass. Focused regressions: 66 pass. Lint, typecheck and both-app static readiness also pass. The complete production build is a separate required release gate.

Install the locked dependencies and generate Prisma normally. Start the development preview with `npm run dev -- --hostname 127.0.0.1 --port 3212`.

```powershell
npm run qa:mobile-features
npm run qa:mobile-features -- --browser webkit
npm run qa:mobile-features -- --width 390 --theme dark
npm run qa:mobile-features -- --browser webkit --width 390 --theme dark
node --import tsx --test tests/mobile-feature-reflow.test.ts tests/ui-accessibility-regressions.test.ts tests/ux-wave4-credentialed-friction.test.ts tests/ui-home-refinement.test.ts tests/app-wide-ui-density.test.ts tests/parent-portal-navigation.test.ts tests/message-conversation-ui.test.ts
npm run mobile:store:check
```

The feature matrix covers eleven screens, widths 320/390/768/1024, normal and 200% root text, Chromium and WebKit; the additional dark matrix covers 390px at both text sizes. It exercises real components with fake data, rejects production URLs, blocks API/external requests and all writes, checks control/text bounds and selector/help positioning, and fails on client exceptions. Browser text scaling is not a physical-device Dynamic Type or keyboard test.

The supplementary accessibility evidence uses axe WCAG A/AA checks plus rendered-color verification for parser/occlusion gaps. Offscreen horizontal navigation is scrolled into view before measuring; unresolved colors or obscured targets fail rather than being waived. Native WebKit on Windows is not iOS Safari on a physical device.

Local evidence is retained under the primary checkout's ignored `output/playwright/mobile-features-20260911/` directory: `STATE_BEFORE.md`, before/after screenshots, responsive JSON matrices, accessibility reports, build/test logs, and the protected release/production report. Failed intermediate runs remain historical diagnostics, not current passing evidence.

## Release and external gates

Require `npm run vercel-build`, protected CI/merge, the exact merge SHA on a Ready production deployment, canonical aliases, healthy `/api/health`, clean relevant logs, and authenticated changed-flow verification. A public 200 is insufficient. Production credentials remain local and are never stored in evidence or Git.

Both Capacitor apps retain their existing bundle IDs, native projects, version/build, icons, privacy manifests and launch paths. Static readiness passes; Capacitor reports matching installed packages. This Windows environment has no Xcode, so this UI batch supplies no signing, archive, simulator, physical-device or TestFlight evidence. No store or provider publishing is authorized by this release report.
