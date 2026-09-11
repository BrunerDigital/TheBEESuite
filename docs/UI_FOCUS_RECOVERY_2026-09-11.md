# Mobile UI focus and long-content follow-up — September 11, 2026

## Current state before changes

- Fresh isolated branch `work/ui-focus-recovery-20260911` starts at current `origin/main`, `395096ef6e789369c82034e50642ad196d60ff4b` (PR #342). The dirty main checkout is untouched.
- Prior accessibility and responsive suites passed, but did not follow every keyboard stop around fixed mobile chrome. Those results are historical, not proof of focus visibility.
- A new fake-data Chromium Tab audit at 390 and 1024 CSS pixels, 100% and 200% root text size, covers parent, teacher, director and executive homes. Production requests and all mutations are blocked.
- At 390 pixels, director/executive KPI reorder controls are fully obscured behind fixed bottom navigation when reached by Tab. Dashboard controls lack the scroll clearance already present on parent and teacher homes.
- At 200% text, the collapsed AI-summary expand button extends beyond its card and is clipped. The title/control layout needs to reflow inside the available width.
- Parent announcements combine `block` and `line-clamp-4`; the display conflict leaves the entire long announcement inside its summary, making the disclosure control thousands of pixels tall.
- KPI links use `height: 100%` while sibling reorder controls occupy additional space. The links extend into the next grid row, so those controls intercept parts of the preceding card.
- The diagnostic's oversized-summary center hit test is not itself a valid focus-obscuration failure. Regression coverage must check the visible intersection for oversized elements, while requiring ordinary controls to remain unobscured.

## Scope and safety

UI layout and browser regression tests only. Preserve routes, parent document links, role/school authorization, preferences, data and integrations. No database, identity, billing, message or provider changes. Director/executive authenticated production verification remains dependent on an approved working demo session; unchanged rejected credentials will not be retried or reset.

## Implemented

- Shared workspace scroll margins clear the measured app header and reserve rem-scaled space for mobile navigation. Existing parent/teacher anchor rules remain intact.
- Parent announcement previews now use the clamping display mode without the conflicting `block` utility. Enter opens the complete body and closes it again.
- Shared collapsed-card headers have a shrinkable grid track and wrapping title/actions, including enlarged text.
- KPI tiles use a flex column; links share available height with the reorder toolbar instead of overflowing it.
- Added four focused regression tests and `npm run qa:home-focus`.

## Fresh local verification

- Replayed the calibrated focus/disclosure audit against the unmodified release: 12 of 16 cases failed (94 recorded findings). The same audit passes all 16 patched Chromium cases.
- Chromium uses actual Tab and Shift+Tab cycles. Windows WebKit skips links in its native Tab mode, even with Alt; its 16 passing cases explicitly use programmatic forward/reverse focus. This is not a claim of macOS Full Keyboard Access verification. [Apple keyboard guidance](https://support.apple.com/guide/safari/cpsh003/mac).
- Ordinary controls must fit entirely between fixed chrome and pass nine-point hit testing. Large linked cards/disclosures must expose at least half the usable viewport without obstruction. Escape dismisses tooltips before testing, rather than treating a dismissible tooltip arrow as fixed navigation.
- The 32 Chromium/WebKit accessibility cases pass with zero violations, unresolved findings or unsafe API requests. Existing role interactions and 200% text checks are rerun separately.
- Focused UI tests: 16 passed, including the four new regressions.
- `npm run mobile:store:check`: passed parent/teacher repository configuration, identity/version, HTTPS/offline, static permissions/privacy, icons/splash and archive-scheme checks. Signing, archives, TestFlight, physical devices and Apple acceptance are not proven by this command.
- Production gate and protected release evidence will be recorded in the closeout artifact after completion. Browser evidence is synthetic web evidence, not native simulator/device or App Store evidence.
