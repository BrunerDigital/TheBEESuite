# Longmont Full-Operations Activation Gap Report

Audit time: 2026-07-20T17:44:30-04:00  
Center: Kid City USA - Longmont  
Center ID: `cmp4ew6f3000a6alwmz62n7w2`  
Timezone: America/Denver  
Evidence source: read-only aggregate queries against the production Supabase project  
Production mutations: none  
PII included in this report: none

## Decision

Longmont is the strongest non-Kokomo candidate for the first full-operations activation rehearsal because it already contains substantial family and child data. It is not ready for parent invitations, billing activation, or live payments yet.

The activation must remain split into independently approved gates: staff operations, parent invitations, billing/invoices, and live payments/payouts. A failure in one gate must not block safe use of an already-proven gate, and approval of one gate must not implicitly approve another.

## Current production snapshot

| Area | Current evidence | Activation implication |
| --- | ---: | --- |
| Active center-grant users | 2 | Director and billing access exist. |
| Active grant roles | 1 CENTER_DIRECTOR; 1 BILLING_ADMIN | Administrative roles exist, but classroom operations need additional staffing evidence. |
| Staff profiles | 1 | Teacher/staff roster is not ready for full classroom operations. |
| Classrooms | 8 | Classroom structure exists. |
| Classroom capacity | 96 | Must be reconciled against 354 active children before activation. |
| Families | 349 | Substantial imported population is present. |
| Children | 514 total; 354 active/enrolled | Enrollment status and classroom assignment need reconciliation. |
| Children without classroom | 160 | Must be resolved or intentionally classified before classroom workflows go live. |
| Guardians | 674 | Guardian population is present. |
| Guardians with email | 518 | 156 guardian records have no usable email. |
| Linked parent users | 0 | Parent portal invitations remain NO-GO. |
| Billing contacts | 348 | Three families have no designated billing contact. |
| Billing contacts with email | 300 | 48 billing contacts have no usable email. |
| Families without any guardian email | 20 | These families require a supported offline/contact-resolution path. |
| Duplicate normalized guardian emails | 29 | Must be reviewed for legitimate shared addresses versus cross-family duplication. |
| Authorized pickups | 0 | Pickup and custody workflows are not ready. |
| Emergency contacts | 0 | Emergency-contact operations are not ready. |
| Billing accounts | 7 of 349 families | 342 families have no billing account. Billing remains NO-GO. |
| Existing billing-account balance | -$163.00 aggregate across 7 nonzero accounts | Opening balances require finance reconciliation and signoff. |
| Ledger synchronization | 0 of 7 accounts | Existing billing data is not marked reconciled. |
| Invoices | 3 OPEN | Must be classified as test, imported, or operational before billing activation. |
| Payments | 0 | No Longmont payment-lifecycle evidence exists. |
| Ledger entries | 7 | Must reconcile to approved opening balances and invoice activity. |
| Stripe connected account | Present; details submitted | Account exists, but is not payment-ready. |
| Stripe charges/payouts | Charges disabled; payouts disabled | Live checkout, payment links, autopay, and payouts remain NO-GO. |
| Attendance/check-in/daily reports/incidents/documents | 0 | Full operational workflows have not yet been proven with Longmont data. |
| Parent setup tokens | 0 | No invitations have been issued, which is the correct held state. |
| Payment-method request links | 0 | No payment setup requests have been issued, which is the correct held state. |

## Required work before activation

### Gate 1 - Staff operations

- Reconcile the active staff roster and provision the required teacher/staff profiles.
- Reconcile the eight classrooms, capacity, assigned staff, and active child placement.
- Resolve or intentionally classify the 160 children without a classroom.
- Import or verify emergency contacts, authorized pickups, custody warnings, medical restrictions, schedules, and permissions.
- Prove attendance, kiosk/check-in, child location, daily reports, incidents, documents, media, messaging, and mobile recovery with synthetic test records.

### Gate 2 - Parent invitations

- Review the 29 duplicate normalized email groups and prevent an email from linking the wrong family.
- Resolve the 20 families without any guardian email and the 48 billing contacts without email.
- Confirm billing-contact and custody authority for every invited guardian.
- Reconcile guardian-to-family-to-user mappings before issuing setup tokens.
- Prove single-use setup, supersession, expiry, replay denial, password recovery, former-credential denial, and cross-family/cross-school isolation.
- Begin with a separately approved small invitation batch and staffed support window.

### Gate 3 - Billing and invoice preview

- Establish or import billing accounts only after all 349 families are reconciled.
- Approve rates, cadence, discounts, subsidies, credits, fees, and opening balances.
- Classify and reconcile the current three open invoices, seven ledger entries, and -$163.00 aggregate balance.
- Produce a family-level billing preview and obtain director plus finance/accounting approval.
- Keep payment-method collection, checkout, autopay, and live payment links disabled.

### Gate 4 - Live payments and payouts

- Refresh the Longmont connected account and obtain `charges_enabled=true` and `payouts_enabled=true` with no outstanding requirements.
- Verify the school bank account, statement/support information, payout schedule, application fee, webhook endpoint, and signing secret.
- In Stripe Sandbox, prove card and bank setup, successful and failed payments, asynchronous settlement, dunning, receipts, duplicate/out-of-order webhook handling, partial refund, dispute, ledger posting, application fee, and payout reconciliation.
- Cap and separately approve the first live payment batch.
- Reconcile the first batch and first payout before enabling the next batch, autopay, or another school.

## Stop conditions

Stop the affected gate immediately for any wrong-school or wrong-family access, custody or pickup mismatch, incorrect tuition/opening balance, duplicate invoice or charge, wrong connected-account routing, unsigned/unreconciled webhook, unresolved Stripe requirement, failed receipt/recovery path, or unavailable support owner.

## Certification environment execution result

Completed on 2026-07-20 without changing production:

- Refreshed an existing production-data-free Supabase Preview project (`edimuxiojxvivkpvlnxj`) instead of creating a new billable branch.
- Reconciled its Supabase and Prisma migration histories and applied all current application migrations.
- Verified 88 public tables, 88 with RLS enabled, zero tables without RLS, zero tenants, zero centers, zero families, and zero users.
- Verified the parent setup token, SendGrid receipt, data-deletion, and payment-method request tables are present; parent setup tokens have RLS enabled.
- Supabase security advisors returned zero findings. Performance notices are unused-index informational results expected on an empty branch.
- Bound 16 isolated Supabase/Postgres variables only to Vercel Preview branch `production-readiness/pr11-release-evidence-20260720`.
- Redeployed commit `d33be271cd44f674c28abd89a0ce04e279b21651` as Preview deployment `dpl_6LTFzgor62TT9SeSeePx4MoNai2M`.
- The deployment reached `READY`; 515 tests passed, 5 were skipped, and none failed.
- Runtime root returned HTTP 200. `/api/health` returned `ok: true`, `database: connected`. The protected readiness endpoint required authentication. No error or fatal runtime logs were recorded for the deployment.

This is an ephemeral Preview database currently associated with an older open PR. It must not be deleted or allowed to expire during certification. A dedicated persistent staging branch remains the preferred long-term environment and requires separate Supabase cost confirmation.

## Next technical action

Approve named synthetic parent, director/billing, teacher, family, invoice, and payment records for this isolated environment. Then seed Longmont-like records and execute the four gates above using Stripe Sandbox and test-only email addresses, without sending real invitations or processing real payments.
