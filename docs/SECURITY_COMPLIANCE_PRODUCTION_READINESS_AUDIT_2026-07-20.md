# Security And Compliance Production Readiness Audit

Audit date: July 20, 2026  
Workstream: Security and compliance  
Accountable human: Brenden until explicitly delegated  
Decision: **NO-GO for the wider school wave. Kokomo may continue normal production use.**

## Production-ready definition

This workstream is production-ready only when all of the following are evidenced and approved:

- No known production credential exposed outside approved secret storage remains active.
- Every table in an exposed Supabase schema has RLS or is deliberately removed from the exposed schema; browser roles have no unintended grants; security advisors are reconciled.
- Executive/admin MFA and compromised-password protection are approved and enabled.
- A safe restore drill proves recovery of database records and separately stored child media/documents, with recorded RPO, RTO, validation, and rollback evidence.
- Credentialed access tests prove tenant, center, classroom, family, custody, medical, billing, document, and audit-log isolation for every launch role.
- Payment data stays in Stripe-hosted flows; webhook signatures, idempotency, connected-account readiness, disclosures, refunds, disputes, and reconciliation are approved and tested per school.
- Privacy, terms, consent, custody/medical handling, retention, deletion, incident/document, and vendor/subprocessor policies have named approvers and final versions.
- Sensitive actions are attributable through durable, appropriately retained audit records; monitoring and escalation paths are tested.

## Evidence completed

### Live, read-only Supabase evidence

- Project `TheBEESuite` (`nqjrlktoewiueiwrubas`) reported `ACTIVE_HEALTHY`, Postgres 17.6.
- Security Advisor returned one warning: leaked-password protection is disabled. Remediation: <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>.
- Live metadata query found 86 public tables: 81 with RLS and 5 without RLS.
- The five RLS gaps are `CalendarEvent`, `ComplianceTask`, `EmergencyDrillLog`, `PaymentMethodRequestLink`, and `SurveyResponse`.
- Live metadata found no direct `anon` or `authenticated` table grants in `public`, no public views, and no public `SECURITY DEFINER` functions.
- Live metadata found 81 policies covering the same 81 RLS-enabled public tables.

### Repository evidence

- Added synchronized Prisma and Supabase migrations that revoke `anon`/`authenticated`, enable RLS, and add `service_role`-only access for all five gaps. The migration was **not applied to production**.
- Existing server architecture keeps Supabase service-role use server-side and payment credentials in Stripe; the application stores provider identifiers and ledger/audit metadata rather than raw card or bank credentials.
- Existing custody, compliance, privacy deletion-request, Stripe fee-approval, notification audit, signed-storage, rate-limit, and operational-log controls were inspected through their domain code, migrations, documentation, and tests.
- Tracked-source scan found no live-format Stripe secret, Stripe webhook secret, or Supabase secret-key token. This does not prove that credentials previously shared in chat, screenshots, tickets, local environment files, or vendor dashboards were rotated.
- `npm audit --omit=dev` reported 0 vulnerabilities.
- Focused security-adjacent tests passed: 17 passed, 0 failed.

### Backup limitation identified

Supabase documents that database backups include Storage metadata but not the stored objects themselves. The current runbook describes database recovery but does not evidence a separate backup/restore path for child media and documents. A database-only restore cannot satisfy the workstream continuity gate.

## Open items

### BLOCKER

| Finding | Owner | Required evidence / exact retest |
| --- | --- | --- |
| Production/API credentials previously shared outside approved secret storage have no completed rotation inventory or evidence. | Brenden | Inventory each production secret by system and exposure channel; rotate affected credentials through the vendor-approved process; record secret name, owner, rotation date, dependent service retest, and revocation confirmation without recording secret values. |
| Automated backup status and a safe restore drill are not evidenced; Storage objects need a separate continuity plan. | Brenden | Confirm current backup tier/retention and Storage protection; restore a production-safe backup to an isolated environment; validate representative family, custody, medical, billing, audit, child-media, and document records; record RPO/RTO and destroy the isolated copy under the approved procedure. |
| Credentialed role isolation is not evidenced for the selected wave. | Brenden | Using approved test accounts, prove corporate, director/billing, teacher, parent/guardian, kiosk, and public roles cannot cross tenant/center/classroom/family boundaries; include custody, medical, billing, documents, messages, integrations, and audit logs. |
| Final privacy/legal/compliance approvals remain open. | Brenden | Obtain named counsel/business/school approvals for privacy, terms, DPA/service-provider posture, parent consent, photo/media, e-signature, custody/medical handling, retention/deletion exceptions, incident/document policies, and payment disclosures. |

### REQUIRED BEFORE WAVE

| Finding | Owner | Required evidence / exact retest |
| --- | --- | --- |
| Five live public tables lack RLS. Repo remediation exists but is not deployed. | Brenden | Review and promote `20260720150000_complete_public_table_rls`; rerun Security Advisor and metadata queries; require 86/86 public tables with RLS, no unintended browser grants, and a successful application smoke test. |
| Supabase leaked-password protection is disabled. | Brenden | Approve and enable compromised-password checks in Supabase Auth; rerun Security Advisor and retain a clear result. |
| Executive/admin MFA policy is undecided and unenforced. | Brenden | Name covered roles, recovery process, enrollment deadline, and exception owner; enable and credential-test the policy before wave access is issued. |
| Payment and connected-account controls require per-school evidence. | Brenden | For each payment-enabled school, verify charges/payouts/requirements, webhook signature and idempotency, hosted payment-method handling, disclosures, refund/dispute ownership, ledger reconciliation, and first-batch reconciliation in an approved safe environment. |
| Retention/deletion schedules are documented as defaults but not approved per jurisdiction/school, and operational deletion completion is not drilled. | Brenden | Approve the retention matrix and legal holds; run a test deletion request through identity verification, export/anonymization, approvals, completion audit, and requester notification without deleting live customer records. |
| Production monitoring, sensitive-log retention/access, alert recipients, and after-hours escalation are not evidenced. | Brenden | Trigger safe synthetic auth, API, webhook, and uptime failures; verify redaction, delivery, severity routing, acknowledgement, retention, and escalation ownership. |
| Storage bucket/policy and signed-URL isolation require current live evidence. | Brenden | Inventory production buckets and policies, confirm sensitive buckets are private, test cross-school denial and signed-URL expiry with approved test objects, and retain results. |

### FOLLOW-UP

| Finding | Owner | Required evidence / exact retest |
| --- | --- | --- |
| A tested Content Security Policy remains deferred while external domains and embeds are finalized. | Brenden | Build a report-only allowlist covering Stripe, Turnstile, Supabase media, white-label domains, and approved embeds; review violations before enforcement. |
| Point-in-time recovery, SSL enforcement, network restrictions, Supabase organization MFA, and vendor compliance posture should be evaluated against the final risk classification. | Brenden | Record plan/tier, data classification, RPO/RTO, vendor agreements, and explicit accept/enable decisions. |
| Security evidence needs a recurring cadence after schema, auth, storage, payment, or role changes. | Brenden | Assign a recurring review owner and require advisor output, grant/RLS inventory, role isolation, dependency audit, and restore evidence after material changes and before each wave. |

## External decisions required

- Which credentials are considered exposed and therefore require rotation.
- Backup tier, PITR/RPO/RTO target, Storage-object backup method, and safe restore-drill environment.
- Executive/admin MFA scope, enrollment deadline, recovery, and exceptions.
- Final legal/privacy/retention/consent/payment language and applicable state/customer requirements.
- Whether Supabase HIPAA/BAA controls are required for the actual data classification; no HIPAA claim is made by this audit.
- Named monitoring, incident-response, privacy-request, payment-dispute, and after-hours escalation owners.

## Files changed

- `prisma/migrations/20260720150000_complete_public_table_rls/migration.sql`
- `supabase/migrations/20260720150000_complete_public_table_rls.sql`
- `tests/public-table-rls-migration.test.ts`
- `docs/SECURITY_COMPLIANCE_PRODUCTION_READINESS_AUDIT_2026-07-20.md`

## Tests run

- `node --import tsx --test tests/public-table-rls-migration.test.ts tests/custody-visibility.test.ts tests/compliance-workflows.test.ts tests/stripe-checkout-fees.test.ts tests/director-notification-audit.test.ts` — 17 passed, 0 failed.
- `npm audit --omit=dev` — 0 vulnerabilities.
- Tracked-source live-secret pattern scan — no matches for live-format Stripe secret/webhook or Supabase secret keys.
- An initial combined verification command timed out during broad scanning; it produced no usable result and was replaced by the bounded commands above.

## Exact next action

Brenden reviews and approves the repo-only RLS migration for a separately authorized release. After it is promoted, rerun the live Supabase Security Advisor and the public-table RLS/grant inventory; the acceptance result is 86 of 86 public tables protected by RLS, zero unintended `anon`/`authenticated` grants, and no unresolved RLS advisor finding. This action does not make the wider wave GO: the credential, restore, role-isolation, and legal/privacy blockers above must also close with shared signoff.
