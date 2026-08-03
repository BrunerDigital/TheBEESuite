import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ewec5003q6alwuwmakk73";
const CENTER_NAME = "Kid City USA - Jasper - Truman";
const CENTER_LOCATION = "Kid City USA - IN | Jasper - Truman";
const CENTER_TIME_ZONE = "America/Indiana/Indianapolis";
const SOURCE_SYSTEM = "procare";
const IMPORT_SOURCE = "jasper_procare_completion_2026_08_01";
const BATCH_FILENAME = "Jasper ProCare completion import (10 files)";
const BILLING_AS_OF = "2026-08-02";

const SOURCE_FILES = {
  accountBalance: ["KCU Jasper Account Balance Summery.csv", "7A5270A1462D4CC94868457A86B64B7CC764A0C2C6F563BB8EE918C3ADE16770", 1018],
  accountInfo: ["KCU Jasper Account Information User Defined.csv", "169897CF4120D85B37195C01325577874CD4C48C68AAF5901D481080AAD67BC4", 1018],
  enrollment: ["KCU Jasper Child All Enrollment Status.csv", "52BE4706F96F1CB8FE87A23F2A426375125C98FDDF20E36C8A8E6EA04618A81D", 3236],
  contractBilling: ["KCU Jasper Child Contract Billing Summery.csv", "E60F669739E26634774DE86B1D8BC87FB40098C1648F6D6D11E5C93AFF806B3A", 158],
  childInfo: ["KCU Jasper Child Information Tracking.csv", "43DA7E72D928FB539284D15A77C06AC3DA91A17FBB2067C877C73E6222DEBB0A", 1341],
  relationships: ["KCU Jasper Child Relationships.csv", "30FE4FB673D1699A5E81B60919C6EACB21C87EB91C6025AAA308457CCB8AFBED", 3728],
  childTimecards: ["KCU Jasper Child Time Cards.csv", "923B36B5BB431613542756CA1B9DEAAEA65637E3637342D7DEC19BF55068EEDE", 32767],
  classroomSchedule: ["KCU Jasper Classroom Schedule Summery Weekly.csv", "EBD1A00F9250E5AAE502DFF14A0B4DE68C993AE190F6467D2F76BE8E93E811BD", 510],
  employeeInfo: ["KCU Jasper Employee Information Tracking.csv", "6149B2C7FAA1A4C44178C2527E3D40CF255FAC15ED228B8F3E80354B45E8144C", 163],
  employeeTimecards: ["KCU Jasper Employee Time Cards.csv", "D23DA04E08E12779ED52B5694B1C4DBEFE23826EF38440D1C2618FF777DE5F22", 1],
} as const;

type SourceKey = keyof typeof SOURCE_FILES;
type CsvRow = Record<string, string>;
type CsvTable = { headers: string[]; rows: CsvRow[]; matrix: string[][] };
type SourceInventory = Record<SourceKey, { filename: string; sha256: string; rows: number; modifiedAt: Date }>;

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function normalizedKey(value: unknown) {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function displayName(value: unknown) {
  const parts = clean(value).split(",").map((part) => part.trim());
  return parts.length > 1 ? `${parts.slice(1).join(" ")} ${parts[0]}`.replace(/\s+/g, " ").trim() : clean(value);
}

function stableId(...parts: string[]) {
  return createHash("sha256").update(parts.map(normalize).join("\0")).digest("hex");
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
  invariant(!quoted, "A Jasper CSV contains an unterminated quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function table(buffer: Buffer): CsvTable {
  const matrix = parseCsv(buffer.toString("utf8"));
  const headers = (matrix[0] ?? []).map((item) => item.replace(/^\ufeff/, "").trim());
  return {
    headers,
    matrix,
    rows: matrix.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, clean(row[index])]))),
  };
}

function parseDate(value: unknown) {
  const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  const result = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return Number.isNaN(result.valueOf()) ? null : result;
}

function checked(value: unknown) {
  return /^(checked|true|yes|y|1|x)$/i.test(clean(value));
}

function phone(row: CsvRow) {
  return [row["Phone 1"], row["Phone 2"], row["Phone 3"], row["Phone 4"], row["Phone 5"]].map(clean).find(Boolean) ?? "";
}

function address(row: CsvRow) {
  const city = [row["Add 1, City"], row["Add 1, Region"], row["Add 1, Postal Code"]].filter(Boolean).join(" ");
  return [row["Add 1, Line 1"], row["Add 1, Line 2"], city].filter(Boolean).join("\n");
}

function sourceStatus(value: unknown) {
  const status = normalize(value);
  if (status === "enrolled") return "enrolled";
  if (status === "withdrawn") return "withdrawn";
  if (status.startsWith("waiting list")) return "waitlisted";
  return status.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "unknown";
}

function chunk<T>(values: T[], size = 500) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  const result = new Map<string, T>();
  for (const value of values) if (!result.has(key(value))) result.set(key(value), value);
  return [...result.values()];
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

function zonedParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTER_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function parseLocalDateTime(value: unknown) {
  const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;
  const [, month, day, year, hourText, minute, second = "0", meridiem] = match;
  let hour = Number(hourText) % 12;
  if (meridiem.toUpperCase() === "PM") hour += 12;
  const desired = Date.UTC(Number(year), Number(month) - 1, Number(day), hour, Number(minute), Number(second));
  let result = new Date(desired);
  for (let iteration = 0; iteration < 2; iteration += 1) result = new Date(desired - (zonedParts(result) - result.valueOf()));
  return Number.isNaN(result.valueOf()) ? null : result;
}

function loadSources() {
  const sourceDir = process.env.JASPER_PROCARE_SOURCE_DIR?.trim() || "C:/Users/brend/AppData/Local/Temp";
  const tables = {} as Record<SourceKey, CsvTable>;
  const inventory = {} as SourceInventory;
  for (const [key, [filename, expectedHash, expectedRows]] of Object.entries(SOURCE_FILES) as Array<[SourceKey, (typeof SOURCE_FILES)[SourceKey]]>) {
    const path = join(sourceDir, filename);
    const buffer = readFileSync(path);
    const hash = createHash("sha256").update(buffer).digest("hex").toUpperCase();
    invariant(hash === expectedHash, `${filename} does not match its reviewed hash.`);
    const parsed = table(buffer);
    const rows = key === "contractBilling" || key === "classroomSchedule" ? parsed.matrix.length : parsed.rows.length;
    invariant(rows === expectedRows, `${filename} expected ${expectedRows} rows; found ${rows}.`);
    tables[key] = parsed;
    inventory[key] = { filename, sha256: hash, rows, modifiedAt: statSync(path).mtime };
  }
  return { tables, inventory };
}

async function readState() {
  const center = await prisma.center.findUnique({ where: { id: CENTER_ID }, select: { id: true, name: true, locationId: true, status: true, timezone: true, organization: { select: { tenantId: true } } } });
  invariant(center?.name === CENTER_NAME && center.locationId === CENTER_LOCATION && center.status === "active" && center.timezone === CENTER_TIME_ZONE, "Jasper production center identity/status/timezone mismatch.");
  const familyScope = { centerId: CENTER_ID } as const;
  const childScope = { family: familyScope } as const;
  const billingScope = { family: familyScope } as const;
  const [families, children, classrooms, guardians, emergencies, pickups, billingAccounts, invoices, payments, ledgerEntries, attendance, checkLogs, messages, documents, notes, surveys, refunds, deletions, setupTokens, accessGrants, users, batches] = await Promise.all([
    prisma.family.findMany({ where: familyScope, select: { id: true, name: true, externalId: true, sourceSystem: true, customFields: true } }),
    prisma.child.findMany({ where: childScope, select: { id: true, familyId: true, externalId: true, sourceSystem: true, customFields: true } }),
    prisma.classroom.findMany({ where: { centerId: CENTER_ID }, select: { id: true, externalId: true, name: true, sourceSystem: true } }),
    prisma.guardian.findMany({ where: { family: familyScope }, select: { id: true, familyId: true, externalId: true, isBillingContact: true, userId: true } }),
    prisma.emergencyContact.findMany({ where: { family: familyScope }, select: { id: true, familyId: true, externalId: true } }),
    prisma.authorizedPickup.findMany({ where: { family: familyScope }, select: { id: true, familyId: true, externalId: true } }),
    prisma.billingAccount.count({ where: billingScope }), prisma.invoice.count({ where: { billingAccount: billingScope } }), prisma.payment.count({ where: { billingAccount: billingScope } }), prisma.ledgerEntry.count({ where: { billingAccount: billingScope } }),
    prisma.attendanceRecord.count({ where: { child: childScope } }), prisma.checkInOutLog.count({ where: { centerId: CENTER_ID } }), prisma.message.count({ where: { family: familyScope } }), prisma.document.count({ where: { family: familyScope } }), prisma.note.count({ where: { family: familyScope } }), prisma.surveyResponse.count({ where: { family: familyScope } }), prisma.refundRequest.count({ where: { family: familyScope } }), prisma.dataDeletionRequest.count({ where: { family: familyScope } }), prisma.parentPortalSetupToken.count({ where: { centerId: CENTER_ID } }), prisma.userAccessGrant.count({ where: { centerId: CENTER_ID } }), prisma.user.count({ where: { guardians: { some: { family: familyScope } } } }), prisma.procareImportBatch.findMany({ where: { centerId: CENTER_ID }, select: { id: true, filename: true, status: true, _count: { select: { rows: true } } } }),
  ]);
  const counts = { families: families.length, children: children.length, classrooms: classrooms.length, guardians: guardians.length, emergencies: emergencies.length, pickups: pickups.length, billingAccounts, invoices, payments, ledgerEntries, attendance, checkLogs, messages, documents, notes, surveys, refunds, deletions, setupTokens, accessGrants, users, batches: batches.length };
  const fingerprint = stableId(JSON.stringify({ counts, families: families.map((item) => [item.id, item.externalId]).sort(), children: children.map((item) => [item.id, item.externalId, item.familyId]).sort(), guardians: guardians.map((item) => item.id).sort(), emergencies: emergencies.map((item) => item.id).sort(), pickups: pickups.map((item) => item.id).sort(), batches: batches.map((item) => item.id).sort() }));
  return { center, families, children, classrooms, guardians, emergencies, pickups, batches, counts, fingerprint };
}

type State = Awaited<ReturnType<typeof readState>>;

function buildPlan(tables: Record<SourceKey, CsvTable>, inventory: SourceInventory, state: State) {
  invariant(state.counts.families === 605 && state.counts.children === 899 && state.counts.guardians === 745 && state.counts.emergencies === 1345 && state.counts.pickups === 1379 && state.counts.batches === 7, "Jasper family/relationship/import counts changed from the reviewed starting point.");
  invariant(state.counts.billingAccounts === 0 && state.counts.invoices === 0 && state.counts.payments === 0 && state.counts.ledgerEntries === 0, "Jasper billing state is no longer empty.");
  invariant(state.counts.attendance === 0 && state.counts.checkLogs === 0, "Jasper attendance state is no longer empty.");
  invariant(state.counts.messages === 0 && state.counts.documents === 0 && state.counts.notes === 0 && state.counts.surveys === 0 && state.counts.refunds === 0 && state.counts.deletions === 0 && state.counts.setupTokens === 0 && state.counts.users === 0, "Jasper dependent or identity state changed.");

  const accounts = tables.accountBalance.rows;
  const accountInfo = tables.accountInfo.rows;
  const enrollment = tables.enrollment.rows;
  const childInfo = tables.childInfo.rows;
  const relationships = tables.relationships.rows;
  const childTimecards = tables.childTimecards.rows;
  const accountById = new Map(accounts.map((row) => [row["Account ID"], row]));
  const infoByAccount = new Map(accountInfo.map((row) => [row["Account ID"], row]));
  invariant(accountById.size === 1018 && infoByAccount.size === 1018 && [...accountById.keys()].every((id) => infoByAccount.has(id)), "Jasper account exports do not cover the same 1,018 accounts.");
  const accountsByPerson = new Map<string, Set<string>>();
  const accountByLabel = new Map<string, Set<string>>();
  const accountByEmail = new Map<string, Set<string>>();
  const accountByPhone = new Map<string, Set<string>>();
  for (const row of accounts) {
    const accountId = row["Account ID"];
    const personId = row["Person ID"];
    accountsByPerson.set(personId, new Set([...(accountsByPerson.get(personId) ?? []), accountId]));
    const payer = [row["First Name"], row["Middle Initial"], row["Last Name"]].filter(Boolean).join(" ");
    const label = `${normalizedKey(row["Account Key"])}|${normalizedKey(payer)}`;
    accountByLabel.set(label, new Set([...(accountByLabel.get(label) ?? []), accountId]));
    const email = normalize(row.Email);
    if (email) accountByEmail.set(email, new Set([...(accountByEmail.get(email) ?? []), accountId]));
    for (const key of ["Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5"]) {
      const value = clean(row[key]).replace(/\D/g, "");
      if (value.length >= 7) accountByPhone.set(value, new Set([...(accountByPhone.get(value) ?? []), accountId]));
    }
  }

  const selfByChild = new Map<string, CsvRow>();
  for (const row of relationships.filter((item) => normalize(item["Person Type"]) === "child")) {
    const prior = selfByChild.get(row["Child ID"]);
    if (!prior || (!parseDate(prior["Date of Birth"]) && parseDate(row["Date of Birth"]))) selfByChild.set(row["Child ID"], row);
  }
  const relatedByChild = new Map<string, CsvRow[]>();
  for (const row of relationships.filter((item) => normalize(item["Person Type"]) === "relationship")) relatedByChild.set(row["Child ID"], [...(relatedByChild.get(row["Child ID"]) ?? []), row]);
  const childInfoById = new Map(childInfo.map((row) => [row["Child ID"], row]));
  const statusRowsByChild = new Map<string, CsvRow[]>();
  for (const row of enrollment) statusRowsByChild.set(row["Child ID"], [...(statusRowsByChild.get(row["Child ID"]) ?? []), row]);
  const latestByChild = new Map<string, CsvRow>();
  for (const [childId, rows] of statusRowsByChild) latestByChild.set(childId, [...rows].sort((a, b) => (parseDate(b["Status Start Date"])?.valueOf() ?? 0) - (parseDate(a["Status Start Date"])?.valueOf() ?? 0))[0]);
  invariant(childInfoById.size === 1341 && latestByChild.size === 1341, "Jasper child source coverage changed.");
  const dobByChild = new Map<string, Date>();
  for (const row of [...childInfo, ...enrollment, ...relationships.filter((item) => normalize(item["Person Type"]) === "child")]) {
    const dob = parseDate(row["Date of Birth"]);
    if (dob && !dobByChild.has(row["Child ID"])) dobByChild.set(row["Child ID"], dob);
  }

  const existingChildByExternalId = new Map(state.children.map((item) => [item.externalId ?? "", item]));
  const existingFamilyById = new Map(state.families.map((item) => [item.id, item]));
  const existingFamilyByExternalId = new Map(state.families.map((item) => [item.externalId ?? "", item]));
  invariant(existingChildByExternalId.size === 899 && existingFamilyByExternalId.size === 605, "Existing Jasper external identifiers are incomplete or duplicated.");
  const personExistingAccounts = new Map<string, Set<string>>();
  for (const [childId, rows] of relatedByChild) {
    const existingChild = existingChildByExternalId.get(childId);
    if (!existingChild) continue;
    const familyExternalId = existingFamilyById.get(existingChild.familyId)?.externalId;
    invariant(familyExternalId && accountById.has(familyExternalId), `Existing child ${childId} is not in a reviewed account-backed family.`);
    for (const row of rows) personExistingAccounts.set(row["Person ID"], new Set([...(personExistingAccounts.get(row["Person ID"]) ?? []), familyExternalId]));
  }

  const scheduleByName = new Map<string, Array<{ classroom: string; schedule: Prisma.InputJsonObject }>>();
  for (const row of tables.classroomSchedule.matrix) {
    const name = normalize(row[11]);
    if (!name) continue;
    const item = { classroom: clean(row[5]), schedule: { weekOf: "2026-07-27", monday: clean(row[12]), tuesday: clean(row[13]), wednesday: clean(row[14]), thursday: clean(row[15]), friday: clean(row[16]), source: IMPORT_SOURCE } };
    const prior = scheduleByName.get(name) ?? [];
    if (!prior.some((value) => JSON.stringify(value) === JSON.stringify(item))) scheduleByName.set(name, [...prior, item]);
  }
  const contractByName = new Map<string, Array<{ payerLabel: string; cadence: string; description: string; note: string; unitAmountCents: number; cycleAmountCents: number }>>();
  const contractAccountsByName = new Map<string, Set<string>>();
  for (const row of tables.contractBilling.matrix) {
    const name = normalize(row[8]);
    if (!name) continue;
    const money = (value: string) => Math.round(Number(clean(value).replace(/[$,]/g, "")) * 100);
    contractByName.set(name, [...(contractByName.get(name) ?? []), { payerLabel: clean(row[13]), cadence: clean(row[14]), description: clean(row[15]), note: clean(row[16]), unitAmountCents: money(row[17]), cycleAmountCents: money(row[18]) }]);
    const match = clean(row[13]).match(/^(.*?)\s+(Primary|Secondary),\s*(.*)$/i);
    if (match) {
      const label = `${normalizedKey(match[1])}|${normalizedKey(match[3])}`;
      for (const accountId of accountByLabel.get(label) ?? []) contractAccountsByName.set(name, new Set([...(contractAccountsByName.get(name) ?? []), accountId]));
    }
  }
  invariant(contractByName.size === 108 && scheduleByName.size === 104, "Jasper billing or schedule child coverage changed.");

  const sourceNameCount = new Map<string, number>();
  for (const row of childInfo) sourceNameCount.set(normalize(row["Full Name"]), (sourceNameCount.get(normalize(row["Full Name"])) ?? 0) + 1);
  const baseCandidateByChild = new Map<string, Set<string>>();
  for (const row of childInfo) {
    const candidates = new Set<string>();
    for (const related of relatedByChild.get(row["Child ID"]) ?? []) for (const accountId of accountsByPerson.get(related["Person ID"]) ?? []) candidates.add(accountId);
    baseCandidateByChild.set(row["Child ID"], candidates);
  }
  invariant([...baseCandidateByChild.values()].filter((set) => set.size === 1).length === 900 && [...baseCandidateByChild.values()].filter((set) => set.size > 1).length === 52 && [...baseCandidateByChild.values()].filter((set) => set.size === 0).length === 389, "Jasper account candidate population changed.");
  invariant([...existingChildByExternalId.keys()].every((childId) => baseCandidateByChild.get(childId)?.size === 1), "An existing Jasper child is no longer identifier-backed.");

  type ChildPlan = {
    externalId: string; personId: string; fullName: string; lastName: string; dateOfBirth: Date | null; dateOfBirthMissing: boolean; enrollmentStatus: string; sourceStatus: string; statusDate: Date | null; startDate: Date | null;
    classroomExternalId: string; classroomName: string; targetFamilyExternalId: string; familyResolution: string; candidateAccountIds: string[]; directorReview: boolean;
    schedule: Prisma.InputJsonObject | null; contractBilling: Array<{ payerLabel: string; cadence: string; description: string; note: string; unitAmountCents: number; cycleAmountCents: number }>;
  };
  const newChildren: ChildPlan[] = [];
  const allChildren: ChildPlan[] = [];
  const unresolvedForGrouping: Array<{ plan: ChildPlan; signature: string }> = [];
  const resolutionCounts = new Map<string, number>();
  const statuses = new Map<string, number>();
  for (const info of childInfo) {
    const childId = info["Child ID"];
    const latest = latestByChild.get(childId)!;
    const self = selfByChild.get(childId);
    const fullName = clean(info["Full Name"] || latest["Full Name"] || self?.["Full Name"]);
    const dob = dobByChild.get(childId) ?? null;
    const related = relatedByChild.get(childId) ?? [];
    const base = baseCandidateByChild.get(childId) ?? new Set<string>();
    const childName = normalize(fullName);
    const contract = sourceNameCount.get(childName) === 1 ? contractAccountsByName.get(childName) ?? new Set<string>() : new Set<string>();
    const relationshipOne = clean(latest["Relationship 1 Id"]);
    const relationshipOneAccounts = accountsByPerson.get(relationshipOne) ?? new Set<string>();
    const siblingAccounts = new Set(related.flatMap((row) => [...(personExistingAccounts.get(row["Person ID"]) ?? [])]));
    const visibleAccounts = new Set([...base].filter((accountId) => normalize(infoByAccount.get(accountId)?.["Is Hidden"]) === "unchecked"));
    const emailAccounts = new Set<string>();
    const phoneAccounts = new Set<string>();
    for (const row of related) {
      const email = normalize(row.Email);
      if (email) for (const accountId of accountByEmail.get(email) ?? []) emailAccounts.add(accountId);
      for (const key of ["Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5"]) {
        const value = clean(row[key]).replace(/\D/g, "");
        if (value.length >= 7) for (const accountId of accountByPhone.get(value) ?? []) phoneAccounts.add(accountId);
      }
    }
    const dualContact = emailAccounts.size === 1 && phoneAccounts.size === 1 && [...emailAccounts][0] === [...phoneAccounts][0] ? new Set(emailAccounts) : new Set<string>();
    const suggestions = [base, contract, relationshipOneAccounts, siblingAccounts, visibleAccounts, dualContact].filter((set) => set.size === 1).map((set) => [...set][0]);
    const distinctSuggestions = [...new Set(suggestions)];
    let targetFamilyExternalId = "";
    let familyResolution = "";
    if (existingChildByExternalId.has(childId)) {
      targetFamilyExternalId = existingFamilyById.get(existingChildByExternalId.get(childId)!.familyId)!.externalId!;
      familyResolution = "previous_reviewed_import";
    } else if (distinctSuggestions.length > 1) {
      familyResolution = "provisional_conflicting_account_evidence";
    } else if (distinctSuggestions.length === 1) {
      targetFamilyExternalId = distinctSuggestions[0];
      if (base.size === 1) familyResolution = "unique_relationship_payer_account";
      else if (contract.size === 1) familyResolution = "contract_billing_primary_account";
      else if (relationshipOneAccounts.size === 1) familyResolution = "primary_relationship_payer_account";
      else if (siblingAccounts.size === 1) familyResolution = "shared_relationship_existing_household";
      else if (visibleAccounts.size === 1) familyResolution = "unique_visible_candidate_account";
      else familyResolution = "dual_contact_account_match";
    } else {
      familyResolution = base.size > 1 ? "provisional_ambiguous_account" : "provisional_no_account_match";
    }
    const sourceStatusValue = clean(latest["Enrollment Status"] || info["Enrollment Status"]);
    const enrollmentStatus = sourceStatus(sourceStatusValue);
    statuses.set(enrollmentStatus, (statuses.get(enrollmentStatus) ?? 0) + 1);
    const classroomExternalId = clean(latest["Classroom ID"] || info["Classroom ID"] || self?.["Classroom ID"]);
    const classroomName = clean(latest["Primary Classroom"] || info["Primary Classroom"] || self?.["Primary Classroom"]);
    const scheduleCandidates = scheduleByName.get(childName) ?? [];
    const schedule = scheduleCandidates.find((item) => normalize(item.classroom) === normalize(classroomName)) ?? (scheduleCandidates.length === 1 ? scheduleCandidates[0] : null);
    const plan: ChildPlan = {
      externalId: childId, personId: clean(info["Person ID"] || latest["Person ID"] || self?.["Person ID"]), fullName, lastName: clean(info["Last Name"] || latest["Last Name"] || self?.["Last Name"]), dateOfBirth: dob, dateOfBirthMissing: !dob,
      enrollmentStatus, sourceStatus: sourceStatusValue, statusDate: parseDate(latest["Status Start Date"] || info["Status Date"]), startDate: enrollmentStatus === "enrolled" ? parseDate(latest["Status Start Date"] || info["Status Date"]) : null,
      classroomExternalId: classroomExternalId === "1" || normalize(classroomName) === "unknown" ? "" : classroomExternalId, classroomName: normalize(classroomName) === "unknown" ? "" : classroomName,
      targetFamilyExternalId, familyResolution, candidateAccountIds: [...base].sort(), directorReview: !existingChildByExternalId.has(childId), schedule: schedule?.schedule ?? null,
      contractBilling: sourceNameCount.get(childName) === 1 ? contractByName.get(childName) ?? [] : [],
    };
    allChildren.push(plan);
    if (!existingChildByExternalId.has(childId)) {
      if (!targetFamilyExternalId) {
        const parentIds = related.filter((row) => /\b(mom|mother|dad|father|parent|guardian|foster|step)/i.test(clean(row["Relationship Type"]))).filter((row) => checked(row["Lives With"])).map((row) => row["Person ID"]).filter(Boolean).sort();
        const fallbackIds = related.filter((row) => /\b(mom|mother|dad|father|parent|guardian|foster|step)/i.test(clean(row["Relationship Type"]))).map((row) => row["Person ID"]).filter(Boolean).sort();
        const signatureIds = parentIds.length ? parentIds : fallbackIds.length ? fallbackIds : related.map((row) => row["Person ID"]).filter(Boolean).sort();
        const signature = signatureIds.length ? signatureIds.join("|") : `child:${childId}`;
        unresolvedForGrouping.push({ plan, signature });
      }
      newChildren.push(plan);
      resolutionCounts.set(familyResolution, (resolutionCounts.get(familyResolution) ?? 0) + 1);
    }
  }
  invariant(newChildren.length === 442 && allChildren.length === 1341, "Jasper completion child population changed.");
  invariant(statuses.get("enrolled") === 109 && statuses.get("waitlisted") === 262 && statuses.get("withdrawn") === 970, "Jasper final status totals changed.");
  const signatureCounts = new Map<string, number>();
  for (const item of unresolvedForGrouping) signatureCounts.set(item.signature, (signatureCounts.get(item.signature) ?? 0) + 1);
  for (const item of unresolvedForGrouping) {
    item.plan.targetFamilyExternalId = (signatureCounts.get(item.signature) ?? 0) > 1 ? `review-household:${stableId(item.signature).slice(0, 24)}` : `review-child:${item.plan.externalId}`;
  }

  const familyExternalIds = new Set(allChildren.map((item) => item.targetFamilyExternalId));
  const newFamilyPlans = [...familyExternalIds].filter((externalId) => !existingFamilyByExternalId.has(externalId)).map((externalId) => {
    const account = accountById.get(externalId);
    const children = allChildren.filter((item) => item.targetFamilyExternalId === externalId);
    const first = children[0];
    invariant(first, `No child plan for family ${externalId}.`);
    return {
      externalId,
      name: `${clean(account?.["Last Name"] || first.lastName) || "ProCare"} Family`,
      address: account ? address(account) : "",
      billingEmail: clean(account?.Email),
      accountId: account?.["Account ID"] ?? "",
      payerPersonId: account?.["Person ID"] ?? "",
      provisional: !account,
      childIds: children.map((item) => item.externalId).sort(),
    };
  });
  const accountBackedNewFamilies = newFamilyPlans.filter((item) => !item.provisional);
  const provisionalFamilies = newFamilyPlans.filter((item) => item.provisional);

  const existingFamilyExternalById = new Map(state.families.map((item) => [item.id, item.externalId ?? ""]));
  const guardianKeys = new Set(state.guardians.map((item) => `${existingFamilyExternalById.get(item.familyId)}\0${item.externalId ?? ""}`));
  const emergencyKeys = new Set(state.emergencies.map((item) => `${existingFamilyExternalById.get(item.familyId)}\0${item.externalId ?? ""}`));
  const pickupKeys = new Set(state.pickups.map((item) => `${existingFamilyExternalById.get(item.familyId)}\0${item.externalId ?? ""}`));
  let guardiansToCreate = 0;
  let emergenciesToCreate = 0;
  let pickupsToCreate = 0;
  const newChildrenByFamily = new Map<string, ChildPlan[]>();
  for (const child of newChildren) newChildrenByFamily.set(child.targetFamilyExternalId, [...(newChildrenByFamily.get(child.targetFamilyExternalId) ?? []), child]);
  for (const [familyExternalId, children] of newChildrenByFamily) {
    const related = uniqueBy(children.flatMap((child) => relatedByChild.get(child.externalId) ?? []), (row) => row["Person ID"] || row["Row ID"]);
    const account = accountById.get(familyExternalId);
    if (account) {
      const key = `${familyExternalId}\0${account["Person ID"]}`;
      if (!guardianKeys.has(key)) { guardianKeys.add(key); guardiansToCreate += 1; }
    }
    for (const relationship of related) {
      const personId = clean(relationship["Person ID"]);
      const relation = clean(relationship["Relationship Type"]);
      if (!personId || !displayName(relationship["Full Name"])) continue;
      const key = `${familyExternalId}\0${personId}`;
      if (/\b(mom|mother|dad|father|parent|guardian|foster|step[- ]?mom|step[- ]?dad|stepmother|stepfather)\b/i.test(relation) && !guardianKeys.has(key)) { guardianKeys.add(key); guardiansToCreate += 1; }
      if (checked(relationship.Emergency) && !emergencyKeys.has(key)) { emergencyKeys.add(key); emergenciesToCreate += 1; }
      if (checked(relationship["Authorized Pickup"]) && !pickupKeys.has(key)) { pickupKeys.add(key); pickupsToCreate += 1; }
    }
  }

  const classroomPlans = uniqueBy(allChildren.filter((item) => item.classroomExternalId && item.classroomName), (item) => item.classroomExternalId).map((item) => ({ externalId: item.classroomExternalId, name: item.classroomName }));
  invariant(classroomPlans.length === 8, "Expected eight Jasper classrooms.");
  const sourceChildIds = new Set(allChildren.map((item) => item.externalId));
  const sessions = uniqueBy(childTimecards.filter((row) => sourceChildIds.has(row["Child ID"])), (row) => [row["Child ID"], row["Punch In Date/Time"], row["Punch Out Date/Time"], row["Classroom ID"]].join("\0"));
  invariant(sessions.length === 32765, "Jasper attendance session count changed.");
  invariant(sessions.every((row) => parseLocalDateTime(row["Punch In Date/Time"]) && parseLocalDateTime(row["Punch Out Date/Time"])), "A Jasper time card is open or invalid.");
  const attendanceDays = uniqueBy(sessions, (row) => `${row["Child ID"]}\0${row["Punch In Date"]}`);
  invariant(attendanceDays.length === 22792, "Jasper attendance-day count changed.");

  return { inventory, accounts, accountInfo, relatedByChild, allChildren, newChildren, newFamilyPlans, accountBackedNewFamilies, provisionalFamilies, classroomPlans, sessions, attendanceDays, guardiansToCreate, emergenciesToCreate, pickupsToCreate, resolutionCounts: Object.fromEntries([...resolutionCounts].sort()), statuses: Object.fromEntries([...statuses].sort()), employeeRowsHeld: tables.employeeInfo.rows.length, employeeTimecardsHeld: tables.employeeTimecards.rows.length };
}

type Plan = ReturnType<typeof buildPlan>;

function publicPlan(plan: Plan, state: State) {
  return {
    sourceFiles: Object.fromEntries(Object.entries(plan.inventory).map(([key, item]) => [key, { filename: item.filename, sha256: item.sha256, rows: item.rows }])),
    before: state.counts,
    completion: {
      childrenToCreate: plan.newChildren.length,
      childrenToCreateMissingDob: plan.newChildren.filter((item) => item.dateOfBirthMissing).length,
      accountBackedFamiliesToCreate: plan.accountBackedNewFamilies.length,
      provisionalFamiliesToCreate: plan.provisionalFamilies.length,
      familiesAfter: state.counts.families + plan.newFamilyPlans.length,
      childrenAfter: state.counts.children + plan.newChildren.length,
      guardiansToCreate: plan.guardiansToCreate,
      emergencyContactsToCreate: plan.emergenciesToCreate,
      authorizedPickupsToCreate: plan.pickupsToCreate,
      finalStatuses: plan.statuses,
      familyResolution: plan.resolutionCounts,
      schedulesCaptured: plan.allChildren.filter((item) => item.schedule).length,
      contractBillingSnapshotsCaptured: plan.allChildren.filter((item) => item.contractBilling.length).length,
      attendanceRecordsToCreate: plan.attendanceDays.length,
      checkLogsToCreate: plan.sessions.length * 2,
      employeeRowsHeld: plan.employeeRowsHeld,
      employeeTimecardsHeld: plan.employeeTimecardsHeld,
    },
    gates: { billingAccountsCreated: false, invoicesCreated: false, paymentsCreated: false, chargesCreated: false, tuitionEnabled: false, usersCreated: false, invitationsSent: false, accessChanged: false, employeeProfilesCreated: false },
  };
}

async function applyPlan(plan: Plan, initial: State) {
  const current = await readState();
  invariant(current.fingerprint === initial.fingerprint, "Jasper production state changed after the dry run.");
  const importedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const classroomIds = new Map(initial.classrooms.filter((item) => item.externalId).map((item) => [item.externalId!, item.id]));
    for (const item of plan.classroomPlans) if (!classroomIds.has(item.externalId)) {
      const created = await tx.classroom.create({ data: { centerId: CENTER_ID, name: item.name, ageGroup: item.name, capacity: 0, sourceSystem: SOURCE_SYSTEM, externalId: item.externalId, customFields: { source: IMPORT_SOURCE, setupVerificationRequired: true, importedAt: importedAt.toISOString() } }, select: { id: true } });
      classroomIds.set(item.externalId, created.id);
    }
    const familyIds = new Map(initial.families.filter((item) => item.externalId).map((item) => [item.externalId!, item.id]));
    for (const item of plan.newFamilyPlans) {
      const created = await tx.family.create({ data: { centerId: CENTER_ID, name: item.name, address: item.address || null, billingEmail: item.billingEmail || null, sourceSystem: SOURCE_SYSTEM, externalId: item.externalId, customFields: { source: IMPORT_SOURCE, sourceAccountId: item.accountId || null, payerPersonId: item.payerPersonId || null, provisionalHousehold: item.provisional, needsDirectorReview: true, sourceChildIds: item.childIds, billingActivationHeld: true, accessCreated: false, invitationsSent: false, importedAt: importedAt.toISOString() } }, select: { id: true } });
      familyIds.set(item.externalId, created.id);
    }
    const childIds = new Map(initial.children.filter((item) => item.externalId).map((item) => [item.externalId!, item.id]));
    for (const item of plan.newChildren) {
      const familyId = familyIds.get(item.targetFamilyExternalId);
      invariant(familyId, `Missing family for child ${item.externalId}.`);
      const classroomId = item.enrollmentStatus === "enrolled" && item.classroomExternalId ? classroomIds.get(item.classroomExternalId) ?? null : null;
      const created = await tx.child.create({ data: { familyId, classroomId, fullName: item.fullName, dateOfBirth: item.dateOfBirth ?? new Date("1900-01-01T12:00:00.000Z"), ageGroup: item.classroomName || "Unassigned", enrollmentStatus: item.enrollmentStatus, startDate: item.startDate, schedule: item.schedule ?? Prisma.JsonNull, sourceSystem: SOURCE_SYSTEM, externalId: item.externalId, customFields: { source: IMPORT_SOURCE, sourcePersonId: item.personId, dateOfBirthMissing: item.dateOfBirthMissing, sourceEnrollmentStatus: item.sourceStatus, sourceStatusDate: item.statusDate?.toISOString() ?? null, sourceClassroomId: item.classroomExternalId || null, sourceClassroomName: item.classroomName || null, familyResolution: item.familyResolution, candidateAccountIds: item.candidateAccountIds, needsDirectorReview: true, procareContractBillingSnapshot: item.contractBilling.length ? { asOf: BILLING_AS_OF, items: item.contractBilling } : null, tuitionBillingEnabled: false, tuitionAutobillEligible: false, billingActivationHeld: true, accessCreated: false, invitationsSent: false, importedAt: importedAt.toISOString() } }, select: { id: true } });
      childIds.set(item.externalId, created.id);
    }
    for (const item of plan.allChildren.filter((child) => initial.children.some((existing) => existing.externalId === child.externalId) && (child.schedule || child.contractBilling.length))) {
      const existing = initial.children.find((child) => child.externalId === item.externalId)!;
      await tx.child.update({ where: { id: existing.id }, data: { ...(item.schedule ? { schedule: item.schedule } : {}), customFields: { ...jsonObject(existing.customFields), procareScheduleSnapshot: item.schedule, procareContractBillingSnapshot: item.contractBilling.length ? { asOf: BILLING_AS_OF, items: item.contractBilling } : null, billingActivationHeld: true } as Prisma.InputJsonObject } });
    }

    const existingGuardianKeys = new Set(initial.guardians.map((item) => `${item.familyId}\0${item.externalId ?? ""}`));
    const existingEmergencyKeys = new Set(initial.emergencies.map((item) => `${item.familyId}\0${item.externalId ?? ""}`));
    const existingPickupKeys = new Set(initial.pickups.map((item) => `${item.familyId}\0${item.externalId ?? ""}`));
    const guardianRows: Prisma.GuardianCreateManyInput[] = [];
    const emergencyRows: Prisma.EmergencyContactCreateManyInput[] = [];
    const pickupRows: Prisma.AuthorizedPickupCreateManyInput[] = [];
    const newChildrenByFamily = new Map<string, typeof plan.newChildren>();
    for (const child of plan.newChildren) newChildrenByFamily.set(child.targetFamilyExternalId, [...(newChildrenByFamily.get(child.targetFamilyExternalId) ?? []), child]);
    const accountById = new Map(plan.accounts.map((row) => [row["Account ID"], row]));
    for (const [familyExternalId, children] of newChildrenByFamily) {
      const familyId = familyIds.get(familyExternalId)!;
      const related = uniqueBy(children.flatMap((child) => plan.relatedByChild.get(child.externalId) ?? []), (row) => row["Person ID"] || row["Row ID"]);
      const account = accountById.get(familyExternalId);
      if (account) {
        const personId = account["Person ID"];
        const key = `${familyId}\0${personId}`;
        if (!existingGuardianKeys.has(key)) {
          const relationship = related.find((row) => row["Person ID"] === personId);
          guardianRows.push({ familyId, fullName: displayName(account["Full Name"]), email: clean(account.Email) || null, phone: phone(account) || null, relation: clean(relationship?.["Relationship Type"]) || "Payer", isBillingContact: true, sourceSystem: SOURCE_SYSTEM, externalId: personId, customFields: { source: IMPORT_SOURCE, needsDirectorReview: true, accessCreated: false, importedAt: importedAt.toISOString() } });
          existingGuardianKeys.add(key);
        }
      }
      for (const relationship of related) {
        const personId = clean(relationship["Person ID"]);
        const name = displayName(relationship["Full Name"]);
        const relation = clean(relationship["Relationship Type"]) || "Unknown";
        if (!personId || !name) continue;
        const metadata = { source: IMPORT_SOURCE, sourceRelationshipRowId: clean(relationship["Row ID"]) || null, livesWith: checked(relationship["Lives With"]), needsDirectorReview: true, accessCreated: false, importedAt: importedAt.toISOString() };
        const guardianKey = `${familyId}\0${personId}`;
        if (/\b(mom|mother|dad|father|parent|guardian|foster|step[- ]?mom|step[- ]?dad|stepmother|stepfather)\b/i.test(relation) && !existingGuardianKeys.has(guardianKey)) {
          guardianRows.push({ familyId, fullName: name, email: clean(relationship.Email) || null, phone: phone(relationship) || null, relation, isBillingContact: false, sourceSystem: SOURCE_SYSTEM, externalId: personId, customFields: metadata });
          existingGuardianKeys.add(guardianKey);
        }
        if (checked(relationship.Emergency) && !existingEmergencyKeys.has(guardianKey)) {
          emergencyRows.push({ familyId, fullName: name, phone: phone(relationship) || "Not imported", relation, sourceSystem: SOURCE_SYSTEM, externalId: personId, customFields: metadata });
          existingEmergencyKeys.add(guardianKey);
        }
        if (checked(relationship["Authorized Pickup"]) && !existingPickupKeys.has(guardianKey)) {
          pickupRows.push({ familyId, fullName: name, phone: phone(relationship) || null, relation, verificationNotes: "Imported from ProCare; director review required.", sourceSystem: SOURCE_SYSTEM, externalId: personId, customFields: metadata });
          existingPickupKeys.add(guardianKey);
        }
      }
    }
    for (const rows of chunk(guardianRows)) await tx.guardian.createMany({ data: rows });
    for (const rows of chunk(emergencyRows)) await tx.emergencyContact.createMany({ data: rows });
    for (const rows of chunk(pickupRows)) await tx.authorizedPickup.createMany({ data: rows });
    invariant(guardianRows.length === plan.guardiansToCreate && emergencyRows.length === plan.emergenciesToCreate && pickupRows.length === plan.pickupsToCreate, "Jasper relationship creation counts drifted from the dry run.");

    const attendanceRows: Prisma.AttendanceRecordCreateManyInput[] = plan.attendanceDays.map((row) => ({ childId: childIds.get(row["Child ID"])!, classroomId: classroomIds.get(row["Classroom ID"]) ?? null, date: parseDate(row["Punch In Date"])!, status: "present", sourceSystem: SOURCE_SYSTEM, externalId: `jasper:${row["Child ID"]}:${row["Punch In Date"]}`, metadata: { source: IMPORT_SOURCE, sourceClassroomId: row["Classroom ID"] || null, sourceClassroomName: row.Classroom || null } }));
    for (const rows of chunk(attendanceRows)) await tx.attendanceRecord.createMany({ data: rows });
    const checkRows: Prisma.CheckInOutLogCreateManyInput[] = [];
    for (const row of plan.sessions) {
      const checkInAt = parseLocalDateTime(row["Punch In Date/Time"])!;
      const checkOutAt = parseLocalDateTime(row["Punch Out Date/Time"])!;
      invariant(checkOutAt.valueOf() >= checkInAt.valueOf(), "A Jasper checkout occurs before check-in.");
      const effectiveOut = checkOutAt.valueOf() === checkInAt.valueOf() ? new Date(checkOutAt.valueOf() + 1) : checkOutAt;
      const sessionId = stableId(row["Child ID"], row["Punch In Date/Time"], row["Punch Out Date/Time"], row["Classroom ID"]).slice(0, 32);
      const common = { childId: childIds.get(row["Child ID"])!, centerId: CENTER_ID, classroomId: classroomIds.get(row["Classroom ID"]) ?? null, signaturePlaceholder: false, verificationStatus: "imported_from_procare", pinVerified: false, sourceSystem: SOURCE_SYSTEM, metadata: { source: IMPORT_SOURCE, sourceSessionId: sessionId, sourcePunchInDateTime: row["Punch In Date/Time"], sourcePunchOutDateTime: row["Punch Out Date/Time"], equalTimestampTieBreakMilliseconds: checkOutAt.valueOf() === checkInAt.valueOf() ? 1 : 0 } };
      checkRows.push({ ...common, type: "check_in", occurredAt: checkInAt, pickupName: clean(row["Checked In By"]) || null, externalId: `jasper:${sessionId}:in` });
      checkRows.push({ ...common, type: "check_out", occurredAt: effectiveOut, pickupName: clean(row["Checked Out By"]) || null, externalId: `jasper:${sessionId}:out` });
    }
    for (const rows of chunk(checkRows)) await tx.checkInOutLog.createMany({ data: rows });

    const summary = { source: IMPORT_SOURCE, plan: publicPlan(plan, initial), results: { familiesCreated: plan.newFamilyPlans.length, accountBackedFamiliesCreated: plan.accountBackedNewFamilies.length, provisionalFamiliesCreated: plan.provisionalFamilies.length, childrenCreated: plan.newChildren.length, guardiansCreated: guardianRows.length, emergencyContactsCreated: emergencyRows.length, authorizedPickupsCreated: pickupRows.length, attendanceRecordsCreated: attendanceRows.length, checkLogsCreated: checkRows.length }, preserved: { billingAccounts: initial.counts.billingAccounts, invoices: initial.counts.invoices, payments: initial.counts.payments, ledgerEntries: initial.counts.ledgerEntries, accessGrants: initial.counts.accessGrants, users: initial.counts.users }, importedAt: importedAt.toISOString() };
    const batch = await tx.procareImportBatch.create({ data: { centerId: CENTER_ID, filename: BATCH_FILENAME, status: "completed_with_review_items", summary: summary as Prisma.InputJsonObject, rows: { create: plan.newChildren.map((child, index) => ({ rowNumber: index + 1, status: child.targetFamilyExternalId.startsWith("review-") ? "imported_review_required" : "imported", message: child.familyResolution, rawData: { sourceChildId: child.externalId, targetFamilyExternalId: child.targetFamilyExternalId, familyResolution: child.familyResolution, candidateAccountIds: child.candidateAccountIds, piiStoredInImportRow: false }, createdFamilyId: familyIds.get(child.targetFamilyExternalId), createdChildId: childIds.get(child.externalId) })) } }, select: { id: true } });
    await tx.auditLog.create({ data: { tenantId: initial.center.organization.tenantId, centerId: CENTER_ID, action: "procare.jasper_completion.imported", resource: "ProcareImportBatch", resourceId: batch.id, metadata: summary as Prisma.InputJsonObject } });
    return { batchId: batch.id, ...summary.results };
  }, { maxWait: 20_000, timeout: 600_000 });
}

async function main() {
  const { tables, inventory } = loadSources();
  const initial = await readState();
  const prior = initial.batches.find((item) => item.filename === BATCH_FILENAME && item.status === "completed_with_review_items");
  if (prior) {
    console.log(JSON.stringify({ ok: true, applied: false, alreadyImported: true, batchRows: prior._count.rows, state: initial.counts }, null, 2));
    return;
  }
  const plan = buildPlan(tables, inventory, initial);
  const preview = publicPlan(plan, initial);
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ ok: true, dryRun: true, plan: preview }, null, 2));
    return;
  }
  invariant(process.argv.includes("--confirm-jasper-completion"), "Apply requires --confirm-jasper-completion.");
  const result = await applyPlan(plan, initial);
  const final = await readState();
  invariant(final.counts.children === 1341, `Expected 1,341 children; found ${final.counts.children}.`);
  invariant(final.counts.families === initial.counts.families + plan.newFamilyPlans.length, "Final Jasper family count mismatch.");
  invariant(final.counts.guardians === initial.counts.guardians + plan.guardiansToCreate && final.counts.emergencies === initial.counts.emergencies + plan.emergenciesToCreate && final.counts.pickups === initial.counts.pickups + plan.pickupsToCreate, "Final Jasper relationship count mismatch.");
  invariant(final.counts.attendance === plan.attendanceDays.length && final.counts.checkLogs === plan.sessions.length * 2, "Final Jasper attendance count mismatch.");
  invariant(final.counts.billingAccounts === 0 && final.counts.invoices === 0 && final.counts.payments === 0 && final.counts.ledgerEntries === 0, "Jasper billing state changed unexpectedly.");
  invariant(final.counts.users === 0 && final.counts.setupTokens === 0 && final.counts.accessGrants === initial.counts.accessGrants, "Jasper identity/access state changed unexpectedly.");
  console.log(JSON.stringify({ ok: true, applied: true, result, final: final.counts, gates: preview.gates }, null, 2));
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
