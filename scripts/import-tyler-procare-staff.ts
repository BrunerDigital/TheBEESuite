import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_LOCATION_ID = "TX | Tyler";
const CENTER_NAME = "Kid City USA - Tyler";
const SOURCE_SYSTEM = "procare";
const IMPORT_SOURCE = "tyler_procare_staff_roster_2026_08_01";
const SOURCE_FILE = "TYLEREMPOLYEEINFORATIONTRACKING.csv";
const SOURCE_SHA256 = "ABCCA0912EB5A46D411861BB7C5FBB356DB770AEC466FA5ECFF82519DFADE7DF";
const SOURCE_ROWS = 113;
const TIMECARD_FILE = "TYLEREMPOLYEETIMECARD.csv";
const TIMECARD_SHA256 = "580098F02A9F557CA1E1BB3BE9652E9E97E492E9755149717D1D9DF64254790E";
const TIMECARD_ROWS_HELD = 16_929;

type CsvRow = Record<string, string>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
  invariant(!quoted, "The Tyler employee CSV contains an unterminated quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function loadCsv(sourceDir: string, filename: string, expectedHash: string) {
  const sourcePath = join(sourceDir, filename);
  const buffer = readFileSync(sourcePath);
  const sha256 = createHash("sha256").update(buffer).digest("hex").toUpperCase();
  invariant(sha256 === expectedHash, `${filename} does not match the reviewed Tyler source hash.`);
  return { sourcePath, buffer, sha256 };
}

function parseRows(buffer: Buffer) {
  const matrix = parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  const headers = (matrix[0] ?? []).map((header) => header.replace(/^\ufeff/, "").trim());
  return matrix.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, clean(row[index])])) as CsvRow);
}

function displayName(value: string) {
  const parts = clean(value).split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? `${parts.slice(1).join(" ")} ${parts[0]}`.replace(/\s+/g, " ").trim() : clean(value);
}

function operationalEmail(employeeId: string) {
  return `tyler.procare.${employeeId}@thebeesuite.io`;
}

function buildPlan() {
  const sourceDir = process.env.TYLER_PROCARE_SOURCE_DIR?.trim() || "C:/Users/brend/AppData/Local/Temp";
  const employeeSource = loadCsv(sourceDir, SOURCE_FILE, SOURCE_SHA256);
  const timecardSource = loadCsv(sourceDir, TIMECARD_FILE, TIMECARD_SHA256);
  const rows = parseRows(employeeSource.buffer);
  const timecardRows = parseRows(timecardSource.buffer);
  invariant(rows.length === SOURCE_ROWS, `Expected ${SOURCE_ROWS} Tyler employee rows; found ${rows.length}.`);
  invariant(timecardRows.length === TIMECARD_ROWS_HELD, `Expected ${TIMECARD_ROWS_HELD} held Tyler time-card rows; found ${timecardRows.length}.`);

  const currentVisible = rows.filter((row) => row["Employment Status"] === "Currently Employed" && row["Is Hidden"] === "Unchecked");
  const disposed = rows.filter((row) => !currentVisible.includes(row));
  invariant(currentVisible.length === 20, `Expected 20 current visible Tyler employees; found ${currentVisible.length}.`);
  invariant(disposed.length === 93, `Expected 93 historical or unsupported Tyler employee rows; found ${disposed.length}.`);
  invariant(new Set(currentVisible.map((row) => row["Employee ID"])).size === currentVisible.length, "Current Tyler employee IDs are not unique.");
  invariant(new Set(currentVisible.map((row) => row["Person ID"])).size === currentVisible.length, "Current Tyler employee person IDs are not unique.");
  invariant(currentVisible.every((row) => row["Employee ID"] && row["Person ID"] && displayName(row["Full Name"])), "A current Tyler employee lacks an authoritative ID or name.");

  const timecardEmployeeIds = new Set(timecardRows.map((row) => row["Employee ID"]).filter(Boolean));
  invariant(timecardEmployeeIds.size === 79, `Expected historical time cards for 79 Tyler employees; found ${timecardEmployeeIds.size}.`);

  return { rows, currentVisible, disposed, timecardEmployeeIds, employeeSource, timecardSource };
}

async function readState(plan: ReturnType<typeof buildPlan>) {
  const centers = await prisma.center.findMany({
    where: { crmLocationId: CENTER_LOCATION_ID },
    take: 2,
    select: { id: true, name: true, status: true, organization: { select: { id: true, tenantId: true } } },
  });
  invariant(centers.length === 1, `Expected exactly one ${CENTER_LOCATION_ID} center; found ${centers.length}.`);
  const center = centers[0];
  invariant(center.name === CENTER_NAME && center.status === "active", `Expected active center ${CENTER_NAME}.`);

  const employeeIds = plan.currentVisible.map((row) => row["Employee ID"]);
  const emails = employeeIds.map(operationalEmail);
  const [classrooms, profiles, users, batches, staffCount, grantsCount] = await Promise.all([
    prisma.classroom.findMany({ where: { centerId: center.id }, select: { id: true, name: true, externalId: true, sourceSystem: true } }),
    prisma.staffProfile.findMany({ where: { centerId: center.id, sourceSystem: SOURCE_SYSTEM, externalId: { in: employeeIds } }, select: { id: true, externalId: true, userId: true, classroomId: true } }),
    prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, tenantId: true, name: true, role: true, staffProfile: { select: { centerId: true, externalId: true } } } }),
    prisma.procareImportBatch.findMany({ where: { centerId: center.id, filename: SOURCE_FILE }, select: { id: true, status: true, summary: true, _count: { select: { rows: true } } } }),
    prisma.staffProfile.count({ where: { centerId: center.id } }),
    prisma.userAccessGrant.count({ where: { centerId: center.id } }),
  ]);
  return { center, classrooms, profiles, users, batches, staffCount, grantsCount };
}

function classroomMap(plan: ReturnType<typeof buildPlan>, state: Awaited<ReturnType<typeof readState>>) {
  const result = new Map<string, string | null>();
  for (const row of plan.currentVisible) {
    const workAreaId = row["Work Area ID"];
    const workAreaName = row["Primary Work Area"];
    if (workAreaId === "1" && workAreaName === "Unknown") {
      result.set(row["Employee ID"], null);
      continue;
    }
    const matches = state.classrooms.filter((room) => room.sourceSystem === SOURCE_SYSTEM && room.externalId === workAreaId && room.name === workAreaName);
    invariant(matches.length === 1, `Employee ${row["Employee ID"]} does not match exactly one Tyler classroom ${workAreaId} / ${workAreaName}.`);
    result.set(row["Employee ID"], matches[0].id);
  }
  invariant([...result.values()].filter(Boolean).length === 16, "Expected 16 Tyler staff classroom assignments and four intentionally unassigned staff.");
  return result;
}

function publicPlan(plan: ReturnType<typeof buildPlan>, state: Awaited<ReturnType<typeof readState>>, rooms: Map<string, string | null>) {
  return {
    target: { locationId: CENTER_LOCATION_ID, centerName: CENTER_NAME },
    source: { filename: SOURCE_FILE, sha256: plan.employeeSource.sha256, rows: plan.rows.length },
    import: {
      currentVisibleStaff: plan.currentVisible.length,
      classroomAssigned: [...rooms.values()].filter(Boolean).length,
      intentionallyUnassigned: [...rooms.values()].filter((value) => !value).length,
      disposedHistoricalOrUnsupported: plan.disposed.length,
    },
    held: {
      staffTimecardFile: TIMECARD_FILE,
      staffTimecardSha256: plan.timecardSource.sha256,
      staffTimecardRows: TIMECARD_ROWS_HELD,
      staffTimecardEmployees: plan.timecardEmployeeIds.size,
      reason: "No standalone staff time-card destination; StaffSchedule represents planned shifts, not historical punches.",
    },
    gates: {
      supabaseAuthUsersCreated: false,
      passwordsCreated: false,
      invitationsSent: false,
      messagesSent: false,
      kioskPinsCreated: false,
      billingChanged: false,
      ssnStored: false,
    },
    liveBefore: { staffProfiles: state.staffCount, centerAccessGrants: state.grantsCount },
  };
}

async function applyPlan(plan: ReturnType<typeof buildPlan>, initial: Awaited<ReturnType<typeof readState>>, rooms: Map<string, string | null>) {
  invariant(initial.profiles.length === 0 && initial.users.length === 0 && initial.batches.length === 0, "Tyler staff import state changed after review; refusing a partial or duplicate apply.");
  const importedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const batch = await tx.procareImportBatch.create({
      data: {
        centerId: initial.center.id,
        filename: SOURCE_FILE,
        status: "completed_with_held_rows",
        summary: {
          source: IMPORT_SOURCE,
          sourceSha256: plan.employeeSource.sha256,
          totalRows: plan.rows.length,
          importedStaff: plan.currentVisible.length,
          disposedRows: plan.disposed.length,
          classroomAssigned: [...rooms.values()].filter(Boolean).length,
          intentionallyUnassigned: [...rooms.values()].filter((value) => !value).length,
          heldStaffTimecards: TIMECARD_ROWS_HELD,
          heldStaffTimecardEmployees: plan.timecardEmployeeIds.size,
          authUsersProvisioned: 0,
          invitationsSent: 0,
          messagesSent: 0,
          ssnStored: false,
        },
      },
      select: { id: true },
    });

    const importedIds = new Set(plan.currentVisible.map((row) => row["Employee ID"]));
    await tx.procareImportRow.createMany({
      data: plan.rows.map((row, index) => ({
        batchId: batch.id,
        rowNumber: index + 1,
        status: importedIds.has(row["Employee ID"]) ? "imported" : "disposed",
        message: importedIds.has(row["Employee ID"])
          ? "Imported current visible staff profile; login activation held off."
          : "Not imported because the employee is not both currently employed and visible.",
        rawData: {
          employeeId: row["Employee ID"] || null,
          personId: row["Person ID"] || null,
          employmentStatus: row["Employment Status"] || null,
          isHidden: row["Is Hidden"] || null,
          piiFieldsStored: false,
        },
      })),
    });

    const created: Array<{ employeeId: string; userId: string; profileId: string; classroomId: string | null }> = [];
    for (const [index, row] of plan.currentVisible.entries()) {
      const employeeId = row["Employee ID"];
      const fullName = displayName(row["Full Name"]);
      const classroomId = rooms.get(employeeId) ?? null;
      const email = operationalEmail(employeeId);
      const user = await tx.user.create({
        data: {
          tenantId: initial.center.organization.tenantId,
          organizationId: initial.center.organization.id,
          email,
          name: fullName,
          role: UserRole.TEACHER,
          isActive: true,
          customFields: {
            source: IMPORT_SOURCE,
            procareEmployeeId: employeeId,
            operationalEmailPlaceholder: true,
            loginProvisioningStatus: "held_off",
            supabaseAuthUserCreated: false,
            invitationsSent: 0,
          },
        },
        select: { id: true },
      });
      const profile = await tx.staffProfile.create({
        data: {
          userId: user.id,
          centerId: initial.center.id,
          classroomId,
          title: "Teacher",
          sourceSystem: SOURCE_SYSTEM,
          externalId: employeeId,
          customFields: {
            source: IMPORT_SOURCE,
            sourceBatchId: batch.id,
            sourceSha256: plan.employeeSource.sha256,
            sourceRowNumber: plan.rows.indexOf(row) + 1,
            personId: row["Person ID"],
            employeeStatus: row["Employment Status"],
            employeeStatusDate: row["Status Date"] || null,
            primaryWorkArea: row["Primary Work Area"],
            workAreaId: row["Work Area ID"],
            classroomAssignment: classroomId ? "exact_procare_work_area_match" : "director_editable_unassigned_unknown_work_area",
            loginProvisioningStatus: "held_off",
            supabaseAuthUserCreated: false,
            importedAt: importedAt.toISOString(),
          },
        },
        select: { id: true },
      });
      await tx.userAccessGrant.create({
        data: {
          userId: user.id,
          tenantId: initial.center.organization.tenantId,
          organizationId: initial.center.organization.id,
          centerId: initial.center.id,
          role: UserRole.TEACHER,
          scopeType: "CENTER",
          isActive: true,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: initial.center.organization.tenantId,
          centerId: initial.center.id,
          action: "operations.staff.profile_created",
          resource: "StaffProfile",
          resourceId: profile.id,
          metadata: {
            source: IMPORT_SOURCE,
            sourceBatchId: batch.id,
            employeeId,
            sourceRowNumber: plan.rows.indexOf(row) + 1,
            classroomAssigned: Boolean(classroomId),
            authProvisioningHeldOff: true,
            invitationHeldOff: true,
            importedAt: importedAt.toISOString(),
            sequence: index + 1,
          },
        },
      });
      created.push({ employeeId, userId: user.id, profileId: profile.id, classroomId });
    }
    await tx.auditLog.create({
      data: {
        tenantId: initial.center.organization.tenantId,
        centerId: initial.center.id,
        action: "operations.staff.roster_imported",
        resource: "ProcareImportBatch",
        resourceId: batch.id,
        metadata: {
          source: IMPORT_SOURCE,
          sourceSha256: plan.employeeSource.sha256,
          importedStaff: created.length,
          classroomAssigned: created.filter((row) => row.classroomId).length,
          intentionallyUnassigned: created.filter((row) => !row.classroomId).length,
          disposedRows: plan.disposed.length,
          heldStaffTimecards: TIMECARD_ROWS_HELD,
          authProvisioningHeldOff: true,
          invitationsHeldOff: true,
          importedAt: importedAt.toISOString(),
        },
      },
    });
    return { batchId: batch.id, created };
  }, { timeout: 30_000 });
}

async function main() {
  const plan = buildPlan();
  const initial = await readState(plan);
  const rooms = classroomMap(plan, initial);
  const publicSummary = publicPlan(plan, initial, rooms);
  const completedBatch = initial.batches.find((batch) => batch.status === "completed_with_held_rows");
  if (completedBatch) {
    invariant(initial.profiles.length === 20 && initial.users.length === 20, "The Tyler staff batch exists but its operational records are incomplete.");
    console.log(JSON.stringify({ ok: true, applied: false, alreadyImported: true, batchId: completedBatch.id, plan: publicSummary }, null, 2));
    return;
  }
  invariant(initial.profiles.length === 0 && initial.users.length === 0 && initial.batches.length === 0, "Unexpected pre-existing Tyler ProCare staff import state.");
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ ok: true, dryRun: true, plan: publicSummary }, null, 2));
    return;
  }
  const result = await applyPlan(plan, initial, rooms);
  const final = await readState(plan);
  invariant(final.profiles.length === 20 && final.users.length === 20, "Tyler staff profiles or operational users did not reach 20.");
  invariant(final.staffCount === initial.staffCount + 20, "Tyler staff profile total changed unexpectedly.");
  invariant(final.grantsCount === initial.grantsCount + 20, "Tyler center access-grant total changed unexpectedly.");
  invariant(final.batches.length === 1 && final.batches[0]._count.rows === SOURCE_ROWS, "Tyler staff batch evidence is incomplete.");
  console.log(JSON.stringify({ ok: true, applied: true, result: { batchId: result.batchId, staffProfilesCreated: result.created.length, classroomAssigned: result.created.filter((row) => row.classroomId).length, intentionallyUnassigned: result.created.filter((row) => !row.classroomId).length }, final: { staffProfiles: final.staffCount, centerAccessGrants: final.grantsCount, batchRows: final.batches[0]._count.rows }, gates: publicSummary.gates }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
