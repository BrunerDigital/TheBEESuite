# Role Smoke Test Checklist

Last updated: June 1, 2026

Run this after major deployments and before adding a new live school.

Automated baseline:

```bash
npm run test:smoke
```

By default, the script checks the live production app at `https://thebeesuite.io` unless `SMOKE_BASE_URL` or `NEXT_PUBLIC_APP_URL` points somewhere else. It checks the public landing page, login, onboarding, CRM, FTE, kiosk, parent portal, billing routes, hosted inquiry embed assets, public Kid City locations API, and inquiry CORS preflight.

Local smoke mode is only for developer troubleshooting and is not the operational target for Kid City USA. To force a local production-server smoke test, set `SMOKE_LOCAL=1`; the script will build if needed, start `next start`, run checks, and stop the server.

```bash
SMOKE_BASE_URL=https://thebeesuite.io npm run test:smoke
```

For credentialed dashboard coverage, also set `SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD`.

## Executive Admin

- Log in as an executive user such as `brenden@kidcityusa.com`.
- Confirm executive navigation shows multi-location CRM, FTE, reporting, admin, and settings access.
- Confirm CRM lead list can view all assigned Kid City USA centers.
- Confirm FTE reports show all submitted and missing schools.
- Confirm executive can open the embed/inquiry tools.
- Confirm executive admin tools can view/manage locations and users.

## Location Director

- Log in as a director/location user.
- Confirm the dashboard shows only that location's data.
- Confirm CRM leads show only that location's inquiries.
- Add a manual test lead and confirm it is tied to the correct location.
- Edit a lead and confirm the pipeline stage does not revert to `New Inquiry`.
- Submit a weekly FTE report and confirm it appears in executive view.
- Confirm the director can access family/student intake, classrooms, staff/teacher views, kiosk setup, and ProCare import for only their location.

## Public Inquiry

- Submit a public inquiry using a selected location ID.
- Confirm the inquiry creates a CRM lead for the selected center.
- Confirm location-specific notification routing uses the selected location.
- Confirm backup Google Sheet receives the submission.
- Confirm another location user cannot see the new lead.

## Kiosk

- Open the center-specific check-in URL.
- Search for a child/family.
- Complete a PIN-based check-in using a test family account.
- Confirm the attendance/check log appears under the correct center/classroom.
- Confirm no cross-location families or children are returned.

## Teacher

- Log in or access the teacher workflow for a test classroom.
- Confirm roster data is limited to the assigned center/classroom.
- Create a daily report item.
- Upload or review a child media placeholder if storage is configured.
- Create a test incident and confirm director review visibility.

## Parent

- Confirm parent portal routes load.
- Confirm parent data is limited to the linked family/children.
- Confirm daily reports, photos/media, incidents, contact requests, and balances only show linked records.
- Confirm parent payment actions remain disabled unless Stripe Connect and tuition checkout are approved for that center.

## Billing

- Confirm billing settings show Stripe Connect status.
- Confirm parent checkout is blocked for schools without active connected payout accounts.
- Confirm platform-only payments are disabled in production.
- Confirm Kid City USA pilot fee waiver behavior remains in place until billing is approved.
