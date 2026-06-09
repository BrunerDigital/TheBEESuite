# Legal, Privacy, And Security Review

Review date: June 9, 2026

Scope: internal product, engineering, privacy, and security readiness review for The BEE Suite before broader public SaaS launch and full-feature school rollout.

This is not legal advice and does not replace licensed counsel, state childcare licensing review, accounting review, vendor compliance review, or the live Supabase security advisor output. The internal review is complete. External sign-offs remain required before public SaaS expansion and before enabling live parent payments or SMS at a school.

## Review Decision

- Internal product/security/privacy review: complete.
- Code remediations from this review: complete.
- Public SaaS legal sign-off: owner/counsel required.
- Parent tuition payment recovery sign-off: school/payout owner plus legal/accounting required.
- Live Supabase advisor/security review: required after the latest production schema migration.
- Kid City USA pilot/full-feature rollout: can proceed only school-by-school after data import, role smoke testing, vendor setup, and owner action items are complete.

## Sources Checked

- FTC children's privacy and COPPA guidance: https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy
- U.S. Department of Education FERPA guidance: https://studentprivacy.ed.gov/ferpa
- California Privacy Protection Agency CCPA/CPRA FAQ: https://cppa.ca.gov/faq.html
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework
- Supabase row-level security guidance: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase storage access control guidance: https://supabase.com/docs/guides/storage/security/access-control
- Stripe security guide: https://docs.stripe.com/security/guide
- Stripe restricted API keys: https://docs.stripe.com/keys/restricted-api-keys
- Stripe webhook signature verification: https://docs.stripe.com/webhooks/signature
- Twilio opt-out handling: https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out

## Evidence Reviewed

- `docs/SECURITY_PRIVACY_OPERATIONS.md`
- `docs/PAYMENT_PROCESSING_RECOVERY_REVIEW.md`
- `docs/GO_LIVE.md`
- `docs/OWNER_ACTION_ITEMS.md`
- `docs/SCHOOL_FULL_FEATURE_ROLLOUT_CHECKLIST_2026-06-08.md`
- `docs/PRODUCTION_RELEASE_CHECKLIST.md`
- `src/lib/auth.ts`
- `src/lib/request-response-logging.ts`
- `src/lib/supabase-auth.ts`
- `src/lib/supabase-storage.ts`
- `src/lib/integration-credentials.ts`
- `src/lib/integrations.ts`
- `src/lib/twilio-messaging.ts`
- `src/app/api/billing/stripe-webhook/route.ts`
- `prisma/migrations/20260527120000_harden_supabase_public_api/migration.sql`
- `prisma/migrations/20260527143000_stripe_connect_hardening/migration.sql`
- `prisma/migrations/20260605110000_tenant_integration_credentials/migration.sql`

## Verification Performed

- Dependency advisory check: `npm audit --omit=dev` returned `found 0 vulnerabilities`.
- Tracked secret scan: no live Stripe, SendGrid, Twilio, Supabase service-role, AWS, Slack, or webhook secrets were found in tracked source. Matches were placeholders or test strings.
- Environment exposure check: no sensitive `NEXT_PUBLIC_*` secret, service-role, Twilio, SendGrid, or Stripe secret references were found.
- Git ignore check: `.env*` files are ignored and only `.env.example` is tracked.
- Console logging scan: raw `console.log`, `console.warn`, and `console.error` calls outside the centralized redacted logger were removed from `src`.
- Request/response logging: API logging uses centralized PII-safe redaction and body-size/content-type safeguards.
- Operational error logging: errors now use context-only redacted JSON payloads with sensitive messages and metadata redacted.

## Remediations Completed

1. Added app-level security headers in `next.config.ts`:
   - `X-DNS-Prefetch-Control`
   - `X-Content-Type-Options`
   - `X-Frame-Options`
   - `Referrer-Policy`
   - `Permissions-Policy`
   - production-only `Strict-Transport-Security`

2. Added `logOperationalError` to `src/lib/request-response-logging.ts`.

3. Replaced raw error-object logging in:
   - `src/app/api/auth/reset-password/route.ts`
   - `src/app/api/auth/forgot-password/route.ts`
   - `src/app/api/auth/force-password-reset/route.ts`
   - `src/app/api/inquiries/route.ts`
   - `src/app/api/registration/route.ts`
   - `src/app/api/public/kidcity-locations/route.ts`
   - `src/app/registration/page.tsx`

4. Added regression coverage in `tests/request-response-logging.test.ts` for redacted operational error logs.

## Privacy Review

The current design does not create child self-service accounts. Parent/guardian access is tied to linked guardian records and school-reviewed invites. This is the safer default for COPPA-sensitive childcare workflows.

High-risk data categories are identified in the security operations plan: child records, guardian records, custody notes, medical notes, allergies, incident reports, attendance, billing, documents, photos/media, messages, and import files.

Privacy controls already present or documented:

- Role and center scoping through server-side auth helpers.
- Parent portal access limited to linked family/child records.
- Custody visibility controls and staff-facing warnings.
- Document review and expiration workflow.
- Guardian change request approval workflow.
- Required document checklist by family, child, and staff.
- Private Supabase Storage uploads with short-lived signed URLs.
- Data retention/deletion policy with audit requirements.
- PII-safe request/response and operational error logging.
- AI output language states that AI suggestions do not make safety, custody, medical, legal, billing, or compliance decisions.

Privacy items still requiring owner/counsel approval:

- Final public privacy policy.
- Parent/school terms of service.
- Parent consent language for portal access, registration, e-signature, messages, photos/media, attendance/kiosk, and billing.
- Data Processing Agreement or service-provider terms for schools and franchise groups.
- State privacy-law applicability and customer threshold analysis.
- FERPA applicability by customer type and records use.
- COPPA operator/service-provider posture and parent notice wording.
- Retention/deletion exceptions by state licensing and school policy.

## Security Review

Controls verified:

- Session cookies are HTTP-only, signed, secure in production, SameSite Lax, and expire after 12 hours.
- Session versioning supports forced revocation after password changes or admin actions.
- Login, forgot-password, forced password reset, kiosk, parent kiosk credentials, onboarding, and public inquiry intake have rate-limit controls.
- Public inquiry intake supports origin restrictions, honeypot protection, and Cloudflare Turnstile when configured.
- Supabase service-role access is server-side only.
- The RLS hardening migration enables row-level security on public tables and revokes `anon` and `authenticated` privileges for the Prisma-managed public schema.
- Supabase Storage uploads are private, size-limited, type-limited, and served through signed URLs.
- Secrets are modeled through tenant-specific integration credentials instead of only global platform environment variables.
- Audit logging exists for sensitive admin, billing, compliance, document, registration, parent, teacher, and integration actions.
- Payment credentials remain in Stripe. The app stores Stripe identifiers and ledger metadata, not raw card or bank credentials.
- Stripe webhook processing verifies signatures, records webhook events, and supports idempotency/dedupe.

Security items still requiring production verification:

- Run Supabase advisor/security review against the live production project after the latest migrations.
- Confirm the RLS hardening migration is applied in production and that no public schema tables are exposed to `anon` or `authenticated` through Supabase Data API settings.
- Decide and implement MFA for executive/admin users.
- Add production error monitoring and uptime monitoring.
- Add staging separate from production for release validation.
- Rotate any production credentials that were ever shared outside approved secret storage.
- Confirm Vercel production environment variables do not expose service-role or secret keys through `NEXT_PUBLIC_*`.
- Test security headers after deployment.
- Build and test a CSP allowlist once Stripe Checkout, Turnstile, Supabase media, white-label domains, and embed scripts are finalized.

## Legal And Compliance Review

The app language avoids guaranteeing legal, licensing, medical, custody, billing, or compliance outcomes. Compliance features are positioned as workflow and documentation support.

Payment processing recovery is properly gated:

- Parent-paid processing recovery remains disabled until `STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED=true`.
- The app uses the safer label `Payment processing recovery` instead of defaulting to `surcharge` or `convenience fee`.
- ACH is positioned as the default low-cost tuition payment option.
- School/payout owner, legal, accounting, card-network/acquirer, refund, dispute, debit/prepaid, and state-specific approval remain required before enabling recovery.

SMS/email review:

- Email/SMS delivery channel foundations exist.
- SMS must not go live until Twilio sender registration, consent language, opt-out handling, and school-approved messaging use cases are confirmed.
- Email sender authentication and unsubscribe/classification rules must be verified for marketing broadcasts before broad launch.

Documents and e-signature review:

- E-signature consent is captured before signature submission.
- Signature/document workflows use document records, review status, and storage upload handling.
- Final enforceability language and school policy acknowledgements still require owner/counsel approval.

State licensing review:

- State-specific licensing configuration exists as operational setup support.
- The app must not claim state licensing compliance certification.
- Each state and school policy still requires review for document retention, incident reporting, medication logs, emergency drills, ratios, and parent acknowledgements.

## Launch Gate

Do not launch public SaaS beyond the Kid City USA pilot until these external items are complete:

- Final terms of service and privacy policy approved.
- School/customer data processing terms approved.
- Parent consent, photo/media release, SMS consent, payment authorization, and e-signature consent approved.
- Payment processing recovery packet approved per school where payments are enabled.
- Twilio messaging compliance and opt-out behavior approved.
- Supabase advisor/security review passed for the live project.
- MFA decision made for executive/admin roles.
- Production monitoring and staging environment in place.

Do not enable a school for full-feature live use until:

- Real school data is imported and validated.
- Role-by-role smoke tests pass for executive, director, teacher, billing, parent, and kiosk workflows.
- Stripe connected account onboarding and payout readiness are complete if parent payments are enabled.
- Storage, email, SMS, calendar, sheets, and webhooks are configured for that school.
- Directors confirm setup for classrooms, ratios, tuition, programs, documents, staff, parent access, reporting, and compliance tasks.
