# The Bee Suite Architecture

The Bee Suite is structured as a white-label, multi-tenant childcare operating system.

## Tenant Hierarchy

Platform owner -> tenant -> brand/franchise -> organization -> center/location -> classroom -> staff/family/child.

The Prisma schema models this hierarchy with `Tenant`, `Brand`, `Organization`, `Center`, `Classroom`, `User`, `Family`, `Guardian`, and `Child`. Production authorization should scope every query by tenant and then by assigned organization, center, classroom, family, or child.

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

Production enforcement should happen in server actions, route handlers, database policies where applicable, and UI field-level guards. Sensitive reads should create audit log events.

## Sensitive Data

Child medical notes, custody notes, incident reports, billing records, compliance documents, and restricted documents should be encrypted or protected at rest where appropriate. The UI marks these areas as restricted and the schema includes audit-log and restricted-field foundations.

## AI Guardrails

AI outputs are suggestions only. They must not make final safety, medical, legal, custody, billing, or compliance decisions. Sensitive AI suggestions should require human review and include a guardrail note. The schema separates `AiSummary` and `AiSuggestion` with `requiresReview` / `status`.

## Placeholders

Stripe, Twilio, SendGrid/Mailgun, Google Calendar, Google Business Profile, Meta Lead Ads, OpenAI, Zapier/webhooks, signature capture, and cloud storage are represented as credential-ready placeholders. No real payment or messaging action is performed by this v1.
