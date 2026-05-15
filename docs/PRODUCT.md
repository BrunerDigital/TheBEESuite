# Product Notes

## Production-Ready in This v1

- Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui component foundation.
- Dark-mode-first premium SaaS interface with responsive sidebar, command/search chrome, route-driven modules, and mobile-friendly layout.
- Executive dashboard with realistic KPIs, charts, center rollups, classroom capacity, parent message queue, pipeline preview, and AI daily summary.
- Forty required surfaces represented as real routes through a reusable module system.
- PostgreSQL-compatible Prisma schema covering tenancy, CRM, enrollment, families, children, staff, billing, communications, forms, documents, attendance, daily reports, incidents, compliance, marketing, automations, reviews, notifications, audit logs, integrations, white-label settings, and AI.
- Demo seed script covering the requested data categories.
- Documentation for architecture, deployment, Supabase, Prisma, security, privacy, AI guardrails, and go-live.
- Stripe Connect payout onboarding foundation for schools, plus guarded parent Checkout session creation and webhook reconciliation.

## Placeholder by Design

- Real authentication and production RBAC enforcement.
- Real card charging remains gated until live Stripe keys, connected school payout accounts, refund policies, and support procedures are approved.
- Real SMS, email, push notifications, and emergency alerts.
- Real Google Calendar and Google Business Profile sync.
- Real Meta Lead Ads ingestion.
- Real OpenAI calls.
- Real document/media upload storage.
- Real e-signature provider.
- Kiosk mode, QR/PIN check-in, signature capture, and pickup verification.
- Licensing exports and jurisdiction-specific compliance configuration.

## Known Limitations

- Demo data is local and static in the UI until connected to database reads.
- AI suggestions are mocked.
- The workflow builder is a foundation, not a live automation engine.
- Form builder and document upload are structural placeholders.
- Parent and teacher portals are included as product surfaces but should become dedicated mobile-first experiences in production.
- Compliance-readiness workflows do not guarantee legal or licensing compliance.

## Customize First

- Brand name, logo, colors, legal footer, domain, and parent portal settings.
- Center/classroom age groups, capacity, and ratio configuration.
- Enrollment pipeline stage labels and required checklist items.
- Tuition plans, fees, discounts, subsidy fields, and invoice cadence.
- Role permissions and sensitive-field visibility.
- Message, campaign, and announcement templates.

## Recommended Next Integrations

- Supabase Auth or Auth.js/Clerk for identity.
- Supabase Storage or S3-compatible storage for documents/media.
- Stripe Connect test-mode rollout for every school payout account, then Stripe Billing/autopay where appropriate.
- Twilio Messaging for SMS reminders.
- SendGrid or Mailgun for transactional and campaign email.
- OpenAI for labeled, human-reviewed AI assistance.
- Google Calendar for tour and event sync.
- Signature provider for enrollment packets and policy acknowledgments.
- Webhooks/Zapier for agency/franchise workflows.

## V2/V3 Roadmap

- Native mobile app.
- Parent push notifications.
- Kiosk check-in with QR/PIN.
- Real payment processing and autopay.
- Real SMS/email integrations.
- Real e-signatures.
- Staff payroll integrations.
- Subsidy payment tracking.
- Licensing report exports.
- Advanced classroom ratio engine.
- Curriculum and lesson planning.
- Developmental milestones.
- Meal planning and CACFP tracking placeholder.
- Multi-state licensing configuration.
- Advanced franchise reporting.
- AI-powered enrollment forecasting.
- Parent satisfaction intelligence.
- Public website/funnel builder.
- Marketplace of automation templates.
- API and webhooks.
- Advanced import/export.
