import { defaultCenterNameFromCrmLocationId, normalizeCrmLocationId, parseCrmLocationId } from "@/lib/active-school-locations";

export type ExecutiveBulkImportType = "location" | "user";

export type ExecutiveBulkImportRow = {
  rowNumber: number;
  type: ExecutiveBulkImportType;
  name: string;
  email: string;
  role: string;
  crmLocationId: string;
  locationId: string;
  status: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  licensedCapacity: string;
  title: string;
  accessScopeType: string;
  ownerGroupId: string;
  password: string;
  sendPasswordReset: boolean;
  errors: string[];
};

const locationTypes = new Set(["location", "school", "center"]);
const userTypes = new Set(["user", "staff", "director", "teacher"]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function key(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (character === "\"") {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  cells.push(current.trim());
  return cells;
}

function truthy(value: string) {
  return ["1", "true", "yes", "y", "send"].includes(value.toLowerCase());
}

function inferType(rawType: string, email: string) {
  const normalized = rawType.toLowerCase();
  if (locationTypes.has(normalized)) return "location" as const;
  if (userTypes.has(normalized)) return "user" as const;
  return email ? "user" as const : "location" as const;
}

function valueFor(record: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = record[key(alias)];
    if (value) return value;
  }
  return "";
}

export function parseExecutiveBulkImportCsv(csvText: string) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]).map(key);
  const rows: ExecutiveBulkImportRow[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index]);
    const record = Object.fromEntries(headers.map((header, cellIndex) => [header, clean(cells[cellIndex] ?? "")]));
    const rawLocationId = valueFor(record, ["crmLocationId", "locationId", "location id", "school id"]);
    const crmLocationId = normalizeCrmLocationId(rawLocationId);
    const parsedLocation = parseCrmLocationId(crmLocationId);
    const email = valueFor(record, ["email", "routingEmail", "userEmail"]);
    const rawType = valueFor(record, ["type", "rowType", "kind"]);
    const type = inferType(rawType, email);
    const name = valueFor(record, ["name", type === "user" ? "userName" : "schoolName", "fullName"]);
    const defaultUserRole = ["staff", "teacher"].includes(rawType.toLowerCase()) ? "TEACHER" : "CENTER_DIRECTOR";
    const row: ExecutiveBulkImportRow = {
      rowNumber: index + 1,
      type,
      name: name || (type === "location" ? defaultCenterNameFromCrmLocationId(crmLocationId) : ""),
      email,
      role: valueFor(record, ["role"]) || (type === "user" ? defaultUserRole : ""),
      crmLocationId,
      locationId: valueFor(record, ["locationId", "location id"]) || crmLocationId,
      status: valueFor(record, ["status"]) || "active",
      address: valueFor(record, ["address", "street"]),
      city: valueFor(record, ["city"]) || parsedLocation?.city || "",
      state: (valueFor(record, ["state"]) || parsedLocation?.state || "").toUpperCase(),
      postalCode: valueFor(record, ["postalCode", "zip", "zipCode"]),
      phone: valueFor(record, ["phone"]),
      licensedCapacity: valueFor(record, ["licensedCapacity", "capacity"]),
      title: valueFor(record, ["title"]),
      accessScopeType: valueFor(record, ["accessScopeType", "scope"]) || (type === "user" ? "CENTER" : ""),
      ownerGroupId: valueFor(record, ["ownerGroupId", "ownerGroup"]),
      password: valueFor(record, ["password", "temporaryPassword"]),
      sendPasswordReset: truthy(valueFor(record, ["sendPasswordReset", "passwordReset"])),
      errors: [],
    };

    if (type === "location" && !row.crmLocationId) row.errors.push("Location rows need a valid ST | City Location ID.");
    if (type === "location" && !row.name) row.errors.push("Location rows need a school name.");
    if (type === "user" && !row.email && row.role.toUpperCase() !== "TEACHER") row.errors.push("User rows need an email.");
    if (type === "user" && !row.name) row.errors.push("User rows need a name.");
    if (type === "user" && row.accessScopeType === "CENTER" && !row.crmLocationId && !row.locationId) {
      row.errors.push("Center-scoped user rows need a Location ID.");
    }
    rows.push(row);
  }

  return rows;
}

export function summarizeExecutiveBulkImport(rows: ExecutiveBulkImportRow[]) {
  return {
    total: rows.length,
    locations: rows.filter((row) => row.type === "location").length,
    users: rows.filter((row) => row.type === "user").length,
    errors: rows.reduce((count, row) => count + row.errors.length, 0),
  };
}
