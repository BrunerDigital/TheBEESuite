# Teacher report-target consolidation — September 12, 2026

## Current truth before changes

Clean isolated branch `work/teacher-report-targets-20260912` starts from current main `3f396ffcd28059bb099d6ca96163995e43f0b840`. Parent conversation release PR #366 is in protected validation; reconcile its merged main before this wave's final gates. The dirty primary checkout, unrelated PR #311, other work and live data remain untouched.

Read-only actual Next preview baseline: `output/playwright/teacher-quick-log-baseline/results.json`, eight fake Chromium cases and 16 screenshots. Whole report-target section heights (one / five selected children): 320px at 100% text 314/424px; 390px at 100% 286/334px; 320px at 200% 860/1336px; 390px at 200% 768/1100px. Zero API/off-origin/write requests or client exceptions. Bounds checks passed, but visual review found the 320/200 selected name truncated to `Ava Riv…`.

The section repeats `Report targets`, a chip row, a separate `Child` label/picker and another row of bulk actions. The chip handler changes the shared individual-task child through `chooseChild`; the picker changes only daily-report recipients through `setDailyReportTargets`. These are deliberately different guarded paths and must not be merged behaviorally. The 40-child cap, exact selected IDs, pending lock, removal checks, draft cancellation and report date/parent-sharing settings remain intact.

The first candidate combined the existing chips and actions into a wrapping toolbar and fixed decorative spacing/icons/44px controls without reducing text. Read-only hands-on review then reproduced a misleading cross-task interaction: selecting Mason for reports left individual tasks on Ava; the ambiguous `Selected child` shortcut reset reports to Ava, while tapping the Mason recipient chip changed individual tasks without changing the five report recipients. The final implementation below removes that ambiguity rather than preserving confusing controls merely because they already existed. No backend, authorization, identity, messaging, attendance or report mutation changes are planned.

## Final implementation and local verification

Reconciled with protected PR #366 main `b6237035ffe74b3d2489684f037697fb8f706f44`. The primary checkout, unrelated work and recoverable earlier WIP stash remain untouched.

- One properly labeled, full-width Report targets picker shows the full selected child name, or an accurate multi-recipient count. All names and options wrap without truncation at enlarged text sizes. Empty rosters disable selection and explain that the school office must confirm the classroom.
- Present children and All visible retain their existing guarded report-only handlers. The redundant `Selected child` shortcut is removed: the explicit picker selects one named child without relying on a possibly different individual-task selection.
- Multi-recipient names move into a native keyboard-accessible `View selected children` disclosure, closed initially. Every selected name is listed, including all 40; there is no hidden eight-name limit. These names are read-only and cannot change photo, incident or location targets. A single child's name is already visible in the picker and is not duplicated below it.
- The roster's individual-child selection and Photo's own picker remain available with existing confirmation guards. Incident and Child location still use that shared individual context; this release does not claim they have dedicated child pickers. Their task-local clarity remains an actionable follow-up.
- Pending fieldset locking, exact IDs, current-roster validation, the 40-child hard limit, discard cancellation, report date/mood and staff-only parent-sharing settings are unchanged. Recipient disclosure does not submit, fetch or mutate anything.

Focused regressions pass 30/30. Chromium and WebKit each pass 29 final actual-component cases, including rosters of 0/1/8/9/40/42, 320/390px, 100/200% text, every disclosed name, keyboard open/close, long names, no present children, unchanged independent photo draft/context and full 44px control bounds. Zero API/off-origin/write requests or client exceptions. Evidence: `output/playwright/teacher-report-targets-{chromium,webkit}/results.json`; final logs use `wave14-browser-*-final.log`.

The larger end-to-end fixture suite passes in both Chromium and WebKit after the final simplification and main reconciliation (`output/wave14-ui-flow-recovery-*-final.log`). It substitutes an explicit named one-child picker choice for the removed ambiguous shortcut; the original staff-only backdate preservation expectations remain unchanged. Each run intercepted 30 synthetic attempts locally; no backend or real writes exist in this fixture.

Independent actual-Next navigation passes 8/8 across both engines: keyboard focus, exact hash/query state, same-document navigation, cross-route Back, unsent cancellation, pending state and exact recipients are preserved. Another 10 Chromium geometry cases plus three WebKit disclosure checks verify real application fonts/styles, long names and native Enter/Space disclosure behavior. `teacher-quick-log-final-candidate/results.json` records the original phone viewport measurements; extra tall-viewport clear crops are explicitly presentation evidence, not physical-device screenshots.

| Width / text | One child: before → after | Five children: before → after |
| --- | --- | --- |
| 320 / 100% | 314 → 230px | 424 → 278px |
| 390 / 100% | 286 → 152px | 334 → 200px |
| 320 / 200% | 860 → 360px | 1,336 → 544px |
| 390 / 200% | 768 → 328px | 1,100 → 472px |

Text remains enlarged and all actions at least 44px. The complete selected-name list is intentionally scrollable with the page when opened; fitting every name without any scrolling is not promised. Static `mobile:store:check` passes for Parent and Teacher without native source, capabilities or asset changes. The full `vercel-build` gate passes Prisma generation, lint (zero errors; one pre-existing unrelated warning), TypeScript, all 2,157 tests and optimized production build (`output/wave14-vercel-build.log`). Protected release and fresh guarded fake-account live checks remain pending.

The independently reviewed task-owned production checker adds `--teacher-report-targets` for 12 optional local-only recipient/geometry/disclosure checks. Its 32 offline request-safety tests pass. The flag does not widen authentication, database or request permission; normal mode remains compatible with the preceding PR #366 release. It still refuses execution without an exact Ready commit and deployment, fresh reserved fake graph verification and matching authenticated roles. Native Dynamic Type, signed-device behavior and real classroom content are not inferred from these browser cases.

Final independent read-only diff review found no code, security, state or draft-handling blocker. Source tests and both saved 29-case browser reports were independently checked. The earlier pending-build wording was updated with the completed 2,157-test gate before commit.
