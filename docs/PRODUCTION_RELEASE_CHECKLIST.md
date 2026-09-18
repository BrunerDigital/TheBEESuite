# Production Release Checklist

Last updated: September 18, 2026

Use this before every production release that affects live schools.

## 0. Release-Readiness Audit Prompt

Use this prompt when you need one consolidated release-readiness audit focused on blockers, paid-plan gaps, and the exact next actions:

```text
Act as a release-readiness auditor for /home/runner/work/TheBEESuite/TheBEESuite.

First read:
- /home/runner/work/TheBEESuite/TheBEESuite/.env.example
- /home/runner/work/TheBEESuite/TheBEESuite/package.json
- /home/runner/work/TheBEESuite/TheBEESuite/vercel.json
- /home/runner/work/TheBEESuite/TheBEESuite/README.md
- /home/runner/work/TheBEESuite/TheBEESuite/docs/LOCAL_CLOUD_SETUP.md
- /home/runner/work/TheBEESuite/TheBEESuite/docs/DEPLOYMENT.md
- /home/runner/work/TheBEESuite/TheBEESuite/docs/GO_LIVE.md
- /home/runner/work/TheBEESuite/TheBEESuite/docs/STRIPE_CONNECT_SETUP.md
- /home/runner/work/TheBEESuite/TheBEESuite/docs/KIDCITY_CRM_CUTOVER.md
- /home/runner/work/TheBEESuite/TheBEESuite/docs/CONFIGURATION_REMEDIATION_2026-09-17.md
- /home/runner/work/TheBEESuite/TheBEESuite/scripts/check-local-cloud-setup.mjs
- /home/runner/work/TheBEESuite/TheBEESuite/scripts/deployment-ops-check.mjs
- /home/runner/work/TheBEESuite/TheBEESuite/src/lib/readiness-guardrails.ts
- /home/runner/work/TheBEESuite/TheBEESuite/src/app/api/system/readiness/route.ts

Objective:
Find everything that must be done so the app is truly good to go as fast as possible, without missing hidden blockers.

Audit all of these:
1. GitHub branch protection, CI, alerts, required checks
2. Vercel project config, envs, deploy behavior, domains, cron jobs
3. Supabase project setup, auth, storage, database, backup, PITR, staging isolation
4. Prisma and migration safety
5. Stripe, Stripe Connect, webhook destinations, payment method configs, payout onboarding
6. SendGrid domain auth, sender config, signed event webhook
7. Twilio sender, messaging service, status/inbound callbacks, account restrictions
8. Web Push VAPID setup
9. Google Sheets / Calendar
10. Turnstile
11. OpenAI
12. Meta / Google Ads / TikTok / LinkedIn / Microsoft Ads / Pinterest / X / Zapier / DocuSign / signature provider
13. Monitoring, health checks, release verification, rollback readiness
14. Paid account, quota, or upgrade dependencies
15. Anything that can cause runtime failure, auth failure, webhook failure, or serverless/database exhaustion

Critical requirements:
- Explicitly verify whether pooled database URLs are required and explain why direct db host connections are risky.
- Flag every place preview/development still touches production services.
- Separate findings into:
  - must fix before go-live
  - should fix immediately after
  - feature-specific only
- Do not print secrets.
- Prefer exact env var names, exact script names, and exact file references.
- Call out anything requiring paid plans, verified senders/domains, provider admin access, or account-owner action.

Return only:
A. Top 10 blockers in priority order
B. Fastest path to green
C. Required env vars by platform
D. Paid-plan / quota / external-account dependencies
E. Production isolation risks
F. Concrete verification commands to run now
G. Final launch checklist with owners/dependencies
```

Fastest path to green after the audit:

1. Confirm Vercel project, env, cron, and build behavior.
2. Confirm Supabase pooled database URL, auth, storage, and backup/recovery coverage.
3. Confirm Stripe webhook secrets, payment method configuration IDs, and Connect payout readiness.
4. Confirm SendGrid signed webhook and sender-domain authentication.
5. Confirm Twilio production sender and resolve account restrictions.
6. Run `npm run cloud:status`, `npm run ops:check`, `npm run pilot:check`, and `npm run cloud:validate`.
7. Verify `/api/health` and authenticated `/api/system/readiness`.

## 1. Scope

- Confirm the release branch and commit range.
- Record the current production deployment ID and aliases before deployment.
- Identify affected roles: executive admin, director/location user, teacher, parent, public visitor, kiosk.
- Identify affected modules: CRM, inquiry intake, FTE, ProCare import, kiosk, parent portal, billing, reporting, admin.
- Confirm whether database migrations are included.
- Confirm whether environment variables, third-party webhooks, or DNS changes are included.

## 2. Pre-Deploy Checks

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm audit --omit=dev`.
- Run `npm run test:smoke` against `https://thebeesuite.io` after the deployment is live.
- Run `npm run build` or `npm run vercel-build`.
- Run `npm run ops:check` when cron, migration inventory, or deployment behavior is in scope.
- Review Prisma migrations for tenant/location scoping and destructive operations.
- Confirm public mutation routes have validation, scope checks, and rate-limit strategy.
- Confirm no secrets or live keys are committed.
- Confirm any new user-facing text avoids legal/compliance guarantees.
- Confirm security headers are present after deployment.

## 3. Data Safety

- Confirm production database backups are current.
- For imports or bulk updates, run dry-run mode first.
- Export affected records before destructive or corrective data work.
- Confirm rollback steps for schema, config, and deployment.
- Confirm audit logging exists for sensitive admin changes.

## 4. Deploy

- Deploy through the separately authorized GitHub/Vercel production flow.
- Watch Vercel build logs until completion.
- If both Git integration and an authorized CLI deployment run, identify both builds and verify which final `READY` deployment owns the production aliases.
- Confirm `/api/health` returns healthy.
- Confirm `/api/system/readiness` for an executive user.
- Check Vercel function logs for errors during first production requests.

## 5. Post-Deploy Smoke Test

- Run `docs/ROLE_SMOKE_TEST_CHECKLIST.md`.
- By default, verify inquiry embeds, routing audit, public locations, and trusted-origin `OPTIONS` preflights without submitting a lead.
- Submit a synthetic inquiry only when the named test location, data fixture, and email/Google Sheet side effects are separately approved.
- If a synthetic inquiry is authorized, confirm the lead appears only for that location and authorized executive users.
- Confirm notification email and Google Sheet backup behavior only inside an approved provider test; a queued provider response is not delivery evidence.
- Do not post a response to a real public survey. Use focused security tests or an approved synthetic active survey.
- Confirm no location user can see another location's leads, families, FTE reports, or operational data.

## 6. Communication

- Tell Kid City USA stakeholders what changed.
- List any new workflows school directors should use.
- List known limitations that remain intentionally next-phase.
- Record any issues in the release notes or support log.
