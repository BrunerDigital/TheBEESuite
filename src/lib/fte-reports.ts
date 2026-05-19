import { readGoogleSheetValues, spreadsheetIdFromUrl } from "@/lib/google-sheets";

type VisibleCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  city: string | null;
  state: string | null;
};

export type FteSnapshot = {
  configured: boolean;
  status: "ready" | "needs_sheet_url" | "needs_google_credentials" | "error";
  sheetName: string;
  spreadsheetId?: string;
  totalFte: number;
  locationCount: number;
  updatedAt?: string;
  rows: Array<{
    key: string;
    centerName: string;
    crmLocationId?: string;
    fte: number;
    reportDate?: string;
  }>;
  error?: string;
};

const DEFAULT_SHEET_NAME = "FTE";

function quoteRangeSheetName(sheetName: string) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function headerIndex(headers: string[], aliases: string[]) {
  const normalized = headers.map(normalizeHeader);
  return aliases
    .map(normalizeHeader)
    .map((alias) => normalized.findIndex((header) => header === alias || header.includes(alias)))
    .find((index) => index >= 0) ?? -1;
}

function parseNumber(value: string | undefined) {
  const number = Number.parseFloat(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function parseDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  row.push(value);
  rows.push(row);
  return rows.filter((items) => items.some((item) => item.trim()));
}

async function readPublicCsvValues(spreadsheetId: string, sheetName?: string) {
  const configuredCsvUrl = process.env.KIDCITY_FTE_CSV_URL?.trim();
  const url = configuredCsvUrl || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    spreadsheetId,
  )}/gviz/tq?tqx=out:csv${sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : ""}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const text = await response.text();

  if (!response.ok || /^\s*</.test(text)) {
    throw new Error(`FTE sheet CSV read returned ${response.status}.`);
  }

  return parseCsv(text);
}

function keyVariants(value?: string | null) {
  const base = value?.trim().toLowerCase();
  if (!base) return [];
  const withoutBrand = base.replace(/^kid city usa\s*[-|]\s*/, "").trim();
  return Array.from(new Set([
    base,
    withoutBrand,
    base.split("|").pop()?.trim() || "",
    base.split(" - ").pop()?.trim() || "",
    withoutBrand.split("|").pop()?.trim() || "",
    withoutBrand.split(" - ").pop()?.trim() || "",
  ].filter(Boolean)));
}

function visibleCenterKeys(center: VisibleCenter) {
  return [
    center.id,
    center.crmLocationId,
    center.name,
    center.city,
    [center.city, center.state].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .flatMap((value) => keyVariants(String(value)));
}

export async function getKidCityFteSnapshot(visibleCenters: VisibleCenter[] = []): Promise<FteSnapshot> {
  const configuredSheetName = process.env.KIDCITY_FTE_SHEET_NAME?.trim();
  const spreadsheetId = spreadsheetIdFromUrl(
    process.env.KIDCITY_FTE_SPREADSHEET_ID ||
      process.env.KIDCITY_FTE_SPREADSHEET_URL ||
      process.env.KIDCITY_FTE_GOOGLE_SHEET_URL,
  );
  const sheetName = configuredSheetName || DEFAULT_SHEET_NAME;
  const range = process.env.KIDCITY_FTE_RANGE || `${quoteRangeSheetName(sheetName)}!A:Z`;

  if (!spreadsheetId) {
    return {
      configured: false,
      status: "needs_sheet_url",
      sheetName,
      totalFte: 0,
      locationCount: 0,
      rows: [],
    };
  }

  const result = await readGoogleSheetValues({ spreadsheetId, range });
  let values = result.values ?? [];

  if (result.skipped || !result.ok) {
    try {
      values = await readPublicCsvValues(spreadsheetId, configuredSheetName);
    } catch (error) {
      if (result.skipped) {
        return {
          configured: false,
          status: "needs_google_credentials",
          spreadsheetId,
          sheetName,
          totalFte: 0,
          locationCount: 0,
          rows: [],
          error: error instanceof Error ? error.message : undefined,
        };
      }

      return {
        configured: true,
        status: "error",
        spreadsheetId,
        sheetName,
        totalFte: 0,
        locationCount: 0,
        rows: [],
        error: result.error || (error instanceof Error ? error.message : "FTE sheet read failed."),
      };
    }
  }

  if (!values.length) {
    return {
      configured: true,
      status: "error",
      spreadsheetId,
      sheetName,
      totalFte: 0,
      locationCount: 0,
      rows: [],
      error: "FTE sheet did not return rows.",
    };
  }

  const headers = values[0] ?? [];
  const locationIdIndex = headerIndex(headers, ["crm location id", "location id", "school id", "center id"]);
  const centerNameIndex = headerIndex(headers, ["school", "location", "location name", "center", "center name"]);
  const fteIndex = headerIndex(headers, [
    "fte current week",
    "current week fte",
    "fte current",
    "current fte",
    "full time equivalent",
    "full-time equivalent",
    "fulltimeequivalent",
    "fte",
  ]);
  const dateIndex = headerIndex(headers, ["date", "week", "report date", "as of", "asof"]);
  const visibleKeys = new Set(visibleCenters.flatMap(visibleCenterKeys));
  const latestByLocation = new Map<string, { rowIndex: number; date: Date | null; data: FteSnapshot["rows"][number] }>();

  values.slice(1).forEach((row, index) => {
    const crmLocationId = locationIdIndex >= 0 ? row[locationIdIndex] : "";
    const centerName = centerNameIndex >= 0 ? row[centerNameIndex] : crmLocationId || `Row ${index + 2}`;
    const key = String(crmLocationId || centerName || `row-${index + 2}`).trim();
    if (!key) return;

    const matchKey = [crmLocationId, centerName].flatMap((value) => keyVariants(value));
    if (visibleKeys.size && !matchKey.some((value) => visibleKeys.has(value))) return;

    const reportDateValue = dateIndex >= 0 ? row[dateIndex] : "";
    const date = parseDate(reportDateValue);
    const fte = fteIndex >= 0 ? parseNumber(row[fteIndex]) : 0;
    const existing = latestByLocation.get(key);
    const shouldReplace = !existing ||
      (date && existing.date && date > existing.date) ||
      (date && !existing.date) ||
      (!date && !existing.date && index > existing.rowIndex);

    if (shouldReplace) {
      latestByLocation.set(key, {
        rowIndex: index,
        date,
        data: {
          key,
          centerName: centerName || key,
          crmLocationId: crmLocationId || undefined,
          fte,
          reportDate: reportDateValue || undefined,
        },
      });
    }
  });

  const rows = Array.from(latestByLocation.values())
    .map((entry) => entry.data)
    .sort((a, b) => b.fte - a.fte);

  return {
    configured: true,
    status: "ready",
    spreadsheetId,
    sheetName,
    totalFte: Math.round(rows.reduce((sum, row) => sum + row.fte, 0) * 100) / 100,
    locationCount: rows.length,
    updatedAt: new Date().toISOString(),
    rows,
  };
}
