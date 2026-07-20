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

1. **Credential transition requires approval and credentialed evidence.** Repo code no longer provisions or advertises the shared parent password. An authorized setup-link action now replaces the prior Supabase credential with an unknown random value, revokes prior unused setup tokens, stores only a token fingerprint, issues a one-hour link, atomically claims it, denies expiry/replay, and records issue/completion audit state. No real account was transitioned. **Owner: Brenden.** Exact retest: approve a synthetic parent account, send one setup link, prove the former credential fails, prove a second issued link revokes the first, prove expiry and replay denial, complete setup once, and prove ordinary forgot-password recovery returns to the parent portal.
2. **No selected-school credentialed parent isolation signoff exists.** Unit guardrails pass, but there is no current browser/device evidence using a linked guardian, an unlinked guardian, and a guardian from another school against the intended wave data. **Owner: Brenden.** Exact retest: for each selected school, authenticate all three identities and record positive family/child visibility plus denied wrong-family and cross-school access for portal data and mutations.
3. **Wave guardian/PIN data is not ready.** The shared readiness audit reports Longmont with 674 guardians but 0 linked logins and 0 PINs; Holly Hill has no linked guardian login; most proposed schools have no imported families or children. **Owner: Brenden.** Exact retest: after authorized import/setup, run `npm run pilot:check -- --all`, reconcile guardian-to-family/user linkage, and verify the approved PIN rollout before sending any invitations.
4. **Per-school payment lifecycle is not signed off.** Platform configuration and unit tests do not prove the selected school's connected account, payment methods, webhook, receipt, failure/dunning, ledger application, refund, or payout reconciliation. **Owner: Brenden.** Exact retest: in an approved safe tenant or test mode, complete setup, card and bank payment, pending-to-settled transition, failed payment, receipt delivery, duplicate prevention, ledger reconciliation, and approved partial refund for each payment-enabled school.

### REQUIRED BEFORE WAVE

1. **Multi-family code defect fixed; credentialed evidence remains.** The parent portal now accepts a requested family only when that family has a guardian linked to the current user, falls back to the first linked enrolled family, and shows a selector when more than one family is permitted. **Owner: Brenden.** Exact retest: use the approved two-family guardian plus unlinked and cross-school identities; prove both permitted families are selectable and every other family is denied without mixed invoices, documents, reports, incidents, messages, media, or PINs.
2. **Parent documents now default on; school policy signoff remains.** Secure server-side family/document guards remain authoritative. The UI is visible by default so document-request emails cannot land on a hidden action; `NEXT_PUBLIC_PARENT_PORTAL_DOCUMENTS_ENABLED=0` is reserved for an approved rollout hold. **Owner: Brenden.** Exact retest: verify assigned download, upload/signature, review, rejection/resubmission, mobile layout, and wrong-family denial.
3. **Invitation, reset, receipt, and transactional delivery need real delivery evidence.** Static link construction and email helper tests pass, but provider delivery, bounce/suppression handling, reset completion, Stripe receipt arrival, and the school reply/support path were not exercised in this repo-only audit. **Owner: Brenden.** Exact retest: use approved test addresses for delivered, bounced, and suppressed cases; retain provider IDs and screen evidence without exposing tokens.
4. **PIN and authorized-pickup operation needs device evidence.** Hash removal, default-PIN helpers, and QR center scoping pass unit tests, but valid/invalid PIN, custody warning, pickup authorization, duplicate check action, location state, and audit history are not currently evidenced on the target kiosk. **Owner: Brenden.** Exact retest: run the complete guardian PIN and authorized-pickup matrix on the actual launch device with safe test records.
5. **Receipt standard requires billing/accounting approval.** Recommended default: Stripe sends the payment receipt to `receipt_email`, while BEE Suite retains payment and ledger history as the operational record. Do not label either as a school tax receipt until legal name, EIN, address, numbering, retention, and resend requirements are approved. **Owner: Brenden.** Exact retest: approve the standard, verify receipt delivery and portal history for card and bank settlement/failure, then decide whether a dedicated receipt resend/download is required.

### FOLLOW-UP

1. **Global announcements have no tenant key.** `Announcement` can have `centerId = null`, and the parent query includes those rows. Confirm whether such rows are intentionally platform-wide and ensure no school-sensitive announcement is ever stored without a center. **Owner: Brenden.** Exact retest: seed platform-global, same-school, and other-school announcements in a safe tenant and verify the documented audience behavior.
2. **Parent route coverage is helper-heavy.** Current tests strongly cover guards and normalization but do not directly integration-test every parent route with database fixtures. **Owner: Brenden.** Exact retest: add route-level positive and negative fixtures for setup, preferences, documents, incidents, payment setup, checkout, and support/recovery after the credential design is approved.

## External decisions required

- Approve the implemented one-hour single-use setup-link policy and a staged existing-account credential transition; do not broadly invite parents until synthetic expiry/replay/recovery and delivery evidence passes.
- Select the actual first school wave, dates, and whether parent portal, kiosk, documents, and payments are enabled independently for each school.
- Name and obtain acceptance from the director signoff, data/import, billing/Stripe, technical release, training, and first-week support owners. Until then Brenden owns each open parent item.
- Approve the guardian PIN source/reset policy, custody/pickup operating procedure, parent-facing payment disclosures, receipt standard, and document feature-flag state.
- Authorize approved test identities/addresses, devices, and safe Stripe mode for credentialed end-to-end evidence.

## Files changed

- Parent credential/setup state: `prisma/schema.prisma`, `prisma/migrations/20260720200000_parent_portal_setup_tokens/migration.sql`, `src/lib/parent-portal-setup-links.ts`, `src/lib/parent-portal-logins.ts`, `src/lib/parent-portal-invitations.ts`, `src/lib/supabase-auth.ts`, `src/lib/auth.ts`, and the login/reset/invitation/registration/document-request routes.
- Parent isolation and workflow UI: `src/lib/portal-guardrails.ts`, `src/app/[slug]/page.tsx`, parent login/setup/invite/workspace components, signature-request copy, and `.env.example`.
- Parent guidance and policy: this audit, `docs/BRENDENS_TASKS.md`, parent onboarding/SOP/install/director guides, and the SOP index.
- Tests: `tests/parent-portal-setup-links.test.ts` and parent assertions in `tests/phase1-guardrails.test.ts`.

## Tests run

- `npm run db:generate` — passed.
- Focused parent/security/billing/document suite — passed, 84 tests, 0 failures.
- `npm test` — passed, 512 tests, 0 failures.
- `npm run typecheck` — passed.
- Focused ESLint across changed parent/auth/routes/components/tests — passed with no findings.
- `git diff --check` — passed.

## Safe release and credentialed-smoke sequence

1. Approve the setup-link, document, receipt, test-identity, evidence, support, and rollback decisions in `docs/BRENDENS_TASKS.md`.
2. Create a focused release diff without unrelated concurrent work; run `npm run vercel-build` on that exact commit.
3. Apply `20260720200000_parent_portal_setup_tokens` in an approved non-production environment and verify the table/indexes before exercising any link.
4. With a synthetic parent, issue link A, issue link B, prove A is revoked, prove the former credential fails, prove B expires/replays only as designed, complete B once, and prove ordinary forgot-password recovery still works. Confirm delivery/audit storage contains only the token record ID/fingerprint and never the raw link.
5. Run the linked two-family, unlinked, and cross-school identity matrix across portal reads and mutations; then run documents, PIN/pickup, daily reports, incidents, preferences, support, payment setup/test payment/receipt/failure, and mobile/desktop recovery.
6. Collect Director, technical/security, billing/accounting, and support signoff. Promote the focused migration/release only with separate authorization; verify readiness, health, logs, and the changed synthetic flow before authorizing any staged real-account transition.
7. Transition existing parent accounts in small named batches with delivery monitoring, stop conditions, and support coverage. Broad invitations remain off until the first batch reconciles.

## Exact next action

Brenden must approve a synthetic parent test account and the staged credential-transition policy; then apply the migration in a safe environment, run setup-link issue/supersession/expiry/replay/recovery tests plus the linked/unlinked/cross-school and two-family smoke, and collect Director/technical/billing/support signoff before any release or broad parent invitation.
