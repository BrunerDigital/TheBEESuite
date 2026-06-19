# Kid City USA Inquiry Intake

The public WordPress/Avada inquiry form should submit to:

```text
https://thebeesuite.io/api/inquiries
```

The preferred Avada embed block is:

```html
<div id="bee-suite-inquiry-form"></div>
<script
  src="https://thebeesuite.io/kidcity-inquiry-form.js"
  data-target="bee-suite-inquiry-form"
  data-endpoint="https://thebeesuite.io/api/inquiries"
  data-turnstile-site-key="OPTIONAL_CLOUDFLARE_TURNSTILE_SITE_KEY"
  async
></script>
```

Executive and center users can also copy live embed code from their BEE Suite dashboard:

- Kid City USA executive users receive the multi-location embed above.
- Single-school users receive a center-specific embed powered by `/bee-suite-inquiry-form.js` and their center profile ID.
- New public onboarding creates a gated trial workspace with a primary center profile and a center-linked embed code. Providers can copy that form immediately, then add more center-specific codes as additional profiles are completed.

The hosted embed currently loads 94 Kid City USA open-school options from `/api/public/kidcity-locations`. The first dropdown option is the placeholder, so a rendered form should show 95 `<option>` elements total.

## What Happens

1. The BEE Suite validates the form payload.
2. The selected `locationId` is matched to a center by CRM location ID, public location ID, or center name.
3. A CRM `Lead` is created in Supabase.
4. A follow-up `Task` is created.
5. A `Note` is attached to the lead.
6. The payload is forwarded to Google Sheets when either the direct Google Sheets API env vars or `GOOGLE_SHEETS_WEBHOOK_URL` are configured.
7. Notification emails are sent through SendGrid when email env vars are configured.
8. If the matched center has a `Center.email` value, that location email is added to the central notification recipient list.

The CRM lead is created first. Google Sheets and email failures are returned in the response but do not block lead creation.

The endpoint rejects browser requests from origins outside `INQUIRY_ALLOWED_ORIGINS` and includes hidden `company` / `website` honeypot fields in the hosted embed. Honeypot hits return a non-error response without creating a CRM lead.

The endpoint also applies a best-effort server-side burst limit per requester. It is not a replacement for a WAF or dedicated abuse service, but it reduces accidental or automated repeated submissions during live testing.

When `INQUIRY_TURNSTILE_SECRET_KEY` is configured, the endpoint also requires Cloudflare Turnstile verification. Add `data-turnstile-site-key` to the hosted embed script so the browser can render the challenge and submit `cf-turnstile-response`. If the secret is not configured, existing embeds continue to work with CORS, honeypot, and rate-limit protection only.

Hosted embeds automatically capture these URL parameters from the page where the form is installed:

```text
utm_source
utm_medium
utm_campaign
utm_term
utm_content
```

## Routing Audit

Brand, regional, and platform users can verify public-form routing without creating test leads:

```text
GET /api/inquiries/routing-audit
```

The audit compares every hosted Kid City USA dropdown location against production center records and reports missing CRM mappings or missing notification targets without exposing full email addresses.

## Required Form Fields

```text
parentName
email
phone
program
locationId
```

Recommended optional fields:

```text
centerId
publicLocationId
locationName
city
state
address
postalCode
locationPhone
pageUrl
leadSource
utmSource
utmMedium
utmCampaign
utmTerm
utmContent
brandName
company
website
turnstileToken
```

Do not remove the hidden `company` and `website` fields from the hosted embed unless another anti-spam control replaces them.

## Vercel Environment Variables

```text
DATABASE_URL
GOOGLE_SHEETS_WEBHOOK_URL
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SHEETS_SHEET_NAME
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL
INQUIRY_NOTIFICATION_EMAILS
INQUIRY_ALLOWED_ORIGINS
INQUIRY_DEFAULT_CENTER_ID
INQUIRY_TURNSTILE_SECRET_KEY
```

`INQUIRY_NOTIFICATION_EMAILS` should be a comma-separated central recipient list. The selected location email is added automatically from the matched center profile:

```text
director@example.com,marketing@example.com
```

`INQUIRY_ALLOWED_ORIGINS` should include the WordPress origins:

```text
https://kidcityusa.com,https://www.kidcityusa.com,https://thebeesuite.io
```

## Google Sheets

The app supports two Google Sheets backup paths.

### Preferred direct API path

Create a Google Cloud service account, share the target sheet with the service account email as an Editor, then set:

```text
GOOGLE_SHEETS_SPREADSHEET_ID="1nUZipSOyHGBzhMkQKc6MWaCuT450CWBjXIS01ITyh4Q"
GOOGLE_SHEETS_SHEET_NAME="Inquiries"
GOOGLE_SERVICE_ACCOUNT_EMAIL="your-service-account@project.iam.gserviceaccount.com"
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

When configured, The BEE Suite creates the `Inquiries` tab if needed, writes headers when the first row is empty, and appends each inquiry after the CRM lead is created.

### Webhook fallback

The easiest no-service-account path is a Google Apps Script Web App or Make/Zapier webhook. Set the webhook URL as `GOOGLE_SHEETS_WEBHOOK_URL`.

A ready-to-paste Apps Script is included at:

```text
docs/google-apps-script-inquiry-webhook.js
```

Suggested sheet columns:

```text
Submitted At
BEE Suite Lead ID
Parent Name
Email
Phone
Program
Location ID
Location Name
City
State
Address
Postal Code
Page URL
Lead Source
UTM Source
UTM Medium
UTM Campaign
UTM Term
UTM Content
```

## SendGrid

Set:

```text
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL
INQUIRY_NOTIFICATION_EMAILS
```

Do not put SendGrid keys in WordPress or browser JavaScript.

Location-specific forwarding uses `Center.email`. For Kid City USA, those values are backfilled from the active school user assigned to each imported CRM location ID:

```bash
npm run kidcity:backfill-center-emails
```
