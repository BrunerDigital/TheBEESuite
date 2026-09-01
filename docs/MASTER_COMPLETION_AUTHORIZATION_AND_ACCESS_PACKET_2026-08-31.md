# BEE Suite Master Completion Authorization and Access Packet

Date opened: August 31, 2026
Initiative branch: `initiative/master-product-completion-20260831`
Clean worktree: `D:\Brenden Bruner\Documents\The BEE Suite-worktrees\master-completion-20260831`
Starting commit: `082710f6` (`origin/main` at setup)

## Purpose

This packet lets the team move quickly without combining technical work with identity, financial, communication, provider, or school-cutover approvals. It records what may proceed under the August 31 request to get set up and authorized, and what still requires an exact execution preview.

## Standing authorization recorded from the August 31 request

The following work may proceed across the master completion initiative:

- inspect repository, deployment metadata, logs, tests, configuration presence, and authorized read-only production state;
- create and use isolated worktrees and scoped branches from current `origin/main`;
- implement backward-compatible application, test, documentation, accessibility, recovery, observability, and configuration-readiness changes;
- create migrations and provider-configuration instructions without applying production migrations or changing providers;
- run local tests, static analysis, production builds, non-mutating readiness scripts, and synthetic/local browser tests;
- open pull requests, address review feedback, and prepare protected releases;
- after request-specific release authorization, merge an otherwise approved and green scoped pull request through the normal protected process;
- after request-specific release authorization, deploy merged technical changes and verify intended commit, Vercel Ready state, canonical aliases, health, logs, and non-mutating changed flows;
- create preview-only, dry-run-first, fingerprinted audit and reconciliation tooling;
- update canonical repository documentation and evidence packets;
- preserve unrelated work, production data, identities, payments, messages, invitations, providers, and cutover state.

This standing authorization does not bypass branch protection, required reviews, failing checks, unresolved review findings, deployment stop conditions, or exact-target validation.

## Always allowed without another approval

- Read-only source, Git, deployment, database-schema, provider-readiness, and redacted production audits.
- Synthetic fixtures and local/staging test data that cannot contact or charge real users.
- Documentation, plans, checklists, test additions, and reversible code changes.
- Non-mutating provider API reads that do not expose secrets or personal/payment data in output.
- Drafting exact mutation or communication previews for approval.

## Exact-preview approval required immediately before execution

The following cannot be authorized safely as an unlimited standing permission. Each execution must show the exact targets, proposed change, safeguards, and post-verification plan.

### Identity and access

- Create, link, invite, disable, delete, or change any real Prisma or Supabase Auth user.
- Add, replace, or remove any role, access grant, school membership, guardian link, teacher access, PIN, or device session.
- Rotate a real user's credential or revoke all sessions.

Required preview: user identity, application record, Auth record, role, exact school/scope, reason, before state, intended after state, notification behavior, and rollback.

### Parent and staff invitations

- Create setup links or send/resend real invitations.

Required preview: exact current eligible population, excluded population with reasons, school, recipient addresses, template, subject, secure link behavior, expiry, sender, support owner, and delivery reconciliation.

### Billing, payments, refunds, credits, and payouts

- Create, edit, void, or recover real invoices.
- Post cash, check, payroll, subsidy, agency, or other payments.
- Charge saved methods, run/retry autopay, refund, credit, dispute, or alter balances.
- Activate school billing, payment acceptance, connected accounts, payout destinations, payout schedules, or software subscriptions.

Required preview: exact tenant, school, family, child, account, invoices, amounts, responsibility split, service/effective period, connected account, consent, source evidence, current provider state, fingerprint, audit effect, rollback or compensating action, and post-state queries.

### Communications and publishing

- Send real email, SMS, push, announcement, campaign, daily report, review request, or social/ad post.
- Change sender identity, reply routing, suppression policy, webhook configuration, or publishing permissions.

Required preview: exact recipients/audience, exclusions, sender, reply owner, subject/body/media/link, classification, consent/unsubscribe policy, schedule, provider account, dedupe behavior, and delivery verification.

### ProCare imports, production data, and school cutover

- Commit a real import, exclude/merge records, change production family/child/staff records, or archive source files.
- Activate kiosk, invitations, billing, payments, or retire ProCare.

Required preview: exact school, source files and hashes, coverage, mapping, warnings, exclusions, counts, financial reconciliation, safety relationships, import batch, rollback/export, director/corporate/technical approvals, module GO/HOLD list, and effective cutover time.

### Providers, infrastructure, and stores

- Apply production database migrations.
- Rotate secrets, change DNS/custom domains, change Supabase/Stripe/SendGrid/Twilio/Google/marketing accounts, enable native capabilities, sign or submit apps, or publish store releases.

Required preview: exact project/account/domain/app, proposed provider-side change, affected flows, secret handling, validation, rollback, owner, and approved maintenance/release window.

### Destructive cleanup

- Delete or permanently alter worktrees, branches, source exports, backups, users, records, provider resources, or audit evidence.

Required preview: exact resolved target, provenance, proof of merge/duplication/obsolescence, recovery method, and retention decision.

## Decisions needed once to remove recurring blockers

- [ ] Name a backup technical/recovery owner in addition to Brenden.
- [ ] Approve the normal release rule: green scoped PRs may merge through branch protection and deploy automatically; administrator bypass remains separate and exceptional.
- [ ] Select or approve a staging data policy: synthetic-only, sanitized snapshot, or another documented approach.
- [ ] Approve the secret manager and who may administer production credentials.
- [ ] Approve the monitoring/on-call platform, notification destinations, and primary/backup responders.
- [ ] Approve the backup destination, retention, encryption owner, and restore-drill cadence.
- [ ] Approve role-based smoke-test account creation and storage for two-school credentialed isolation testing.
- [ ] Name legal/privacy, accounting/billing, communications/deliverability, school-operations, mobile-store, and ProCare/cutover approvers.
- [ ] Decide which current school will be the first full-role verification target and which second school will be used for isolation testing.
- [ ] Decide whether native iOS distribution is in the current completion scope or remains after browser/PWA completion.
- [ ] Decide whether Android is in the current completion scope; the repository currently has no Android native target.
- [ ] Decide whether custom domains, terminal equipment store, paid advertising, and support impersonation are current-scope deliverables or deferred enhancements.

## Access and connection inventory

### Confirmed at initiative setup

- [x] Local Git repository and clean isolated worktree.
- [x] GitHub CLI authenticated as `BrunerDigital` with repository and workflow access.
- [x] Vercel CLI authenticated as `brunerdigital`.
- [x] Repository contains Supabase, Prisma, Stripe, SendGrid, Twilio, web-push, Google/integration, Playwright, Capacitor, and operational readiness code.

### Must be verified before dependent work

- [ ] Vercel project/scope linkage inside the new worktree.
- [ ] Safe local environment-file availability without copying or printing secrets.
- [ ] Read-only production database connectivity and current migration state.
- [ ] Supabase dashboard/API authority needed for security, Auth, Storage, backup, and RLS evidence.
- [ ] Stripe platform and connected-account read authority; write actions remain exact-preview gated.
- [ ] SendGrid and Twilio administrative authority for authentication/webhooks/suppressions; live sends remain exact-preview gated.
- [ ] Apple Developer/App Store Connect team role if mobile distribution is approved.
- [ ] DNS/domain authority if custom domains are approved.
- [ ] Approved monitoring, backup, and secret-management accounts.
- [ ] Safe role-based production smoke accounts or authority to create isolated ones.

## Execution waves

### Wave 1: foundations and evidence

- Access inventory, staging/monitoring/backup decisions, two-school smoke-account plan, current-main full gate, and live read-only readiness audits.

### Wave 2: P0 identity, isolation, and recovery

- Account reconciliation, credentialed role tests, security/RLS/rate-limit/CSP work, monitoring, backup, and restore evidence.

### Wave 3: P0 school data and money

- Per-school ProCare/source reconciliation, current-family/tuition/balance audits, Stripe readiness, ledger/webhook/refund/payout evidence, and exact repair previews.

### Wave 4: P1 role workflows and providers

- Director, assistant, billing, teacher, parent, kiosk, regional, executive, and auditor device tests; communications and provider completion.

### Wave 5: rollout, documentation, and expansion

- Training/support, school launch rehearsals, exact module approvals, public launch polish, mobile/store work, and approved P2/P3 capabilities.

## Release evidence required for every technical wave

- Scoped branch and commit.
- Focused tests and `npm run vercel-build`.
- Green required checks and resolved review findings.
- Intended commit deployed and Vercel Ready.
- Canonical aliases and `/api/health` healthy.
- Relevant build/runtime logs clean.
- Changed flow verified with the appropriate role/device or honestly recorded as awaiting credentialed verification.
- Independent business gates unchanged unless separately and exactly approved.
- Worktree/branch closeout only after merge and production evidence.
