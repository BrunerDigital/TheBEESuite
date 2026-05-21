import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current.trim());
      current = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function value(record: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const found = record[alias.toLowerCase()];
    if (found) return found.trim();
  }
  return "";
}

function cents(input: string) {
  const normalized = input.replace(/[$,]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function parseDate(input: string) {
  const date = input ? new Date(input) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function centerKey(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function centerAliases(center: { id: string; name: string; crmLocationId: string | null; locationId: string | null; city: string | null; state: string | null }) {
  return [
    center.id,
    center.name,
    center.crmLocationId,
    center.locationId,
    [center.city, center.state].filter(Boolean).join(" "),
    [center.name, center.city, center.state].filter(Boolean).join(" "),
  ].map(centerKey).filter(Boolean);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "ProCare imports are not allowed for this role." }, { status: 403 });
  }

  const formData = await request.formData();
  const requestedCenterId = clean(formData.get("centerId"));
  const autoMap = ["auto", "all", "bulk", ""].includes(requestedCenterId.toLowerCase()) && canAccessAllCenters(user);
  const centerId = autoMap ? "" : requestedCenterId || user.primaryCenterId;
  const file = formData.get("file");
  const pastedCsv = clean(formData.get("csv"));
  if (!centerId && !autoMap) return NextResponse.json({ ok: false, error: "Center ID is required." }, { status: 400 });
  if (centerId && !canAccessCenter(user, centerId)) return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });

  const visibleCenters = await prisma.center.findMany({
    where: {
      status: { not: "closed" },
      ...(user.role === "PLATFORM_OWNER" ? {} : { id: { in: user.centerIds.length ? user.centerIds : ["__none__"] } }),
    },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: { id: true, name: true, crmLocationId: true, locationId: true, city: true, state: true },
  });
  const center = autoMap
    ? visibleCenters[0] ?? null
    : visibleCenters.find((item) => item.id === centerId) ?? null;
  if (!center) return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  const centerByAlias = new Map<string, typeof center>();
  for (const visibleCenter of visibleCenters) {
    for (const alias of centerAliases(visibleCenter)) {
      centerByAlias.set(alias, visibleCenter);
    }
  }

  const text = file instanceof File && file.size > 0 ? await file.text() : pastedCsv;
  if (!text) return NextResponse.json({ ok: false, error: "Upload a CSV export or paste CSV text." }, { status: 400 });

  const rows = parseCsv(text);
  const headers = rows[0]?.map((header) => header.trim().toLowerCase()) ?? [];
  if (rows.length < 2 || !headers.length) {
    return NextResponse.json({ ok: false, error: "No import rows found." }, { status: 400 });
  }

  let createdFamilies = 0;
  let updatedFamilies = 0;
  let createdChildren = 0;
  let ledgerRows = 0;
  let createdClassrooms = 0;
  const centersTouched = new Set<string>();
  const rowResults: Array<{ rowNumber: number; status: string; message?: string; rawData: Record<string, string>; createdFamilyId?: string; createdChildId?: string }> = [];

  const batch = await prisma.procareImportBatch.create({
    data: {
      centerId: center.id,
      uploadedById: user.id,
      filename: file instanceof File && file.size > 0 ? file.name : "pasted-procare-import.csv",
      status: "processing",
      summary: {},
    },
  });

  for (let index = 1; index < rows.length; index += 1) {
    const rawData = Object.fromEntries(headers.map((header, column) => [header, rows[index]?.[column] ?? ""]));
    try {
      const rowCenterValue = value(rawData, [
        "location id",
        "crm location id",
        "school id",
        "school",
        "school name",
        "center",
        "center name",
        "location",
        "site",
      ]);
      const targetCenter = autoMap
        ? centerByAlias.get(centerKey(rowCenterValue)) ?? null
        : center;
      if (!targetCenter) {
        throw new Error(`Could not map row to a center from "${rowCenterValue || "blank location"}".`);
      }
      centersTouched.add(targetCenter.id);
      const familyName = value(rawData, ["family name", "account name", "account", "family", "parent name", "primary guardian"]);
      const childName = value(rawData, ["child name", "student name", "student", "child", "name"]);
      const guardianName = value(rawData, ["guardian name", "parent/guardian", "parent name", "primary guardian", "mother", "father"]);
      const email = value(rawData, ["email", "guardian email", "parent email", "primary email"]);
      const phone = value(rawData, ["phone", "guardian phone", "parent phone", "primary phone"]);
      const address = value(rawData, ["address", "street address", "home address"]);
      const balanceCents = cents(value(rawData, ["balance", "account balance", "ledger balance", "amount due"]));
      const classroomName = value(rawData, ["classroom", "classroom name", "room", "room name", "class"]);
      const ageGroup = value(rawData, ["age group", "program", "class", "room"]) || "Preschool";
      if (!familyName && !childName && !email) throw new Error("Missing family, child, or email fields.");

      const familyMatchers = [
        familyName ? { name: familyName } : undefined,
        email ? { billingEmail: email } : undefined,
      ].filter(Boolean) as Array<{ name?: string; billingEmail?: string }>;
      const existing = familyMatchers.length
        ? await prisma.family.findFirst({
            where: {
              centerId: targetCenter.id,
              OR: familyMatchers,
            },
            select: { id: true },
          })
        : null;

      const family = existing
        ? await prisma.family.update({
            where: { id: existing.id },
            data: {
              name: familyName || childName || email,
              billingEmail: email || undefined,
              address: address || undefined,
            },
          })
        : await prisma.family.create({
            data: {
              centerId: targetCenter.id,
              name: familyName || childName || email,
              billingEmail: email || null,
              address: address || null,
              notes: "Imported from ProCare export.",
            },
          });
      if (existing) {
        updatedFamilies += 1;
      } else {
        createdFamilies += 1;
      }

      if (guardianName || email || phone) {
        const guardianMatchers = [
          email ? { email } : undefined,
          guardianName ? { fullName: guardianName } : undefined,
        ].filter(Boolean) as Array<{ email?: string; fullName?: string }>;
        const existingGuardian = guardianMatchers.length
          ? await prisma.guardian.findFirst({
              where: {
                familyId: family.id,
                OR: guardianMatchers,
              },
            })
          : null;
        if (!existingGuardian) {
          await prisma.guardian.create({
            data: {
              familyId: family.id,
              fullName: guardianName || familyName || email || phone,
              email: email || null,
              phone: phone || null,
              relation: "Guardian",
              preferredCommunication: email ? "email" : phone ? "phone" : null,
              isBillingContact: true,
            },
          });
        }
      }

      let childId: string | undefined;
      if (childName) {
        let classroomId: string | null = null;
        if (classroomName) {
          const existingClassroom = await prisma.classroom.findFirst({
            where: { centerId: targetCenter.id, name: classroomName },
            select: { id: true },
          });
          if (existingClassroom) {
            classroomId = existingClassroom.id;
          } else {
            const classroom = await prisma.classroom.create({
              data: {
                centerId: targetCenter.id,
                name: classroomName,
                ageGroup,
                capacity: 12,
                ratioRule: "Imported from ProCare; verify capacity and ratio.",
              },
              select: { id: true },
            });
            classroomId = classroom.id;
            createdClassrooms += 1;
          }
        }
        const existingChild = await prisma.child.findFirst({ where: { familyId: family.id, fullName: childName }, select: { id: true } });
        if (!existingChild) {
          const child = await prisma.child.create({
            data: {
              familyId: family.id,
              classroomId,
              fullName: childName,
              dateOfBirth: parseDate(value(rawData, ["dob", "birth date", "date of birth"])) ?? new Date("2021-01-01T12:00:00.000Z"),
              ageGroup,
              enrollmentStatus: value(rawData, ["status", "enrollment status"]) || "enrolled",
              startDate: parseDate(value(rawData, ["start date", "enrollment date"])),
            },
          });
          childId = child.id;
          createdChildren += 1;
        } else {
          childId = existingChild.id;
          if (classroomId) {
            await prisma.child.update({ where: { id: existingChild.id }, data: { classroomId, ageGroup } });
          }
        }
      }

      if (balanceCents) {
        const account = await prisma.billingAccount.upsert({
          where: { familyId: family.id },
          update: { balanceCents },
          create: { familyId: family.id, balanceCents },
        });
        await prisma.ledgerEntry.create({
          data: {
            billingAccountId: account.id,
            type: "procare_balance",
            description: "Imported ProCare balance",
            amountCents: balanceCents,
            balanceAfterCents: balanceCents,
            sourceSystem: "procare",
            externalId: `${batch.id}:${index}`,
            metadata: { ...rawData, mappedCenterId: targetCenter.id },
          },
        });
        ledgerRows += 1;
      }

      rowResults.push({
        rowNumber: index + 1,
        status: "imported",
        rawData: { ...rawData, mappedCenterId: targetCenter.id, mappedCenter: targetCenter.crmLocationId ?? targetCenter.name },
        createdFamilyId: family.id,
        createdChildId: childId,
      });
    } catch (error) {
      rowResults.push({ rowNumber: index + 1, status: "error", message: error instanceof Error ? error.message : "Import failed", rawData });
    }
  }

  await prisma.procareImportRow.createMany({
    data: rowResults.map((row) => ({
      batchId: batch.id,
      rowNumber: row.rowNumber,
      status: row.status,
      message: row.message || null,
      rawData: row.rawData,
      createdFamilyId: row.createdFamilyId || null,
      createdChildId: row.createdChildId || null,
    })),
  });

  const summary = {
    center: autoMap ? "Auto-mapped from ProCare export" : center.crmLocationId ?? center.name,
    rows: rowResults.length,
    imported: rowResults.filter((row) => row.status === "imported").length,
    errors: rowResults.filter((row) => row.status === "error").length,
    createdFamilies,
    updatedFamilies,
    createdChildren,
    createdClassrooms,
    ledgerRows,
    centersTouched: centersTouched.size,
  };

  await prisma.procareImportBatch.update({
    where: { id: batch.id },
    data: { status: summary.errors ? "completed_with_errors" : "completed", summary },
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "procare.import.completed",
    resource: "ProcareImportBatch",
    resourceId: batch.id,
    metadata: summary,
  });

  return NextResponse.json({ ok: true, batchId: batch.id, summary, rowResults });
}
