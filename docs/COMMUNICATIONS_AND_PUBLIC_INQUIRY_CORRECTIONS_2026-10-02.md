# Communications and public inquiry corrections

This scoped correction addresses reported daily-report emails, message attachments, conversation replies, and public inquiry eligibility. It changes no school billing, identities, access, provider configuration, or historical records.

## Director and parent behavior

Daily-report email at checkout includes all reports recorded for that child in the school's service day. Notes and care entries remain in their original records. The query enforces the child, tenant, school, and day before aggregation.

Message email copies list attachment filenames and direct recipients to the authenticated conversation. Parents sign in to open files. Email contains no permanent storage download URL. Existing family authorization and attachment validation remain in place. Conversation replies inherit their thread subject, so the expanded reply composer no longer asks for a redundant subject.

Public location lists filter explicitly removed locations after combining database and static choices. Intake also rejects those locations by center ID, location ID, and aliases before writing a lead. This protects against stale browser options while preserving existing leads and eligible locations. Mailbox reinstatement does not restore public inquiries.

## Acceptance

Focused payment, setup, communications, and inquiry checks passed. The production gate passed lint, typecheck, all 2583 tests, and the optimized Next.js build. No live test email, charge, identity repair, or invite was submitted. Deployment evidence and authenticated acceptance are recorded separately in the private completion tracker.
# Family ledger and tuition rate handling

When the complete family ledger sums to the current account balance, the family ledger and its printed views calculate running balances in effective-date order. Posting snapshots remain stored unchanged. Partial or unreconciled ledgers retain their stored snapshots pending investigation.

Authorized billing staff can select a tuition rate under Tuition rate setup and choose Archive rate. Archived rates stay visible in the rate editor and can be restored. New child assignments omit archived rates; an existing child assignment keeps its plan and recurring billing. Invoices, plan amounts, saved assignments and audit history are retained. Archive and restore changes are scoped to the school and tenant and recorded atomically in the audit log. No schema migration is required.
