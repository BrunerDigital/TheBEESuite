# Parent Experience Production Readiness

Audit date: July 20, 2026

Accountable human: Brenden until he explicitly delegates this workstream.

Decision: **NO-GO for the wider school wave. Kokomo may continue normal production use.** This workstream does not authorize parent invitations, production-data changes, payment enablement, credential changes, or deployment.

## Production-ready definition

The parent experience is production-ready for a selected school only when a credentialed, linked guardian can complete invite/setup/reset on the target devices; sees only the correct family and children; can use the approved PIN and pickup flow; can review daily reports, approved media, documents, incidents, preferences, and messages; can reach a clear support/recovery path; and, when payments are in scope, can save a method, pay, receive a receipt, observe settlement/failure accurately, and reconcile the result without duplicate or wrong-family application. The same tests must deny access to an unlinked guardian and another school. School data, Stripe Connect, support coverage, and all shared rollout signoffs must also pass.

## Evidence completed

- Traced `/parents`, `/parents/setup`, `/parent-portal/setup`, `/reset-password`, and `/parent-portal` through their authentication, guardian linkage, and setup paths.
- Traced the parent workspace's family, child, billing account, invoices, payments, ledger, daily reports, incidents, messages, documents, shared media, announcements, PIN credentials, preferences, and account-deletion request queries.
- Confirmed family-sensitive mutation routes use linked-guardian or scoped-center checks for incident acknowledgement, parent document submission, payment-method management, checkout, family change requests, and preferences.
- Confirmed checkout is blocked when tenant Stripe credentials, webhook reconciliation, a connected account, charges, payouts, or cached requirements are not ready. No payment or production configuration was changed.
- Confirmed payment setup uses Stripe-hosted setup/checkout behavior, payment rows distinguish pending bank settlement, and the portal prevents a second checkout while an invoice has an active pending payment.
- Confirmed signed downloads are produced for family documents, shared child media, and message attachments before records reach the client.
- Confirmed PIN summaries remove the PIN hash before client serialization and PIN/QR helpers scope credentials to the current center and PIN state.
- Added a visible `/support` entry point in Parent Profile Settings for login, payment, document, and security recovery, with explicit direction to call the school for urgent child, pickup, medical, or custody concerns.
- Full unit suite passed: 424 tests, 0 failures.
- Focused parent regression passed: 43 tests, 0 failures across parent RBAC, invite links, portal login metadata, guardian PIN/change requests, preferences, payment-method management/disclosures, billing reconciliation, daily-report email, incidents, and document checklists.

## Findings and open items

### BLOCKER

1. **Shared parent default password is launch-unsafe.** New parent users are provisioned with the shared `BusyBees` password, the login UI and guides publish it, and parent users are not required to reset it. A known guardian email plus the shared password can become account access. Existing-account remediation requires a controlled credential transition, delivery/recovery testing, and authorization to invalidate or rotate credentials. **Owner: Brenden.** Exact retest: invite a new test guardian through a one-time setup/recovery link, prove the link expires or cannot be reused, prove the shared password cannot authenticate, and prove reset recovery returns to the correct parent setup route.
2. **No selected-school credentialed parent isolation signoff exists.** Unit guardrails pass, but there is no current browser/device evidence using a linked guardian, an unlinked guardian, and a guardian from another school against the intended wave data. **Owner: Brenden.** Exact retest: for each selected school, authenticate all three identities and record positive family/child visibility plus denied wrong-family and cross-school access for portal data and mutations.
3. **Wave guardian/PIN data is not ready.** The shared readiness audit reports Longmont with 674 guardians but 0 linked logins and 0 PINs; Holly Hill has no linked guardian login; most proposed schools have no imported families or children. **Owner: Brenden.** Exact retest: after authorized import/setup, run `npm run pilot:check -- --all`, reconcile guardian-to-family/user linkage, and verify the approved PIN rollout before sending any invitations.
4. **Per-school payment lifecycle is not signed off.** Platform configuration and unit tests do not prove the selected school's connected account, payment methods, webhook, receipt, failure/dunning, ledger application, refund, or payout reconciliation. **Owner: Brenden.** Exact retest: in an approved safe tenant or test mode, complete setup, card and bank payment, pending-to-settled transition, failed payment, receipt delivery, duplicate prevention, ledger reconciliation, and approved partial refund for each payment-enabled school.

### REQUIRED BEFORE WAVE

1. **Multi-family guardian behavior is unresolved.** Login provisioning can link matching guardian records across a tenant, but `/parent-portal` selects only the newest linked family. A guardian connected to multiple valid family records cannot select or review the others. **Owner: Brenden.** Exact retest: define the intended multi-family experience, create a test guardian linked to two families, and prove every permitted family is selectable without mixing records.
2. **Parent documents are feature-flagged off unless `NEXT_PUBLIC_PARENT_PORTAL_DOCUMENTS_ENABLED=1`.** Documentation describes document upload/signature as generally available, so the intended launch state and school training copy are not aligned. **Owner: Brenden.** Exact retest: decide the wave setting, then verify an assigned family document download, upload/signature, director review state, rejection/resubmission, and wrong-family denial on desktop and mobile.
3. **Invitation, reset, receipt, and transactional delivery need real delivery evidence.** Static link construction and email helper tests pass, but provider delivery, bounce/suppression handling, reset completion, Stripe receipt arrival, and the school reply/support path were not exercised in this repo-only audit. **Owner: Brenden.** Exact retest: use approved test addresses for delivered, bounced, and suppressed cases; retain provider IDs and screen evidence without exposing tokens.
4. **PIN and authorized-pickup operation needs device evidence.** Hash removal, default-PIN helpers, and QR center scoping pass unit tests, but valid/invalid PIN, custody warning, pickup authorization, duplicate check action, location state, and audit history are not currently evidenced on the target kiosk. **Owner: Brenden.** Exact retest: run the complete guardian PIN and authorized-pickup matrix on the actual launch device with safe test records.
5. **Parent receipt retrieval is not a clearly evidenced portal workflow.** Checkout supplies `receipt_email` and the portal lists payment/ledger history, but the audited workspace does not expose a dedicated receipt download or verified resend path. **Owner: Brenden.** Exact retest: decide whether Stripe email plus ledger history satisfies the school/accounting requirement; otherwise add and test a stable receipt retrieval/resend workflow.

### FOLLOW-UP

1. **Global announcements have no tenant key.** `Announcement` can have `centerId = null`, and the parent query includes those rows. Confirm whether such rows are intentionally platform-wide and ensure no school-sensitive announcement is ever stored without a center. **Owner: Brenden.** Exact retest: seed platform-global, same-school, and other-school announcements in a safe tenant and verify the documented audience behavior.
2. **Parent route coverage is helper-heavy.** Current tests strongly cover guards and normalization but do not directly integration-test every parent route with database fixtures. **Owner: Brenden.** Exact retest: add route-level positive and negative fixtures for setup, preferences, documents, incidents, payment setup, checkout, and support/recovery after the credential design is approved.

## External decisions required

- Approve a one-time parent invitation/password-setup design and an existing-account credential transition; do not broadly invite parents while the shared-password blocker remains.
- Select the actual first school wave, dates, and whether parent portal, kiosk, documents, and payments are enabled independently for each school.
- Name and obtain acceptance from the director signoff, data/import, billing/Stripe, technical release, training, and first-week support owners. Until then Brenden owns each open parent item.
- Approve the guardian PIN source/reset policy, custody/pickup operating procedure, parent-facing payment disclosures, receipt standard, and document feature-flag state.
- Authorize approved test identities/addresses, devices, and safe Stripe mode for credentialed end-to-end evidence.

## Files changed

- `src/components/parent-portal-workspace.tsx` — added the parent-visible support/recovery entry point.
- `docs/PARENT_EXPERIENCE_PRODUCTION_READINESS_2026-07-20.md` — added this evidence record and owner-based launch gates.

## Tests run

- `npm test` — passed, 424 tests, 0 failures.
- `node --import tsx --test tests/parent-app-rbac.test.ts tests/parent-portal-logins.test.ts tests/parent-portal-invite-links.test.ts tests/guardian-kiosk-pin.test.ts tests/guardian-change-requests.test.ts tests/notification-preferences.test.ts tests/payment-method-management.test.ts tests/payment-disclosures.test.ts tests/billing-reconciliation.test.ts tests/daily-report-email.test.ts tests/teacher-incident.test.ts tests/required-document-checklist.test.ts` — passed, 43 tests, 0 failures.

## Exact next action

Brenden must approve the one-time parent setup and existing-account credential-transition design; then the implementation owner should remove shared-password parent provisioning and published login guidance, add positive/reuse/expiry/reset tests, and run the credentialed three-identity isolation smoke in the first selected school's safe test data before any broad parent invitation.
