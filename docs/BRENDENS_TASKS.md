# Brenden's Recorded Wave Decisions, Accepted Owners, and Signoffs

This file records facts after they occur. Do not add proposed tasks, default owners, recommendations, unsigned approvals, or Codex findings here. Open readiness work remains in the workstream audits, `SCHOOL_ROLLOUT_READINESS_CHECKLIST_2026-07-18.md`, and the reusable per-school control/evidence packets.

The wider school wave remains **NO-GO**. Kokomo may continue normal production use. No entry in this file authorizes a different module or bypasses its underlying evidence gate.

## Actual wave choices

No first-wave school, launch date, or module scope has been selected and recorded as of July 20, 2026.

When Brenden makes a decision, record only:

| Decision date/time | School and center ID | Launch window/time zone | Modules selected | Modules held off | Decision evidence |
| --- | --- | --- | --- | --- | --- |

### Director smoke selection and evidence

No selected-school Director smoke authorization has been recorded as of July 20, 2026. Record only actual selections and approvals; never record credentials, PINs, tokens, session cookies, or full payment details.

| Decision date/time | Selected school and center ID | Approved real Director/billing test accounts | Approved environment/devices/window | Approved financial evidence and test scope | Evidence reference |
| --- | --- | --- | --- | --- | --- |

## Accepted owners

No delegation acceptance has been recorded as of July 20, 2026. Brenden remains accountable until a named person explicitly accepts a defined responsibility.

Record only accepted delegations:

| Acceptance date/time | School/scope | Responsibility | Accepted owner | Coverage window | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |

For a Director smoke, accepted ownership must cover Director operations, data reconciliation, billing/accounting when in scope, technical retest, alert/support coverage, and stop/rollback authority. Do not infer acceptance from a name alone.

## Signoffs

No new-school go-live or module activation signoff has been recorded as of July 20, 2026.

Record only completed written decisions:

| Decision date/time | School and center ID | Gate/module | Approver and authority | GO / NO-GO / NOT ENABLED | Exact scope/exceptions | Evidence reference |
| --- | --- | --- | --- | --- | --- | --- |

Parent invitations, kiosk/PIN, billing/invoices, live payments/payouts, and ProCare cutover must each have separate entries when decided. ProCare remains the source of truth until a written ProCare cutover approval is recorded.

## Pending communications actions requiring Brenden

These are required external actions and legal classifications, not recorded decisions or authorization to send. Complete them using `SENDGRID_PROVIDER_CONFIGURATION_EVIDENCE_CHECKLIST.md`.

- [ ] Approve and evidence each platform/school From identity, SPF, DKIM, DMARC alignment/policy, branded-link posture, monitored reply inbox, primary/backup reply owner, and response target.
- [ ] Review redacted suppression counts and approve the hard-bounce, block, spam-report, invalid-address, global-unsubscribe, and ASM handling/removal policy; name the primary and backup suppression operator.
- [ ] Authorize a provider administrator to configure the signed SendGrid Event Webhook and verification-key environment variable after the receipt migration is released; retain redacted signing, event-selection, replay, and accepted-to-final evidence.
- [ ] Approve one non-family test inbox and one controlled invalid test address for the exact invitation/payment test sequence; this does not authorize broad invitations or live-family messaging.
- [ ] Classify every email purpose as transactional, operational, or marketing and obtain legal/product approval for consent, preference-center, unsubscribe, physical-address, payment, receipt, and failed-payment language.
- [ ] Decide whether any tenant may use shared platform SendGrid credentials. The implemented default is fail closed; any exception must document authentication alignment, branding, reply routing, suppression scope, legal classification, incident owner, and revocation condition.

## Security and compliance actions requiring Brenden

- [ ] **Authorize the pending RLS migration release.** Approve `20260720150000_complete_public_table_rls` for a separately controlled promotion and authorize the post-release read-only security audit. This entry is authorization only; it does not record the migration as applied.
- [ ] **Approve and configure leaked-password protection and executive/admin MFA.** Record the covered roles, enrollment deadline, recovery and exception process, and completion evidence from Supabase. Do not record recovery codes or secrets here.
- [ ] **Authorize and witness the database-plus-Storage restore drill.** Select the isolated environment, backup sources, Storage-object recovery method, RPO/RTO, operators, cleanup plan, and evidence location using `SECURITY_DATABASE_STORAGE_RESTORE_EVIDENCE_PACKET.md`.
- [ ] **Obtain legal/privacy policy approvals.** Record final approval for privacy, terms, DPA/service-provider posture, consent, photo/media, e-signature, payment disclosures, custody/medical handling, retention/deletion exceptions, and incident/document policies.
- [ ] **Provide the external security evidence.** Attach sanitized credential-rotation confirmation, Supabase advisor/settings evidence, credentialed role-isolation results, Storage privacy/signed-URL tests, monitoring/escalation tests, and completed retention/deletion drill evidence. Do not include passwords, tokens, PINs, full medical/custody notes, or payment details.

## Teacher classroom decisions requiring Brenden

- [ ] **Approve the health-check custody policy.** Name the required daily health fields, who may view/correct them, parent visibility, retention period, urgent escalation path, and whether a health check is a licensing record. Until approved, urgent health concerns remain direct-to-director communication and no new health record is collected.
- [ ] **Approve temporary classroom coverage.** Decide whether a teacher may act for another classroom, who grants and expires that access, whether dual-classroom coverage is allowed, and what audit evidence directors review. The current implementation remains fail-closed to the teacher's assigned classroom.
- [ ] **Name the supported classroom devices.** Record tablet/phone models, OS versions, managed/shared-device posture, browser or installed-app mode, camera policy, storage restrictions, and the minimum offline duration to support.
- [ ] **Accept the classroom operating loop.** A named director and teacher must complete roster, attendance, the approved health workflow, location, daily report, incident, permission-aware media, messages, offline/reconnect, account switching, and cross-classroom denial on supported devices before school signoff.
