export type ProcareImportRecord = Record<string, string>;

const placeholderValues = new Set([
  "-",
  "--",
  "---",
  "----",
  "-----",
  "------",
  "-------",
  "n/a",
  "na",
  "none",
  "null",
]);

export function cleanProcareImportValue(input: unknown) {
  const value = typeof input === "string" ? input.trim() : "";
  return value && !placeholderValues.has(value.toLowerCase()) ? value : "";
}

export function procareValue(record: ProcareImportRecord, aliases: string[]) {
  for (const alias of aliases) {
    const found = cleanProcareImportValue(record[alias.toLowerCase()]);
    if (found) return found;
  }
  return "";
}

function procarePlacementValue(record: ProcareImportRecord, aliases: string[]) {
  for (const alias of aliases) {
    const found = cleanProcareImportValue(record[alias.toLowerCase()]);
    if (found && found.toLowerCase() !== "unknown") return found;
  }
  return "";
}

function personName(parts: Array<string | undefined>) {
  return parts
    .map(cleanProcareImportValue)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function procareFamilyName(rawData: ProcareImportRecord) {
  const direct = procareValue(rawData, [
    "family name",
    "account name",
    "account",
    "family",
    "payer family",
    "household",
    "parent name",
    "primary guardian",
    "primary payer",
  ]);
  if (direct) return direct;
  const guardian = procareValue(rawData, ["guardian name", "primary guardian", "primary payer", "payer", "payer 1", "primary parent"]);
  return guardian ? `${guardian} Household` : "";
}

export function procareChildFullName(rawData: ProcareImportRecord) {
  const splitName = personName([
    procareValue(rawData, ["first name", "child first name", "student first name"]),
    procareValue(rawData, ["middle initial", "middle name", "child middle name", "student middle name"]),
    procareValue(rawData, ["last name", "child last name", "student last name"]),
  ]);
  return (
    splitName ||
    procareValue(rawData, ["child name", "student name", "student", "child"]) ||
    procareValue(rawData, ["name"])
  );
}

export function procareChildPreferredName(rawData: ProcareImportRecord) {
  return (
    procareValue(rawData, ["preferred name", "nickname", "goes by"]) ||
    procareValue(rawData, ["first name", "child first name", "student first name"])
  );
}

export function procareClassroomName(rawData: ProcareImportRecord) {
  return procarePlacementValue(rawData, [
    "classroom",
    "classroom name",
    "room",
    "room name",
    "class",
    "assigned classroom",
    "assigned room",
    "primary work area",
  ]);
}

export function procareAgeGroup(rawData: ProcareImportRecord, fallback = "Unassigned") {
  return procarePlacementValue(rawData, ["age group", "program", "class", "room"]) || procareClassroomName(rawData) || fallback;
}

export function procareStaffName(rawData: ProcareImportRecord) {
  return (
    procareValue(rawData, ["employee name", "staff name", "teacher name", "employee", "teacher"]) ||
    personName([
      procareValue(rawData, ["first name", "employee first name", "staff first name"]),
      procareValue(rawData, ["middle initial", "middle name"]),
      procareValue(rawData, ["last name", "employee last name", "staff last name"]),
    ])
  );
}

export function normalizeProcareEnrollmentStatus(input: string, fallback = "enrolled") {
  const value = cleanProcareImportValue(input).toLowerCase();
  if (!value) return fallback;
  if (/summer\s*break|summer/.test(value)) return "summer_break";
  if (/withdraw|inactive|not\s*enrolled|unenrolled|terminated|quit/.test(value)) return "withdrawn";
  if (/graduat/.test(value)) return "graduated";
  if (/wait/.test(value)) return "waitlisted";
  if (/tour/.test(value)) return "tour_scheduled";
  if (/pend|prospect|pre[-\s]?enroll/.test(value)) return "pending";
  if (/active|enroll|current/.test(value)) return "enrolled";
  return value.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || fallback;
}

export function procareSourceFields(rawData: ProcareImportRecord) {
  return {
    rowType: procareValue(rawData, ["row type", "record type", "type"]),
    sourceLocation: procareValue(rawData, ["source location", "location", "center name", "school name", "school"]),
    sourceSystem: procareValue(rawData, ["source system"]),
    sourceNotes: procareValue(rawData, ["source notes", "notes"]),
    childFirstName: procareValue(rawData, ["first name", "child first name", "student first name"]),
    childMiddleInitial: procareValue(rawData, ["middle initial", "middle name", "child middle name", "student middle name"]),
    childLastName: procareValue(rawData, ["last name", "child last name", "student last name"]),
    childGender: procareValue(rawData, ["gender", "sex"]),
    childEndDate: procareValue(rawData, ["end date", "withdrawal date", "termination date"]),
    employeeStatus: procareValue(rawData, ["employee status", "staff status", "teacher status"]),
    employeeStatusDate: procareValue(rawData, ["status date", "employee status date"]),
    primaryWorkArea: procareValue(rawData, ["primary work area", "work area"]),
  };
}

export function isActiveProcareStaffStatus(input: string) {
  const status = cleanProcareImportValue(input).toLowerCase();
  return !/(terminated|quit|inactive|separated|dismissed)/.test(status);
}
