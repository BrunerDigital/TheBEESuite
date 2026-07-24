# Production Release Checklist

Last updated: July 24, 2026

Use this before every production release that affects live schools.

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
