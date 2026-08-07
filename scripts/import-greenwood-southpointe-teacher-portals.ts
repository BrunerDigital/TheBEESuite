import "./load-env";

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, UserRole } from "@prisma/client";
import { createClient, type SupabaseClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "../src/lib/prisma";
import { buildTeacherLoginEmail, getDefaultTeacherInitialPassword } from "../src/lib/teacher-login";

const EXPECTED_SUPABASE_REF = "nqjrlktoewiueiwrubas";
const SOURCE_SYSTEM = "procare";
const IMPORT_SOURCE = "greenwood_southpointe_staff_portals_2026_08_07";
const PORTAL_URL = "https://thebeesuite.io/teachers";
const ACK = `--ack-production=${EXPECTED_SUPABASE_REF}`;
const applyRecords = process.argv.includes("--apply-records");
const provisionAuth = process.argv.includes("--provision-auth");
const verifyLogins = process.argv.includes("--verify-logins");
const finalize = process.argv.includes("--finalize");

type CsvRow = Record<string, string>;
type StaffCategory = "portal" | "former" | "held";

type LocationSpec = {
  key: "Greenwood" | "Southpointe";
  slug: string;
  centerId: string;
  employeeFile: string;
  employeeSha256: string;
  contactFile: string;
  contactSha256: string;
  timecardFile: string;
  timecardSha256: string;
};

const LOCATIONS: LocationSpec[] = [
  {
    key: "Greenwood",
    slug: "greenwood",
    centerId: "cmp4ewe7i003o6alworuhvudg",
    employeeFile: "Greenwood - Employee Information 1.csv",
    employeeSha256: "882B8D2AB04B7D88C5D72B38B41FAA3E314B583E2B353C744505F8F96057457F",
    contactFile: "Greenwood - Employee Information 2.csv",
    contactSha256: "71FCC0AF038026833F0E51FEC87A514DFB556FBCDAB67339A781FF9B394B5631",
    timecardFile: "Greenwood - Employee Timecard 1.csv",
    timecardSha256: "64E36B5C3C5EAAD8F70F40CDD7DC564AD5334CC8B1151427C0210274AB6130A1",
  },
  {
    key: "Southpointe",
    slug: "southpointe",
    centerId: "cmp4ewfha00486alwwab1t4et",
    employeeFile: "Southpointe - Employee Information 1.csv",
    employeeSha256: "AF2996E6F9FB32DDD079EC7A300BFDEEA1C793CFA9146D31EB7DBC3BB10982EB",
    contactFile: "Southpointe - Employee Information 2.csv",
    contactSha256: "A0DBA270CADE8326F8B57B6B16B67FBF6F7A7826E53D966327B28F2F04C62228",
    timecardFile: "Southpointe - Employee Time Card with Pay.csv",
    timecardSha256: "B372F0A232FE9B8FD085DE27A3175823FF3FD6A725C5C9FE02A1D504BBEF9103",
  },
];

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: unknown) {
  return clean(value).toLowerCase();
}

function hash(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function shortFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function stableUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function parseCsv(text: string) {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
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
      if (row.some(Boolean)) matrix.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  invariant(!quoted, "A source CSV contains an unterminated quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) matrix.push(row);
  return matrix;
}

function loadRows(filename: string, expectedHash: string) {
  const buffer = readFileSync(join(process.cwd(), filename));
  invariant(hash(buffer) === expectedHash, `${filename} no longer matches the reviewed source hash.`);
  const matrix = parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  const headers = (matrix[0] ?? []).map((header) => header.replace(/^\ufeff/, "").trim());
  return matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, clean(values[index])])) as CsvRow);
}

function displayName(row: CsvRow) {
  return [row["First Name"], row["Middle Initial"], row["Last Name"]].map(clean).filter(Boolean).join(" ").replace(/\s+/g, " ");
}

function isCurrentVisible(row: CsvRow) {
  return normalized(row["Employment Status"]) === "currently employed" && normalized(row["Is Hidden"]) === "unchecked";
}

function isExplicitFormer(row: CsvRow) {
  return /(terminated|quit|resigned|left positive|transfer)/i.test(clean(row["Employment Status"]));
}

function isNonPersonPlaceholder(spec: LocationSpec, row: CsvRow) {
  return spec.key === "Southpointe" && normalized(row["First Name"]) === "southpointe" && normalized(row["Last Name"]) === "southpointe";
}

function isHeldCrossLocationDirector(row: CsvRow) {
  return normalized(row["First Name"]) === "rex" && normalized(row["Last Name"]) === "martindale";
}

function categorize(spec: LocationSpec, row: CsvRow): { category: StaffCategory; reason: string } {
  if (isCurrentVisible(row)) {
    if (isNonPersonPlaceholder(spec, row)) return { category: "held", reason: "non_person_school_placeholder" };
    if (isHeldCrossLocationDirector(row)) return { category: "held", reason: "current_at_both_locations_director_role_requires_confirmation" };
    return { category: "portal", reason: "currently_employed_and_visible" };
  }
  if (isExplicitFormer(row)) return { category: "former", reason: "explicit_former_employee_status" };
  const status = clean(row["Employment Status"]);
  const hidden = clean(row["Is Hidden"]);
  if (/leave/i.test(status)) return { category: "held", reason: "leave_status_not_a_former_employee" };
  if (normalized(status) === "currently employed" && normalized(hidden) === "checked") {
    return { category: "held", reason: "currently_employed_but_hidden_requires_confirmation" };
  }
  if (/hire pool/i.test(status)) return { category: "held", reason: "hire_pool_not_confirmed_employee" };
  return { category: "held", reason: "blank_or_unsupported_employment_status" };
}

function operationalFormerEmail(spec: LocationSpec, employeeId: string) {
  return `${spec.slug}.procare.former.${employeeId}@thebeesuite.io`;
}

function getSupabaseClients() {
  const url = clean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
  const anonKey = clean(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  invariant(url === `https://${EXPECTED_SUPABASE_REF}.supabase.co`, "Refusing to operate against an unexpected Supabase project.");
  invariant(serviceKey && anonKey, "Supabase service and public keys are required.");
  return {
    url,
    anonKey,
    admin: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }),
  };
}

async function listAllAuthUsers(client: SupabaseClient) {
  const users: SupabaseUser[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
  throw new Error("Supabase Auth inventory exceeded the safe audit limit.");
}

type PlannedStaff = {
  spec: LocationSpec;
  row: CsvRow;
  category: StaffCategory;
  reason: string;
  name: string;
  employeeId: string;
  personId: string;
  phone: string | null;
  desiredEmail: string | null;
  classroomId: string | null;
  classroomName: string | null;
};

type Plan = {
  fingerprint: string;
  centers: Map<string, { id: string; name: string; organizationId: string; tenantId: string }>;
  rowsByLocation: Map<string, CsvRow[]>;
  staff: PlannedStaff[];
  classroomsToCreate: Array<{ id: string; centerId: string; name: string; externalId: string }>;
  authUsersInspected: number;
};

function phoneFromContact(row: CsvRow | undefined) {
  if (!row) return null;
  for (const key of ["Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5"]) {
    if (clean(row[key])) return clean(row[key]);
  }
  return null;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function buildPlan(admin: SupabaseClient): Promise<Plan> {
  const centersFound = await prisma.center.findMany({
    where: { id: { in: LOCATIONS.map((location) => location.centerId) } },
    select: { id: true, name: true, status: true, organizationId: true, organization: { select: { tenantId: true } } },
  });
  invariant(centersFound.length === LOCATIONS.length && centersFound.every((center) => normalized(center.status) === "active"), "Both target centers must exist and be active.");
  const centers = new Map(centersFound.map((center) => [center.id, { id: center.id, name: center.name, organizationId: center.organizationId, tenantId: center.organization.tenantId }]));

  const [appUsers, authUsers, existingClassrooms, existingSourceProfiles] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true } }),
    listAllAuthUsers(admin),
    prisma.classroom.findMany({ where: { centerId: { in: LOCATIONS.map((location) => location.centerId) } }, select: { id: true, centerId: true, name: true, sourceSystem: true, externalId: true } }),
    prisma.staffProfile.findMany({
      where: { centerId: { in: LOCATIONS.map((location) => location.centerId) }, sourceSystem: SOURCE_SYSTEM },
      select: { centerId: true, externalId: true, user: { select: { id: true, email: true } } },
    }),
  ]);
  const existingBySourceKey = new Map(existingSourceProfiles.filter((profile) => profile.externalId).map((profile) => [`${profile.centerId}:${profile.externalId}`, profile.user]));
  const existingTargetUserIds = new Set(existingSourceProfiles.map((profile) => profile.user.id));
  const usedEmails = new Set([
    ...appUsers.filter((user) => !existingTargetUserIds.has(user.id)).map((user) => normalized(user.email)),
    ...authUsers.filter((user) => !existingTargetUserIds.has(clean(user.app_metadata?.bee_suite_app_user_id))).map((user) => normalized(user.email)).filter(Boolean),
  ]);
  const rowsByLocation = new Map<string, CsvRow[]>();
  const baseStaff: PlannedStaff[] = [];
  for (const spec of LOCATIONS) {
    const rows = loadRows(spec.employeeFile, spec.employeeSha256);
    const contacts = loadRows(spec.contactFile, spec.contactSha256);
    loadRows(spec.timecardFile, spec.timecardSha256);
    rowsByLocation.set(spec.key, rows);
    invariant(new Set(rows.map((row) => row["Employee ID"])).size === rows.length, `${spec.key} employee IDs are not unique.`);
    const contactByEmployeeId = new Map(contacts.map((row) => [row["Employee ID"], row]));
    for (const row of rows) {
      const { category, reason } = categorize(spec, row);
      const employeeId = clean(row["Employee ID"]);
      const personId = clean(row["Person ID"]);
      const name = displayName(row);
      invariant(employeeId && personId && name, `${spec.key} contains a staff row without an employee ID, person ID, or name.`);
      baseStaff.push({
        spec, row, category, reason, name, employeeId, personId,
        phone: phoneFromContact(contactByEmployeeId.get(employeeId)),
        desiredEmail: null, classroomId: null, classroomName: null,
      });
    }
  }

  for (const member of baseStaff.filter((item) => item.category === "former")) {
    const email = operationalFormerEmail(member.spec, member.employeeId);
    const existing = existingBySourceKey.get(`${member.spec.centerId}:${member.employeeId}`);
    invariant(!existing || normalized(existing.email) === email, `Former-staff operational email changed for ${member.spec.key} employee ${member.employeeId}.`);
    invariant(!usedEmails.has(email), `Former-staff operational email is already occupied: ${email}`);
    usedEmails.add(email);
    member.desiredEmail = email;
  }
  for (const member of baseStaff.filter((item) => item.category === "portal").sort((a, b) => a.spec.key.localeCompare(b.spec.key) || a.name.localeCompare(b.name))) {
    const existing = existingBySourceKey.get(`${member.spec.centerId}:${member.employeeId}`);
    if (existing) {
      const email = normalized(existing.email);
      const base = buildTeacherLoginEmail({ firstName: member.row["First Name"], lastName: member.row["Last Name"] }).split("@")[0]!;
      const local = email.split("@")[0] || "";
      invariant(email.endsWith("@thebeesuite.io") && (local === base || new RegExp(`^${base}\\d+$`).test(local)), `Existing teacher email is not canonical for ${member.name}.`);
      invariant(!usedEmails.has(email), `Existing teacher email is occupied by another identity: ${email}`);
      usedEmails.add(email);
      member.desiredEmail = email;
      continue;
    }
    let chosen = "";
    for (let suffix = 1; suffix <= 500; suffix += 1) {
      const candidate = buildTeacherLoginEmail({ firstName: member.row["First Name"], lastName: member.row["Last Name"], suffix });
      if (!usedEmails.has(candidate)) { chosen = candidate; break; }
    }
    invariant(chosen, `No safe teacher email is available for ${member.name}.`);
    usedEmails.add(chosen);
    member.desiredEmail = chosen;
  }

  const nonClassroomWorkAreas = new Set(["", "1", "250", "254", "1390"]);
  const classroomsToCreate: Plan["classroomsToCreate"] = [];
  const plannedClassroomByKey = new Map<string, { id: string; name: string }>();
  for (const member of baseStaff.filter((item) => item.category === "portal")) {
    const externalId = clean(member.row["Work Area ID"]);
    const name = clean(member.row["Primary Work Area"]);
    if (nonClassroomWorkAreas.has(externalId) || normalized(name) === "unknown") continue;
    const exact = existingClassrooms.filter((room) => room.centerId === member.spec.centerId && room.sourceSystem === SOURCE_SYSTEM && room.externalId === externalId);
    invariant(exact.length <= 1, `${member.spec.key} has duplicate classroom external ID ${externalId}.`);
    if (exact.length === 1) {
      invariant(exact[0]!.name === name, `${member.spec.key} classroom ${externalId} name conflicts with the employee source.`);
      member.classroomId = exact[0]!.id;
      member.classroomName = exact[0]!.name;
      continue;
    }
    const key = `${member.spec.centerId}:${externalId}`;
    let planned = plannedClassroomByKey.get(key);
    if (!planned) {
      planned = { id: stableUuid(`${IMPORT_SOURCE}:${member.spec.centerId}:classroom:${externalId}`), name };
      plannedClassroomByKey.set(key, planned);
      classroomsToCreate.push({ id: planned.id, centerId: member.spec.centerId, name, externalId });
    }
    invariant(planned.name === name, `${member.spec.key} work area ${externalId} has conflicting names.`);
    member.classroomId = planned.id;
    member.classroomName = planned.name;
  }

  const expected = {
    Greenwood: { rows: 201, portal: 22, former: 128, held: 51 },
    Southpointe: { rows: 99, portal: 14, former: 50, held: 35 },
  } as const;
  for (const spec of LOCATIONS) {
    const staff = baseStaff.filter((item) => item.spec.key === spec.key);
    const exp = expected[spec.key];
    invariant(staff.length === exp.rows, `${spec.key} row count changed.`);
    invariant(staff.filter((item) => item.category === "portal").length === exp.portal, `${spec.key} portal count changed.`);
    invariant(staff.filter((item) => item.category === "former").length === exp.former, `${spec.key} former-staff count changed.`);
    invariant(staff.filter((item) => item.category === "held").length === exp.held, `${spec.key} held count changed.`);
  }

  const seed = {
    sourceHashes: LOCATIONS.flatMap((spec) => [spec.employeeSha256, spec.contactSha256, spec.timecardSha256]),
    staff: baseStaff.map((item) => [item.spec.key, item.employeeId, item.category, item.reason, item.desiredEmail, item.classroomId]),
  };
  return { fingerprint: shortFingerprint(seed), centers, rowsByLocation, staff: baseStaff, classroomsToCreate, authUsersInspected: authUsers.length };
}

function summary(plan: Plan) {
  return {
    ok: true,
    mode: applyRecords ? "apply-records" : provisionAuth ? "provision-auth" : verifyLogins ? "verify-logins" : finalize ? "finalize" : "dry-run",
    fingerprint: plan.fingerprint,
    authUsersInspected: plan.authUsersInspected,
    locations: LOCATIONS.map((spec) => {
      const members = plan.staff.filter((item) => item.spec.key === spec.key);
      return {
        location: spec.key,
        sourceRows: members.length,
        portalAccounts: members.filter((item) => item.category === "portal").length,
        formerStaffArchivedInactive: members.filter((item) => item.category === "former").length,
        heldForSchoolConfirmation: members.filter((item) => item.category === "held").length,
        classroomAssigned: members.filter((item) => item.category === "portal" && item.classroomId).length,
        classroomUnassigned: members.filter((item) => item.category === "portal" && !item.classroomId).length,
        missingPhone: members.filter((item) => item.category === "portal" && !item.phone).length,
        newClassrooms: plan.classroomsToCreate.filter((room) => room.centerId === spec.centerId).map((room) => ({ externalId: room.externalId, name: room.name })),
        heldReasons: Object.fromEntries([...new Set(members.filter((item) => item.category === "held").map((item) => item.reason))].sort().map((reason) => [reason, members.filter((item) => item.reason === reason).length])),
      };
    }),
    communicationGates: { invitationsSent: 0, messagesSent: 0, passwordResetsSent: 0, notificationsSent: 0 },
  };
}

function requireMutationAuthorization(plan: Plan) {
  invariant(process.argv.includes(ACK), `Production mutation requires ${ACK}.`);
  invariant(process.argv.includes(`--confirm-fingerprint=${plan.fingerprint}`), `Production mutation requires --confirm-fingerprint=${plan.fingerprint}.`);
}

async function existingImportState(plan: Plan, spec: LocationSpec) {
  const desired = plan.staff.filter((item) => item.spec.key === spec.key && item.category !== "held");
  const [batch, profiles] = await Promise.all([
    prisma.procareImportBatch.findFirst({ where: { centerId: spec.centerId, filename: spec.employeeFile }, select: { id: true, status: true, _count: { select: { rows: true } } } }),
    prisma.staffProfile.findMany({ where: { centerId: spec.centerId, sourceSystem: SOURCE_SYSTEM, externalId: { in: desired.map((item) => item.employeeId) } }, select: { id: true, externalId: true, user: { select: { email: true, isActive: true } } } }),
  ]);
  return { batch, profiles, desired };
}

async function applyLocationRecords(plan: Plan, spec: LocationSpec) {
  const state = await existingImportState(plan, spec);
  if (state.batch) {
    invariant(state.batch._count.rows === plan.rowsByLocation.get(spec.key)!.length, `${spec.key} import batch rows are incomplete.`);
    invariant(state.profiles.length === state.desired.length, `${spec.key} staff records are incomplete.`);
    return { location: spec.key, alreadyApplied: true, batchId: state.batch.id, staffProfiles: state.profiles.length };
  }
  invariant(state.profiles.length === 0, `${spec.key} has partial source-linked staff records without its import batch.`);
  const center = plan.centers.get(spec.centerId)!;
  const sourceRows = plan.rowsByLocation.get(spec.key)!;
  const members = plan.staff.filter((item) => item.spec.key === spec.key);
  const imported = members.filter((item) => item.category !== "held");
  const classrooms = plan.classroomsToCreate.filter((room) => room.centerId === spec.centerId);
  const batchId = randomUUID();
  const now = new Date().toISOString();
  const userByEmployeeId = new Map(imported.map((member) => [member.employeeId, randomUUID()]));
  const profileByEmployeeId = new Map(imported.map((member) => [member.employeeId, randomUUID()]));
  await prisma.$transaction(async (tx) => {
    if (classrooms.length) {
      await tx.classroom.createMany({ data: classrooms.map((room) => ({
        id: room.id, centerId: room.centerId, name: room.name, ageGroup: room.name, capacity: 0,
        sourceSystem: SOURCE_SYSTEM, externalId: room.externalId,
        customFields: { source: IMPORT_SOURCE, importedFrom: "employee_primary_work_area", setupVerificationRequired: true, capacityImported: false, ratioRuleImported: false },
      })) });
    }
    await tx.procareImportBatch.create({ data: {
      id: batchId, centerId: spec.centerId, filename: spec.employeeFile, status: "app_records_ready_auth_pending",
      summary: {
        source: IMPORT_SOURCE, fingerprint: plan.fingerprint, employeeSourceSha256: spec.employeeSha256,
        contactSourceFilename: spec.contactFile, contactSourceSha256: spec.contactSha256,
        timecardSourceFilename: spec.timecardFile, timecardSourceSha256: spec.timecardSha256,
        totalRows: sourceRows.length, portalStaff: members.filter((item) => item.category === "portal").length,
        formerStaffArchivedInactive: members.filter((item) => item.category === "former").length,
        heldRows: members.filter((item) => item.category === "held").length,
        authUsersProvisioned: 0, invitationsSent: 0, messagesSent: 0, passwordResetsSent: 0,
        piiFieldsStoredFromSource: ["name", "phone"], sensitiveFieldsNotStored: ["dateOfBirth", "ssn", "address", "personalEmail", "payRates"],
      },
    } });
    await tx.procareImportRow.createMany({ data: members.map((member, index) => ({
      batchId, rowNumber: index + 1,
      status: member.category === "portal" ? "imported" : member.category === "former" ? "archived_inactive" : "needs_resolution",
      message: member.reason,
      rawData: {
        employeeId: member.employeeId, personId: member.personId, employmentStatus: member.row["Employment Status"] || null,
        statusDate: member.row["Status Date"] || null, isHidden: member.row["Is Hidden"] || null,
        primaryWorkArea: member.row["Primary Work Area"] || null, workAreaId: member.row["Work Area ID"] || null,
        sourceSha256: spec.employeeSha256, sensitiveFieldsStored: false,
      },
    })) });
    await tx.user.createMany({ data: imported.map((member) => ({
      id: userByEmployeeId.get(member.employeeId)!, tenantId: center.tenantId, organizationId: center.organizationId,
      email: member.desiredEmail!, name: member.name, role: UserRole.TEACHER,
      isActive: member.category === "portal", mustResetPassword: false,
      customFields: {
        source: IMPORT_SOURCE, procareEmployeeId: member.employeeId, procarePersonId: member.personId,
        employmentDisposition: member.category, loginProvisioningStatus: member.category === "portal" ? "auth_pending" : "inactive_no_auth",
        supabaseAuthUserCreated: false, invitationsSent: 0, messagesSent: 0, importedAt: now,
      },
    })) });
    await tx.staffProfile.createMany({ data: imported.map((member) => ({
      id: profileByEmployeeId.get(member.employeeId)!, userId: userByEmployeeId.get(member.employeeId)!, centerId: spec.centerId,
      classroomId: member.category === "portal" ? member.classroomId : null,
      title: member.category === "portal" ? "Teacher" : "Former Staff", phone: member.phone,
      sourceSystem: SOURCE_SYSTEM, externalId: member.employeeId,
      customFields: {
        source: IMPORT_SOURCE, sourceBatchId: batchId, sourceSha256: spec.employeeSha256,
        personId: member.personId, employeeStatus: member.row["Employment Status"] || null,
        employeeStatusDate: member.row["Status Date"] || null, isHidden: member.row["Is Hidden"] || null,
        primaryWorkArea: member.row["Primary Work Area"] || null, workAreaId: member.row["Work Area ID"] || null,
        employmentDisposition: member.category,
        classroomAssignment: member.classroomId ? "exact_procare_work_area_match" : member.category === "portal" ? "intentionally_unassigned_nonclassroom_or_unknown_work_area" : "inactive_no_assignment",
        loginProvisioningStatus: member.category === "portal" ? "auth_pending" : "inactive_no_auth",
        supabaseAuthUserCreated: false, importedAt: now,
      },
    })) });
    const portal = imported.filter((member) => member.category === "portal");
    await tx.userAccessGrant.createMany({ data: portal.map((member) => ({
      id: randomUUID(), userId: userByEmployeeId.get(member.employeeId)!, tenantId: center.tenantId,
      organizationId: center.organizationId, centerId: spec.centerId, role: UserRole.TEACHER,
      scopeType: "CENTER", isActive: true,
      permissions: { source: IMPORT_SOURCE, invitationsHeldOff: true },
    })) });
    await tx.auditLog.create({ data: {
      tenantId: center.tenantId, centerId: spec.centerId, action: "operations.staff.teacher_portal_records_imported",
      resource: "ProcareImportBatch", resourceId: batchId,
      metadata: { source: IMPORT_SOURCE, fingerprint: plan.fingerprint, portalStaff: portal.length, formerStaff: imported.length - portal.length, heldRows: members.length - imported.length, authPending: portal.length, invitationsSent: 0, messagesSent: 0 },
    } });
  }, { maxWait: 20_000, timeout: 60_000 });
  return { location: spec.key, alreadyApplied: false, batchId, staffProfiles: imported.length, portalProfiles: imported.filter((member) => member.category === "portal").length };
}

function chunkArgs() {
  const offsetArg = process.argv.find((arg) => arg.startsWith("--offset="));
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const offset = Number(offsetArg?.split("=")[1] ?? 0);
  const limit = Number(limitArg?.split("=")[1] ?? 10);
  invariant(Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit > 0 && limit <= 25, "Chunk offset/limit are invalid.");
  return { offset, limit };
}

async function targetPortalUsers(plan: Plan) {
  return prisma.staffProfile.findMany({
    where: { centerId: { in: LOCATIONS.map((spec) => spec.centerId) }, sourceSystem: SOURCE_SYSTEM,
      externalId: { in: plan.staff.filter((item) => item.category === "portal").map((item) => item.employeeId) },
      user: { isActive: true, role: UserRole.TEACHER } },
    select: { id: true, centerId: true, externalId: true, classroom: { select: { name: true } }, user: { select: { id: true, email: true, name: true, tenantId: true, organizationId: true, customFields: true } } },
    orderBy: [{ centerId: "asc" }, { user: { name: "asc" } }],
  });
}

async function provisionAuthChunk(plan: Plan, admin: SupabaseClient) {
  const { offset, limit } = chunkArgs();
  const targets = await targetPortalUsers(plan);
  invariant(targets.length === 36, `Expected 36 active teacher portal records; found ${targets.length}.`);
  const authUsers = await listAllAuthUsers(admin);
  const authByEmail = new Map(authUsers.filter((user) => user.email).map((user) => [normalized(user.email), user]));
  const password = getDefaultTeacherInitialPassword();
  invariant(password.length >= 8, "The configured teacher initial password is not acceptable.");
  const results = [];
  for (const target of targets.slice(offset, offset + limit)) {
    const email = normalized(target.user.email);
    const existing = authByEmail.get(email);
    const appUserId = clean(existing?.app_metadata?.bee_suite_app_user_id);
    invariant(!existing || !appUserId || appUserId === target.user.id, `${email} Auth identity belongs to another application user.`);
    const userMetadata = { ...jsonObject(existing?.user_metadata), name: target.user.name, source: IMPORT_SOURCE };
    const appMetadata = { ...jsonObject(existing?.app_metadata), bee_suite_role: UserRole.TEACHER, bee_suite_app_user_id: target.user.id, bee_suite_center_id: target.centerId };
    let created = false;
    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: userMetadata, app_metadata: appMetadata, ban_duration: "none" });
      if (error) throw error;
    } else {
      const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: userMetadata, app_metadata: appMetadata });
      if (error) throw error;
      created = true;
    }
    await prisma.user.update({ where: { id: target.user.id }, data: { customFields: { ...jsonObject(target.user.customFields), loginProvisioningStatus: "auth_ready_uninvited", supabaseAuthUserCreated: true, authProvisionedAt: new Date().toISOString(), invitationsSent: 0, messagesSent: 0 } } });
    results.push({ email, created });
  }
  return { offset, limit, total: targets.length, processed: results.length, created: results.filter((item) => item.created).length, updated: results.filter((item) => !item.created).length };
}

function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function verifyPassword(url: string, anonKey: string, email: string, password: string) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      const body = await response.json() as { user?: { email?: string } };
      if (normalized(body.user?.email) === normalized(email)) return true;
    }
    if (attempt < 3 && (response.status === 429 || response.status >= 500)) { await delay(4000 * attempt); continue; }
    return false;
  }
  return false;
}

async function verifyLoginChunk(plan: Plan, url: string, anonKey: string) {
  const { offset, limit } = chunkArgs();
  const targets = await targetPortalUsers(plan);
  invariant(targets.length === 36, `Expected 36 active teacher portal records; found ${targets.length}.`);
  const password = getDefaultTeacherInitialPassword();
  const results = [];
  const chunk = targets.slice(offset, offset + limit);
  for (const [index, target] of chunk.entries()) {
    if (index > 0) await delay(3500);
    const ok = await verifyPassword(url, anonKey, normalized(target.user.email), password);
    invariant(ok, `Real password login failed for ${target.user.email}.`);
    await prisma.user.update({ where: { id: target.user.id }, data: { customFields: { ...jsonObject(target.user.customFields), loginProvisioningStatus: "verified_uninvited", loginVerifiedAt: new Date().toISOString(), invitationsSent: 0, messagesSent: 0 } } });
    results.push({ email: normalized(target.user.email), ok: true });
  }
  return { offset, limit, total: targets.length, verified: results.length };
}

function csvValue(value: unknown) {
  const text = clean(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function finalizeImport(plan: Plan, admin: SupabaseClient) {
  const targets = await targetPortalUsers(plan);
  invariant(targets.length === 36, `Expected 36 active teacher portal records; found ${targets.length}.`);
  const authUsers = await listAllAuthUsers(admin);
  const authByEmail = new Map(authUsers.filter((user) => user.email).map((user) => [normalized(user.email), user]));
  const grantCounts = await prisma.userAccessGrant.groupBy({ by: ["userId"], where: { userId: { in: targets.map((target) => target.user.id) }, centerId: { in: LOCATIONS.map((spec) => spec.centerId) }, role: UserRole.TEACHER, scopeType: "CENTER", isActive: true }, _count: { _all: true } });
  const grantByUserId = new Map(grantCounts.map((row) => [row.userId, row._count._all]));
  for (const target of targets) {
    const fields = jsonObject(target.user.customFields);
    invariant(fields.loginProvisioningStatus === "verified_uninvited", `${target.user.email} has not passed paced login verification.`);
    invariant(grantByUserId.get(target.user.id) === 1, `${target.user.email} does not have exactly one active teacher center grant.`);
    const auth = authByEmail.get(normalized(target.user.email));
    invariant(auth && clean(auth.app_metadata?.bee_suite_app_user_id) === target.user.id && clean(auth.app_metadata?.bee_suite_center_id) === target.centerId, `${target.user.email} Auth metadata is incomplete.`);
  }
  const former = await prisma.staffProfile.findMany({ where: { centerId: { in: LOCATIONS.map((spec) => spec.centerId) }, sourceSystem: SOURCE_SYSTEM, user: { isActive: false }, customFields: { path: ["source"], equals: IMPORT_SOURCE } }, select: { userId: true, user: { select: { email: true } } } });
  invariant(former.length === 178, `Expected 178 inactive former staff profiles; found ${former.length}.`);
  const formerAuthEmails = new Set(former.map((item) => normalized(item.user.email)));
  invariant(authUsers.every((user) => !formerAuthEmails.has(normalized(user.email))), "A former staff archive identity unexpectedly has Supabase Auth access.");
  invariant(await prisma.userAccessGrant.count({ where: { userId: { in: former.map((item) => item.userId) }, isActive: true } }) === 0, "A former staff archive identity unexpectedly has an active access grant.");

  for (const spec of LOCATIONS) {
    const locationTargets = targets.filter((target) => target.centerId === spec.centerId);
    const outputDir = join(process.cwd(), "output", "procare-preparation", "2026-08-07", spec.key);
    mkdirSync(outputDir, { recursive: true });
    const rows = [
      ["Staff name", "BEE Suite login email", "Teacher portal", "Assigned classroom", "Status"],
      ...locationTargets.map((target) => [target.user.name, target.user.email, PORTAL_URL, target.classroom?.name || "Unassigned - director review", "Ready - no invite sent"]),
    ];
    writeFileSync(join(outputDir, "15-teacher-login-information-private.csv"), `${rows.map((row) => row.map(csvValue).join(",")).join("\r\n")}\r\n`, "utf8");
    const heldRows = plan.staff.filter((member) => member.spec.key === spec.key && member.category === "held");
    const heldCsv = [
      ["Staff name", "ProCare employee ID", "Employment status", "Is hidden", "Primary work area", "Work area ID", "School confirmation needed"],
      ...heldRows.map((member) => [member.name, member.employeeId, member.row["Employment Status"], member.row["Is Hidden"], member.row["Primary Work Area"], member.row["Work Area ID"], member.reason]),
    ];
    writeFileSync(join(outputDir, "16-staff-status-follow-up-needed.csv"), `${heldCsv.map((row) => row.map(csvValue).join(",")).join("\r\n")}\r\n`, "utf8");
    const memberByEmployeeId = new Map(plan.staff.filter((member) => member.spec.key === spec.key).map((member) => [member.employeeId, member]));
    const classroomCsv = [
      ["Staff name", "BEE Suite login email", "ProCare work area", "Work area ID", "Needed"],
      ...locationTargets.filter((target) => !target.classroom).map((target) => {
        const member = memberByEmployeeId.get(clean(target.externalId));
        return [target.user.name, target.user.email, member?.row["Primary Work Area"] || "", member?.row["Work Area ID"] || "", "Confirm classroom assignment or confirm this is a floater/office/unassigned role"];
      }),
    ];
    writeFileSync(join(outputDir, "17-teacher-classroom-follow-up-needed.csv"), `${classroomCsv.map((row) => row.map(csvValue).join(",")).join("\r\n")}\r\n`, "utf8");
    const batch = await prisma.procareImportBatch.findFirst({ where: { centerId: spec.centerId, filename: spec.employeeFile }, select: { id: true, summary: true } });
    invariant(batch, `${spec.key} staff import batch is missing.`);
    const currentSummary = jsonObject(batch.summary);
    await prisma.procareImportBatch.update({ where: { id: batch.id }, data: { status: "completed_with_held_rows", summary: { ...currentSummary, authUsersProvisioned: locationTargets.length, realLoginsVerified: locationTargets.length, invitationsSent: 0, messagesSent: 0, passwordResetsSent: 0, finalizedAt: new Date().toISOString() } } });
  }
  return { portalAccountsVerified: targets.length, formerStaffInactiveNoAccess: former.length, invitationsSent: 0, messagesSent: 0, passwordResetsSent: 0, artifacts: LOCATIONS.flatMap((spec) => [
    `output/procare-preparation/2026-08-07/${spec.key}/15-teacher-login-information-private.csv`,
    `output/procare-preparation/2026-08-07/${spec.key}/16-staff-status-follow-up-needed.csv`,
    `output/procare-preparation/2026-08-07/${spec.key}/17-teacher-classroom-follow-up-needed.csv`,
  ]) };
}

async function main() {
  invariant([applyRecords, provisionAuth, verifyLogins, finalize].filter(Boolean).length <= 1, "Choose only one mutation mode.");
  const { admin, url, anonKey } = getSupabaseClients();
  const plan = await buildPlan(admin);
  const publicSummary = summary(plan);
  if (!applyRecords && !provisionAuth && !verifyLogins && !finalize) {
    console.log(JSON.stringify(publicSummary, null, 2));
    return;
  }
  requireMutationAuthorization(plan);
  if (applyRecords) {
    const result = [];
    for (const spec of LOCATIONS) result.push(await applyLocationRecords(plan, spec));
    console.log(JSON.stringify({ ...publicSummary, result }, null, 2));
    return;
  }
  if (provisionAuth) {
    console.log(JSON.stringify({ ...publicSummary, result: await provisionAuthChunk(plan, admin) }, null, 2));
    return;
  }
  if (verifyLogins) {
    console.log(JSON.stringify({ ...publicSummary, result: await verifyLoginChunk(plan, url, anonKey) }, null, 2));
    return;
  }
  console.log(JSON.stringify({ ...publicSummary, result: await finalizeImport(plan, admin) }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
