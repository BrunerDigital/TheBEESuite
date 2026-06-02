import {
  appendRowToGoogleSheet,
  hasGoogleSheetsApiConfig,
  type GoogleSheetValue,
} from "@/lib/google-sheets";

export type InquiryIntegrationResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  mode?: "google_sheets_api" | "webhook";
  spreadsheetId?: string;
  sheetName?: string;
  updatedRange?: string;
  recipients?: number;
  locationRecipients?: number;
};

const GOOGLE_SHEET_COLUMNS = [
  { header: "Submitted At", field: "submittedAt" },
  { header: "Bee Suite Lead ID", field: "leadId" },
  { header: "Parent Name", field: "parentName" },
  { header: "Email", field: "email" },
  { header: "Phone", field: "phone" },
  { header: "Program", field: "program" },
  { header: "Center ID", field: "centerId" },
  { header: "Location ID", field: "locationId" },
  { header: "Public Location ID", field: "publicLocationId" },
  { header: "Location Name", field: "locationName" },
  { header: "City", field: "city" },
  { header: "State", field: "state" },
  { header: "Address", field: "address" },
  { header: "Postal Code", field: "postalCode" },
  { header: "Location Phone", field: "locationPhone" },
  { header: "Page URL", field: "pageUrl" },
  { header: "Lead Source", field: "leadSource" },
  { header: "Brand Name", field: "brandName" },
  { header: "UTM Source", field: "utmSource" },
  { header: "UTM Medium", field: "utmMedium" },
  { header: "UTM Campaign", field: "utmCampaign" },
  { header: "UTM Term", field: "utmTerm" },
  { header: "UTM Content", field: "utmContent" },
  { header: "Lead Score", field: "leadScore" },
  { header: "Stage", field: "stage" },
] as const;

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function uniqueInquiryEmails(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => isEmail(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sheetValue(value: unknown): GoogleSheetValue {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  return "";
}

export async function forwardInquiryToGoogleSheets(
  payload: Record<string, unknown>,
): Promise<InquiryIntegrationResult> {
  if (hasGoogleSheetsApiConfig()) {
    return appendRowToGoogleSheet({
      headers: GOOGLE_SHEET_COLUMNS.map((column) => column.header),
      row: GOOGLE_SHEET_COLUMNS.map((column) =>
        sheetValue(payload[column.field]),
      ),
    });
  }

  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) return { ok: true, skipped: true };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { ok: false, error: `Google Sheets webhook returned ${response.status}.` };
    }

    return { ok: true, mode: "webhook" };
  } catch (error) {
    return {
      ok: false,
      mode: "webhook",
      error: error instanceof Error ? error.message : "Google Sheets webhook failed.",
    };
  }
}

export async function sendInquiryNotificationEmail(
  payload: Record<string, unknown>,
  locationRecipients: string[] = [],
): Promise<InquiryIntegrationResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const recipients = uniqueInquiryEmails([
    ...(process.env.INQUIRY_NOTIFICATION_EMAILS?.split(",") ?? []),
    ...locationRecipients,
  ]);
  const from = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !recipients.length || !from) {
    return { ok: true, skipped: true };
  }

  const brand = String(payload.brandName || "Kid City USA");
  const subject = `New ${brand} Inquiry - ${payload.program} - ${payload.locationId || payload.locationName || payload.centerId}`;
  const lines = [
    `Parent: ${payload.parentName}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phone}`,
    `Program: ${payload.program}`,
    `Location ID: ${payload.locationId}`,
    `Public Location ID: ${payload.publicLocationId || ""}`,
    `Location: ${payload.locationName || ""}`,
    `City/State: ${payload.city || ""}, ${payload.state || ""}`,
    `Page: ${payload.pageUrl || ""}`,
    `Bee Suite Lead ID: ${payload.leadId}`,
  ];

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: recipients.map((email) => ({ email })) }],
        from: { email: from, name: "The Bee Suite" },
        subject,
        content: [
          {
            type: "text/plain",
            value: lines.join("\n"),
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { ok: false, error: `SendGrid returned ${response.status}.` };
    }

    return {
      ok: true,
      recipients: recipients.length,
      locationRecipients: uniqueInquiryEmails(locationRecipients).length,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Notification email failed.",
    };
  }
}
