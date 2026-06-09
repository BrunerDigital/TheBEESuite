# Production Release Checklist

Last updated: June 9, 2026

Use this before every production release that affects live schools.

## 1. Scope

- Confirm the release branch and commit range.
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

- Deploy through GitHub/Vercel main branch flow.
- Watch Vercel build logs until completion.
- Confirm `/api/health` returns healthy.
- Confirm `/api/system/readiness` for an executive user.
- Check Vercel function logs for errors during first production requests.

## 5. Post-Deploy Smoke Test

- Run `docs/ROLE_SMOKE_TEST_CHECKLIST.md`.
- Submit one test inquiry to a known test location only.
- Confirm the lead appears only for that location and for executive users.
- Confirm notification email and Google Sheet backup behavior if the release touched inquiry intake.
- Confirm no location user can see another location's leads, families, FTE reports, or operational data.

## 6. Communication

- Tell Kid City USA stakeholders what changed.
- List any new workflows school directors should use.
- List known limitations that remain intentionally next-phase.
- Record any issues in the release notes or support log.
