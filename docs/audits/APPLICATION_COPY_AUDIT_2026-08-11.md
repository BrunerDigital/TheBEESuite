# Application copy audit — August 11, 2026

## Scope and safety boundary

This audit reviewed user-visible labels, guidance, errors, empty states, notification text, email copy, printable receipts, parent guides, and responsive navigation. It did not change route paths, query parameters, API request or response shapes, stored enum values, permissions, authentication, billing calculations, payment processing, message delivery, or production data.

The existing initial-credential policy and all password provisioning behavior were intentionally left unchanged. Changing that policy requires a separate authentication decision and was outside this copy-only review.

## Route and role inventory

| Audience | Direct and contextual routes reviewed | Shared experiences reviewed |
| --- | --- | --- |
| Public and prospective families | `/`, `/app`, `/registration`, `/support`, `/resources`, `/privacy`, `/terms`, `/eula` | Marketing metadata, registration guidance, help copy, downloadable guides, global errors, and not-found states |
| Authentication and setup | `/login`, `/parents`, `/parents/setup`, `/teachers`, `/directors`, `/executives`, `/reset-password`, `/onboarding` | Role-specific sign-in guidance, password recovery, invitation language, setup confirmations, and validation states |
| Parents and guardians | `/parent-portal`, `/parent-portal/setup`, `/parent-portal/[...legacyPath]`, `/payment-method-form/[token]`, `/payment-method-form/r/[code]` | Home, updates, messages, payments, family information, children, check-in credentials, documents, profile, notifications, receipts, reminders, and invitation templates |
| Teachers and classroom staff | `/teacher-portal`, `/[slug]` classroom modules | Attendance, daily reports, photos, incidents, classroom notes, staff drafts, navigation, empty states, and recovery copy |
| Directors and school staff | `/dashboard`, `/crm-leads`, `/data-readiness`, `/[slug]` school modules | Families, children, classrooms, staff, attendance, enrollment, tours, messages, documents, reports, billing, payments, settings, activity history, and integrations |
| Owners, corporate users, and administrators | `/[slug]` executive and administrative modules, `/stripe-reauthorization`, `/stripe-reauthorization/corporate` | Multi-location reporting, executive administration, users and access, corporate billing, branding, integrations, and system recovery copy |
| Shared-device users | `/check-in`, `/check-in/[centerId]`, `/check-in/[centerId]/family` | Family PIN, QR camera, family lookup, staff time clock, connection failures, timeout/reset guidance, and balance notices |
| Development-only visual verification | `/device-preview` | Parent, teacher, director, family kiosk, and staff kiosk layouts. This route remains unavailable in production. |

The consolidated `/{slug}` route was reviewed for: `asset-hub`, `school-setup`, `multi-location-dashboard`, `fte-reports`, `enrollment-pipeline`, `tours`, `calendar`, `waitlist`, `family-detail`, `child-profile`, `parent-portal`, `teacher-portal`, `messages`, `announcements`, `campaigns`, `automations`, `billing-invoices`, `payments`, `terminal-store`, `analytics`, `reputation`, `ai-command`, `white-label`, `billing-settings`, `corporate-billing`, `notifications`, `audit-logs`, `team-permissions`, `agency-admin`, `developer-dashboard`, `integrations`, `center-dashboard`, `classroom-dashboard`, `attendance`, `daily-reports`, `parent-media-review`, `incident-reports`, `staff`, `forms`, `documents`, `compliance`, and `help`.

## Issue and coupling record

| Surface | Audience | Previous wording problem | Correction | Functional coupling preserved |
| --- | --- | --- | --- | --- |
| Parent Portal statuses | Parent | Stored values such as underscored invoice, document, enrollment, and ledger statuses could render mechanically | Human-readable display formatter with protected acronyms | Stored values and API payloads unchanged |
| Parent payments | Parent | Card, Link, and bank methods used inconsistent labels across portal, links, email, and guides | `Debit or credit card`, `Pay with Link`, `Bank account`, `Save card`, and `Connect bank account` | Method keys, Stripe calls, fees, consent, and autopay behavior unchanged |
| Parent contact changes | Parent | Generic form instructions and unlabeled fields | Specific field labels and `Send change request` | Existing fields, handler, validation, and endpoint unchanged |
| Enrollment workspace | Director | CRM, tenant, and implementation language appeared in ordinary screens | Enrollment inquiry and school-oriented wording | Route slug, record fields, filters, and actions unchanged |
| Dashboards and shared module metadata | Staff and administrators | Command-center, SaaS, role-scope, and generic template copy | Task-focused school operations, access, report, and setup language | Module slugs, permissions, and navigation destinations unchanged |
| Teacher mobile workflows | Teacher | Internal-draft and role-visibility language; repeated inputs lacked precise names | Plain saved-state copy and specific accessible labels | Submit handlers, record visibility, and workflow states unchanged |
| Kiosk | Families and staff | PIN, QR, camera, family/staff mode, and result wording was ambiguous | Explicit method, mode, recovery, and completion language | Lookup, attendance, timeout, staff authorization, and audit behavior unchanged |
| Billing workbench | Director and billing staff | Implementation metadata, raw IDs, and vague charge actions | Specific review, charge, payment-method, and readiness labels | Amounts, invoices, ledger allocation, payment calls, and authorization unchanged |
| Receipt and payment messages | Parents and staff | Provider codes and mechanical statuses could appear | Friendly payment-type labels while retaining `Payment reference` | Provider value and audit/support reference unchanged |
| Executive administration | Owners and administrators | Raw role, scope, enum, and session language | Human-readable role, school-access, status, and action labels | Role keys, grants, sessions, and administrative handlers unchanged |
| Public registration and onboarding | Prospective families and administrators | CRM, database, Supabase, trial, and rollout narration | Direct next-step and account-ready language | Form fields, identity flow, and submission behavior unchanged |
| Error and not-found pages | All users | Generic error and parent-specific fallback copy | Role-neutral recovery instructions | Retry and navigation behavior unchanged |
| Parent email and PDF guidance | Parents | Stale Billing navigation and inconsistent payment option names | Current Payments navigation and exact UI labels | Template variables, recipient behavior, links, and delivery unchanged |

## Deliberately preserved text

- Legal terms, privacy language, payment fee disclosures, autopay consent and timing, refund language, subsidy responsibility, and payment-processing timing were not rewritten without legal or financial approval.
- Provider names remain on screens where authorized administrators are explicitly configuring those services.
- Accurate AI labels remain on features that genuinely generate drafts or summaries. Copy now states that staff choose whether to use those suggestions.
- Approved preview records and test fixtures remain in place. They are not used as fallback production records.
- Operational payment failure details remain available to authorized billing staff where they are needed for follow-up.

## Verification expectations

- Focused copy-contract tests cover parent, teacher, kiosk, billing, administration, public/auth, templates, and shared module descriptions.
- The full type check, lint, unit/integration suite, production build, and read-only responsive browser matrix must pass before the branch is offered for review.
- Browser verification must not submit forms or make authenticated or mutating API requests.
