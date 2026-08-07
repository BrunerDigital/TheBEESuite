# Agent Recommendation Coverage Audit

Date: August 4, 2026
Lane: operate / verify
Mode: repository and documentation review only. No production data, provider configuration, access, billing, messages, invitations, imports, deployments, or rollout gates were changed.

## Sources Reviewed

- `docs/PRODUCTION_READINESS_MASTER_EXECUTION_TASK_2026-07-20.md`
- `docs/PRODUCTION_READINESS_AUDIT_MATRIX_2026-07-24.md`
- `docs/READINESS_CONTINUATION_PROMPTS_2026-07-20.md`
- `docs/APP_COMPLETION_CHECKLIST.md`
- `docs/BRENDENS_TASKS.md`
- `docs/RELEASE_NOTES_2026-07-24.md`
- `docs/audits/2026-07-31-kid-city-billing-configuration-audit.md`
- `docs/incidents/STRIPE_WEBHOOK_FAILURE_2026-07-28.md`
- Current Git state after `git fetch --prune`

## Current State

- Working tree is clean.
- Local `main` is divergent: one local commit ahead of `origin/main` and 29 commits behind it.
- Local-only commit: `628cd7cb Improve enrollment status reporting workflows`.
- Current `origin/main`: `1f57c386 Add safe director invoice voids and zero-dollar rates (#52)`.
- The workspace readiness helper referenced by the workflow skill was not present at `scripts/workspace-readiness.ps1`, so this audit used direct Git and document inspection.

## Coverage Map

| Area | Existing coverage | Current risk | Coverage decision |
| --- | --- | --- | --- |
| Authoritative backlog | The master execution task consolidates the 17 readiness workstreams and says not to run them as duplicate backlogs. | Later work after July 24 adds billing, parent invitation, rate cutover, AI mutation, ProCare, and invoice-void risk surfaces that are not folded back into the July 20 master doc. | Keep the master as the gate structure, but treat this audit plus newer release notes/incidents as current supplements until the master is refreshed. |
| Repository / release hygiene | Release checklist, post-release smoke checklist, `npm run vercel-build`, `ops:check`, and no-force-push policy exist. | The active checkout is behind `origin/main` and has one local-only commit. Releasing or validating from here could miss 29 remote commits or accidentally bundle the local enrollment change. | Any release or broad validation should start from a fresh `origin/main` worktree. Reconcile or intentionally retain `628cd7cb` separately. |
| Wider school rollout | `BRENDENS_TASKS.md` records no first-wave school/module selections or completed new-school signoffs. | Wider wave remains NO-GO. Code readiness cannot substitute for school/module decisions, owners, training, support, and cutover records. | Covered as a gate. Next action is still human wave selection plus accepted owners before credentialed school evidence. |
| Owners and incident coverage | Brenden accepted primary technical release/database ownership and response targets. | Backup technical owner and after-hours coverage remain unaccepted. Monitoring acknowledgement and named recipients remain incomplete. | Partially covered. Do not close operations readiness until backup owner and alert acknowledgement evidence are recorded. |
| Backup, Storage, and recovery | Storage archive/verify/restore tooling and a no-production-data database-plus-child-media drill exist. | Production Storage backup is not operational without an approved encrypted/versioned off-platform destination and runner. The drill does not certify every object class or full E7 continuity. | Partially covered. Needs approved destination, scheduled runner, monitoring, and representative restore evidence before multi-school cutover. |
| Role access / RBAC | Role map, two-school credentialed test plan, RBAC helpers, and isolation tests exist. | MFA, support role/impersonation policy, credentialed positive/negative role smoke, and some persona mappings remain open. | Covered technically, blocked operationally. Do not expand role enum or issue broad accounts before policy and credential matrix approval. |
| Parent invitations and portal access | Parent setup-link and invitation tooling/tests exist; invitation readiness policy has been tightened in recent work. | Live sends remain separate authorization. Provider accepted status is not proof of delivered mail. ProCare completeness is diagnostic, not a blocker by itself. | Covered as a guarded workflow. Continue reconciling delivery records before retrying; no duplicate waves after provider/pooler uncertainty. |
| Parent billing privacy and checkout isolation | Recent code and tests cover subsidy agency hiding, family responsibility projection, and overlapping checkout guards. | Director and parent views intentionally differ; future billing edits can regress by exposing agency responsibility to parents or allowing concurrent invoice/family checkout. | Covered with focused tests. Keep parent-specific projections and checkout draft blockers in any billing change. |
| Current-family active balances | Recent work adds current-enrollment filters for AR/dashboard views. | Historical withdrawn/hidden families can leak back into active balances if queries use visibility only without current-family/current-child predicates. | Covered with tests. Use `currentFamilyWhere` / `currentlyEnrolledChildWhere()` whenever active receivables or active dashboards are changed. |
| Billing approvals and Stripe Connect | Billing audit found all 70 active public locations mapped to reachable Stripe accounts; five were technically charge/payout ready. Tests and evidence packets exist. | No explicit full-billing approval records were found in the July 31 audit. Technical Stripe readiness is not billing authorization. | Covered as a gate. Require per-school billing approval, opening balance preview, connected-account packet, and reconciliation before billing/payments. |
| Stripe webhook incident | Diagnosis, patch inventory, readiness script, reconciliation script, and replay manifest exist. | The incident report explicitly stopped before production secret/config change, deployment, organic retry confirmation, or replay. Newer origin commits may have moved this forward, but this checkout did not live-verify it. | Treat as not closed from this audit alone. Before relying on platform webhook delivery, verify current Vercel env fingerprint, Ready deployment, organic retry receipt, and no unexpected mutation. |
| Tuition cutovers and recurring invoices | Guarded weekly tuition tooling and recent four-week-ahead billing work exist on `origin/main`; memory records prior P2028 recovery lessons. | Large rate cutovers can fail if transactions run too long or if unreviewed records are activated. | Covered by process. Use reviewed manifests, fingerprint confirmation, short per-child transactions, and zero financial side effects unless separately authorized. |
| ProCare imports and retirement | Preview tooling, source manifest retention, duplicate review, and import tests exist. | Oakleaf and Canton still require authoritative source fixes in the July 24 record. Duplicate source keys require school/source interpretation. ProCare retirement needs written cutover after imported data is verified. | Covered as a gate. Do not preview/commit/cut over from unresolved source packets; archive imports only after a school is fully set up on BEE Suite. |
| Kiosk / PIN / authorized pickup | Kiosk UX, PIN, QR, custody warnings, throttling tests, and SOPs exist. | Actual school-device kiosk activation remains independent. Custody/pickup failure is a stop condition. | Covered technically, blocked operationally. Needs selected-school synthetic device smoke and separate kiosk GO. |
| Communications / SendGrid / SMS | SendGrid checklist, webhook receipt work, retry queues, suppression policy tasks, and SOPs exist. | Provider configuration, legal classification, reply ownership, signed webhook evidence, and accepted-to-delivered proof remain external gates. | Covered as a gate. No broad family sends until provider evidence and response ownership are complete. |
| Mobile / app stores / native push | PWA guidance, Capacitor runbooks, Apple/Google readiness docs, and store packets exist. | Native APNs/FCM, signing, TestFlight, store metadata, physical device evidence, and legal/privacy declarations remain open. | Covered as held-off. Do not advertise native store/push capability until approved and evidenced. |
| Payroll / HR / staff reports | Staff payroll fields, time cards, payroll print tests, and recent origin payroll commits exist. | Payroll provider/export rules and compensation validation remain open; HR/payroll role is not first-class. | Partially covered. Treat payroll output as review/reporting until Kokomo validation and provider handoff are approved. |
| AI-assisted actions | AI command features and recent confirmed school-scoped mutation work exist. | AI output is still advisory/human-reviewed; any data-changing AI action needs strict school scope and audit evidence. | Covered with guardrails. Keep AI data changes school-scoped, explicit, and auditable; no autonomous safety/billing/access decisions. |
| Public routes and API safety | Static API inventory, survey hardening, rate-limit/public-route tests, and production smoke docs exist. | App checklist still says rate limiting is needed for all public and sensitive mutation routes. | Partially covered. Keep public-route inventory current after each new route and add focused tests before release. |

## Highest-Risk Gaps To Close Next

1. Reconcile the local/remote branch divergence before any new release or broad validation.
2. Refresh the authoritative master task with post-July-24 realities: parent invite waves, billing activation work, Stripe webhook incident, rate cutovers, current-family balance repairs, invoice voids, AI mutation controls, and ProCare readiness safeguards.
3. Verify the Stripe platform webhook production state from current `origin/main` and Vercel/Stripe evidence before any replay, payment expansion, or reliance on platform receipts.
4. Record backup technical owner, after-hours coverage, and alert acknowledgement evidence.
5. Approve the production Storage backup destination and scheduled runner; then run monitored backup/verify evidence.
6. Select the first school/module wave and create the exact per-school control record, or keep the wider wave explicitly NO-GO.
7. Create approved synthetic smoke identities for corporate, director/billing, teacher, linked/unlinked/two-family parent, kiosk, and public flows.
8. Complete per-school billing approval packets before treating technically ready Stripe accounts as active billing locations.
9. Resolve authoritative ProCare source gaps and duplicate-source-key reviews per school before import preview or ProCare retirement.
10. Execute credentialed role/device smoke after the next Ready deployment, using only approved fixtures and cleanup boundaries.

## Practical Next Step

Create a fresh worktree from `origin/main`, then produce a short "current master supplement" that merges this audit with the post-July-24 commits and marks every item as one of:

- `Covered by automated guardrail`
- `Covered by documented approval gate`
- `Needs live read-only verification`
- `Needs human/business approval`
- `Needs implementation`

Do not use the divergent local `main` for that work unless the local enrollment-status commit is intentionally reconciled first.
