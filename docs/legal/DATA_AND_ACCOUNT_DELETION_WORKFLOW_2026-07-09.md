# Data and Account Deletion Workflow - The BEE Suite

Draft date: July 9, 2026  
Status: Draft for owner, counsel, product, and engineering review. Do not publish without approval.

## Release Requirement

Apple requires apps that support account creation to let users initiate account deletion inside the app. The workflow must be easy to find, must allow deletion of the entire account rather than only deactivation, and must explain any regulated retention process.

The BEE Suite processes childcare records that may be controlled by schools and may need retention for licensing, safety, custody, medical, accounting, payment, audit, or legal reasons. The correct implementation is an in-app deletion request flow with identity verification, school/customer routing, retention review, and completion notice.

## Public Entry Points

Required:

- Parent portal settings: `Settings > Privacy and Account > Request account deletion`
- Public support page: `https://thebeesuite.io/support`
- Public privacy policy: `https://thebeesuite.io/privacy`
- Support email fallback: `support@thebeesuite.io`

Recommended:

- Terms/EULA link from account settings.
- Data request form with authenticated and unauthenticated paths.
- Admin queue for directors/executives to review school-controlled records.

## Request Types

| Request type | Description | Typical owner |
| --- | --- | --- |
| Account deletion | Delete or deactivate a user's login account and access tokens. | The BEE Suite support/security |
| Personal data deletion | Delete, de-identify, or restrict personal data where legally and operationally allowed. | The BEE Suite plus school/customer |
| Correction request | Fix inaccurate family, child, billing, pickup, medical, or staff records. | School/customer |
| Access request | Provide a user a copy or summary of account/personal data where required. | The BEE Suite plus school/customer |
| School-controlled record request | Change or delete child/family/student/staff records controlled by a childcare provider. | School/customer |

## In-App Parent Flow

1. User opens Parent Portal.
2. User opens Settings.
3. User selects Privacy and Account.
4. User selects Request account deletion.
5. App explains:
   - This starts a deletion request.
   - Login access can be removed.
   - Some school records may need to be retained.
   - Urgent child safety/pickup issues require direct school contact.
   - The user will receive confirmation and timing.
6. User confirms request.
7. Server creates a deletion request record with:
   - Request ID.
   - User ID.
   - Guardian/family IDs.
   - Center/school IDs.
   - Request type.
   - Timestamp.
   - Source: iOS app/web app/support.
   - Status: pending verification.
   - Metadata: current role and contact email.
8. Server sends verification email or requires recent password reauthentication.
9. After verification, status changes to verified.
10. System notifies support and the relevant school/customer admin queue.
11. School/customer reviews retained school records where required.
12. The BEE Suite executes approved deletion/deactivation actions.
13. User receives completion notice or retention explanation.

## Staff/Admin Flow

For staff, director, executive, billing, and support users:

1. User initiates request from account settings or support.
2. The BEE Suite verifies identity and role.
3. Customer admin or authorized owner approves removal if the account is tied to employment or school records.
4. The BEE Suite removes login access, sessions, device sessions, and operational permissions.
5. Staff records, audit logs, employment records, compliance records, and payment records are retained or deleted according to customer and legal requirements.
6. User receives a completion notice where appropriate.

## Retention Review

Before deleting or de-identifying records, check:

- Child safety records.
- Custody and pickup restrictions.
- Incident reports.
- Medical, allergy, medication, immunization, and health records.
- Attendance records.
- Licensing and state childcare retention rules.
- Billing, invoice, payment, refund, dispute, and tax records.
- Staff employment/time/certification records.
- Audit logs.
- Security incident evidence.
- Backup retention windows.
- Litigation hold or law enforcement request.
- Customer contract requirements.

If deletion cannot be completed, provide the requester a clear explanation where legally allowed.

## Engineering Requirements

Minimum implementation:

- Add a `DataDeletionRequest` or equivalent table.
- Add server route to create authenticated deletion requests.
- Add parent settings UI entry point.
- Add email confirmation or recent reauthentication.
- Add admin/support queue.
- Add audit log event for every status change.
- Add status values: `pending_verification`, `verified`, `school_review`, `approved`, `partially_completed`, `completed`, `denied_retention_required`, `cancelled`.
- Add SLA timestamps: received, verified, due, completed.
- Add internal notes and user-visible response fields.
- Add exportable evidence packet for audit.
- Expire active sessions after account deletion is approved.
- Preserve audit logs without exposing unnecessary sensitive data.

Recommended implementation:

- Add self-service request history for the requester.
- Add director/customer approval workflow for school-controlled records.
- Add deletion job queue with idempotent steps.
- Add backup deletion/de-identification tracking.
- Add support macros for Apple review and privacy requests.
- Add metrics for request volume and completion times.

## Operational SLA

Suggested public targets, subject to counsel approval:

- Acknowledge request immediately in app and by email.
- Verify identity within 7 days where additional verification is required.
- Complete straightforward account deletion within 30 days.
- Provide explanation when school/legal retention prevents full deletion.
- Escalate complex school-controlled, payment, legal, or safety records to the relevant childcare provider and legal owner.

## Apple Review Notes

Suggested language after implementation:

```text
Users can initiate account deletion in the app from Parent Portal > Settings > Privacy and Account > Request account deletion. The app creates a verified deletion request and explains that certain childcare, safety, licensing, billing, payment, or audit records may need to be retained by the school or The BEE Suite where required by law or school policy.
```

## Completion Checklist

- [ ] Counsel approves deletion policy and retention language.
- [ ] Product approves user-facing copy.
- [ ] Engineering implements in-app request entry point.
- [ ] Engineering implements server request record and audit log.
- [ ] Support queue and ownership are defined.
- [ ] School/customer review path is defined.
- [ ] Completion and denial templates are approved.
- [ ] Privacy Policy references the workflow.
- [ ] Support page references the workflow.
- [ ] App Review notes include deletion path.
- [ ] QA verifies request creation, email, admin queue, session expiry, and retained-record explanation.
