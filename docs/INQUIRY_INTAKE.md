# Kid City USA Inquiry Intake

The public WordPress/Avada inquiry form should submit to:

```text
https://the-bee-suite-beta.vercel.app/api/inquiries
```

## What Happens

1. The Bee Suite validates the form payload.
2. A CRM `Lead` is created in Supabase.
3. A follow-up `Task` is created.
4. A `Note` is attached to the lead.
5. The payload is forwarded to Google Sheets when `GOOGLE_SHEETS_WEBHOOK_URL` is configured.
6. Notification emails are sent through SendGrid when email env vars are configured.

The CRM lead is created first. Google Sheets and email failures are returned in the response but do not block lead creation.

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
```

## Vercel Environment Variables

```text
DATABASE_URL
GOOGLE_SHEETS_WEBHOOK_URL
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL
INQUIRY_NOTIFICATION_EMAILS
INQUIRY_ALLOWED_ORIGINS
INQUIRY_DEFAULT_CENTER_ID
```

`INQUIRY_NOTIFICATION_EMAILS` should be a comma-separated list:

```text
director@example.com,marketing@example.com
```

`INQUIRY_ALLOWED_ORIGINS` should include the WordPress origins:

```text
https://kidcityusa.com,https://www.kidcityusa.com,https://the-bee-suite-beta.vercel.app
```

## Google Sheets

The easiest production path is a Google Apps Script Web App or Make/Zapier webhook. Set the webhook URL as `GOOGLE_SHEETS_WEBHOOK_URL`.

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
