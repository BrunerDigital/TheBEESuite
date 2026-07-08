# The BEE Suite Architecture

Last updated: July 8, 2026

The BEE Suite is a multi-tenant childcare operating platform with role-specific web portals, Supabase-backed auth/data, Stripe Connect payment flows, and school/corporate reporting.

## Tenant Hierarchy

Platform owner -> tenant -> brand/franchise -> organization -> owner group -> center/location -> classroom -> staff/family/child.

The Prisma schema models this hierarchy with `Tenant`, `Brand`, `Organization`, `OwnerGroup`, `Center`, `Classroom`, `User`, `UserAccessGrant`, `Family`, `Guardian`, and `Child`. Server code scopes records by tenant first, then by role and explicit access grants for brand, organization, owner group, center, classroom, family, or child access.

`OwnerGroup` is the operator/franchisee container. It supports single-location owners, multi-location owner groups, and corporate/franchise network rollups like Kid City USA corporate schools.

White-label data is layered:

- `WhiteLabelSettings`: legacy brand-level compatibility settings.
- `BrandCustomization`: tenant, brand, organization, owner group, or center-level copy, color, domain, legal footer, sender, and portal/login settings.
- `BrandAsset`: logo, favicon, mascot, login image, and parent portal media references scoped to the appropriate tenant/brand/owner group/center.

## Application Structure

- `src/app/page.tsx`: public marketing site.
- `src/app/app/page.tsx`: app/portal launcher.
- `src/app/login/page.tsx`: shared login surface with role-aware routing.
- `src/app/parents/page.tsx`, `src/app/teachers/page.tsx`, `src/app/directors/page.tsx`, `src/app/executives/page.tsx`: role-specific login entry points.
- `src/app/[slug]/page.tsx`: authenticated module router for dashboards, school operations, messaging, billing, documents, FTE, reporting, admin, and support modules.
- `src/app/api/**/route.ts`: server API routes, integrations, billing/webhook routes, cron handlers, and role workflows.
- `src/components/`: shared shell, portal workspaces, dashboard/workbench panels, forms, and UI primitives.
- `src/lib/`: RBAC, auth/session, query guardrails, billing, communications, reporting, import, payout, Stripe, Supabase, and notification helpers.
- `prisma/schema.prisma`: PostgreSQL-compatible application schema.
- `supabase/migrations/`: Supabase SQL migration history.
- `tests/`: Node tests covering guardrails, billing, messaging, imports, reporting, Stripe, Twilio, teacher/parent/director workflows, and security-sensitive helpers.

## Auth And RBAC

Supabase Auth backs login/reset/setup flows. The app uses server-side session cookies and `getCurrentUser()` to resolve user, role, tenant, center, and access-grant context.

Primary roles include platform owner, brand/franchise admin, regional/executive users, center director, assistant director, teacher, billing/admin staff, parent/guardian, authorized pickup, and read-only auditor.

`UserAccessGrant` adds explicit scoped access on top of role. A corporate executive can see network-level rollups; a center director is limited to assigned school data; a teacher is limited to classroom-safe workflows; a parent/guardian is limited to linked family records.

## Major Workflow Areas

- CRM and enrollment: inquiry embed/API, lead routing, tours, tasks, notes, campaigns, online registration, approvals, documents, and enrollment checklists.
- ProCare migration: import preview/diff, batch/row tracking, duplicate matching, classroom/staff/family/guardian/child import foundations, backup/export and audit traceability.
- Parent portal: billing, daily reports, photos/media, documents, messages, incidents, contact updates, payment method setup, and notification preferences.
- Teacher portal: roster, attendance, daily reports, incidents, media, name-to-face/profile setup, classroom movement context, and messaging.
- Director operations: dashboards, staff/classrooms, billing, messages, compliance, documents, FTE submission, reports, payout setup, and support workflows.
- Executive operations: multi-location dashboard, FTE rollups, corporate billing, user/access management, rollout views, and reporting.
- Payments: Stripe Connect account onboarding/status, Checkout, webhooks, payment method requests, autopay billing, tuition reminders, dunning, ledger/reconciliation, terminal store, and software invoices.
- Communications: scoped in-app threads, staff/family replies, attachments, SendGrid email, Twilio SMS foundations, notification preferences, delivery logs, and director oversight notifications.

## Sensitive Data

Sensitive child, custody, medical, incident, billing, document, payment, and compliance data must stay tenant/role scoped. The code uses server-side guardrails, signed document/media access patterns, audit logs, redaction helpers, and route-level authorization checks. Supabase service role access is reserved for server-side workflows.

## External Integrations

Integrations are credential-gated. Missing credentials or incomplete school setup should block live external actions rather than falling back to unsafe behavior.

- Supabase: auth, Postgres, storage, migrations.
- Vercel: hosting, cron/API runtime, production deployments.
- Stripe: Checkout, Connect, webhooks, fee recovery settings, Accounts v2 version override.
- SendGrid/Twilio: email/SMS delivery and inbound/status handling.
- Google Sheets/Calendar: inquiry backups and calendar sync where configured.
- OpenAI/Mr. Bee: human-reviewed drafting and operational suggestions.

## AI Guardrails

AI outputs are suggestions only. They must not make final safety, medical, legal, custody, billing, licensing, payroll, tax, or compliance decisions. Sensitive suggestions require human review and should be auditable.
