# The BEE Suite In-School Testing Runbook

Use this before any Kid City USA location tests the app with live staff workflows.

## 1. Preflight Commands

Run these against the staging/pilot environment, not production, unless explicitly approved.

```bash
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npm run vercel-build
npm run db:migrate
npm run pilot:check
```

Only run the destructive seed on an approved empty local or staging database:

```bash
ALLOW_DESTRUCTIVE_SEED=true npm run db:seed
```

## 2. Required Environment

The pilot is blocked until these are present in the deployed environment:

- `DATABASE_URL`
- `AUTH_SECRET`
- `PIN_HASH_SECRET`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Payment testing also requires:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Stripe Connect payout account data on each pilot center

Photo upload and parent media review require:

- Supabase Storage service key
- Private child media bucket setup
- Storage upload/signing verification

## 3. First-Day Manual Test Script

For each pilot location:

1. Director logs in and confirms they only see their assigned center.
2. Director opens dashboard, family profiles, child profiles, classroom dashboard, attendance, daily reports, incidents, documents, billing, and media review.
3. Director creates or verifies classrooms, staff, one family, one guardian, one child, and one guardian kiosk PIN.
4. Teacher logs in and confirms roster is limited to assigned classroom or center.
5. Teacher submits check-in, check-out, daily report, incident, and photo upload.
6. Director reviews incident, media permission queue, and notifications.
7. Parent/guardian logs in and confirms only their family, children, invoices, reports, incidents, documents, and shared media are visible.
8. Parent sends a message and submits a contact update request.
9. Kiosk lookup and check-in/check-out are tested with valid PIN, invalid PIN, duplicate check-in, and checkout-before-checkin.
10. Billing admin creates a test invoice and, if Stripe test credentials are configured, completes a test checkout.

## 4. Stop Conditions

Stop the pilot at that location if any of these occur:

- A user can see another center's family, child, attendance, billing, message, media, or incident data.
- Parent/guardian can see another family.
- Kiosk accepts a PIN for the wrong center.
- A malformed or duplicate check-in creates bad attendance state.
- A payment marks the wrong invoice paid or can be applied twice.
- Media becomes visible to parents without permission.
- `npm run pilot:check` reports failures.

## 5. After-Test Review

Capture:

- Location name and test date
- Roles tested
- Accounts used
- Workflows completed
- Any screenshots of errors
- Any records created for cleanup
- Whether `npm run pilot:check` passed after testing
