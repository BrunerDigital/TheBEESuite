/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Google Apps Script webhook for Kid City USA inquiries.
 *
 * Setup:
 * 1. Open the target Google Sheet.
 * 2. Extensions > Apps Script.
 * 3. Paste this file.
 * 4. Deploy > New deployment > Web app.
 * 5. Execute as: Me.
 * 6. Who has access: Anyone.
 * 7. Copy the Web App URL into Vercel as GOOGLE_SHEETS_WEBHOOK_URL.
 */

const SHEET_NAME = "Inquiries";

function doPost(event) {
  const payload = JSON.parse(event.postData.contents || "{}");
  const sheet = getSheet_();

  ensureHeader_(sheet);

  sheet.appendRow([
    payload.submittedAt || new Date().toISOString(),
    payload.leadId || "",
    payload.parentName || "",
    payload.email || "",
    payload.phone || "",
    payload.program || "",
    payload.locationId || "",
    payload.locationName || "",
    payload.city || "",
    payload.state || "",
    payload.address || "",
    payload.postalCode || "",
    payload.locationPhone || "",
    payload.pageUrl || "",
    payload.leadSource || "",
    payload.utmSource || "",
    payload.utmMedium || "",
    payload.utmCampaign || "",
    payload.leadScore || "",
    payload.stage || "",
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeader_(sheet) {
  if (sheet.getLastRow() > 0) return;

  sheet.appendRow([
    "Submitted At",
    "Bee Suite Lead ID",
    "Parent Name",
    "Email",
    "Phone",
    "Program",
    "Location ID",
    "Location Name",
    "City",
    "State",
    "Address",
    "Postal Code",
    "Location Phone",
    "Page URL",
    "Lead Source",
    "UTM Source",
    "UTM Medium",
    "UTM Campaign",
    "Lead Score",
    "Stage",
  ]);
}
