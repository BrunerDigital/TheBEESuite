# UX declutter wave — review versus update work

Date: 2026-09-02
Branch: `work/ux-declutter-20260902`
Base: `origin/main` at `82d34c80eb3ef5a5618bfdceb41f9831f35b85de`

## Goal

Continue the product-wide street-level UX work by making a clear distinction between:

- information a user is reviewing, which can be summarized and expanded; and
- information a user is adding or changing, which should have a clear button and a stable page or section destination.

This wave changes presentation and navigation only. It does not change routes, API behavior, authorization, data models, business rules, or production records.

## Current-state audit

| Surface | Evidence of overload | Treatment in this wave |
| --- | --- | --- |
| Agency subsidy billing | Three full data-entry cards and the entire claim queue competed on one screen. | Added a review/update directory, stable anchors for all three forms, and an expandable claim queue with claim/attention counts in the collapsed summary. |
| Staff management | Coverage summaries, classroom assignment, schedule generation, time-clock editing, payroll tables, printable time cards, staff profiles, certifications, and schedules were presented in one continuous workspace. | Added a task directory, made coverage and payroll review sections expandable, and added stable anchors for five update workflows. |
| Family billing workbench | Eleven billing tabs had equal visual weight even though invoice correction, batch recovery, payroll deductions, refunds, agency claims, and adjustments are secondary workflows. | Kept four routine tasks visible and placed seven secondary workflows under one expandable “More billing tasks” group. Added review and update destinations plus refresh-safe anchors. |
| Corporate administration | School, user, and owner-group directories appeared alongside bulk import and multiple access-editing forms in one long screen. | Added a review/update directory, made school and user directories expandable, and added stable anchors for five administrative update workflows. |

## Existing surfaces intentionally retained

These areas already use the requested pattern or a more task-appropriate equivalent and were not reworked in this wave:

- Shared application shell: primary destinations plus expandable product neighborhoods.
- Role dashboards: focused street-level content plus expandable dashboard details.
- Parent portal: role-specific sections and existing disclosure panels.
- Teacher workspace: anchored, collapsible task cards designed for touch use.
- Family record editor: sticky anchored section navigation for its editing-first workflow.
- Data readiness: distinct overview, review queue, and import tabs with drawer-based record review.
- Integration setup: provider selection exposes only one provider configuration at a time.

## Shared interaction contract

`WorkspaceSectionDirectory` is the shared pattern for dense operational workspaces:

1. “Review information” uses normal links to stable review anchors.
2. “Add or update” uses clearly labeled links styled as buttons.
3. Native hash navigation remains bookmarkable and browser-history friendly.
4. Every target uses scroll margin so the shared header does not cover it.
5. Collapsed review sections retain a meaningful summary and an explicitly labeled expand control.
6. Routine actions remain visible; secondary actions may be disclosed progressively.

## Compatibility and safety

- No existing route was renamed or removed.
- Existing query parameters and hashes remain valid.
- New anchors are additive.
- No API route or mutation payload changed.
- No RBAC or workspace-scope code changed.
- No schema or data migration was added.
- No messaging, invitation, payment, provider, or identity action was performed.

## Visual evidence

Synthetic development previews are available through:

- `/ui-preview?view=declutter`
- `/ui-preview?view=billing-declutter`
- `/ui-preview?view=staff-declutter`

These previews are development-only and use synthetic records. They exist to verify hierarchy, responsive behavior, keyboard disclosure controls, touch targets, and screenshots without exposing production data.
