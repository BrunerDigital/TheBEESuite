# Kid City USA Inquiry Intake

The public WordPress/Avada inquiry form should submit to:

```text
https://the-bee-suite-beta.vercel.app/api/inquiries
```

The preferred Avada embed block is:

```html
<div id="bee-suite-inquiry-form"></div>
<script
  src="https://the-bee-suite-beta.vercel.app/kidcity-inquiry-form.js"
  data-target="bee-suite-inquiry-form"
  data-endpoint="https://the-bee-suite-beta.vercel.app/api/inquiries"
  async
></script>
```

The hosted embed currently loads 96 Kid City USA open-school options from `/api/public/kidcity-locations`. The first dropdown option is the placeholder, so a rendered form should show 97 `<option>` elements total.

## What Happens

1. The Bee Suite validates the form payload.
2. The selected `locationId` is matched to a center by CRM location ID, public location ID, or center name.
3. A CRM `Lead` is created in Supabase.
4. A follow-up `Task` is created.
5. A `Note` is attached to the lead.
6. The payload is forwarded to Google Sheets when either the direct Google Sheets API env vars or `GOOGLE_SHEETS_WEBHOOK_URL` are configured.
7. Notification emails are sent through SendGrid when email env vars are configured.
8. If the matched center has a `Center.email` value, that location email is added to the central notification recipient list.

The CRM lead is created first. Google Sheets and email failures are returned in the response but do not block lead creation.

The endpoint rejects browser requests from origins outside `INQUIRY_ALLOWED_ORIGINS` and includes hidden `company` / `website` honeypot fields in the hosted embed. Honeypot hits return a non-error response without creating a CRM lead.

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
company
website
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
```

`INQUIRY_NOTIFICATION_EMAILS` should be a comma-separated central recipient list. The selected location email is added automatically from the matched center profile:

```text
director@example.com,marketing@example.com
```

`INQUIRY_ALLOWED_ORIGINS` should include the WordPress origins:

```text
https://kidcityusa.com,https://www.kidcityusa.com,https://the-bee-suite-beta.vercel.app
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

When configured, The Bee Suite creates the `Inquiries` tab if needed, writes headers when the first row is empty, and appends each inquiry after the CRM lead is created.

### Webhook fallback

The easiest no-service-account path is a Google Apps Script Web App or Make/Zapier webhook. Set the webhook URL as `GOOGLE_SHEETS_WEBHOOK_URL`.

A ready-to-paste Apps Script is included at:

```text
docs/google-apps-script-inquiry-webhook.js
```

Suggested sheet columns:

```text
Submitted At
Bee Suite Lead ID
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
