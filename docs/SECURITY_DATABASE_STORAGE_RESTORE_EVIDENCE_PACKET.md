# Database And Storage Restore Evidence Packet

Status: Blank evidence template. A completed packet requires separately authorized infrastructure access and a safe isolated environment. Never restore over production for this drill.

## Authorization and scope

- Accountable owner:
- Technical operator:
- Approver and authorization reference:
- Source environment:
- Isolated restore target:
- Approved start/end window and time zone:
- Source backup identifier and timestamp:
- Database backup type and retention window:
- Storage-object backup source and retention window:
- Target RPO / target RTO:
- Data minimization and isolated-target destruction plan:

Stop if the target could route email/SMS, charge payments, run cron jobs, invoke production webhooks, accept public traffic, or write to production integrations. Disable those paths before validation.

## Pre-restore controls

| Control | Expected | Result | Evidence reference | Owner |
| --- | --- | --- | --- | --- |
| Target is isolated from production | No shared writable database or Storage target |  |  |  |
| Outbound communications disabled | Email, SMS, push, webhooks, and campaigns cannot send |  |  |  |
| Billing disabled | No live Stripe calls, autopay, invoices, refunds, or payouts |  |  |  |
| Scheduled jobs disabled | No billing, dunning, reminders, or integration retries |  |  |  |
| Access restricted | Only named drill operators can access restored data |  |  |  |
| Sensitive evidence sanitized | No credentials, full medical/custody notes, payment data, or tokens captured |  |  |  |

## Database restore evidence

Record counts and hashes or sanitized identifiers, not sensitive record contents.

| Domain | Representative validation | Expected | Actual | PASS/FAIL | Evidence reference |
| --- | --- | --- | --- | --- | --- |
| Tenant/center/access | Grants and center assignments preserved | Scoped relationships match source |  |  |  |
| Family/guardian/child | Relationships and guardian links preserved | Referential integrity passes |  |  |  |
| Custody/medical/allergy | Restricted records present and need-to-know access preserved | Authorized visible; unauthorized denied |  |  |  |
| Attendance/incidents | Recent test records recover to expected point | Within RPO |  |  |  |
| Billing/ledger | Invoices, payments, credits, and webhook dedupe records reconcile | No duplicate or missing entries |  |  |  |
| Audit logs | Actor, action, scope, timestamp, and resource references preserved | Append-only history usable |  |  |  |
| Privacy requests | Request status and retention acknowledgement preserved | Workflow can resume safely |  |  |  |

## Storage-object restore evidence

Supabase database backups contain Storage metadata, not deleted object bodies. Validate object recovery separately through the approved Storage backup mechanism and Storage API; do not modify the `storage` schema directly.

| Object class | Private bucket confirmed | Metadata reconciles | Object opens through approved signed access | Unauthorized access denied | Integrity/hash matches | Evidence reference |
| --- | --- | --- | --- | --- | --- | --- |
| Child media |  |  |  |  |  |  |
| Family documents |  |  |  |  |  |  |
| Staff documents |  |  |  |  |  |  |
| Signed forms/incidents |  |  |  |  |  |  |

## Recovery and isolation validation

- RLS/grant audit result:
- Credentialed two-school isolation result:
- Signed-URL expiry result:
- Stripe webhook replay/idempotency result using safe fixtures only:
- Achieved RPO:
- Achieved RTO:
- Exceptions and severity:
- Cleanup/destruction evidence for isolated restored data:
- Technical reviewer decision:
- Brenden decision and date:

Any missing Storage object, cross-school exposure, live external side effect, unreconciled ledger entry, or failed audit-history recovery is a **BLOCKER**.
