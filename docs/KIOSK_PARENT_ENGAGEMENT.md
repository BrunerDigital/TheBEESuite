# Lobby Kiosk, Parent Engagement, ProCare Import, and Ledger Setup

This document covers the v1 workflows added for school directors, teachers, guardians, and billing staff.

## Lobby Check-In Kiosk

Each center has a public kiosk route:

```text
/check-in/[centerId]
```

Directors can open this on a lobby tablet or front-desk computer. Guardians enter the 4 digit PIN that a director sets from the family profile. The kiosk never exposes the stored PIN. It sends the entered PIN to the server, where it is normalized and compared against the HMAC hash stored on the guardian record.

Kiosk submissions create:

- `AttendanceRecord`
- `CheckInOutLog`
- `AuditLog`

The kiosk supports multiple child selection for families with siblings. It also shows whether each child is currently ready for check-in or check-out based on the latest same-day log.

## Director PIN Setup

Directors and operations users can set or reset guardian PINs from the family profile page. PINs must be exactly 4 digits.

Required environment variable:

```text
PIN_HASH_SECRET=
```

Set this in Vercel before schools use the kiosk. If it is missing, the app falls back to `AUTH_SECRET`, then to a development-only fallback.

## Teacher Parent Engagement

The teacher mobile workspace now supports shared child photos. Teachers can upload an image, select a child, add a caption, and publish it for parent visibility.

Current v1 behavior:

- Supports image files up to 3 MB.
- Stores photos as data URLs in `ChildMedia` as a bridge implementation.
- Shows shared media in the parent portal.
- Writes an audit log for each shared photo.

Production hardening to do before heavy media use:

- Move photo storage to Supabase Storage, S3, or another private object store.
- Generate signed URLs for parent access.
- Add photo/video permission enforcement before sharing.
- Add moderation/review status for sensitive content.

## ProCare Family Import

Directors and operations users can import family account data from ProCare CSV exports from the family profile page.

Supported matching fields include common aliases for:

- Family/account name
- Child/student name
- Guardian/parent name
- Email
- Phone
- Address
- DOB
- Enrollment/start date
- Account balance

The import creates or updates:

- `Family`
- `Guardian`
- `Child`
- `BillingAccount`
- `LedgerEntry`
- `ProcareImportBatch`
- `ProcareImportRow`

Every import row is recorded so directors can review which rows imported and which rows errored.

## Billing and Ledger Foundation

Billing is still merchant-placeholder mode, but directors can now record tuition charges and ledger adjustments.

Supported v1 records:

- Manual invoices
- Invoice ledger entries
- Manual ledger adjustments
- Imported ProCare balances
- Stripe webhook payment ledger entries when Stripe is configured

Real parent payment processing still requires live Stripe Connect onboarding, merchant configuration, and school payout setup.

## Database Migration

The schema changes are in:

```text
prisma/migrations/202605200900_parent_engagement_kiosk/migration.sql
supabase/migrations/202605200900_parent_engagement_kiosk.sql
```

Apply the migration to Supabase before enabling the kiosk, photo uploads, ProCare import, or ledger screens in production.

