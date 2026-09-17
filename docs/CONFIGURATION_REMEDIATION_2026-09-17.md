# Configuration remediation — September 17, 2026

## Applied account settings

- GitHub vulnerability alerts and Dependabot security updates enabled and read back successfully. No open dependency alerts at verification.
- Main requires both Vercel (app 8329) and validate (GitHub Actions, app 15368), with strict status checks. Existing administrator enforcement and force-push protection retained.
- Vercel `SUPABASE_SECRET_KEY` and `SUPABASE_JWT_SECRET` shared production/preview entries changed to production-only. No secret values were replaced. Future preview deployments no longer receive these privileged production credentials. Existing deployments retain their captured environment; this change alone is not complete isolation.

## Release changes

- Reconcile the existing billing UI/readiness changes onto current main, which includes the direct-database connection-limit fix. Original working checkouts remain untouched.
- Add `cloud:release:check` and `cloud:release`. The manual release wrapper verifies a clean checkout, expected repository and Vercel project/owner, and equality with freshly queried remote main. It cannot prevent somebody bypassing the wrapper with a direct CLI command.
- Stop environment sync before any local write when a redacted credential has no usable local replacement; preserve usable local credentials when the export is blank/redacted. Write environment files and backups with mode 0600.
- Add regression coverage for rejected releases, redacted exports, credential rotation, and school payment readiness.

## Remaining external setup

- A separate Supabase staging target has not been provisioned. Preview still lacks database configuration and currently references the production public auth endpoint. Development still has production-backed credentials. Select an existing isolated project or confirm the cost of a new branch before completing environment migration.
- Twilio records identify a trial-account restriction on a pending SMS. Account upgrade/destination verification requires account-owner action; no message was sent or retried.
- Current production database retention/PITR and an operating off-platform storage backup destination still need verification and owner/destination selection. The earlier synthetic restore drill is not a current full-production recovery certificate.
- Email suppression/bounce records and invalid push subscriptions were not bypassed. Their presence does not establish that the platform's provider keys are invalid.

Vercel environment changes affect new deployments; see [Vercel environment-variable management](https://vercel.com/docs/environment-variables/managing-environment-variables). No production migrations, financial transactions, user access changes, or live test messages are part of this remediation.
