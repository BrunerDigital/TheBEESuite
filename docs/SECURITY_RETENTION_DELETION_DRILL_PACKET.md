# Retention And Deletion Drill Packet

Status: Blank evidence template. Use synthetic or approved non-production records. This packet does not authorize deletion of production customer data.

## Authorization and policy inputs

- Accountable owner:
- Privacy/legal approver:
- Technical operator:
- Environment and synthetic subject:
- Approved retention schedule version:
- Applicable school/state requirements:
- Legal hold checked by and result:
- Drill start/end timestamp and time zone:

## Request lifecycle

| Step | Required evidence | Result | Evidence reference | Owner |
| --- | --- | --- | --- | --- |
| Intake | Durable request ID without exposing credentials or sensitive notes |  |  |  |
| Identity/authority | Requester and relationship verified |  |  |  |
| Scope | Tenant, center, family, child, account, files, integrations, and vendors enumerated |  |  |  |
| Retention decision | Delete, anonymize, retain, or legal hold per record class |  |  |  |
| Export | Approved portable export produced when required and securely transferred |  |  |  |
| Approval | Named school/privacy/legal approval before execution |  |  |  |
| Execution | Synthetic records deleted/anonymized through supported application/vendor APIs |  |  |  |
| Storage | Object bodies and metadata handled consistently; signed links invalidated |  |  |  |
| Vendors | Stripe/Supabase/email/SMS or other processor action documented where applicable |  |  |  |
| Sessions | Account sessions revoked before identity deletion where required |  |  |  |
| Audit | Request, decision, actor, timestamp, retained exceptions, and completion recorded |  |  |  |
| Notification | Sanitized completion/retention explanation prepared and approved |  |  |  |

## Record-class decisions

| Record class | Policy period | Action at expiry | Legal/school exception | System/location | Verification query or UI check | PASS/FAIL |
| --- | --- | --- | --- | --- | --- | --- |
| Account/session data |  |  |  |  |  |  |
| Family/guardian/child |  |  |  |  |  |  |
| Custody/medical/allergy |  |  |  |  |  |  |
| Attendance/incidents |  |  |  |  |  |  |
| Billing/ledger/receipts |  |  |  |  |  |  |
| Documents/media/Storage objects |  |  |  |  |  |  |
| Messages/notifications |  |  |  |  |  |  |
| Audit/security logs |  |  |  |  |  |  |
| Imports/support artifacts |  |  |  |  |  |  |

## Negative and recovery checks

- Deleted/anonymized subject no longer appears in permitted search/export surfaces:
- Cross-school user cannot inspect the request or evidence:
- Retained accounting/audit records contain only approved minimum data:
- Storage object cannot be retrieved with an old signed URL after required deletion:
- Deletion did not remove another family/school record:
- Restore/backup policy explains whether deleted data remains in immutable backups and for how long:
- Failed or partial execution is detectable, retryable, and assigned:

## Decision

- Exceptions:
- Defects and classification:
- Retest owner and exact step:
- Privacy/legal reviewer:
- Technical reviewer:
- Brenden decision: `ACCEPTED`, `RETEST REQUIRED`, or `NO-GO`
- Decision date and scope:

Any identity failure, cross-school effect, undocumented retained sensitive data, incomplete Storage deletion, or missing audit trail is a **BLOCKER**.
