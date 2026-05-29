export type FteImportRow = {
  rowNumber: number;
  centerKey: string;
  weekStart: string;
  weekEnd: string;
  enrolledCount: number;
  fullTimeCount: number;
  partTimeCount: number;
  fteCount: number | null;
  infants: number;
  toddlers: number;
  twos: number;
  preschool: number;
  preK: number;
  schoolAge: number;
  status: string;
  notes: string;
};

type ParseResult = {
  rows: FteImportRow[];
  errors: Array<{ rowNumber: number; message: string }>;
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function asNumber(value: string | undefined) {
  if (!value) return 0;
  const number = Number(value.replace(/[$,%]/g, ""));
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100) / 100) : 0;
}

function asInt(value: string | undefined) {
  return Math.round(asNumber(value));
}

function field(row: Record<string, string>, names: string[]) {
  for (const name of names) {
    const value = row[normalizeHeader(name)];
    if (value) return value.trim();
  }
  return "";
}

export function parseFteImportCsv(text: string): ParseResult {
  const csvRows = parseCsv(text);
  if (csvRows.length < 2) {
    return { rows: [], errors: [{ rowNumber: 1, message: "CSV needs a header row and at least one data row." }] };
  }

  const headers = csvRows[0].map(normalizeHeader);
  const rows: FteImportRow[] = [];
  const errors: ParseResult["errors"] = [];

  csvRows.slice(1).forEach((values, index) => {
    const rowNumber = index + 2;
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex]?.trim() ?? ""]));
    const centerKey = field(row, ["center id", "center", "school", "school id", "location", "location id", "crm location id"]);
    const weekStart = field(row, ["week start", "week", "week beginning", "report week", "start date"]);
    if (!centerKey) errors.push({ rowNumber, message: "Missing center/location identifier." });
    if (!weekStart) errors.push({ rowNumber, message: "Missing week start date." });
    if (!centerKey || !weekStart) return;

    rows.push({
      rowNumber,
      centerKey,
      weekStart,
      weekEnd: field(row, ["week end", "end date"]),
      enrolledCount: asInt(field(row, ["enrolled", "enrolled count", "children enrolled", "enrollment"])),
      fullTimeCount: asInt(field(row, ["full time", "full-time", "full time count", "ft"])),
      partTimeCount: asInt(field(row, ["part time", "part-time", "part time count", "pt"])),
      fteCount: field(row, ["fte", "fte count", "full time equivalent"]) ? asNumber(field(row, ["fte", "fte count", "full time equivalent"])) : null,
      infants: asInt(field(row, ["infants", "infant"])),
      toddlers: asInt(field(row, ["toddlers", "toddler"])),
      twos: asInt(field(row, ["twos", "2s", "two year olds"])),
      preschool: asInt(field(row, ["preschool", "pre school"])),
      preK: asInt(field(row, ["pre-k", "prek", "pre k"])),
      schoolAge: asInt(field(row, ["school age", "school-age", "schoolage"])),
      status: field(row, ["status"]),
      notes: field(row, ["notes", "note", "comments", "comment"]),
    });
  });

  return { rows, errors };
}

export function normalizeFteCenterKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
