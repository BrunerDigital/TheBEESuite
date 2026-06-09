# Security, Privacy, And Data Operations

Last updated: June 9, 2026

This document defines the production security operating plan for The BEE Suite. It does not replace legal review, state licensing review, or Supabase's own security advisor output.

Latest internal review: `docs/LEGAL_PRIVACY_SECURITY_REVIEW_2026-06-09.md`. The internal product/security/privacy review is complete. Public SaaS expansion still requires owner/counsel approvals, payment-processing approval, Twilio/SMS compliance approval, MFA decision, production monitoring, and live Supabase advisor verification.

## Application Security Headers

`next.config.ts` applies baseline browser security headers to all routes:

- `X-DNS-Prefetch-Control: on`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(self), browsing-topics=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` in production only

Do not add a broad CSP until Stripe Checkout, Cloudflare Turnstile, Supabase media URLs, white-label domains, and public embed scripts have a tested allowlist.

## Access Model

The application should keep direct browser access to database tables disabled. Public clients use API routes, Supabase Auth, signed cookies, and server-side role/scope checks. Supabase service-role access stays server-side only.

Primary scope order:

1. Platform owner: all tenants.
2. Brand/franchise admin: assigned brand/organization/owner group.
3. Regional manager: assigned owner group, region, or centers.
4. Center director/assistant director/billing admin: assigned center.
5. Teacher: assigned classroom/center records needed for classroom work.
6. Parent/guardian: linked family and children only.
7. Authorized pickup: check-in/check-out authorization only.
8. Read-only auditor: explicitly granted read-only scope.

## RLS And Table Scope Documentation

When Supabase table access is exposed outside trusted server APIs, every table must have RLS enabled and must follow the scope below. Tables marked `derived` inherit access only through their parent relationship.

| Model | Primary Scope | Policy Requirement |
| --- | --- | --- |
| Tenant | platform | Platform owner only. |
| Brand | tenant | Tenant scope; brand admins only for assigned brand. |
| Organization | tenant/brand | Tenant plus assigned brand/organization. |
| Center | organization/owner group | Assigned organization, owner group, or center. |
| OwnerGroup | tenant/brand/organization | Executive/brand users assigned to the group. |
| Classroom | center | Assigned center; teachers only assigned classroom. |
| User | tenant/organization | Self plus admins in assigned scope. |
| UserAccessGrant | tenant/brand/org/owner group/center/user | Executive/admin only; audited mutation. |
| BrandAsset | tenant/brand/owner group/center | Assigned brand/center branding admins. |
| BrandCustomization | tenant/brand/org/owner group/center | Assigned brand/center branding admins. |
| Role | platform | Platform-managed reference data. |
| Permission | platform | Platform-managed reference data. |
| Family | center | Assigned center; parents only linked family. |
| Guardian | family/user | Assigned family or linked guardian user. |
| Child | family/classroom | Assigned family, center, or classroom. |
| AuthorizedPickup | family | Assigned family; center staff with safety need. |
| EmergencyContact | family | Assigned family; center staff with safety need. |
| ChildMedicalNote | child | Child scope; restricted staff only. |
| Allergy | child | Child scope; staff with child safety need. |
| Enrollment | child/lead | Assigned center through child or lead. |
| EnrollmentPipelineStage | reference | Read-only reference data. |
| Lead | center | Assigned center; executives across granted centers. |
| Tour | center/lead | Assigned center through lead/tour. |
| WaitlistEntry | derived | Assigned center through child/lead/program relationship. |
| Task | lead | Assigned center through lead. |
| Note | family/lead/user | Assigned center through family or lead; author/admin for edits. |
| Tag | tenant/brand | Tenant/brand-managed reference data. |
| CustomField | tenant/brand/module | Tenant/brand-managed schema extensions. |
| Message | family | Family-linked parents and assigned center staff. |
| Announcement | center | Assigned center; brand admins for broadcasts. |
| Campaign | brand | Assigned brand/organization only. |
| Automation | brand | Assigned brand/organization only. |
| AutomationRun | automation | Assigned brand through automation. |
| Form | tenant/brand/center | Assigned tenant/brand/center. |
| FormSubmission | family | Family/center scope; sensitive fields restricted. |
| Document | family/child | Family/child scope; restricted by document type. |
| AttendanceRecord | classroom/child | Assigned center/classroom/family child. |
| CheckInOutLog | center/classroom/child | Assigned center/classroom/family child. |
| DailyReport | classroom/child | Assigned classroom/center/family child. |
| ChildMedia | classroom/child | Assigned classroom/center/family child; signed URLs only. |
| Meal | daily report | Inherits daily report scope. |
| Nap | daily report | Inherits daily report scope. |
| DiaperPottyLog | daily report | Inherits daily report scope. |
| ActivityLog | daily report | Inherits daily report scope. |
| IncidentReport | classroom/child | Assigned center/classroom/family child; restricted review. |
| StaffProfile | center/classroom/user | Assigned center; staff self profile where appropriate. |
| StaffSchedule | center | Assigned center. |
| Certification | staff profile | Assigned center through staff profile. |
| BillingAccount | family | Family billing contact and assigned billing/admin staff. |
| Invoice | billing account | Inherits billing account/family scope. |
| InvoiceItem | invoice | Inherits invoice scope. |
| Payment | invoice/billing account | Inherits invoice scope; no raw payment credentials. |
| LedgerEntry | billing account | Inherits billing account/family scope. |
| Product | tenant/brand/center | Assigned tenant/brand/center billing admins. |
| TuitionPlan | tenant/brand/center | Assigned tenant/brand/center billing admins. |
| SubscriptionPlaceholder | tenant/brand/owner group | Platform/brand billing admins. |
| Review | center/brand | Assigned center/brand. |
| Survey | family/center | Assigned family/center. |
| Notification | user | Recipient user only, plus scoped admin support access. |
| AuditLog | tenant/center/user | Read by authorized admins; append-only from server. |
| Integration | tenant | Platform/tenant admins only; secrets never returned to client. |
| StripeWebhookEvent | platform | Server-only webhook idempotency table. |
| ProcareImportBatch | center | Assigned center; executives across granted centers. |
| ProcareImportRow | import batch | Inherits import batch scope. |
| FteReport | center | Assigned center; executives across granted centers. |
| WhiteLabelSettings | brand | Assigned brand admins. |
| AiSummary | target record | Inherits target module scope; human review for sensitive output. |
| AiSuggestion | target record | Inherits target module scope; human review for sensitive output. |

## Encryption And Sensitive Field Plan

Supabase/Postgres provides encryption at rest for the database and storage layer. The app should add field-level protection for data where a normal database reader should not see plaintext.

Fields that should be prioritized for field-level encryption or envelope encryption:

- Custody notes and court-order details.
- Medical notes, medication instructions, allergy severity notes, and immunization attachments.
- Guardian PIN hashes use one-way hashing and must never store plaintext PINs.
- Billing metadata that is not already tokenized by Stripe.
- Uploaded documents containing IDs, medical records, subsidy details, or legal paperwork.
- Incident report attachments and sensitive staff notes.

Implementation plan:

1. Keep payment method data in Stripe only.
2. Keep file storage private and use short-lived signed URLs.
3. Add an encryption service helper before introducing plaintext custody/medical free-text expansion.
4. Store key identifiers separately from ciphertext.
5. Rotate encryption keys through a documented maintenance process.
6. Redact encrypted/sensitive fields from logs, analytics, exports, and support screenshots.

## Data Retention And Deletion Policy

Default retention should be conservative until legal review finalizes state-specific rules.

| Data Type | Default Retention | Deletion Rule |
| --- | --- | --- |
| CRM leads not enrolled | 24 months after last activity | Delete or anonymize after retention window unless legal hold. |
| Enrolled family/child records | 7 years after last enrollment | Archive first, then delete/anonymize after approval. |
| Attendance/check logs | 7 years | Retain for operational and licensing documentation support. |
| Incident reports | 7 years minimum | Retain longer if unresolved, legal hold, or school policy requires. |
| Billing invoices/ledger/payments | 7 years | Retain non-card financial records for accounting. |
| Child media/photos | 12 months by default | Delete sooner on approved parent/school request when permitted. |
| Messages/announcements | 3 years | Archive or delete by tenant policy. |
| In-app notifications | 180 days by default | Hide expired/archived notifications from user surfaces; use dedupe keys for repeatable system reminders. |
| Audit logs | 7 years | Append-only; do not edit. |
| Import batches/source rows | 12 months after validated cutover | Delete raw imports after validation and backup period. |
| Support artifacts/screenshots | 90 days unless tied to incident | Redact or delete after issue closure. |

Deletion requirements:

- Verify requester identity and authority.
- Confirm tenant, center, family, and child scope before deletion.
- Export records first if required by school policy.
- Prefer anonymization where accounting/audit retention prevents deletion.
- Log deletion requests and completion in audit/support records.

## Backup And Restore Runbook

### Backup Requirements

- Supabase automated backups must remain enabled for production.
- Export before every bulk import, migration, or cross-location correction.
- Keep import source files and batch IDs until validation is complete.
- Keep Google Sheet backups for inquiry/FTE workflows as secondary operational backup only, not as the system of record.

### Restore Procedure

1. Identify incident type: accidental delete, bad import, bad migration, vendor outage, or data corruption.
2. Stop the affected workflow if writes could make the issue worse.
3. Capture affected tenant, center, table/model, user, timestamp, and deployment SHA.
4. Check audit logs, import batch records, and Vercel logs.
5. Choose restore method:
   - Row-level repair from export/import batch for small corrections.
   - Point-in-time restore to a temporary database for investigation.
   - Full production restore only for severe incidents after owner approval.
6. Validate restored data with an executive user and one affected location user.
7. Run the role smoke test checklist.
8. Document root cause and prevention step.

### Post-Restore Checks

- Confirm location users still see only their assigned center data.
- Confirm public inquiry routing still creates leads for the selected location ID.
- Confirm FTE reports still show correct week/center status.
- Confirm Stripe webhook idempotency records were not duplicated.
- Confirm audit logs and support notes include the correction.
