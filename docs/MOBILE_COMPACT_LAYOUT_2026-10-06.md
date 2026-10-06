# Mobile compact layout follow-up — 2026-10-06

## Baseline and scope

Started from protected main c4c045b7 in the retained isolated mobile worktree.
Short teacher controls and parent summary values still occupied entire rows on
normal phones. The existing full-screen audit and local fixture inspection
identified suitable pairs without changing any data or workflow behavior.

## Changes

- Teacher meal type/amount and nap start/end share a row when space permits.
- Teacher report date/mood and staff clock totals use the available width.
- Parent child day details, daily care cards, and contact summaries use compact
  columns on phones with sufficient space.
- Teacher profile save and parent history pagination buttons fit their labels.
- Column minimums are in rem units, so enlarged text and narrow containers
  automatically stack. Long text fields, recipients, and date-time inputs keep
  their existing widths. Existing touch targets and desktop grids are preserved.

## Verification

- All 11 portal screens: WebKit at 390px/light and Chromium at 320px/dark,
  normal and 200% text, touch input and rotation (44 cases).
- Teacher tablet layout: WebKit at 768px, normal and 200% text (2 cases).
- Final parent column adjustment: Home, Updates, Profile repeated at 390px,
  normal and 200% text with touch and rotation (6 cases).
- Browser checks cover field focus, selectors, draft retention, navigation
  clearance, long content and absence of client exceptions or API writes.
- Focused parent UX, today, teacher login and short viewport tests: 11 passed.
- Production gate passed: lint, typecheck, all 2,631 tests and Next build.
- 24 grid measurement cases at 320/390/412px and normal/200% text passed.
  At 390px, affected teacher groups save 258px of height and the two sample
  parent reports save 176px compared with stacked rows. All groups stack at 200%.
- Screenshot and before/after grid-height measurements are retained under
  output/playwright/compact-measurements in this worktree.

Live parent authentication remains unverified because the available review
credential is rejected. No credentials, roles, data, messages, payments, provider
settings, or store submissions were changed. Physical iPhone keyboard behavior
remains a separate verification gap.
