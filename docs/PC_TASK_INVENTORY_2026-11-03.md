# PC engineering and QA inventory - November 3, 2026

Scope: continue safe PC engineering work from `origin/main` at `52a3ccc61c11f2553bc62f9b28c73b4aa58d101d`. This is a dated inventory, not approval for operational changes or a new production release. Existing approved operations remain live. Older school, identity, provider and financial counts below linked task lists need fresh, scoped verification before action.

## Current source and queue

- PRs [#511](https://github.com/BrunerDigital/TheBEESuite/pull/511) and [#515](https://github.com/BrunerDigital/TheBEESuite/pull/515) are already merged. The prior task verified #515's production deployment; this pass did not redeploy either change.
- The initial November 3 GitHub snapshot found no open issues or pull requests before this QA proposal. Main [web CI](https://github.com/BrunerDigital/TheBEESuite/actions/runs/41521575802) and [unsigned iOS CI](https://github.com/BrunerDigital/TheBEESuite/actions/runs/41521575786) succeeded. An unsigned build does not establish authenticated physical-device acceptance or store approval.
- The primary checkout is still at `05fda84` with ten tracked dirty files and additional untracked work. It was preserved. QA work uses a fresh temporary worktree from main on `qa/offline-payment-recovery-20261103`.
- The saved October 20 local to-do list, repository instructions, Codex memories, [remaining tasks](REMAINING_TASKS.md) and [October 19 follow-up](COMPLETION_FOLLOWUP_2026-10-19.md) were reconciled with this source/CI snapshot. Historical completed releases were not reopened.

## Prioritized next actions

| Priority | Action | Result or remaining gate |
| --- | --- | --- |
| P1 - safe engineering QA | Exercise repeat cash/check clicks, interrupted responses, receipt validation, reload recovery and family isolation using fictional data and intercepted APIs. | Eleven new component-browser scenarios pass. Existing seven draft/document scenarios also pass. Coverage is wired into the existing CI browser step; no product behavior changed. |
| P1 - authenticated acceptance | Complete genuine parent-session billing, invoice/receipt and installed-app acceptance; verify removal of the old unsaved acceptance note. | Blocked by the existing Windows browser URL-verification gate. No retry, alternative session, credential reset or impersonation was attempted. Synthetic director checks do not close this gate. |
| P2 - reviewed dependency maintenance | Find a compatible upgrade path for current glob/minimatch tooling advisories. | Fresh production-only audit: zero vulnerabilities. Full audit: 19 moderate, zero high/critical. Dependabot cannot produce a compatible security update; automatic major-version suggestions include downgrades. No lockfile change or `npm audit fix` was applied. |
| P2 - worktree reconciliation | Confirm ownership, untracked artifacts and whether unmatched heads are merged, duplicated, obsolete or deliberately retained before proposing cleanup. | Read-only snapshot contains 34 worktrees: 14 with main-ancestor heads and no tracked changes, 19 with non-ancestor heads and no tracked changes, and the dirty primary checkout. Ancestry does not prove whether squash-merged content is duplicated. All were retained; no untracked-content or ownership audit was completed. |
| Owner decision | Resolve recovery custody, MFA enrollment, exact school/source exceptions, provider delivery, financial reconciliation and rollout gates from the dated operating worklists. | Requires named owners, current exact evidence and the relevant explicit authorization. No account, school, provider, financial or rollout state changed. |
| Explicitly held | Timezone labels, delivery status, ACH correction and annual-report changes. | Remain excluded from integration and production release until specifically approved. Paused Castaway work remains untouched. |

## Added behavioral coverage

`tests/offline-payment-recovery.browser.ts` mounts the real `BillingWorkbench` with the shared fictional director fixture, using a separate headless browser and fresh page contexts. All API traffic is intercepted; external traffic is rejected. These checks never use a signed-in user profile, a production endpoint or a payment provider.

For both cash and check, the scenarios verify:

1. Rapid repeated clicks while the response is held send one submission; validated success clears the matching recovery marker and form fields.
2. A deliberately lost response retains the request identity. After reload, `offlinePaymentReceipt` looks up the existing mocked receipt without another payment submission. Explicit acknowledgement clears the marker without posting anything.
3. A response with another family's receipt preserves the draft and request ID; a retry reuses that ID.
4. Unavailable browser recovery storage prevents API submission.
5. Switching families cannot look up or adopt another family's unresolved payment marker; returning to the original family recovers the original receipt.

An additional check verifies that Cancel clears unsaved check fields while preserving an unresolved financial operation's recovery identity. The existing seven draft, statement and director document scenarios remain in the same CI command. These are component integration checks; the server is mocked, so they do not establish live ledger correctness, authenticated parent access or real provider acceptance.

## Dependency evidence

The read-only full lockfile audit reported [glob cancellation bypass](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and [minimatch amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249), propagated through development tooling such as ESLint/Next ESLint, TypeScript ESLint and Capacitor CLI. `npm audit --omit=dev --json` reported zero findings at the same lockfile.

The separate [Dependabot job](https://github.com/BrunerDigital/TheBEESuite/actions/runs/41521603484) failed with `security_update_not_possible` / `update_not_possible`; its latest compatible minimatch version was 10.2.5, below the audited fixed range. This is a dependency-maintenance item, separate from the successful main application CI. Do not accept incompatible majors or misleading automated downgrade suggestions without testing a reviewed upgrade plan.

## Local evidence and limits

- Local full and production audit reports: `%TEMP%/bee-pc-dependency-audit-20261103.json` and `%TEMP%/bee-pc-production-dependency-audit-20261103.json`.
- Local worktree inventory: `%TEMP%/bee-pc-worktree-inventory-20261103.csv`. No cleanup was performed.
- Validation log: `%TEMP%/bee-pc-qa-validation-20261103.log`. `npm run vercel-build` passed: Prisma generation, lint, typecheck, all 3,170 aggregate tests (2,996 primary, seven cron, 167 FTE), and the Next.js 16.4.3 production build. The two browser files passed all 18 behavioral scenarios (20 Node test entries including their two enclosing tests).
- The optional readiness PowerShell helper was blocked by Windows execution policy. No policy bypass or setting change was attempted; repository/tool/worktree checks were performed directly with read-only commands.
- No deployment, financial write, message, invitation, attendance event, identity/permission mutation or provider change was performed. No production acceptance is claimed by this test-only work.
