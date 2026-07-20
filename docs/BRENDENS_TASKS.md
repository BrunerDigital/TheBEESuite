# Brenden's Recorded Decisions and Signoffs

This file is primarily a factual ledger for actual wave choices, accepted owners, and completed signoffs. The pending Communications section below is the explicit action list Brenden requested; it records no approval and grants no authorization.

The wider school wave remains **NO-GO**. Kokomo may continue normal production use. No entry authorizes a different module or bypasses its evidence gate.

## Read-only production inspection approvals

| Decision date/time | Approved target/scope | Decision | Limits | Evidence reference |
| --- | --- | --- | --- | --- |
| 2026-07-20T13:26:38-04:00 | Currently configured production database for TheBEESuite Supabase project `nqjrlktoewiueiwrubas`; existing authorized launch-owner browser session | Brenden approved Codex to perform the R4 read-only production inspection and authenticated `/api/system/readiness` capture needed by the master task. | No migration apply/repair/reverse, deployment, production-data mutation, account creation, credential/provider change, school/family contact, module activation, billing/payment/payout action, or business/legal/cutover approval. Existing independent gates and stop conditions remain in force. | `PRODUCTION_READINESS_MASTER_EXECUTION_TASK_2026-07-20.md`, R3/R4 execution records |

Connected evidence: Brenden completed Supabase dashboard sign-in. The production project showed eight daily physical database restore points dated July 13-20, latest `2026-07-20T08:04:24Z`; PITR is not enabled and Storage objects are excluded from database backups. This is backup evidence, not restore-drill completion or Storage recovery approval.

## Production release approvals

| Decision date | Release scope | Decision | Result | Limits |
| --- | --- | --- | --- | --- |
| 2026-07-20 | GitHub PR `#8`, `Sync Supabase migration history for readiness smoke` | Brenden stated: “Authorize PR #8 merge and production verification.” | Merged at `2026-07-20T19:05:03Z` as `93cf5c7f`; Vercel production became `READY`, Supabase protected-main migration check reported current, and health/log verification passed. | This exact approval did not authorize later production migrations, real-customer test writes, credential rotation, provider changes, or wider-school activation. |
| 2026-07-20 | GitHub PR `#11`, `Enable RLS for parent setup tokens`; only isolated demo teacher `demoteacher@kidcityusa.com` | Brenden stated: “Authorize PR #11 merge and production verification. Authorize rotation of only the isolated demo teacher credential for the bounded daily-report regression and cleanup.” | Merged at `2026-07-20T20:48:52Z` as `8054ef23`; protected-main applied the migration, production reached 88/88 RLS, Vercel became `READY`, public/parent smoke and logs passed, and the authorized teacher create/replay/cleanup passed with zero test rows remaining. | Limited to this PR and this synthetic credential/regression. No family send, real-customer mutation, provider change beyond the already recorded leaked-password setting, module activation, school-wave GO, billing/payment/payout action, or ProCare cutover. |

## Production security configuration evidence

| Evidence date/time | Target | Change | Verification | Remaining boundary |
| --- | --- | --- | --- | --- |
| 2026-07-20T20:38:32Z | Supabase project `nqjrlktoewiueiwrubas`, production Auth email provider | Enabled **Prevent use of leaked passwords**. | Dashboard showed the setting enabled after save; a fresh Security Advisor run returned zero errors, zero warnings, and no leaked-password finding. | MFA policy and role-enrollment evidence remain separate open requirements. |
| 2026-07-20T20:54:50Z | Isolated demo teacher `demoteacher@kidcityusa.com` only | Rotated the generated credential, stored it as Windows generic credential `TheBeeSuite/production/isolated-demo-teacher`, and incremented the application session version. | Production login `200`; one internal daily report created `201`; the same client action replayed `200` with the original report and `replayed: true`; logout `200`; cleanup deleted one report, report audit, device session, device audit, and rate-limit bucket; zero matching rows remained. | This does not authorize rotation of any other account, reveal the stored secret, broaden demo access, or satisfy MFA, cross-role isolation, Storage restore, or school-wave gates. |

## Actual wave choices

No first-wave school, launch date, or module scope has been selected and recorded as of July 20, 2026.

| Decision date/time | School and center ID | Launch window/time zone | Modules selected | Modules held off | Decision evidence |
| --- | --- | --- | --- | --- | --- |

## Accepted owners

No delegation acceptance has been recorded as of July 20, 2026. Brenden remains accountable until a named person explicitly accepts a defined responsibility.

| Acceptance date/time | School/scope | Responsibility | Accepted owner | Coverage window | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-07-20T14:20:13-04:00 | Platform production release/database readiness; no school-wave or business/legal approval implied | Technical release/database ownership, including stop and rollback authority | Brenden Bruner | Effective immediately and continuing until replaced or revoked; response target and backup owner remain unrecorded | Brenden stated: “I, Brenden, accept technical release/database ownership, including stop and rollback authority.” |

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
