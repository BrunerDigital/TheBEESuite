# Enrollment CRM Delivery, Backup, and Retry Evidence

Create one completed copy per selected school. This template does not authorize live notifications or production backup writes.

## School and test authorization

- School name:
- Center ID:
- CRM location ID (`ST | City`):
- Test date/time and time zone:
- Approved test lead/family identifier:
- Test authorized by:
- Tester:
- Evidence storage location:

## Inquiry routing and isolation

- Submitted location ID:
- Resolved center ID/name:
- BEE Suite lead ID:
- Lead visible to approved school role: `PASS / FAIL`
- Lead absent from second-school role: `PASS / FAIL`
- Public confirmation shown: `PASS / FAIL`
- Evidence links/screenshots:

## School notification

- Human-approved primary mailbox:
- Human-approved fallback mailbox/group:
- Approval owner and date:
- Integration delivery record ID:
- Provider message ID and final status:
- Received by primary mailbox at:
- Reply-to path tested: `PASS / FAIL`
- Bounce/suppression checked: `PASS / FAIL`
- No unintended recipient observed: `PASS / FAIL`
- Redacted evidence links/headers:

## Google Sheets backup

- Approved spreadsheet owner and tab:
- Access list reviewed by:
- Retention/deletion policy reference:
- Integration delivery record ID:
- Lead ID and center ID reconcile: `PASS / FAIL`
- Expected row created once: `PASS / FAIL`
- No other-school sheet/tab received the row: `PASS / FAIL`
- Redacted evidence link:

## Retry

- Approved safe failure introduced or observed:
- Provider/purpose: `sendgrid inquiry_notification / google_sheets inquiry_backup`
- Initial delivery status/error and attempt count:
- Retry owner, trigger, and time:
- Final delivery status and attempt count:
- Provider/recipient evidence reconciled: `PASS / FAIL`
- Duplicate notification/backup row avoided: `PASS / FAIL`
- Evidence links:

## Human signoff

- School director — `GO / NO-GO`, name, date, exceptions:
- Corporate enrollment owner — `GO / NO-GO`, name, date, exceptions:
- Technical/release owner — `GO / NO-GO`, name, date, exceptions:
- Final CRM activation decision and exact enabled scope:

Record `NO-GO` if routing resolves to the wrong school, either school can see the other's lead, recipients are unapproved, delivery or backup cannot be reconciled, retry duplicates a delivery, or a CRM stage is treated as enrollment approval without a linked enrollment record.
