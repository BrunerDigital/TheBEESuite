# Kid City USA CRM Cutover

This is the live-test cutover path for moving Kid City USA from the old CRM export into The Bee Suite enrollment CRM.

## What Is Ready

- Kid City USA tenant, brand, organization, center/location profiles, users, and historical leads can be imported from the old CRM export.
- Supabase Auth login is wired into The Bee Suite. Kid City school users can sign in with their school email and the approved temporary password.
- CRM pages and lead APIs are protected by signed HttpOnly app sessions.
- School users only see and update leads for their assigned center. Brand, regional, and platform roles can see broader views.
- The public inquiry endpoint creates leads in The Bee Suite and routes them by `crm_location_id`, `Location ID`, or center name.
- The endpoint can also forward every inquiry to a Google Sheet through the direct Sheets API or a webhook fallback, and send notification emails with SendGrid.
- Inquiry notifications are sent to the central recipient list plus the selected center's `Center.email` when one exists.
- The WordPress/Avada embed block lives at `wordpress-avada/kidcity-inquiry-form-embed.html`.
- Mr. Bee is available as a CRM communication-assistant asset at `/mr-bee.png`.

## Import Commands

Run these from the project root after setting `DATABASE_URL`.

```bash
npm run kidcity:prepare-crm
npx prisma db execute --file prisma/migrations/202605131600_kidcity_crm_import/migration.sql --schema prisma/schema.prisma
npm run kidcity:import-crm
npm run kidcity:sync-open-schools
```

The import is idempotent for centers, users, and legacy leads with the same center/external ID.
The open-schools sync is also idempotent and ensures the website dropdown's 94 open Kid City USA schools have matching center profiles, even when a location was missing from the legacy CRM export.

## Supabase Auth Users

The app database stores user profiles, not plaintext passwords. To create Supabase Auth users with the approved temporary password, set these at runtime and run:

```bash
SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
KIDCITY_DEFAULT_PASSWORD="YOUR_APPROVED_TEMP_PASSWORD" \
npm run kidcity:create-auth-users
```

The Kid City cutover scripts also load `.env.local` / `.env` automatically when those files are present, so local one-off imports can use the same environment file as the app without committing credentials.

Require password reset after live testing begins if this becomes production access. The Bee Suite now has a Supabase-backed reset flow at `/forgot-password` and `/reset-password`; make sure the Supabase Auth redirect allow-list includes `https://the-bee-suite-beta.vercel.app/reset-password` before inviting school users.

## CRM Access Rules

- `/login` is public.
- `/api/inquiries` and `/api/public/kidcity-locations` are public for website intake.
- `/`, `/crm-leads`, module pages, `/api/leads`, and `/api/leads/[id]` require login.
- Center-scoped users are restricted to their assigned `StaffProfile.centerId`.
- Lead creation and stage movement are allowed for platform, brand, regional, center director, assistant director, and billing/admin roles.
- Read-only auditor can view broad CRM data but cannot create or move leads.

## Inquiry Form Embed

Paste this into an Avada Code Block or the old form replacement area:

```html
<div id="bee-suite-inquiry-form"></div>
<script
  src="https://the-bee-suite-beta.vercel.app/kidcity-inquiry-form.js"
  data-target="bee-suite-inquiry-form"
  data-endpoint="https://the-bee-suite-beta.vercel.app/api/inquiries"
  async
></script>
```

The embed loads school options from `/kidcity-locations.json` and posts inquiries to `/api/inquiries`.

## Google Sheet Backup

The direct Google Sheets API path is preferred for the live pilot. Share the backup spreadsheet with a Google Cloud service account as an Editor, then set:

```bash
GOOGLE_SHEETS_SPREADSHEET_ID="1nUZipSOyHGBzhMkQKc6MWaCuT450CWBjXIS01ITyh4Q"
GOOGLE_SHEETS_SHEET_NAME="Inquiries"
GOOGLE_SERVICE_ACCOUNT_EMAIL="your-service-account@project.iam.gserviceaccount.com"
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

The app will create the `Inquiries` tab if needed, write headers when the first row is empty, and append every successful CRM inquiry.

As a fallback, create a Google Apps Script web app using `docs/google-apps-script-inquiry-webhook.js`, deploy it as a web app, then set:

```bash
GOOGLE_SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
```

Recommended sheet columns:

- Submitted At
- Parent Name
- Email
- Phone
- Program
- Location ID
- Location Name
- City
- State
- Page URL
- Lead Source
- Bee Suite Lead ID

## Notification Emails

Set:

```bash
SENDGRID_API_KEY="..."
SENDGRID_FROM_EMAIL="noreply@your-domain.com"
INQUIRY_NOTIFICATION_EMAILS="director@example.com,admin@example.com"
```

Notification routing is location-specific now. A future settings UI can let admins edit each center's recipient list directly.

Current Kid City location-specific routing uses `Center.email`, backfilled from the active school user assigned to each imported CRM location ID:

```bash
npm run kidcity:backfill-center-emails
```

## Production Notes

- Use the Supabase pooler connection string on Vercel. Direct `db.*:5432` connections can fail from Vercel when the host resolves IPv6-only.
- Do not expose service-role keys or email provider API keys in WordPress.
- Mr. Bee drafts are suggestions only and should require human review before sending to parents.
- Parent payment modules now include Stripe Connect payout setup, but live payments should stay gated until each Kid City USA school has completed payout onboarding and test payments have been reconciled.
