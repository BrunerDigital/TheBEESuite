# Post-Release Smoke Checklist

Last updated: July 24, 2026

Run only after a separately authorized release. Use approved test tenants/accounts and non-destructive fixtures; never use Kokomo for destructive testing.

## Deployment identity

- Commit: __________  Deployment ID/URL: __________  Release owner: __________
- Vercel state `READY`: [ ]  Production aliases correct: [ ]  Build/migration evidence linked: __________

## First 15 minutes

- [ ] `GET https://thebeesuite.io/api/health` is 200 with database connected.
- [ ] Authorized operator confirms `/api/system/readiness`: zero blocked checks; warnings reviewed and accepted.
- [ ] Homepage and `/parents`, `/teachers`, `/directors`, `/executives` render expected login/entry states.
- [ ] `npm run test:smoke` passes against the production URL.
- [ ] If inquiry origins changed, approved `OPTIONS /api/inquiries` preflights return 204 and echo the exact allowed origin; no lead is created.
- [ ] Vercel runtime/build logs show no new unexplained errors; request/deployment IDs retained.
- [ ] Uptime/error monitoring sees the release and alerts remain armed.

## Role and changed-flow smoke

- [ ] Corporate: correct school scope and readiness visibility.
- [ ] Director/billing: correct school data; approved read-only/fixture workflow passes.
- [ ] Teacher: correct classroom/roster scope and approved fixture workflow passes.
- [ ] Parent: linked test family sees only its children; approved setup/read workflow passes.
- [ ] Public/CRM and kiosk: only if changed and with approved non-live fixtures.
- [ ] Public survey: focused tests pass; use an approved synthetic active survey only if mutation evidence is required. Never submit feedback to a real family survey for smoke testing.
- [ ] Every changed route/workflow has an explicit expected result and evidence link.
- [ ] No cross-school exposure, unexpected email/SMS, live charge, payout, invitation, or destructive write occurred.
- [ ] No ProCare preview/import, billing/payment activation, invitation, communication, kiosk activation, or school rollout gate changed merely because the deployment passed.

## Operations observation

- [ ] Relevant cron/webhook/integration shows expected success or is scheduled for an observed window.
- [ ] Error rate, latency, database connectivity, and vendor status remain normal for ______ minutes.
- [ ] Incident commander and after-hours contacts confirm coverage.
- [ ] Stop conditions were not triggered; otherwise complete `RELEASE_STOP_CONDITIONS_AND_ROLLBACK_DECISION.md`.

Final result: PASS / FAIL  Release owner/date: ____________________  Exceptions/owner/retest: ____________________
