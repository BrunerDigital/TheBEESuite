export type ProcareImportRecord = Record<string, string>;

export const PROCARE_FIELD_OPTIONS = [
  { key: "account id", label: "Family / account ID", aliases: ["account key", "account number", "account no", "family id", "family key", "procare account id"] },
  { key: "family name", label: "Family / household name", aliases: ["account name", "account", "family", "payer family", "household"] },
  { key: "child id", label: "Child ID", aliases: ["child key", "student id", "student key", "procare child id"] },
  { key: "child name", label: "Child full name", aliases: ["student name", "student", "child"] },
  { key: "child first name", label: "Child first name", aliases: ["student first name"] },
  { key: "child middle name", label: "Child middle name / initial", aliases: ["child middle initial", "student middle name", "middle initial"] },
  { key: "child last name", label: "Child last name", aliases: ["student last name"] },
  { key: "date of birth", label: "Child date of birth", aliases: ["dob", "birth date", "birthday", "birthdate"] },
  { key: "child status", label: "Child enrollment status", aliases: ["enrollment status", "student status"] },
  { key: "start date", label: "Enrollment start date", aliases: ["enrollment date", "begin date", "first day"] },
  { key: "end date", label: "Enrollment end / withdrawal date", aliases: ["withdrawal date", "termination date"] },
  { key: "classroom", label: "Classroom / room", aliases: ["classroom name", "room", "room name", "assigned classroom", "assigned room"] },
  { key: "age group", label: "Age group / program", aliases: ["program"] },
  { key: "guardian id", label: "Primary guardian ID", aliases: ["payer id", "primary payer id", "parent id", "payer 1 id", "primary parent id"] },
  { key: "guardian name", label: "Primary guardian name", aliases: ["parent/guardian", "parent name", "primary guardian", "primary payer", "payer", "payer 1", "primary parent"] },
  { key: "guardian email", label: "Primary guardian email", aliases: ["parent email", "primary email", "payer email", "payer 1 email", "primary payer email"] },
  { key: "guardian phone", label: "Primary guardian phone", aliases: ["parent phone", "primary phone", "payer phone", "payer 1 phone", "primary payer phone"] },
  { key: "secondary guardian", label: "Secondary guardian name", aliases: ["secondary payer", "secondary parent", "parent 2", "payer 2", "spouse"] },
  { key: "secondary guardian id", label: "Secondary guardian ID", aliases: ["secondary payer id", "secondary parent id", "parent 2 id", "payer 2 id"] },
  { key: "secondary email", label: "Secondary guardian email", aliases: ["secondary guardian email", "secondary payer email", "parent 2 email", "payer 2 email"] },
  { key: "secondary phone", label: "Secondary guardian phone", aliases: ["secondary guardian phone", "secondary payer phone", "parent 2 phone", "payer 2 phone"] },
  { key: "employee id", label: "Staff / teacher ID", aliases: ["staff id", "teacher id", "employee key"] },
  { key: "employee name", label: "Staff / teacher name", aliases: ["staff name", "teacher name", "employee", "teacher"] },
  { key: "employee email", label: "Staff / teacher email", aliases: ["staff email", "teacher email", "work email"] },
  { key: "employee status", label: "Staff employment status", aliases: ["staff status", "teacher status"] },
  { key: "location", label: "School / location", aliases: ["location id", "crm location id", "school id", "school", "school name", "center", "center name", "site"] },
  { key: "balance", label: "Account balance", aliases: ["account balance", "ledger balance", "amount due"] },
  { key: "schedule", label: "Child schedule", aliases: ["schedule template", "contract schedule", "contract", "days"] },
  { key: "allergies", label: "Allergies / medical allergy", aliases: ["allergy", "allergy notes", "medical allergy"] },
] as const;

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/^\ufeff/, "").replace(/[_./\\-]+/g, " ").replace(/\s+/g, " ").trim();
}

const recognizedHeaderMap = new Map(
  PROCARE_FIELD_OPTIONS.flatMap((field) => [field.key, ...field.aliases].map((alias) => [normalizedHeader(alias), field.key] as const)),
);

export type ProcareFieldMapping = Record<string, string>;

export const PROCARE_CORRELATION_GROUPS = [
  {
    id: "families",
    title: "Family identity",
    description: "Confirm the ProCare account ID and household name before matching people.",
    fields: ["location", "account id", "family name"],
  },
  {
    id: "children",
    title: "Children and enrollment",
    description: "Confirm child identity, enrollment status, dates, and classroom placement. Closed enrollment stays out of active classrooms.",
    fields: ["child id", "child name", "child first name", "child middle name", "child last name", "date of birth", "child status", "start date", "end date", "classroom", "age group"],
  },
  {
    id: "parents",
    title: "Parents and guardians",
    description: "Confirm parent identities and contact fields before creating their family profiles.",
    fields: ["guardian id", "guardian name", "guardian email", "guardian phone", "secondary guardian id", "secondary guardian", "secondary email", "secondary phone"],
  },
  {
    id: "relationships",
    title: "Family and pickup relationships",
    description: "Confirm the source records that connect children, parents, emergency contacts, and authorized pickups to the family.",
    fields: ["allergies"],
  },
  {
    id: "optional",
    title: "Other editable data",
    description: "Confirm optional schedule, balance, and staff fields. Unmapped report-only columns remain retained in the import backup.",
    fields: ["balance", "schedule", "employee id", "employee name", "employee email", "employee status"],
  },
] as const;

export type ProcareCorrelationSection = {
  id: string;
  title: string;
  description: string;
  required: boolean;
  correlations: Array<{
    source: string;
    destination: string;
    label: string;
    recognized: boolean;
  }>;
};

const fieldLabelByKey = new Map<string, string>(PROCARE_FIELD_OPTIONS.map((field) => [field.key, field.label]));

function procareCorrelationGroup(destination: string, source: string) {
  const normalizedSource = normalizedHeader(source);
  if (/^procare (relationship|account person)/.test(normalizedSource)) {
    return normalizedSource.includes("account person") ? "parents" : "relationships";
  }
  if (/^procare (allergy|child info|enrollment source)/.test(normalizedSource)) return "relationships";
  return PROCARE_CORRELATION_GROUPS.find((group) => (group.fields as readonly string[]).includes(destination))?.id ?? "";
}

export function buildProcareCorrelationReview(
  headers: string[],
  mapping: ProcareFieldMapping,
  sourceType: string,
): ProcareCorrelationSection[] {
  const analysis = analyzeProcareHeaders(headers);
  const destinations = applyProcareFieldMapping(headers, mapping);
  const standardReports = sourceType.startsWith("procare_multi_report_");

  return PROCARE_CORRELATION_GROUPS.flatMap((group) => {
    const correlations = headers.flatMap((source, index) => {
      const destination = destinations[index];
      if (procareCorrelationGroup(destination, source) !== group.id) return [];
      return [{
        source,
        destination,
        label: fieldLabelByKey.get(destination) ?? destination.replaceAll("_", " "),
        recognized: analysis[index]?.recognized ?? false,
      }];
    });
    if (!correlations.length && !(standardReports && group.id !== "optional")) return [];
    return [{
      id: group.id,
      title: group.title,
      description: group.description,
      required: group.id !== "optional",
      correlations,
    }];
  });
}

export function analyzeProcareHeaders(headers: string[]) {
  return headers.map((header) => {
    const normalized = normalizedHeader(header);
    return { source: header, normalized, suggestedField: recognizedHeaderMap.get(normalized) ?? "", recognized: recognizedHeaderMap.has(normalized) };
  });
}

export function applyProcareFieldMapping(headers: string[], mapping: ProcareFieldMapping) {
  return headers.map((header) => normalizedHeader(mapping[header] || mapping[normalizedHeader(header)] || header));
}

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
  if (/pend|prospect|pre[-\s]?(?:enroll|regist)/.test(value)) return "pending";
  if (/active|enroll|current/.test(value)) return "enrolled";
  return value.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || fallback;
}

export function isActiveProcareEnrollmentStatus(input: string) {
  return ["enrolled", "pending", "waitlisted", "tour_scheduled", "summer_break"].includes(normalizeProcareEnrollmentStatus(input));
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
