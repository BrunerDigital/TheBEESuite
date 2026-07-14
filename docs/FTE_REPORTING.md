# Kid City USA FTE Reporting

The executive portal reads Kid City USA FTE reporting from Google Sheets and shows a snapshot on:

- `/multi-location-dashboard`
- `/analytics`

The first sheet provided is a next-month/template workbook. The app now treats it as an import source, not as the long-term operating model.
Going forward, Kid City USA should use one rolling FTE workbook instead of creating a separate workbook per month.

```text
https://docs.google.com/spreadsheets/d/1dMhtbBL2h0hYcpRy1RmlmZthVb_Ws3zxpmG4WuRoBlQ/edit?usp=sharing
```

## Recommended Source Model

Create one tab named `FTE Data` or `Current FTE` and keep appending/updating rows. Each row should identify the location and reporting period, so the app can keep the latest row per school.

Do not create a new sheet file for each month. If weekly tabs already exist, the app can auto-read the latest `week N` tab temporarily, but that is a migration bridge only.

## Runtime Configuration

Set:

```text
KIDCITY_FTE_SPREADSHEET_URL
KIDCITY_FTE_SHEET_NAME
KIDCITY_FTE_RANGE
KIDCITY_FTE_CSV_URL
```

`KIDCITY_FTE_SPREADSHEET_URL` is enough when the sheet is public-readable. The app falls back to Google's public CSV export when Google service-account credentials are not configured.

For the current Kid City USA source, production should only need:

```text
KIDCITY_FTE_SPREADSHEET_URL="https://docs.google.com/spreadsheets/d/1dMhtbBL2h0hYcpRy1RmlmZthVb_Ws3zxpmG4WuRoBlQ/edit?usp=sharing"
```

Leave `KIDCITY_FTE_SHEET_NAME` blank unless a specific tab must be forced. Blank mode prefers rolling FTE tabs such as `FTE Data`, `Current FTE`, `Rolling FTE`, or `FTE Report`; if none exist, it falls back to the highest-numbered legacy `week N` tab.

For a more durable private-sheet setup, create a Google Cloud service account, share the FTE sheet with that service account as a Viewer, then set:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
KIDCITY_FTE_SPREADSHEET_URL
KIDCITY_FTE_RANGE
```

## Expected Columns

The parser looks for headers similar to:

```text
School
Location
CRM Location ID
Location ID
FTE Current Week
Current Week FTE
FTE
Date
Week
Report Date
Period Start
Period End
Month
```

It keeps the latest row per school/location and totals the FTE column for the executive snapshot.

## Legacy Weekly Report Coverage

The Bee Suite FTE submission flow also covers the columns from the pre-Bee Suite weekly PDF report:

```text
School Name
Location Data
Accounts Receivable
Amount of Self-Payer Bill
Amount of Subsidy Bill
Total Amount Billed
Total FTE's (FTE)
Total currently enrolled
License Capacity
Occupancy Percent
Payroll Amount
Payroll Percentage
# New Starts
# Withdrawn
# Children preregistered
```

Directors can enter these values in the weekly FTE form. Executive users can import them from CSV, correct them in the historical FTE explorer, print them, and export them through `/api/fte-reports?format=csv`. Total billed, occupancy percent, and payroll percent can be entered directly or calculated from self-payer/subsidy billing, enrollment/capacity, and payroll amount when the derived field is left blank.

## Notes

- This is reporting only. The sheet remains the backup/source-of-truth until Kid City confirms the final internal FTE workflow.
- Keep one rolling source workbook. Monthly/weekly tabs are accepted only as compatibility input.
- If the tab name must be forced, set `KIDCITY_FTE_SHEET_NAME`.
- If the report uses a nonstandard tab/range, set `KIDCITY_FTE_RANGE`.
