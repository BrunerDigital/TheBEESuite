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

## Supabase Storage for Child Media

Child photos now use a private Supabase Storage bucket instead of inline database blobs.

Expected bucket:

```text
child-media
```

Required environment variables:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_CHILD_MEDIA_BUCKET=child-media
SUPABASE_CHILD_MEDIA_SIGNED_URL_SECONDS=7200
```

Run this when setting up a new Supabase project or refreshing bucket policy:

```bash
npm run supabase:setup-storage
```

The bucket is private, limited to image uploads, and capped at 8 MB per object. Uploads happen from server route handlers using the server-side key. Parent portal media is shown with short-lived signed URLs.

To migrate old inline demo uploads into Storage:

```bash
npm run supabase:migrate-child-media
```

Supabase Storage docs used for this setup:

- Private buckets and signed URLs: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Bucket upload restrictions: https://supabase.com/docs/guides/storage/buckets/creating-buckets/

## Teacher Parent Engagement

The teacher mobile workspace now supports shared child photos. Teachers can upload an image, select a child, add a caption, and publish it for parent visibility.

Current v1 behavior:

- Supports image files up to 8 MB.
- Stores photos in private Supabase Storage.
- Stores Storage object keys in `ChildMedia`.
- Shows shared media in the parent portal through signed URLs.
- Writes an audit log for each shared photo.
- If photo/video permission is not enabled for a child, the upload is saved for review but is not shared with parents.

Production hardening to do before heavy media use:

- Add moderation/review status for sensitive content.
- Add optional image optimization/transforms if the Supabase plan supports it.
- Add automatic media retention policies by tenant or center.

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
