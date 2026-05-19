# Kid City USA FTE Reporting

The executive portal reads the Kid City USA FTE report from Google Sheets and shows a snapshot on:

- `/multi-location-dashboard`
- `/analytics`

Configured sheet:

```text
https://docs.google.com/spreadsheets/d/1dMhtbBL2h0hYcpRy1RmlmZthVb_Ws3zxpmG4WuRoBlQ/edit?usp=sharing
```

## Runtime Configuration

Set:

```text
KIDCITY_FTE_SPREADSHEET_URL
KIDCITY_FTE_SHEET_NAME
KIDCITY_FTE_RANGE
KIDCITY_FTE_CSV_URL
```

`KIDCITY_FTE_SPREADSHEET_URL` is enough when the sheet is public-readable. The app falls back to Google's public CSV export when Google service-account credentials are not configured.

For the current Kid City USA sheet, production is configured with:

```text
KIDCITY_FTE_SPREADSHEET_URL="https://docs.google.com/spreadsheets/d/1dMhtbBL2h0hYcpRy1RmlmZthVb_Ws3zxpmG4WuRoBlQ/edit?usp=sharing"
KIDCITY_FTE_SHEET_NAME="week 4"
```

For a more durable private-sheet setup, create a Google Cloud service account, share the FTE sheet with that service account as a Viewer, then set:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
KIDCITY_FTE_SPREADSHEET_URL
KIDCITY_FTE_SHEET_NAME
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
```

It keeps the latest row per school/location and totals the FTE column for the executive snapshot.

## Notes

- This is reporting only. The sheet remains the backup/source-of-truth until Kid City confirms the final internal FTE workflow.
- If the tab name changes, set `KIDCITY_FTE_SHEET_NAME`.
- If the report uses a nonstandard tab/range, set `KIDCITY_FTE_RANGE`.
