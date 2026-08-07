# Current Master Recommendation Supplement

Date: August 4, 2026
Source baseline: `origin/main` at `1f57c386` (`Add safe director invoice voids and zero-dollar rates (#52)`)
Worktree: `D:\Brenden Bruner\Documents\The Bee Suite 2-worktrees\recommendation-coverage-20260804`
Mode: operate / verify. No production data, provider settings, access, billing, invitations, messages, imports, deployments, or rollout gates were changed.

This supplements `PRODUCTION_READINESS_MASTER_EXECUTION_TASK_2026-07-20.md`; it does not replace the master gate structure. Keep setup, invitations, kiosk/PIN, billing/invoices, payments/payouts, ProCare retirement, mobile stores, provider changes, and wider-wave approval independent. Technical coverage below is not business activation.

## Current Coverage Decisions

| Recommendation area | Current source evidence | Decision |
| --- | --- | --- |
| Clean source baseline | Work was moved to a fresh branch from `origin/main`; the older shared checkout still has local `628cd7cb` and should not be used for release. | Covered by workflow. Use this or another fresh `origin/main` worktree for validation/release work. Reconcile the local enrollment-status commit separately. |
| Release static guardrails | `npm run ops:check` passed: 9 cron handlers match 9 configured cron paths; 38 Prisma migration directories contain SQL; 38 have Supabase mirrors. `npm audit --omit=dev` reports zero vulnerabilities. | Covered by automated guardrail. This is static evidence only; it does not prove live cron execution, database drift, backups, or deployment health. |
| Branch/release hygiene | `PRODUCTION_RELEASE_CHECKLIST.md`, `POST_RELEASE_SMOKE_CHECKLIST.md`, and the canonical `vercel-build` gate remain present. | Covered by documented gate. Any production release still needs scoped commit, push, Vercel Ready, aliases, `/api/health`, logs, and changed-flow verification. |
| Reliability monitoring | `docs/operations/RELIABILITY_MONITORING.md`, `scripts/qa-synthetic-parent-login.ts`, request logging redaction, and SendGrid delivery audit tests exist. | Covered by automated/documented guardrail. Still needs accepted alert recipients, after-hours owner, and acknowledgement evidence before R7 can close. |
| Stripe platform webhook incident | Current source includes `STRIPE_PLATFORM_WEBHOOK_SECRET` support, masked readiness diagnostics, event-ID receipt dedupe, 2xx-after-receipt behavior, replay manifest, and hardening tests. | Needs live read-only verification. Do not treat the incident closed until current Vercel env fingerprint, Ready deployment, organic retry receipt, and no unexpected mutation are verified. Replay remains a separate approval gate. |
| Stripe-ready billing activation | `scripts/activate-stripe-ready-school-billing.ts` has dry-run fingerprinting, connected-account/bank checks, apply confirmation, and no charge/invoice/refund/payment/payout side effects. Test coverage exists. | Covered by guarded implementation. Still needs dated per-school billing/business approval and evidence packet before activation or expansion; technical account readiness is not billing authorization. |
| Parent billing fees, subsidies, and checkout isolation | Current source includes subsidy/agency parent visibility protection, fee responsibility fixes, overlapping checkout blockers, and focused billing tests. | Covered by automated guardrail. Preserve parent-specific responsibility projection and invoice/family checkout isolation in every billing change. |
| Current-family active balances | Current source includes active-family/current-child balance filtering and withdrawn-family exclusion work. | Covered by automated guardrail. Dashboard/receivable queries must continue pairing center visibility with current-family/current-child predicates. |
| Safe invoice voids and zero-dollar rates | `src/lib/invoice-void.ts`, billing route changes, UI controls, and `tests/invoice-void.test.ts` exist on current `origin/main`. | Covered by automated guardrail. Director voids/zero-rate behavior still belongs to billing policy and audit review, not broad financial activation. |
| Weekly tuition cutovers | `scripts/apply-reviewed-weekly-tuition-rates.ts` requires input, fingerprint, explicit start period, billing approval, connected-account checks, short per-child transactions, and no invoice/charge side effects. | Covered by guarded implementation. Use reviewed manifests only; do not activate uncertain records or hold school-wide interactive transactions. |
| Four-week-ahead tuition billing | Current `origin/main` includes four-week-ahead tuition billing tests and billing workflow changes. | Covered by automated guardrail. Still requires school billing approval, rate eligibility review, and post-run reconciliation before business reliance. |
| Parent invitation readiness | Current source decouples ProCare completeness from hard invitation blockers, aligns bulk/direct readiness, and guards duplicate/ambiguous family access. | Covered by guarded implementation. Live sends remain separately authorized; provider `accepted` is not delivered; reconcile `IntegrationDelivery` before retries. |
| Ambiguous parent-family access | Parent accounts linked to more than one family now fail closed across parent portal, setup, kiosk credential, product purchase, payment checkout, and provisioning paths. | Covered by automated guardrail. Existing ambiguous links need record-level review before unlink/merge; do not bulk-repair by inference. |
| ProCare readiness safeguards | Current source includes ProCare relationship reconciliation, source-file collision checks, final import review safeguards, and pilot readiness module gates. | Covered by automated/documented gate. Production import preview/cutover still needs authoritative source packets, signed exception handling, and school-specific approval. |
| ProCare retirement/archive | The standing rule remains: once a school is fully set up on The BEE Suite, verify imported data, then archive source imports as recoverable backups instead of deleting or leaving active inputs. | Covered by documented gate. No school is authorized for ProCare retirement from this supplement alone. |
| Kiosk/PIN | Kiosk/PIN guardrails and module-gate checks exist. | Covered technically, needs human/business approval. Actual device smoke, pickup/custody policy, and separate kiosk GO remain required per school. |
| Role access and smoke identities | RBAC tests, two-school credentialed plan, and access maps exist. | Needs human/business approval. Create approved synthetic identities and run credentialed role/device smoke before wider rollout; do not expand roles until policy decisions are recorded. |
| Communications and provider evidence | SendGrid event verification, delivery audit states, stale/deferred/suppression reporting, and Brenden's pending communications action list exist. | Needs provider/human evidence. No broad family sends until SPF/DKIM/DMARC, sender/reply ownership, signed webhook, accepted-to-delivered proof, suppression policy, and legal classification are approved. |
| Storage and continuity | Storage archive/verify/restore tooling and no-production-data drill evidence exist. | Needs human/business approval and live operational evidence. Approve encrypted/versioned off-platform destination, scheduled runner, backup monitoring, and second technical backup owner before closing E7. |
| Mobile/native push/stores | PWA, Capacitor runbooks, Apple/Google readiness packets, and store docs exist. | Held off. No native push, signing, TestFlight/App Store/Play submission, or store claims without platform/legal/device evidence. |
| Payroll/staff reporting | Current source includes terminated-staff pay-period inclusion and executive school filter coverage. | Partially covered. Treat payroll as review/reporting until Kokomo compensation/pay-code/overtime validation and provider/export handoff are approved. |
| AI data changes | Current source includes confirmed school-scoped AI mutation controls and tests. | Covered by guardrails. Keep AI actions explicit, school-scoped, audited, and human-reviewed; no autonomous billing/access/safety decisions. |

## Items Closed By This Pass

- Created a clean `origin/main` worktree for recommendation cleanup.
- Verified current source baseline at `1f57c386`.
- Replaced the stale July 24-only view with a current supplement that accounts for post-July-24 parent, billing, ProCare, reliability, invoice, and AI work.
- Ran repo-safe static checks:
  - `npm run ops:check`: passed.
  - `npm audit --omit=dev`: zero vulnerabilities.
  - `git diff --check`: passed before edits.
- Installed dependencies in the isolated worktree with `npm ci`; npm reported zero vulnerabilities.
- Generated Prisma Client explicitly with `npx prisma generate` because this environment did not auto-run pending install scripts.
- Ran focused guardrail validation:
  - `node --import tsx --test tests/stripe-webhook-hardening.test.ts tests/stripe-ready-school-billing-activation.test.ts tests/reviewed-weekly-tuition-rate-cutover.test.ts tests/parent-invitation-readiness.test.ts tests/parent-billing-visibility.test.ts tests/invoice-void.test.ts tests/procare-family-relationship-reconciliation.test.ts tests/pilot-readiness-report.test.ts tests/request-response-logging.test.ts`
  - Result: 56 passed, 0 failed.
- Linked this isolated worktree to the existing Vercel project with `npm run cloud:link` so read-only production env checks can be attempted from the clean source tree.
- Confirmed by `vercel env ls production` that `STRIPE_PLATFORM_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, and `DATABASE_URL` are present as encrypted Production variables. This listed variable names only; it did not print secret values.
- Attempted the masked Stripe webhook readiness command, but `vercel env run -e production` did not inject Production variables into the child process in this Windows/Node 24 invocation. A boolean-only check also returned `false` for `DATABASE_URL`, `STRIPE_PLATFORM_WEBHOOK_SECRET`, and `STRIPE_WEBHOOK_SECRET`. Treat this as blocked tool execution, not as failed production configuration.

## Still Gated

These cannot be closed without explicit external evidence or authorization:

1. Stripe platform webhook live verification and any replay.
2. Production Storage backup destination, scheduler, monitoring, and second backup technical owner.
3. First school/module wave selection and per-school control records.
4. Synthetic credential set for corporate, director/billing, teacher, parent, kiosk, public, and store-review testing.
5. Credentialed role/device smoke after the next Ready deployment.
6. Provider communications proof and legal classifications.
7. Per-school billing approval packets and first-batch reconciliation.
8. ProCare source packet corrections, import preview approval, and ProCare retirement signoff.
9. Mobile store/native push signing, legal, privacy, device, and store evidence.
10. Payroll provider/export and Kokomo compensation validation.

## Next Ordered Work

1. Verify Stripe platform webhook state read-only from current production environment and Stripe destination evidence, using a working Vercel env execution path or another approved secret-safe runner.
2. Add the exact synthetic smoke identity matrix to the selected-school control record once Brenden approves accounts/devices.
3. If code changes are required after this supplement, keep them on this branch or another clean `origin/main` branch and rerun the focused set plus `npm run vercel-build` before any release decision.
4. Before any release, run the full production gate on the intended commit and complete Vercel Ready, alias, health, log, and changed-flow verification.
