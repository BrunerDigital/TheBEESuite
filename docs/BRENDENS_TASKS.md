# Brenden's Recorded Decisions and Signoffs

This file is primarily a factual ledger for actual wave choices, accepted owners, and completed signoffs. The pending Communications section below is the explicit action list Brenden requested; it records no approval and grants no authorization.

The wider school wave remains **NO-GO**. Kokomo may continue normal production use. No entry authorizes a different module or bypasses its evidence gate.

## Actual wave choices

No first-wave school, launch date, or module scope has been selected and recorded as of July 20, 2026.

| Decision date/time | School and center ID | Launch window/time zone | Modules selected | Modules held off | Decision evidence |
| --- | --- | --- | --- | --- | --- |

## Accepted owners

No delegation acceptance has been recorded as of July 20, 2026. Brenden remains accountable until a named person explicitly accepts a defined responsibility.

| Acceptance date/time | School/scope | Responsibility | Accepted owner | Coverage window | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |

## Completed signoffs

No new-school go-live or module activation signoff has been recorded as of July 20, 2026.

| Decision date/time | School and center ID | Gate/module | Approver and authority | GO / NO-GO / NOT ENABLED | Exact scope/exceptions | Evidence reference |
| --- | --- | --- | --- | --- | --- | --- |

Parent invitations, kiosk/PIN, billing/invoices, live payments/payouts, and ProCare cutover require separate entries. ProCare remains the source of truth until written ProCare cutover approval is recorded.

## Pending Communications actions for Brenden

Complete these external/provider and legal actions using `SENDGRID_PROVIDER_CONFIGURATION_EVIDENCE_CHECKLIST.md`. Checking an item records evidence completion only; it does not authorize broad invitations, live-family messaging, billing, or deployment.

- [ ] Approve and evidence each platform/school From identity, SPF, DKIM, DMARC alignment/policy, branded-link posture, monitored reply inbox, primary/backup reply owner, and response target.
- [ ] Review redacted suppression counts and approve the hard-bounce, block, spam-report, invalid-address, global-unsubscribe, and ASM handling/removal policy; name the primary and backup suppression operator.
- [ ] Authorize a provider administrator to configure the signed SendGrid Event Webhook and verification-key environment variable after the receipt migration is released; retain redacted signing, event-selection, replay, and accepted-to-final evidence.
- [ ] Approve one non-family test inbox and one controlled invalid test address for the exact invitation/payment test sequence.
- [ ] Classify every email purpose as transactional, operational, or marketing and obtain legal/product approval for consent, preference-center, unsubscribe, physical-address, payment, receipt, and failed-payment language.
- [ ] Decide whether any tenant may use shared platform SendGrid credentials. The implemented default is fail closed; any exception must document authentication alignment, branding, reply routing, suppression scope, legal classification, incident owner, and revocation condition.
