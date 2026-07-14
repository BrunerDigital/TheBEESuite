export type FteImportRow = {
  rowNumber: number;
  centerKey: string;
  locationData: string;
  weekStart: string;
  weekEnd: string;
  accountReceivableAmount: number | null;
  selfPayerBillAmount: number | null;
  subsidyBillAmount: number | null;
  totalBilledAmount: number | null;
  enrolledCount: number;
  fullTimeCount: number;
  partTimeCount: number;
  fteCount: number | null;
  licenseCapacity: number | null;
  occupancyPercent: number | null;
  payrollAmount: number | null;
  payrollPercent: number | null;
  newStarts: number;
  withdrawals: number;
  preregisteredChildren: number;
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

function asOptionalNumber(value: string | undefined) {
  if (!value) return null;
  return asNumber(value);
}

function asOptionalInt(value: string | undefined) {
  const number = asOptionalNumber(value);
  return number === null ? null : Math.round(number);
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
    const centerKey = field(row, ["center id", "center", "school", "school name", "school id", "location", "location id", "crm location id"]);
    const weekStart = field(row, ["week start", "week", "week beginning", "report week", "start date"]);
    if (!centerKey) errors.push({ rowNumber, message: "Missing center/location identifier." });
    if (!weekStart) errors.push({ rowNumber, message: "Missing week start date." });
    if (!centerKey || !weekStart) return;

    rows.push({
      rowNumber,
      centerKey,
      locationData: field(row, ["location data", "location type", "owner group", "ownership group", "operator"]),
      weekStart,
      weekEnd: field(row, ["week end", "end date"]),
      accountReceivableAmount: asOptionalNumber(field(row, [
        "accounts receivable",
        "accounts receivable tuition",
        "accounts receivable (tuition)",
        "ar",
      ])),
      selfPayerBillAmount: asOptionalNumber(field(row, [
        "amount of self-payer bill",
        "amount of self payer bill",
        "self payer bill",
        "self-pay bill",
        "self pay bill",
      ])),
      subsidyBillAmount: asOptionalNumber(field(row, [
        "amount of subsidy bill",
        "subsidy bill",
        "subsidy billed",
      ])),
      totalBilledAmount: asOptionalNumber(field(row, [
        "total amount billed",
        "total billed",
        "amount billed",
      ])),
      enrolledCount: asInt(field(row, ["enrolled", "enrolled count", "children enrolled", "enrollment", "total currently enrolled"])),
      fullTimeCount: asInt(field(row, ["full time", "full-time", "full time count", "ft"])),
      partTimeCount: asInt(field(row, ["part time", "part-time", "part time count", "pt"])),
      fteCount: field(row, ["fte", "fte count", "full time equivalent", "total fte", "total fte's", "total ftes", "total fte's (fte)", "total ftes fte"])
        ? asNumber(field(row, ["fte", "fte count", "full time equivalent", "total fte", "total fte's", "total ftes", "total fte's (fte)", "total ftes fte"]))
        : null,
      licenseCapacity: asOptionalInt(field(row, ["license capacity", "licensed capacity", "capacity"])),
      occupancyPercent: asOptionalNumber(field(row, ["occupancy percent", "occupancy percentage", "occupancy %"])),
      payrollAmount: asOptionalNumber(field(row, ["payroll amount", "payroll"])),
      payrollPercent: asOptionalNumber(field(row, ["payroll percentage", "payroll percent", "payroll %"])),
      newStarts: asInt(field(row, ["# new starts", "new starts", "new starts for week", "new starts this week"])),
      withdrawals: asInt(field(row, ["# withdrawn", "withdrawn", "withdrawals", "withdrawn this week"])),
      preregisteredChildren: asInt(field(row, [
        "# children preregistered",
        "children preregistered",
        "preregistered children",
        "pre-registered children",
      ])),
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
