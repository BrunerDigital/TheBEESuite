# Complete scoped audit history — September 13, 2026

## Current truth before changes

The current page selects the latest 100 events, then its client viewer filters and exports only those rows. Counts describe the whole scope, creating a misleading impression of completeness. School filters use display labels rather than immutable school IDs. The Prisma `include` returns all AuditLog scalars, including raw metadata, which cross the client boundary despite a narrower TypeScript type. CSV quoting does not neutralize spreadsheet formulas. The active-school selector also drops historical closed-school events that remain within established administrative authority.

These findings are established from current code and schema, not from reading production audit content. The existing protected `audit-logs` role permission must remain unchanged. This wave follows family-payment PR #378; it is not included in that payment commit.

## Intended correction and evidence boundaries

Use one server-side tenant/school-paired scope for counts, search, facets, pagination and full filtered CSV. Preserve the selected workspace and historical authorized schools without expanding grants. Only an explicitly all-locations workspace with tenant/platform authority includes tenant-global events. Foreign or malformed scope requests fail before audit reads. Never send raw metadata, internal tenant/user IDs or mismatched-tenant actor details to the browser/export.

Use the existing 50-row pagination and date/time conventions, stable snapshot time, deterministic ordering and URL-backed filters. Compact the header and controls, show accurate matching counts, and distinguish full filtered export from printing the current page. Exports are bounded and complete or explicitly fail with guidance to narrow the date/school filters; no silent truncation. No audit-history mutation or production migration is needed.

## Implemented correction and local verification

The page now derives its complete result set server-side from one strict, paired tenant-and-school scope. It uses URL-backed filters, a stable snapshot timestamp, deterministic 50-row pages, scope-wide facets and exact selected fields. Malformed, duplicate, foreign-school, pending-workspace and unauthorized-role requests fail before event reads. Historical closed schools remain visible only where they are already authorized. Global events require an explicitly broad all-locations workspace; no filter broadens the active scope.

The browser receives a deliberately small audit row DTO. Raw metadata, tenant IDs, user IDs and mismatched-tenant actor details are not serialized. CSV is generated server-side under the same scope, neutralizes spreadsheet formulas, is bounded to 10,000 rows and 3 MB, and either completes wholly or returns a clear narrowing instruction. A user-scoped export throttle runs before the shared IP throttle, so a rate-limited individual cannot consume the shared network quota.

The compact responsive viewer keeps controls at accessible touch sizes, presents phone rows with expandable record detail, and uses the full table on larger screens. It distinguishes exporting all matching events from printing the current page, carries the snapshot/filter context into print, wraps long headers and record IDs, and reports focus/recovery states. The selector draft is rebased on each committed URL state, so a stale visible school selection cannot disagree with rows, print, or CSV export after a search and history navigation.

Focused parser/query/route checks: 14 passing tests. Two fake-data real-component browser runs passed in Chromium and WebKit, 17 cases each: 320/390/768/1280 widths at 100% and 200% text zoom, keyboard/focus recovery, empty and invalid-filter recovery, duplicate/stale export handling, all CSV failure guidance, visible filter/export-scope continuity, and current-page print/PDF geometry. The final evidence is under `output/wave26-audit-*final.log` and `output/playwright/audit-history-{chromium,webkit}-2026-09-14T02-2*-*/`.

Production release evidence remains pending. Management production authentication is a separate unavailable evidence gate; health alone cannot prove this screen.
