# Product-wide UX and information architecture modernization

Date: 2026-09-02
Scope: every authenticated BEE Suite dashboard, shared shell, and role portal
Implementation branch: `work/product-wide-ux-20260902` from `origin/main` at `fa7b506256907afbdf2caa1ef0a363e3c50a1d2f`

## Outcome model

The authenticated experience now follows one consistent hierarchy:

1. **Current workspace:** the tenant/company and one authorized location, or the explicitly selected **All locations** aggregate.
2. **Your street:** the three to five destinations most important to the signed-in role.
3. **Needs attention:** live exceptions or incomplete work that has an authorized next step.
4. **Primary actions:** no more than four common destinations on the role landing screen.
5. **Explore more:** authorized secondary capabilities grouped into expandable product neighborhoods.
6. **Local navigation:** consolidated tabs, anchors, filters, and contextual actions inside the selected neighborhood.

This changes presentation, hierarchy, and effective request scope. It does not change business records, identities, grants, payments, messages, provider configuration, or launch state.

## Evidence reviewed

- RBAC and role lenses: `prisma/schema.prisma`, `src/lib/rbac.ts`, `src/lib/auth.ts`
- Existing shell and navigation: `src/components/app-shell.tsx`, `src/lib/demo-data.ts`, `src/components/consolidated-workspace-nav.tsx`
- Authenticated entry points: `src/app/dashboard/page.tsx`, `src/app/[slug]/page.tsx`, `src/app/crm-leads/page.tsx`, `src/app/data-readiness/page.tsx`, `src/app/check-in/page.tsx`
- Role portals: `src/components/teacher-mobile-workspace.tsx`, `src/components/parent-portal-workspace.tsx`, `src/components/authorized-pickup-workspace.tsx`
- Safe responsive previews: `src/app/device-preview/page.tsx`, `scripts/qa-device-preview.ts`
- Route and portal compatibility tests under `tests/`
- Existing product guidance: `docs/BEE_SUITE_COMPLETE_GUIDE.md`, `docs/user-feature-access-map.md`, `docs/SOP_CURRENT_UI_AND_USER_FLOW_AUDIT_2026-08-06.md`, and `docs/PRODUCT_COMPLETION_CHECKLIST_2026-08-31.md`
- Installed Next.js 16.2.12 guides for layouts/pages, navigation, server/client components, cookies, accessibility, and authentication

## Current-state audit

### Roles and landing priorities

The role inventory comes from the Prisma `UserRole` enum and current RBAC rules. No new role was invented.

| Role | Primary responsibility | Main-screen priorities | Primary actions | Needs attention | Workspace behavior |
|---|---|---|---|---|---|
| Platform owner | Platform operations and cross-company support | Workspace health, cross-location exceptions, access/release posture | Dashboard, multi-location, data readiness, AI command | Operational, migration, security, and audit exceptions | Must choose when more than one location is authorized; All locations preserves the broad authorized view |
| Brand admin | Company performance and administration | Location performance, enrollment, operational exceptions | Dashboard, multi-location, enrollment, analytics | Location, compliance, billing, and enrollment exceptions | Specific location or All locations |
| Regional manager | Multi-school operating oversight | School performance, director follow-up, regional exceptions | Dashboard, multi-location, enrollment, school operations | Staffing, compliance, and enrollment follow-up | Specific authorized location or All authorized locations |
| Center director | One-school daily operations | Today, coverage, families, enrollment | Dashboard, school operations, enrollment, messages | Attendance, ratios, family requests, records, billing exceptions | Direct entry to assigned school; no unnecessary selector |
| Assistant director | One-school operational support | Daily operations, classroom support, family follow-up | Dashboard, school operations, enrollment, messages | Attendance, open tasks, family and staff requests | Direct entry to assigned school |
| Teacher | Assigned-classroom work | Roster, attendance, reports, family communication | Teacher portal, attendance, daily reports, messages | Missing attendance, reports, unread messages | Direct entry to assigned classroom/school |
| Billing admin | Family account operations | Review queue, payment status, billing follow-up | Dashboard, billing, payments, messages | Past due, failed/processing payments, billing questions | Direct entry to assigned billing scope |
| Parent/guardian | Their linked family | Child updates, messages, payments/forms | Family portal | New updates, required forms, account actions | Family-scoped; no school portfolio selector |
| Authorized pickup | Approved pickup only | Pickup access, identity guidance, child status | Pickup portal | Access changes and pickup instructions | Family/pickup-scoped; no broader family modules |
| Read-only auditor | Evidence and compliance review | Compliance, reports, audit evidence | Dashboard, multi-location, analytics, audit log | Missing evidence and material exceptions | Specific authorized location or read-only All locations |

The executable role configuration is in `src/lib/role-experience.ts`. The shared dashboard reads this configuration, while the teacher, parent, and pickup portals keep their specialized landing implementations.

### Authenticated portals and entry points

| Experience | Entry | Users | Current architecture decision |
|---|---|---|---|
| Role dashboard | `/dashboard` | Executive, director, assistant director, billing admin, auditor; fallback for other roles | One role-relevant hierarchy; executive company and single-school views no longer expose multiple competing dashboard-lens tabs |
| Teacher portal | `/teacher-portal` | Teacher | Preserve classroom-first mobile workspace, roster anchors, quick log, and native deep links |
| Parent portal | `/parent-portal` | Parent/guardian | Preserve Home, Updates, Messages, Payments, and Family; preserve native document navigation used for runtime reliability |
| Authorized pickup | `/parent-portal` limited view | Authorized pickup | Preserve home-only pickup surface; do not expose profile, billing, documents, or private family messages |
| Lobby kiosk launcher | `/check-in` | Authorized operations roles | Inherits workspace scope; one selected school opens directly, while All locations retains an explicit kiosk choice |
| Consolidated module renderer | `/[slug]` | RBAC-dependent | Shared shell plus one neighborhood-level local navigation model |
| Data readiness | `/data-readiness` | Operations roles when enabled | Dedicated large-workspace implementation, now guarded by active workspace before loading data |
| Enrollment lead table | `/crm-leads` | Lead-reading roles | Dedicated lead view plus consolidated pipeline/tours/waitlist views, all inheriting active workspace |

### Product neighborhoods and preserved destinations

| Neighborhood | Consolidated entry | Preserved destinations and local views |
|---|---|---|
| Overview and command | `/dashboard` | Dashboard, data readiness, multi-location, AI command |
| Daily operations | `/classroom-dashboard` | School overview, FTE reports, classrooms, attendance, daily reports, incidents, calendar |
| Enrollment and growth | `/crm-leads` and `/campaigns` | Leads, pipeline, tours, waitlist, campaigns, automations, reputation |
| Families and communication | `/family-detail` | Families, children, messages, media review, announcements |
| Billing and payments | `/billing-invoices` | Billing accounts, invoices, payments, corporate billing where authorized |
| Records and compliance | `/forms` | Forms, documents, compliance, audit evidence |
| Reporting and analytics | `/analytics` | Enrollment reporting, analytics, reputation, FTE reporting |
| Staff and access | `/staff` | Staff, teacher operations, permissions, classroom access |
| Settings and administration | `/billing-settings` | Billing settings, integrations, school setup, notifications, branding; plus executive/developer administration when authorized |
| Support and utilities | `/help` | Help, asset hub, terminal store, audit logs, authorized utilities |

Legacy destinations continue to resolve through the existing redirect/compatibility layer. Consolidated query-view contracts remain intact.

### Boundaries preserved

- Tenant/company: `tenantId`, organization relationships, and tenant-aware queries remain the first broad boundary.
- Location/school: every authenticated request receives effective `centerIds` narrowed by the active workspace.
- Classroom: teacher mutations still require the assigned classroom in addition to school access.
- Family/child: parent access still requires an exact guardian-family link; school visibility is not sufficient.
- Messaging: family, classroom, conversation, and current-enrollment visibility rules remain in force.
- Billing: billing account and family-center scope remain separate from role visibility.
- Identity: Prisma application users and Supabase Auth users remain separate systems.
- Read-only: auditor module and mutation restrictions remain unchanged.

### Problems found in the baseline

- The full desktop sidebar expanded every authorized module group, so executives and directors encountered the whole platform at once.
- Tablet rail navigation repeated the entire accessible module inventory as icons.
- Executive dashboard roles received several competing dashboard lenses instead of one hierarchy for the active context.
- “Workspace” was an orientation label and link, not a persistent, canonical, server-enforced selection.
- Tenant-wide roles repeatedly encountered section-level location choices because the application had no single active-location contract.
- The dashboard mixed daily priorities, setup, reports, embeds, widgets, trends, and administrative tools in one continuous screen.
- Mobile role navigation was stronger than desktop, but its role rules were duplicated instead of being documented in one role experience model.
- Existing parent and teacher portals were already substantially more focused than the general dashboard and needed preservation, not replacement.

## Implemented architecture

### Shared shell

- **Your street** shows only the role's primary destinations.
- **Explore more** exposes remaining authorized modules in semantic, keyboard-operable `details` groups.
- The compact tablet rail is limited to role-primary destinations.
- Mobile keeps the existing role-focused bottom navigation plus a labeled **More** sheet.
- Active destinations continue to use `aria-current="page"`; icons remain accompanied by visible or accessible labels.
- The existing skip link, focus rings, touch target sizing, theme control, account menu, notification control, and global search remain intact.

### Role landing screens

- One page title is derived from the actual role and active workspace.
- All-locations titles say **All locations** explicitly.
- **Needs attention** uses live exception data and shows a calm caught-up state when no exception is visible.
- **Primary actions** is capped at four role-specific destinations.
- Existing KPI summaries remain visible when configured.
- Reports, setup, trends, embeds, widget configuration, and less-frequent tools remain available under **Explore dashboard details**.
- Parent, teacher, and pickup experiences retain their focused portals and shared responsive shell.

## Canonical workspace-selection contract

### Resolution

1. The session contains an optional signed `workspaceSelection` value: `all` or `center:<id>`.
2. `getCurrentUser` independently reloads the active application user, current grants, assignments, tenant, and authorized centers on every request.
3. The requested session value is accepted only if it still resolves inside that live authorized set.
4. A multi-location executive with no valid selection receives `mode: pending` and an empty effective `centerIds` array.
5. A specific selection produces one effective center ID.
6. All locations produces only the user's currently authorized center IDs. Scoped regional access never becomes tenant-wide access.
7. Single-location executives and non-executive users enter their existing fixed scope directly.
8. When a platform owner selects a school outside the identity's home tenant, that school supplies the effective tenant, organization, and branding context while the signed-in identity and platform role remain unchanged.

### Persistence and switching

- `/workspace` is the post-login and recovery chooser for multi-location executives.
- `/api/workspace/selection` validates the choice and refreshes the existing HMAC-signed, HTTP-only, SameSite session cookie.
- The endpoint writes no Prisma/business record.
- The same selector is available from the shared shell on desktop, tablet, and mobile.
- Portfolios with more than eight locations can be searched by school, city, or company.
- Safe page paths, query parameters, and hashes are preserved.
- Location query parameters are replaced or removed to match the new scope.
- Kiosk paths and record-specific query destinations fall back to `/dashboard` when switching would make the destination ambiguous.
- Browser refresh retains the signed selection. Back/forward navigation retains URL history without restoring a stale broader scope.

### Enforcement

- `canAccessCenter` uses only effective workspace center IDs for real `CurrentUser` objects.
- `canAccessAllCenters` is true only in `mode: all` and only for an underlying tenant/platform-wide authority.
- `getLeadScopeWhere` and dashboard scope use effective IDs for selected locations.
- The dashboard, consolidated module renderer, enrollment, data readiness, kiosk launcher, and Stripe reauthorization entry points redirect a pending/stale executive selection before data queries.
- AI summaries, ProCare center visibility, and autopay center resolution were audited for direct platform-role bypasses and now honor effective scope.
- Actual autopay charges are rejected from All locations; review and dry-run behavior can remain aggregate.
- Hiding or disabling a location in the client is not the authorization boundary.

## Location-control audit

The canonical selector replaces repeated *workspace* selection. It does not replace controls with a different business meaning.

Controls retained intentionally:

- Classroom and roster selectors inside classroom workflows.
- Family, child, record, invoice, conversation, and billing-account selectors.
- Report populations, comparison groups, date ranges, saved filters, and export filters.
- Communication audiences and campaign targeting.
- Explicit kiosk choice while in All locations.
- Explicit center assignment during audited imports and setup workflows.
- Any picker that represents a destination record rather than the authenticated workspace.

When a specific workspace is active, server-loaded center option sets naturally contain only the active school. Redundant multi-school choices therefore disappear without deleting distinct report, audience, record, or classroom controls.

## Route and interaction compatibility

- Existing route names are unchanged.
- Existing consolidated `?view=` contracts remain unchanged.
- Native parent portal links remain native document links.
- Existing hashes and anchored sections remain available.
- Workspace switching preserves safe query strings and hashes.
- Existing bookmarks and authorized deep links still resolve; stale or cross-workspace record links fail closed.
- No named-location runtime branch was introduced.

## Loading, empty, disabled, warning, success, and error behavior

- Workspace buttons expose pending text and a polite live region.
- The current workspace is visibly selected and uses `aria-pressed`.
- A revoked/stale location displays a specific warning and only current authorized choices.
- Failed selection reports an actionable inline error.
- No-exception dashboard state explains that no current exceptions are visible.
- Consequential multi-location autopay attempts return an explicit “choose one location” conflict response.
- Existing module-specific loading, empty, validation, disabled, confirmation, and error states are preserved.

## Responsive and accessibility model

- Small phone and large phone: role bottom navigation, More sheet, mobile workspace control, touch-sized buttons, scroll-contained dialog.
- Tablet: compact role-primary rail and shared workspace control.
- Laptop and wide desktop: primary sidebar plus expandable neighborhoods; current workspace remains visible in the shell.
- Semantic buttons are used for actions and links for navigation.
- Disclosure controls are keyboard operable without hover.
- Dialog focus is trapped and returns to its trigger through the existing dialog primitive.
- Visible focus indicators, labeled icons, headings, landmarks, skip navigation, and non-color status labels remain in place.
- Status and selection are communicated through text, borders, icons, and ARIA state, not color alone.

## Data-preservation statement

This implementation adds no schema migration and performs no production-data migration. Workspace choice lives only in the existing signed session cookie. No code in the workspace-selection endpoint creates, updates, deletes, merges, reclassifies, bills, pays, refunds, messages, invites, or changes application/Supabase identities, grants, PINs, provider configuration, or rollout state.

## Intentionally unchanged

- Parent portal native navigation, because repository interaction tests protect its runtime reliability.
- Teacher classroom anchors and mobile quick-log structure, because they already provide a focused daily workflow.
- Authorized pickup's deliberately narrow portal.
- Existing routes and consolidated query-view redirects.
- Module-specific selectors with distinct record, classroom, report, audience, billing, or import meaning.
- The existing design tokens and component system; the work extends shared foundations instead of replacing them.
- Business activation, production records, identities, payments, messages, invitations, providers, and schema.

## Verification record

Baseline before edits:

- Focused role/scope/portal suite: 41 passed, 0 failed.
- Safe browser matrix: 40 checks across eight role experiences and five viewport sizes, 0 failed.

Implementation verification is recorded in the protected release handoff after focused tests, full production build, browser/device matrix, protected CI/review, deployment, aliases, health, logs, and authorized production-flow checks complete.

Pre-release implementation verification:

- Focused workspace, role, navigation, access, and browser-store regressions: passed.
- Complete repository suite: 1,490 passed, 0 failed.
- Production gate: Prisma generation, lint, TypeScript, complete tests, and optimized Next.js 16.2.12 build passed.
- Final safe browser matrix: 40 checks across eight role experiences and five viewport sizes, 0 failed.
- Interactive browser checks: actual shared dashboard component at 1,440 px and 360 px; workspace dialog and keyboard selection; mobile More sheet; progressive disclosure; parent deep link, back, forward, and refresh; zero relevant console errors and zero horizontal overflow.
