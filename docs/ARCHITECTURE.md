# The BEE Suite Architecture

The BEE Suite is structured as a white-label, multi-tenant childcare operating system.

## Tenant Hierarchy

Platform owner -> tenant -> brand/franchise -> organization -> owner group -> center/location -> classroom -> staff/family/child.

The Prisma schema models this hierarchy with `Tenant`, `Brand`, `Organization`, `OwnerGroup`, `Center`, `Classroom`, `User`, `Family`, `Guardian`, and `Child`. Production authorization scopes every query by tenant first, then by explicit access grants for brand, organization, owner group, center, classroom, family, or child.

`OwnerGroup` is the franchisee/operator container. It supports a single-location owner, a multi-location operator who owns a few centers inside a larger brand, and corporate/franchise network ownership for rollups like Kid City USA. Each center can be assigned to one owner group while still belonging to the larger brand and organization.

White-label data is layered:

- `WhiteLabelSettings`: legacy brand-level settings kept for compatibility.
- `BrandCustomization`: tenant, brand, organization, owner group, or center-level overrides for colors, names, domains, portal copy, sender placeholders, legal footer, and login surfaces.
- `BrandAsset`: logo, favicon, mascot, login image, and parent portal media references scoped to the correct tenant, brand, owner group, or center.

## Application Structure

- `src/app/page.tsx`: executive dashboard.
- `src/app/[slug]/page.tsx`: route-driven product surfaces for all required modules.
- `src/components/app-shell.tsx`: sidebar, command/search, center selector, notification chrome.
- `src/components/dashboard.tsx`: bespoke executive dashboard with charts and role dashboard lenses.
- `src/components/module-page.tsx`: reusable workspace for CRM, enrollment, billing, compliance, AI, settings, portals, and admin modules.
- `src/lib/demo-data.ts`: realistic demo data and module registry.
- `prisma/schema.prisma`: PostgreSQL-compatible schema.
- `prisma/seed.ts`: demo seed data for centers, classrooms, staff, families, children, leads, tours, waitlist, invoices, messages, daily reports, incidents, campaigns, automations, notifications, integrations, AI outputs, and compliance reminders.

## RBAC

The v1 schema includes explicit roles for platform owner, brand/franchise admin, regional manager, center director, assistant director, teacher, billing/admin staff, parent/guardian, authorized pickup, and read-only auditor.

`UserAccessGrant` adds explicit scoped access on top of roles. A user can be granted access at tenant, brand, organization, owner group, or center level, which lets a franchise owner see only their locations while corporate admins retain full network visibility. Production enforcement happens in server actions, route handlers, database policies where applicable, and UI field-level guards. Sensitive reads should create audit log events.

## Sensitive Data

Child medical notes, custody notes, incident reports, billing records, compliance documents, and restricted documents should be encrypted or protected at rest where appropriate. The UI marks these areas as restricted and the schema includes audit-log and restricted-field foundations.

## AI Guardrails

AI outputs are suggestions only. They must not make final safety, medical, legal, custody, billing, or compliance decisions. Sensitive AI suggestions should require human review and include a guardrail note. The schema separates `AiSummary` and `AiSuggestion` with `requiresReview` / `status`.

## Placeholders

Stripe Connect, Twilio, SendGrid/Mailgun, Google Calendar, Google Business Profile, Meta Lead Ads, OpenAI, Zapier/webhooks, signature capture, and cloud storage are represented as credential-ready integrations. Parent checkout uses server-side Stripe Checkout only when platform keys are present and the selected school has a connected payout account; missing credentials keep the workflow safely disabled.
