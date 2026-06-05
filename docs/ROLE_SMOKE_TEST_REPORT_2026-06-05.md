# Role Smoke Test Report

Date: June 5, 2026

Target: `https://thebeesuite.io`

## Automated Production Smoke

Command:

```bash
npm run test:smoke
```

Result: Passed.

Coverage:

- Public landing page.
- Login page.
- Onboarding page.
- Protected CRM, FTE, kiosk, parent portal, and billing route loading/redirect behavior.
- Hosted Kid City inquiry embed asset.
- Hosted generic inquiry embed asset.
- Public Kid City locations API.
- Inquiry CORS preflight from `https://kidcityusa.com`.

## Live Health

Endpoint:

```bash
https://thebeesuite.io/api/health
```

Result: Passed.

Observed response:

```json
{
  "ok": true,
  "service": "the-bee-suite",
  "database": "connected"
}
```

## Read-Only Production Data Check

Supabase linked database query was read-only.

Key observations:

- Active centers: `101`.
- Active centers without classrooms: `95`.
- Active users by role:
  - `PLATFORM_OWNER`: `2`
  - `BRAND_ADMIN`: `7`
  - `REGIONAL_MANAGER`: `2`
  - `CENTER_DIRECTOR`: `112`
  - `BILLING_ADMIN`: `2`
  - `TEACHER`: `19`
- Teacher users with staff profiles: `19`.
- Families: `58`.
- Children: `83`.
- Guardians: `116`.
- Guardians with kiosk PINs: `16`.
- Guardians linked to user login accounts: `0`.
- Active parent/guardian users: `0`.
- Open invoices: `11`.
- Pending incident admin reviews: `4`.
- Pending media reviews: `0`.

## Role-by-Role Status

- Executive: Blocked for credentialed browser smoke because no dedicated smoke credential is configured in the local environment.
- Director: Blocked for credentialed browser smoke because no dedicated smoke credential is configured in the local environment.
- Teacher: Data exists for teacher-account smoke coverage, but browser login is blocked until a dedicated smoke credential is configured.
- Parent: Blocked by production data. There are currently `0` active `PARENT_GUARDIAN` users and `0` guardians linked to user login accounts.
- Public inquiry: Automated production smoke passed for public assets, public location API, and inquiry CORS preflight.
- Kiosk: Automated protected route smoke passed; full PIN-based kiosk transaction requires designated test family/PIN.
- Billing: Automated protected route smoke passed; full parent checkout role smoke remains blocked until parent login users and Stripe-connected test school/payment policy are ready.

## Conclusion

The production baseline smoke passed, but the full role-by-role production smoke test is not complete yet. The next account/data setup pass must create or identify dedicated smoke credentials for executive, director, teacher, and parent roles, and parent/guardian login users must exist before this checklist item can be closed.

