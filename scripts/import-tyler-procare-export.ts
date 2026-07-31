import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_LOCATION_ID = "TX | Tyler";
const CENTER_NAME = "Kid City USA - Tyler";
const CENTER_TIME_ZONE = "America/Chicago";
const SOURCE_SYSTEM = "procare";
const IMPORT_SOURCE = "tyler_procare_cross_report_import_2026_07_31";
const BILLING_AS_OF = "2026-08-02";

const SOURCE_FILES = {
  accountBalance: { name: "TYLERACCOUNTBALANCESUMMARY.csv", sha256: "F4ADBCE54C1217B09A1A02BE7ECE12916B75055DA35EEC3FE7EDFC9B7E974833", rows: 351 },
  accountInfo: { name: "TYLERACCOUNTINFORAMTION.csv", sha256: "B45EB5C99201E4DC8BC4148220A098F181CFF29B1A6C4FE6FD68343EF0CFAB58", rows: 351 },
  enrollment: { name: "TYLERCHILDALLENROLLMENTSTATUS.csv", sha256: "88847D2F003D519406D674738C3ED87CBBDAF0D10604BFA8303C625D089F0839", rows: 990 },
  contractBilling: { name: "TYLERCHILDCONTACTBILLINGSUMMARY.csv", sha256: "7A86C5E072665AE5A7200F0F343B0854E145CF2D117397FF069E1CFACCBDFCEA", rows: 188 },
  childInfo: { name: "TYLERCHILDINFORATIONTRACKING.csv", sha256: "906AEB6529CC13B573CAC0586E18AD03F9971A9079081BA6C3DA7E7E01B88DC5", rows: 486 },
  relationships: { name: "TYLERCHILDRELATIONSHIPS.csv", sha256: "FDC0878AD52EE195792D98CC32ADB25D1CCDA67222F3A37320CE1427A4F560D3", rows: 2149 },
  childTimecards: { name: "TYLERCHILDTIMECARDS.csv", sha256: "C20A5A66EAFDC44F154CE816A2BAAAA6F5093AD5120E4EC61874D428146166A8", rows: 35287 },
  classroomSchedule: { name: "TYLERCLASSROOMSUMMARYWEEKLY.csv", sha256: "3484F2A693984B653122F614F0A2A5485A597C5FCE0FBC0A81EC18AE3AE132EF", rows: 548 },
  employeeInfo: { name: "TYLEREMPOLYEEINFORATIONTRACKING.csv", sha256: "ABCCA0912EB5A46D411861BB7C5FBB356DB770AEC466FA5ECFF82519DFADE7DF", rows: 113 },
  employeeTimecards: { name: "TYLEREMPOLYEETIMECARD.csv", sha256: "580098F02A9F557CA1E1BB3BE9652E9E97E492E9755149717D1D9DF64254790E", rows: 16929 },
} as const;

type CsvRow = Record<string, string>;
type CsvTable = { headers: string[]; rows: CsvRow[]; matrix: string[][] };
type SourceKey = keyof typeof SOURCE_FILES;
type SourceInventory = Record<SourceKey, { path: string; sha256: string; rows: number; modifiedAt: Date }>;

type ChildPlan = {
  externalId: string;
  personId: string;
  fullName: string;
  lastName: string;
  dateOfBirth: Date | null;
  sourceStatus: string;
  enrollmentStatus: string;
  statusDate: Date | null;
  startDate: Date | null;
  classroomExternalId: string;
  classroomName: string;
  familyExternalId: string;
  familyResolution: string;
  statusHistory: Array<{ status: string; startsAt: string | null; endsAt: string | null; classroom: string }>;
  schedule: Record<string, string> | null;
  contractBilling: Array<{ payerLabel: string; cadence: string; description: string; note: string; unitAmountCents: number; cycleAmountCents: number }>;
  identificationNumber: string;
};

type FamilyPlan = {
  externalId: string;
  name: string;
  address: string;
  billingEmail: string;
  payerPersonId: string;
  accountRows: CsvRow[];
  accountInfoRows: CsvRow[];
  unresolvedChildExternalId: string;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function displayName(value: string) {
  const parts = clean(value).split(",").map((part) => part.trim());
  return parts.length > 1 ? `${parts.slice(1).join(" ")} ${parts[0]}`.replace(/\s+/g, " ").trim() : clean(value);
}

function stableId(...parts: string[]) {
  return createHash("sha256").update(parts.map((part) => clean(part).toLowerCase()).join("\0")).digest("hex");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\r" || char === "\n") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  invariant(!quoted, "A Tyler CSV contains an unterminated quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function decode(buffer: Buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function table(buffer: Buffer): CsvTable {
  const matrix = parseCsv(decode(buffer));
  const headers = (matrix[0] ?? []).map((header) => header.replace(/^\ufeff/, "").trim());
  return {
    headers,
    matrix,
    rows: matrix.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, clean(row[index])]))),
  };
}

function parseMoneyCents(value: string) {
  const parsed = Number(clean(value).replace(/[$,]/g, ""));
  invariant(Number.isFinite(parsed), `Invalid money value: ${value}`);
  return Math.round(parsed * 100);
}

function parseDateOnly(value: string) {
  const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  const result = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return Number.isNaN(result.valueOf()) ? null : result;
}

function dateOnlyIso(value: string) {
  return parseDateOnly(value)?.toISOString() ?? null;
}

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function parseLocalDateTime(value: string) {
  const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;
  const [, month, day, year, hourText, minute, second = "0", meridiem] = match;
  let hour = Number(hourText) % 12;
  if (meridiem.toUpperCase() === "PM") hour += 12;
  const desired = Date.UTC(Number(year), Number(month) - 1, Number(day), hour, Number(minute), Number(second));
  let result = new Date(desired);
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const offset = zonedParts(result, CENTER_TIME_ZONE) - result.valueOf();
    result = new Date(desired - offset);
  }
  return Number.isNaN(result.valueOf()) ? null : result;
}

function sourceStatus(value: string) {
  const status = normalize(value);
  if (status === "enrolled") return "enrolled";
  if (status === "withdrawn") return "withdrawn";
  if (status.startsWith("waiting list")) return "waitlisted";
  if (status === "pre-registered") return "pre_registered";
  if (status === "not starting") return "not_enrolled";
  return status.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "unknown";
}

function checked(value: string) {
  return /^(checked|true|yes|y|1|x)$/i.test(clean(value));
}

function address(row: CsvRow) {
  const cityLine = [row["Add 1, City"], row["Add 1, Region"], row["Add 1, Postal Code"]].filter(Boolean).join(" ");
  return [row["Add 1, Line 1"], row["Add 1, Line 2"], cityLine].filter(Boolean).join("\n");
}

function phone(row: CsvRow) {
  return [row["Phone 1"], row["Phone 2"], row["Phone 3"], row["Phone 4"], row["Phone 5"]].map(clean).find(Boolean) ?? "";
}

function chunk<T>(values: T[], size = 500) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  const result = new Map<string, T>();
  for (const value of values) if (!result.has(key(value))) result.set(key(value), value);
  return [...result.values()];
}

function loadSources() {
  const sourceDir = process.env.TYLER_PROCARE_SOURCE_DIR?.trim() || "C:/Users/brend/AppData/Local/Temp";
  const buffers = {} as Record<SourceKey, Buffer>;
  const inventory = {} as SourceInventory;
  const tables = {} as Record<SourceKey, CsvTable>;
  for (const [key, expected] of Object.entries(SOURCE_FILES) as Array<[SourceKey, (typeof SOURCE_FILES)[SourceKey]]>) {
    const path = join(sourceDir, expected.name);
    const buffer = readFileSync(path);
    const sha256 = createHash("sha256").update(buffer).digest("hex").toUpperCase();
    invariant(sha256 === expected.sha256, `${expected.name} does not match the reviewed Tyler source hash.`);
    const parsed = table(buffer);
    const rows = key === "contractBilling" || key === "classroomSchedule" ? parsed.matrix.length : parsed.rows.length;
    invariant(rows === expected.rows, `${expected.name} expected ${expected.rows} rows; found ${rows}.`);
    buffers[key] = buffer;
    tables[key] = parsed;
    inventory[key] = { path, sha256, rows, modifiedAt: statSync(path).mtime };
  }
  return { buffers, inventory, tables };
}

function buildPlan(tables: Record<SourceKey, CsvTable>, inventory: SourceInventory) {
  const accounts = tables.accountBalance.rows;
  const accountInfo = tables.accountInfo.rows;
  const enrollment = tables.enrollment.rows;
  const childInfo = tables.childInfo.rows;
  const relationships = tables.relationships.rows;
  const childTimecards = tables.childTimecards.rows;
  const employeeInfo = tables.employeeInfo.rows;
  const employeeTimecards = tables.employeeTimecards.rows;

  invariant(new Set(accounts.map((row) => row["Account ID"])).size === 351, "Tyler account identifiers are not unique.");
  invariant(new Set(enrollment.map((row) => row["Child ID"])).size === 486, "Tyler enrollment child count changed.");
  invariant(new Set(relationships.map((row) => row["Child ID"])).size === 495, "Tyler relationship child count changed.");
  invariant(new Set(childInfo.map((row) => row["Child ID"])).size === 486, "Tyler child information count changed.");
  invariant(new Set(employeeInfo.map((row) => row["Employee ID"])).size === 113, "Tyler employee count changed.");
  invariant(new Set(employeeTimecards.map((row) => row["Employee ID"])).size === 79, "Tyler employee time-card coverage changed.");

  const accountsByPayer = new Map<string, CsvRow[]>();
  const payerByAccountId = new Map<string, string>();
  const payerIdsByName = new Map<string, Set<string>>();
  for (const row of accounts) {
    const personId = clean(row["Person ID"]);
    const accountId = clean(row["Account ID"]);
    invariant(personId && accountId, "A Tyler account is missing its payer or account identifier.");
    accountsByPayer.set(personId, [...(accountsByPayer.get(personId) ?? []), row]);
    payerByAccountId.set(accountId, personId);
    const name = normalize(displayName(row["Full Name"]));
    payerIdsByName.set(name, new Set([...(payerIdsByName.get(name) ?? []), personId]));
  }
  invariant(accountsByPayer.size === 348, "Expected 348 distinct Tyler payer identities.");
  const duplicatePayerGroups = [...accountsByPayer.values()].filter((rows) => rows.length > 1);
  invariant(duplicatePayerGroups.length === 3 && duplicatePayerGroups.every((rows) => rows.length === 2), "Tyler duplicate-payer account grouping changed.");
  for (const rows of duplicatePayerGroups) {
    invariant(new Set(rows.map((row) => normalize(displayName(row["Full Name"])))).size === 1, "Duplicate payer accounts disagree on payer name.");
    invariant(new Set(rows.map((row) => normalize(row.Email))).size === 1, "Duplicate payer accounts disagree on payer email.");
    invariant(new Set(rows.map((row) => normalize(address(row)))).size === 1, "Duplicate payer accounts disagree on payer address.");
  }

  const accountInfoByAccount = new Map(accountInfo.map((row) => [row["Account ID"], row]));
  invariant(accountInfoByAccount.size === 351 && accounts.every((row) => accountInfoByAccount.has(row["Account ID"])), "Account information and balance sources do not cover the same accounts.");

  const selfRelationshipByChild = new Map(relationships.filter((row) => normalize(row["Person Type"]) === "child").map((row) => [row["Child ID"], row]));
  const relationshipsByChild = new Map<string, CsvRow[]>();
  for (const row of relationships.filter((candidate) => normalize(candidate["Person Type"]) === "relationship")) {
    relationshipsByChild.set(row["Child ID"], [...(relationshipsByChild.get(row["Child ID"]) ?? []), row]);
  }
  const childInfoByChild = new Map(childInfo.map((row) => [row["Child ID"], row]));

  const statusRowsByChild = new Map<string, CsvRow[]>();
  for (const row of enrollment) statusRowsByChild.set(row["Child ID"], [...(statusRowsByChild.get(row["Child ID"]) ?? []), row]);
  const latestByChild = new Map<string, CsvRow>();
  for (const [childId, rows] of statusRowsByChild) {
    latestByChild.set(childId, [...rows].sort((left, right) => (parseDateOnly(right["Status Start Date"])?.valueOf() ?? 0) - (parseDateOnly(left["Status Start Date"])?.valueOf() ?? 0))[0]);
  }
  for (const [childId, row] of selfRelationshipByChild) if (!latestByChild.has(childId)) latestByChild.set(childId, row);
  invariant(latestByChild.size === 495, "Expected 495 Tyler children across enrollment and relationship sources.");

  const billingItemsByChildName = new Map<string, ChildPlan["contractBilling"]>();
  const primaryPayerNamesByChildName = new Map<string, Set<string>>();
  for (const row of tables.contractBilling.matrix) {
    const childName = normalize(row[8] ?? "");
    const payerLabel = clean(row[13]);
    invariant(childName, "A contract-billing row is missing its child name.");
    const item = {
      payerLabel,
      cadence: clean(row[14]),
      description: clean(row[15]),
      note: clean(row[16]),
      unitAmountCents: parseMoneyCents(row[17]),
      cycleAmountCents: parseMoneyCents(row[18]),
    };
    billingItemsByChildName.set(childName, [...(billingItemsByChildName.get(childName) ?? []), item]);
    if (/\bprimary\b/i.test(payerLabel)) {
      const payerName = normalize(payerLabel.split(",").slice(1).join(","));
      if (payerName) primaryPayerNamesByChildName.set(childName, new Set([...(primaryPayerNamesByChildName.get(childName) ?? []), payerName]));
    }
  }
  invariant(billingItemsByChildName.size === 131, "Expected 131 billed Tyler children.");

  const scheduleByChildName = new Map<string, Array<{ classroom: string; schedule: Record<string, string> }>>();
  for (const row of tables.classroomSchedule.matrix) {
    const childName = normalize(row[11] ?? "");
    if (!childName) continue;
    const schedule = {
      weekOf: "2026-07-27",
      monday: clean(row[12]),
      tuesday: clean(row[13]),
      wednesday: clean(row[14]),
      thursday: clean(row[15]),
      friday: clean(row[16]),
      source: IMPORT_SOURCE,
    };
    const candidates = scheduleByChildName.get(childName) ?? [];
    const fingerprint = JSON.stringify([clean(row[5]), schedule]);
    if (!candidates.some((candidate) => JSON.stringify([candidate.classroom, candidate.schedule]) === fingerprint)) {
      scheduleByChildName.set(childName, [...candidates, { classroom: clean(row[5]), schedule }]);
    }
  }
  invariant(scheduleByChildName.size === 110, "Expected 110 scheduled Tyler children.");

  const familyExternalIdByPayer = new Map<string, string>();
  const familyPlans: FamilyPlan[] = [];
  for (const [payerPersonId, rows] of accountsByPayer) {
    const externalId = rows.length === 1 ? rows[0]["Account ID"] : `payer:${payerPersonId}`;
    familyExternalIdByPayer.set(payerPersonId, externalId);
    const payerName = displayName(rows[0]["Full Name"]);
    const lastName = clean(rows[0]["Last Name"]) || payerName.split(/\s+/).at(-1) || "ProCare";
    familyPlans.push({
      externalId,
      name: `${lastName} Family`,
      address: address(rows[0]),
      billingEmail: clean(rows[0].Email),
      payerPersonId,
      accountRows: rows,
      accountInfoRows: rows.map((row) => accountInfoByAccount.get(row["Account ID"])!).filter(Boolean),
      unresolvedChildExternalId: "",
    });
  }

  const childNameCounts = new Map<string, number>();
  for (const row of latestByChild.values()) childNameCounts.set(normalize(row["Full Name"]), (childNameCounts.get(normalize(row["Full Name"])) ?? 0) + 1);
  const childPlans: ChildPlan[] = [];
  const heldChildren: Array<{ externalId: string; sourceStatus: string; reason: string }> = [];
  const familyResolutionCounts = new Map<string, number>();

  for (const [childId, latest] of latestByChild) {
    const sourceSelf = selfRelationshipByChild.get(childId);
    const sourceInfo = childInfoByChild.get(childId);
    const fullName = clean(latest["Full Name"] || sourceInfo?.["Full Name"] || sourceSelf?.["Full Name"]);
    const dobText = clean(latest["Date of Birth"] || sourceInfo?.["Date of Birth"] || sourceSelf?.["Date of Birth"]);
    const dateOfBirth = parseDateOnly(dobText);
    if (!dateOfBirth) {
      heldChildren.push({ externalId: childId, sourceStatus: clean(latest["Enrollment Status"]), reason: "date_of_birth_missing_in_all_child_sources" });
      continue;
    }
    const childName = normalize(fullName);
    const related = relationshipsByChild.get(childId) ?? [];
    const primaryPayerNames = [...(primaryPayerNamesByChildName.get(childName) ?? [])];
    const billingPayerIds = new Set(primaryPayerNames.flatMap((name) => [...(payerIdsByName.get(name) ?? [])]));
    const relationshipOneId = clean(latest["Relationship 1 Id"]);
    const linkedPayerIds = new Set([
      relationshipOneId,
      clean(latest["Relationship 2 Id"]),
      clean(latest["Relationship 3 Id"]),
      ...related.map((row) => clean(row["Person ID"])),
    ].filter((personId) => accountsByPayer.has(personId)));

    let payerPersonId = "";
    let familyResolution = "";
    if (billingPayerIds.size === 1) {
      payerPersonId = [...billingPayerIds][0];
      familyResolution = "contract_billing_primary_payer_identity";
    } else if (relationshipOneId && accountsByPayer.has(relationshipOneId)) {
      payerPersonId = relationshipOneId;
      familyResolution = "primary_relationship_payer_identity";
    } else if (linkedPayerIds.size === 1) {
      payerPersonId = [...linkedPayerIds][0];
      familyResolution = "unique_linked_payer_identity";
    } else {
      familyResolution = linkedPayerIds.size || billingPayerIds.size ? "unresolved_multiple_payer_accounts" : "unresolved_no_payer_account";
    }

    let familyExternalId = payerPersonId ? familyExternalIdByPayer.get(payerPersonId) ?? "" : "";
    if (!familyExternalId) {
      familyExternalId = `unresolved-child:${childId}`;
      const lastName = clean(latest["Last Name"] || sourceInfo?.["Last Name"] || sourceSelf?.["Last Name"]) || fullName.split(/\s+/).at(-1) || "ProCare";
      familyPlans.push({ externalId: familyExternalId, name: `${lastName} Family`, address: address(latest) || address(sourceSelf ?? {}), billingEmail: "", payerPersonId: "", accountRows: [], accountInfoRows: [], unresolvedChildExternalId: childId });
    }
    familyResolutionCounts.set(familyResolution, (familyResolutionCounts.get(familyResolution) ?? 0) + 1);

    const classroomExternalId = clean(latest["Classroom ID"] || sourceInfo?.["Classroom ID"] || sourceSelf?.["Classroom ID"]);
    const classroomName = clean(latest["Primary Classroom"] || sourceInfo?.["Primary Classroom"] || sourceSelf?.["Primary Classroom"]);
    const scheduleCandidates = scheduleByChildName.get(childName) ?? [];
    const chosenSchedule = scheduleCandidates.find((candidate) => normalize(candidate.classroom) === normalize(classroomName)) ?? (scheduleCandidates.length === 1 ? scheduleCandidates[0] : null);
    const histories = statusRowsByChild.get(childId) ?? [];
    const sourceStatusValue = clean(latest["Enrollment Status"] || sourceSelf?.["Enrollment Status"] || "Unknown");
    childPlans.push({
      externalId: childId,
      personId: clean(latest["Person ID"] || sourceInfo?.["Person ID"] || sourceSelf?.["Person ID"]),
      fullName,
      lastName: clean(latest["Last Name"] || sourceInfo?.["Last Name"] || sourceSelf?.["Last Name"]),
      dateOfBirth,
      sourceStatus: sourceStatusValue,
      enrollmentStatus: sourceStatus(sourceStatusValue),
      statusDate: parseDateOnly(latest["Status Start Date"] || latest["Status Date"]),
      startDate: sourceStatus(sourceStatusValue) === "enrolled" ? parseDateOnly(latest["Status Start Date"] || latest["Status Date"]) : null,
      classroomExternalId,
      classroomName,
      familyExternalId,
      familyResolution,
      statusHistory: histories.map((row) => ({ status: clean(row["Enrollment Status"]), startsAt: dateOnlyIso(row["Status Start Date"]), endsAt: dateOnlyIso(row["Status End Date"]), classroom: clean(row["Primary Classroom"]) })),
      schedule: chosenSchedule?.schedule ?? null,
      contractBilling: childNameCounts.get(childName) === 1 ? billingItemsByChildName.get(childName) ?? [] : [],
      identificationNumber: clean(latest["Identification Number"] || sourceInfo?.["Identification Number"] || sourceSelf?.["Identification Number"]),
    });
  }

  invariant(heldChildren.length === 7, "Expected seven Tyler children to be held for missing dates of birth.");
  invariant(childPlans.length === 488, "Expected 488 importable Tyler children.");
  invariant(childPlans.filter((child) => child.enrollmentStatus === "enrolled").length === 133, "Expected 133 importable enrolled Tyler children and one enrolled child held for missing DOB.");
  invariant(childPlans.filter((child) => child.contractBilling.length).length === 131, "All 131 billed children must map uniquely to an importable child.");
  const mappedScheduleChildren = childPlans.filter((child) => child.schedule).length;
  invariant(mappedScheduleChildren === 109, `Expected 109 uniquely resolved schedule assignments and one duplicate-name schedule held; mapped ${mappedScheduleChildren}.`);

  const currentChildrenWithoutPayer = childPlans.filter((child) => child.enrollmentStatus === "enrolled" && child.familyExternalId.startsWith("unresolved-child:"));
  invariant(currentChildrenWithoutPayer.length === 0, "A current Tyler child does not have an authoritative payer-family resolution.");

  const classroomPlans = uniqueBy(childPlans.filter((child) => child.classroomExternalId && child.classroomName), (child) => child.classroomExternalId)
    .map((child) => ({ externalId: child.classroomExternalId, name: child.classroomName }));
  invariant(classroomPlans.length === 14, "Expected 14 Tyler classrooms across the current child snapshot.");
  for (const classroom of classroomPlans) {
    invariant(childPlans.filter((child) => child.classroomExternalId === classroom.externalId).every((child) => child.classroomName === classroom.name), `Classroom ${classroom.externalId} has conflicting names.`);
  }

  const importedChildIds = new Set(childPlans.map((child) => child.externalId));
  const sessions = uniqueBy(childTimecards.filter((row) => importedChildIds.has(row["Child ID"])), (row) => [row["Child ID"], row["Punch In Date/Time"], row["Punch Out Date/Time"], row["Classroom ID"]].join("\0"));
  invariant(sessions.length === 35_285, "Expected 35,285 unique Tyler child attendance sessions.");
  invariant(sessions.every((row) => parseLocalDateTime(row["Punch In Date/Time"]) && parseLocalDateTime(row["Punch Out Date/Time"])), "A Tyler child time card has an invalid or open punch.");
  const attendanceDays = uniqueBy(sessions, (row) => `${row["Child ID"]}\0${row["Punch In Date"]}`);
  invariant(attendanceDays.length === 34_956, "Expected 34,956 importable Tyler child attendance days.");

  const balanceCents = familyPlans.filter((family) => family.accountRows.length).reduce((sum, family) => sum + family.accountRows.reduce((familySum, row) => familySum + parseMoneyCents(row.Balance), 0), 0);
  invariant(balanceCents === 327_700, "Expected the Tyler account balances to net to $3,277.00.");

  return {
    inventory,
    accounts,
    accountInfo,
    relationships,
    relationshipsByChild,
    familyPlans,
    childPlans,
    heldChildren,
    classroomPlans,
    sessions,
    attendanceDays,
    employeeInfo,
    employeeTimecards,
    familyResolutionCounts: Object.fromEntries([...familyResolutionCounts].sort()),
    balanceCents,
  };
}

type ImportPlan = ReturnType<typeof buildPlan>;

async function readState() {
  const centers = await prisma.center.findMany({
    where: { crmLocationId: CENTER_LOCATION_ID },
    take: 2,
    select: { id: true, name: true, status: true, timezone: true, organization: { select: { tenantId: true } } },
  });
  invariant(centers.length === 1, `Expected exactly one ${CENTER_LOCATION_ID} center; found ${centers.length}.`);
  const center = centers[0];
  invariant(center.name === CENTER_NAME, `Expected ${CENTER_NAME}; found ${center.name}.`);
  invariant(center.status === "active", `Expected Tyler to be active; found ${center.status}.`);
  invariant(center.timezone === CENTER_TIME_ZONE, `Expected Tyler timezone ${CENTER_TIME_ZONE}; found ${center.timezone}.`);
  const [families, children, classrooms, guardians, emergencyContacts, pickups, billingAccounts, invoices, payments, ledgerEntries, attendance, checkLogs, staff, accessGrants, batches] = await Promise.all([
    prisma.family.count({ where: { centerId: center.id } }),
    prisma.child.count({ where: { family: { centerId: center.id } } }),
    prisma.classroom.count({ where: { centerId: center.id } }),
    prisma.guardian.count({ where: { family: { centerId: center.id } } }),
    prisma.emergencyContact.count({ where: { family: { centerId: center.id } } }),
    prisma.authorizedPickup.count({ where: { family: { centerId: center.id } } }),
    prisma.billingAccount.count({ where: { family: { centerId: center.id } } }),
    prisma.invoice.count({ where: { billingAccount: { family: { centerId: center.id } } } }),
    prisma.payment.count({ where: { billingAccount: { family: { centerId: center.id } } } }),
    prisma.ledgerEntry.count({ where: { billingAccount: { family: { centerId: center.id } } } }),
    prisma.attendanceRecord.count({ where: { child: { family: { centerId: center.id } } } }),
    prisma.checkInOutLog.count({ where: { centerId: center.id } }),
    prisma.staffProfile.count({ where: { centerId: center.id } }),
    prisma.userAccessGrant.count({ where: { centerId: center.id } }),
    prisma.procareImportBatch.findMany({ where: { centerId: center.id }, select: { id: true, filename: true, status: true, summary: true, _count: { select: { rows: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const statusCounts = await prisma.child.groupBy({ by: ["enrollmentStatus"], where: { family: { centerId: center.id } }, _count: { _all: true } });
  const balance = await prisma.billingAccount.aggregate({ where: { family: { centerId: center.id } }, _sum: { balanceCents: true } });
  return {
    center,
    counts: { families, children, classrooms, guardians, emergencyContacts, pickups, billingAccounts, invoices, payments, ledgerEntries, attendance, checkLogs, staff, accessGrants },
    statusCounts: Object.fromEntries(statusCounts.map((row) => [row.enrollmentStatus, row._count._all])),
    balanceCents: balance._sum.balanceCents ?? 0,
    batches,
  };
}

function publicPlan(plan: ImportPlan) {
  const sourceStatuses = new Map<string, number>();
  for (const child of plan.childPlans) sourceStatuses.set(child.enrollmentStatus, (sourceStatuses.get(child.enrollmentStatus) ?? 0) + 1);
  const payerFamilies = plan.familyPlans.filter((family) => family.accountRows.length);
  return {
    sourceFiles: Object.fromEntries(Object.entries(plan.inventory).map(([key, item]) => [key, { filename: SOURCE_FILES[key as SourceKey].name, sha256: item.sha256, rows: item.rows }])),
    sourceCoverage: {
      accountRows: plan.accounts.length,
      distinctPayerFamilies: payerFamilies.length,
      relationshipRows: plan.relationships.length,
      importableChildren: plan.childPlans.length,
      heldChildren: plan.heldChildren.length,
      currentChildren: plan.childPlans.filter((child) => child.enrollmentStatus === "enrolled").length,
      billedChildren: plan.childPlans.filter((child) => child.contractBilling.length).length,
      scheduledChildren: plan.childPlans.filter((child) => child.schedule).length,
      classrooms: plan.classroomPlans.length,
      attendanceSessions: plan.sessions.length,
      attendanceDays: plan.attendanceDays.length,
      employeeRowsHeld: plan.employeeInfo.length,
      employeeTimecardsHeld: plan.employeeTimecards.length,
    },
    target: {
      families: plan.familyPlans.length,
      children: plan.childPlans.length,
      classrooms: plan.classroomPlans.length,
      billingAccounts: payerFamilies.length,
      balanceCents: plan.balanceCents,
      attendanceRecords: plan.attendanceDays.length,
      checkLogs: plan.sessions.length * 2,
      statuses: Object.fromEntries([...sourceStatuses].sort()),
    },
    familyResolution: plan.familyResolutionCounts,
    heldChildren: plan.heldChildren.map((child) => ({ sourceStatus: child.sourceStatus, reason: child.reason })),
    gates: {
      recurringTuitionEnabled: false,
      paymentsCreated: false,
      chargesCreated: false,
      invitationsSent: false,
      identitiesCreated: false,
      accessChanged: false,
      employeeDataImported: false,
      ssnDataStored: false,
    },
  };
}

async function applyPlan(plan: ImportPlan, initial: Awaited<ReturnType<typeof readState>>) {
  const initialCounts = initial.counts;
  invariant(initialCounts.families === 0 && initialCounts.children === 0 && initialCounts.classrooms === 0, "Tyler family, child, or classroom state changed after the dry-run audit.");
  invariant(initialCounts.billingAccounts === 0 && initialCounts.invoices === 0 && initialCounts.payments === 0 && initialCounts.ledgerEntries === 0, "Tyler billing state changed after the dry-run audit.");
  invariant(initialCounts.attendance === 0 && initialCounts.checkLogs === 0 && initial.batches.length === 0, "Tyler import or attendance state changed after the dry-run audit.");
  const importedAt = new Date();
  const sourceExportedAt = plan.inventory.accountBalance.modifiedAt;

  return prisma.$transaction(async (tx) => {
    const classroomIdByExternalId = new Map<string, string>();
    for (const classroom of plan.classroomPlans) {
      const created = await tx.classroom.create({
        data: {
          centerId: initial.center.id,
          name: classroom.name,
          ageGroup: classroom.name,
          capacity: 0,
          sourceSystem: SOURCE_SYSTEM,
          externalId: classroom.externalId,
          customFields: { source: IMPORT_SOURCE, sourceCapacityUnavailable: true, importedAt: importedAt.toISOString() },
        },
        select: { id: true },
      });
      classroomIdByExternalId.set(classroom.externalId, created.id);
    }

    const familyIdByExternalId = new Map<string, string>();
    for (const family of plan.familyPlans) {
      const sourceAccountIds = family.accountRows.map((row) => row["Account ID"]);
      const created = await tx.family.create({
        data: {
          centerId: initial.center.id,
          name: family.name,
          address: family.address || null,
          billingEmail: family.billingEmail || null,
          sourceSystem: SOURCE_SYSTEM,
          externalId: family.externalId,
          customFields: {
            source: IMPORT_SOURCE,
            sourceAccountIds,
            sourceAccountKeys: family.accountRows.map((row) => row["Account Key"]).filter(Boolean),
            payerPersonId: family.payerPersonId || null,
            unresolvedChildExternalId: family.unresolvedChildExternalId || null,
            accountInformation: family.accountInfoRows.map((row) => ({
              accountId: row["Account ID"],
              comment: row.Comment,
              alert: row.Alert,
              immunization: row.Immunization,
              religiousExempt: row["Religious Exempt"],
              k12: row["K-12"],
              schoolAge: row["School age"],
              physical: row.Physical,
            })),
            accessCreated: false,
            invitationsSent: false,
            importedAt: importedAt.toISOString(),
          } as Prisma.InputJsonObject,
        },
        select: { id: true },
      });
      familyIdByExternalId.set(family.externalId, created.id);
    }

    const childIdByExternalId = new Map<string, string>();
    for (const child of plan.childPlans) {
      const familyId = familyIdByExternalId.get(child.familyExternalId);
      invariant(familyId, `Missing target family for child ${child.externalId}.`);
      const classroomId = child.enrollmentStatus === "enrolled" ? classroomIdByExternalId.get(child.classroomExternalId) ?? null : null;
      const created = await tx.child.create({
        data: {
          familyId,
          classroomId,
          fullName: child.fullName,
          dateOfBirth: child.dateOfBirth!,
          ageGroup: child.classroomName || "Unassigned",
          enrollmentStatus: child.enrollmentStatus,
          startDate: child.startDate,
          schedule: child.schedule ? child.schedule as Prisma.InputJsonObject : Prisma.JsonNull,
          sourceSystem: SOURCE_SYSTEM,
          externalId: child.externalId,
          customFields: {
            source: IMPORT_SOURCE,
            sourcePersonId: child.personId,
            sourceIdentificationNumber: child.identificationNumber || null,
            sourceEnrollmentStatus: child.sourceStatus,
            sourceStatusDate: child.statusDate?.toISOString() ?? null,
            sourceClassroomId: child.classroomExternalId || null,
            sourceClassroomName: child.classroomName || null,
            familyResolution: child.familyResolution,
            statusHistory: child.statusHistory,
            procareContractBillingSnapshot: child.contractBilling.length ? { asOf: BILLING_AS_OF, items: child.contractBilling } : null,
            tuitionBillingEnabled: false,
            tuitionAutobillEligible: false,
            accessCreated: false,
            invitationsSent: false,
            importedAt: importedAt.toISOString(),
          } as Prisma.InputJsonObject,
        },
        select: { id: true },
      });
      childIdByExternalId.set(child.externalId, created.id);
    }

    const childrenByFamily = new Map<string, ChildPlan[]>();
    for (const child of plan.childPlans) childrenByFamily.set(child.familyExternalId, [...(childrenByFamily.get(child.familyExternalId) ?? []), child]);
    const guardianRows: Prisma.GuardianCreateManyInput[] = [];
    const emergencyRows: Prisma.EmergencyContactCreateManyInput[] = [];
    const pickupRows: Prisma.AuthorizedPickupCreateManyInput[] = [];

    for (const family of plan.familyPlans) {
      const familyId = familyIdByExternalId.get(family.externalId)!;
      const related = uniqueBy((childrenByFamily.get(family.externalId) ?? []).flatMap((child) => plan.relationshipsByChild.get(child.externalId) ?? []), (row) => clean(row["Person ID"]) || clean(row["Row ID"]));
      const payerAccount = family.accountRows[0];
      if (payerAccount) {
        const relationship = related.find((row) => row["Person ID"] === family.payerPersonId);
        guardianRows.push({
          familyId,
          fullName: displayName(payerAccount["Full Name"]),
          email: clean(payerAccount.Email) || null,
          phone: phone(payerAccount) || null,
          relation: clean(relationship?.["Relationship Type"]) || "Payer",
          isBillingContact: true,
          sourceSystem: SOURCE_SYSTEM,
          externalId: family.payerPersonId,
          customFields: { source: IMPORT_SOURCE, livesWith: relationship ? checked(relationship["Lives With"]) : null, accessCreated: false, importedAt: importedAt.toISOString() },
        });
      }
      for (const relationship of related) {
        const personId = clean(relationship["Person ID"]);
        const relation = clean(relationship["Relationship Type"]) || "Unknown";
        const fullName = displayName(relationship["Full Name"]);
        if (!personId || !fullName) continue;
        const metadata = { source: IMPORT_SOURCE, sourceRelationshipRowId: clean(relationship["Row ID"]) || null, livesWith: checked(relationship["Lives With"]), accessCreated: false, importedAt: importedAt.toISOString() };
        const isGuardian = personId === family.payerPersonId || /\b(mom|mother|dad|father|parent|guardian|foster|step[- ]?mom|step[- ]?dad|stepmother|stepfather)\b/i.test(relation);
        if (isGuardian && personId !== family.payerPersonId) guardianRows.push({ familyId, fullName, email: clean(relationship.Email) || null, phone: phone(relationship) || null, relation, isBillingContact: false, sourceSystem: SOURCE_SYSTEM, externalId: personId, customFields: metadata });
        if (checked(relationship.Emergency)) emergencyRows.push({ familyId, fullName, phone: phone(relationship) || "Not imported", relation, sourceSystem: SOURCE_SYSTEM, externalId: personId, customFields: metadata });
        if (checked(relationship["Authorized Pickup"])) pickupRows.push({ familyId, fullName, phone: phone(relationship) || null, relation, verificationNotes: "Imported from ProCare; director should verify identity requirements.", sourceSystem: SOURCE_SYSTEM, externalId: personId, customFields: metadata });
      }
    }

    const uniqueGuardians = uniqueBy(guardianRows, (row) => `${row.familyId}\0${row.externalId}`);
    const uniqueEmergency = uniqueBy(emergencyRows, (row) => `${row.familyId}\0${row.externalId}`);
    const uniquePickups = uniqueBy(pickupRows, (row) => `${row.familyId}\0${row.externalId}`);
    for (const rows of chunk(uniqueGuardians)) await tx.guardian.createMany({ data: rows });
    for (const rows of chunk(uniqueEmergency)) await tx.emergencyContact.createMany({ data: rows });
    for (const rows of chunk(uniquePickups)) await tx.authorizedPickup.createMany({ data: rows });

    let positiveInvoices = 0;
    for (const family of plan.familyPlans.filter((candidate) => candidate.accountRows.length)) {
      const familyId = familyIdByExternalId.get(family.externalId)!;
      const familyBalanceCents = family.accountRows.reduce((sum, row) => sum + parseMoneyCents(row.Balance), 0);
      const account = await tx.billingAccount.create({
        data: {
          familyId,
          balanceCents: familyBalanceCents,
          autopayPlaceholder: false,
          ledgerSyncedAt: sourceExportedAt,
          sourceSystem: SOURCE_SYSTEM,
          externalId: family.externalId,
          customFields: {
            source: IMPORT_SOURCE,
            sourceAccountBalances: family.accountRows.map((row) => ({ accountId: row["Account ID"], accountKey: row["Account Key"], balanceCents: parseMoneyCents(row.Balance) })),
            sourceExportedAt: sourceExportedAt.toISOString(),
            autopayEnabled: false,
            chargesCreated: false,
          } as Prisma.InputJsonObject,
        },
        select: { id: true },
      });
      let invoiceId: string | null = null;
      if (familyBalanceCents > 0) {
        const invoice = await tx.invoice.create({
          data: {
            billingAccountId: account.id,
            number: `PC-TYLER-${stableId(family.externalId).slice(0, 16).toUpperCase()}`,
            status: PaymentStatus.OPEN,
            dueDate: sourceExportedAt,
            totalCents: familyBalanceCents,
            sourceSystem: SOURCE_SYSTEM,
            externalId: `procare-opening-balance:${CENTER_LOCATION_ID}:${family.externalId}`,
            customFields: { source: IMPORT_SOURCE, sourceDueDateUnavailable: true, sourceExportedAt: sourceExportedAt.toISOString(), chargesCreated: false },
            items: { create: [{ description: "Imported ProCare opening balance", amountCents: familyBalanceCents }] },
          },
          select: { id: true },
        });
        invoiceId = invoice.id;
        positiveInvoices += 1;
      }
      await tx.ledgerEntry.create({
        data: {
          billingAccountId: account.id,
          invoiceId,
          type: "procare_balance",
          description: "Imported ProCare balance",
          amountCents: familyBalanceCents,
          balanceAfterCents: familyBalanceCents,
          effectiveAt: sourceExportedAt,
          sourceSystem: SOURCE_SYSTEM,
          externalId: `procare-opening-balance:${CENTER_LOCATION_ID}:${family.externalId}`,
          metadata: { source: IMPORT_SOURCE, sourceAccountIds: family.accountRows.map((row) => row["Account ID"]), sourceExportedAt: sourceExportedAt.toISOString() },
        },
      });
    }

    const attendanceRows: Prisma.AttendanceRecordCreateManyInput[] = plan.attendanceDays.map((row) => {
      const childId = childIdByExternalId.get(row["Child ID"]);
      invariant(childId, `Missing child for attendance row ${row["Child ID"]}.`);
      const date = parseDateOnly(row["Punch In Date"]);
      invariant(date, "Invalid attendance date.");
      const classroomId = classroomIdByExternalId.get(row["Classroom ID"]) ?? null;
      return {
        childId,
        classroomId,
        date,
        status: "present",
        sourceSystem: SOURCE_SYSTEM,
        externalId: `tyler:${row["Child ID"]}:${row["Punch In Date"]}`,
        metadata: { source: IMPORT_SOURCE, sourceClassroomId: row["Classroom ID"] || null, sourceClassroomName: row.Classroom || null },
      };
    });
    for (const rows of chunk(attendanceRows)) await tx.attendanceRecord.createMany({ data: rows });

    const checkRows: Prisma.CheckInOutLogCreateManyInput[] = [];
    for (const row of plan.sessions) {
      const childId = childIdByExternalId.get(row["Child ID"]);
      invariant(childId, `Missing child for check log ${row["Child ID"]}.`);
      const classroomId = classroomIdByExternalId.get(row["Classroom ID"]) ?? null;
      const checkInAt = parseLocalDateTime(row["Punch In Date/Time"]);
      const checkOutAt = parseLocalDateTime(row["Punch Out Date/Time"]);
      invariant(checkInAt && checkOutAt, "A validated Tyler attendance session could not be parsed.");
      invariant(checkOutAt.valueOf() >= checkInAt.valueOf(), "A Tyler checkout occurs before its matching check-in.");
      const effectiveCheckOutAt = checkOutAt.valueOf() === checkInAt.valueOf()
        ? new Date(checkOutAt.valueOf() + 1)
        : checkOutAt;
      const sessionId = stableId(row["Child ID"], row["Punch In Date/Time"], row["Punch Out Date/Time"], row["Classroom ID"]).slice(0, 32);
      const common = {
        childId,
        centerId: initial.center.id,
        classroomId,
        signaturePlaceholder: false,
        verificationStatus: "imported_from_procare",
        pinVerified: false,
        sourceSystem: SOURCE_SYSTEM,
        metadata: {
          source: IMPORT_SOURCE,
          sourceSessionId: sessionId,
          sourceClassroomId: row["Classroom ID"] || null,
          sourceDepartmentId: row["Department ID"] || null,
          sourcePunchInDateTime: row["Punch In Date/Time"],
          sourcePunchOutDateTime: row["Punch Out Date/Time"],
          equalTimestampTieBreakMilliseconds: checkOutAt.valueOf() === checkInAt.valueOf() ? 1 : 0,
        },
      };
      checkRows.push({ ...common, type: "check_in", occurredAt: checkInAt, pickupName: clean(row["Checked In By"]) || null, externalId: `tyler:${sessionId}:in` });
      checkRows.push({ ...common, type: "check_out", occurredAt: effectiveCheckOutAt, pickupName: clean(row["Checked Out By"]) || null, externalId: `tyler:${sessionId}:out` });
    }
    for (const rows of chunk(checkRows)) await tx.checkInOutLog.createMany({ data: rows });

    const summary = {
      source: IMPORT_SOURCE,
      plan: publicPlan(plan),
      results: {
        families: plan.familyPlans.length,
        children: plan.childPlans.length,
        classrooms: plan.classroomPlans.length,
        guardians: uniqueGuardians.length,
        emergencyContacts: uniqueEmergency.length,
        authorizedPickups: uniquePickups.length,
        billingAccounts: plan.familyPlans.filter((family) => family.accountRows.length).length,
        positiveInvoices,
        ledgerEntries: plan.familyPlans.filter((family) => family.accountRows.length).length,
        attendanceRecords: attendanceRows.length,
        checkLogs: checkRows.length,
      },
      preserved: { staffProfiles: initialCounts.staff, accessGrants: initialCounts.accessGrants },
      importedAt: importedAt.toISOString(),
    };
    const batch = await tx.procareImportBatch.create({
      data: {
        centerId: initial.center.id,
        filename: "Tyler ProCare cross-report export (10 files)",
        status: "completed_with_held_rows",
        summary: summary as Prisma.InputJsonObject,
        rows: {
          create: (Object.entries(plan.inventory) as Array<[SourceKey, SourceInventory[SourceKey]]>).map(([key, item], index) => ({
            rowNumber: index + 1,
            status: "source_verified",
            message: `${SOURCE_FILES[key].name}: ${item.rows} rows verified`,
            rawData: { sourceKey: key, filename: SOURCE_FILES[key].name, sha256: item.sha256, rows: item.rows, piiStoredInImportRow: false },
          })),
        },
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        tenantId: initial.center.organization.tenantId,
        centerId: initial.center.id,
        action: "procare.tyler_cross_report.imported",
        resource: "ProcareImportBatch",
        resourceId: batch.id,
        metadata: summary as Prisma.InputJsonObject,
      },
    });
    return { batchId: batch.id, ...summary.results };
  }, { maxWait: 20_000, timeout: 600_000 });
}

async function main() {
  const { inventory, tables } = loadSources();
  const plan = buildPlan(tables, inventory);
  const initial = await readState();
  const priorBatch = initial.batches.find((batch) => batch.filename === "Tyler ProCare cross-report export (10 files)" && batch.status === "completed_with_held_rows");
  if (priorBatch) {
    console.log(JSON.stringify({ ok: true, applied: false, alreadyImported: true, state: { counts: initial.counts, statusCounts: initial.statusCounts, balanceCents: initial.balanceCents, importBatchRows: priorBatch._count.rows } }, null, 2));
    return;
  }
  const apply = process.argv.includes("--apply");
  if (!apply) {
    console.log(JSON.stringify({ ok: true, dryRun: true, plan: publicPlan(plan), liveBefore: { counts: initial.counts, statusCounts: initial.statusCounts, balanceCents: initial.balanceCents, importBatches: initial.batches.length } }, null, 2));
    return;
  }
  invariant(process.argv.includes("--confirm-tx-tyler"), "Apply mode requires --confirm-tx-tyler.");
  const result = await applyPlan(plan, initial);
  const final = await readState();
  const target = publicPlan(plan).target;
  invariant(final.counts.families === target.families, `Expected ${target.families} families; found ${final.counts.families}.`);
  invariant(final.counts.children === target.children, `Expected ${target.children} children; found ${final.counts.children}.`);
  invariant(final.counts.classrooms === target.classrooms, `Expected ${target.classrooms} classrooms; found ${final.counts.classrooms}.`);
  invariant(final.counts.billingAccounts === target.billingAccounts, `Expected ${target.billingAccounts} billing accounts; found ${final.counts.billingAccounts}.`);
  invariant(final.counts.attendance === target.attendanceRecords, `Expected ${target.attendanceRecords} attendance records; found ${final.counts.attendance}.`);
  invariant(final.counts.checkLogs === target.checkLogs, `Expected ${target.checkLogs} check logs; found ${final.counts.checkLogs}.`);
  invariant(final.balanceCents === target.balanceCents, `Expected net balance ${target.balanceCents}; found ${final.balanceCents}.`);
  invariant(final.counts.payments === 0, "The Tyler import must not create payments.");
  invariant(final.counts.staff === initial.counts.staff && final.counts.accessGrants === initial.counts.accessGrants, "Staff or access state changed unexpectedly.");
  console.log(JSON.stringify({ ok: true, applied: true, result, state: { counts: final.counts, statusCounts: final.statusCounts, balanceCents: final.balanceCents, importBatches: final.batches.map((batch) => ({ status: batch.status, rows: batch._count.rows })) }, heldChildren: plan.heldChildren.map((child) => ({ sourceStatus: child.sourceStatus, reason: child.reason })), gates: publicPlan(plan).gates }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
