import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageOperations, getCurrentUser, getLeadScopeWhere } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  ageGroupTotal,
  calculateFteCount,
  defaultFteWeekEnd,
  isExecutiveFteManager,
  normalizeFteStatus,
  validateFtePeriod,
} from "@/lib/fte-report-guardrails";
import { normalizeFteCenterKey, parseFteImportCsv } from "@/lib/fte-report-import";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: string) {
  const text = value.trim();
  if (!text) return null;
  const isoLike = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text;
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addLookup(lookup: Map<string, string>, key: string | null | undefined, centerId: string) {
  if (!key) return;
  lookup.set(normalizeFteCenterKey(key), centerId);
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user) || !isExecutiveFteManager(user.role)) {
    return NextResponse.json({ ok: false, error: "Only executive users can bulk import or correct FTE reports." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const csvText = clean(body.csvText);
  const dryRun = Boolean(body.dryRun);
  if (!csvText) {
    return NextResponse.json({ ok: false, error: "Paste or upload a CSV before importing." }, { status: 400 });
  }
  if (csvText.length > 1_000_000) {
    return NextResponse.json({ ok: false, error: "FTE import CSV is too large. Split it into smaller batches." }, { status: 413 });
  }

  const parsed = parseFteImportCsv(csvText);
  if (parsed.rows.length > 500) {
    return NextResponse.json({ ok: false, error: "FTE bulk import is limited to 500 rows per batch." }, { status: 400 });
  }

  const centers = await prisma.center.findMany({
    where: { ...getLeadScopeWhere(user), status: { not: "closed" } },
    select: { id: true, name: true, crmLocationId: true, locationId: true, city: true, state: true },
  });
  const lookup = new Map<string, string>();
  for (const center of centers) {
    addLookup(lookup, center.id, center.id);
    addLookup(lookup, center.name, center.id);
    addLookup(lookup, center.crmLocationId, center.id);
    addLookup(lookup, center.locationId, center.id);
    addLookup(lookup, [center.city, center.state].filter(Boolean).join(", "), center.id);
    addLookup(lookup, [center.crmLocationId ?? center.name, center.city, center.state].filter(Boolean).join(" "), center.id);
  }

  const batchId = randomUUID();
  const errors = [...parsed.errors];
  let created = 0;
  let updated = 0;
  let validated = 0;
  const touchedCenterIds = new Set<string>();

  for (const row of parsed.rows) {
    const centerId = lookup.get(normalizeFteCenterKey(row.centerKey));
    if (!centerId) {
      errors.push({ rowNumber: row.rowNumber, message: `No visible school matched "${row.centerKey}".` });
      continue;
    }
    if (!canAccessCenter(user, centerId)) {
      errors.push({ rowNumber: row.rowNumber, message: "School is outside this executive account scope." });
      continue;
    }

    const weekStart = parseDate(row.weekStart);
    const weekEnd = row.weekEnd ? parseDate(row.weekEnd) : weekStart ? defaultFteWeekEnd(weekStart) : null;
    const period = validateFtePeriod(weekStart, weekEnd);
    if (!weekStart || !period.ok) {
      errors.push({ rowNumber: row.rowNumber, message: period.ok ? "Invalid week start date." : period.error });
      continue;
    }

    const existing = await prisma.fteReport.findUnique({
      where: { centerId_weekStart: { centerId, weekStart } },
      select: { id: true },
    });
    const calculatedFte = calculateFteCount(row.fullTimeCount, row.partTimeCount);
    const fteCount = row.fteCount ?? calculatedFte;
    const ageGroupCount = ageGroupTotal(row);
    const data = {
      centerId,
      submittedById: user.id,
      weekStart,
      weekEnd,
      enrolledCount: row.enrolledCount,
      fullTimeCount: row.fullTimeCount,
      partTimeCount: row.partTimeCount,
      fteCount,
      infants: row.infants,
      toddlers: row.toddlers,
      twos: row.twos,
      preschool: row.preschool,
      preK: row.preK,
      schoolAge: row.schoolAge,
      notes: row.notes || null,
      status: normalizeFteStatus({ requestedStatus: row.status || "corrected", role: user.role, isCorrection: Boolean(existing) }),
      source: "bulk_import_dashboard",
      sourceMetadata: {
        batchId,
        rowNumber: row.rowNumber,
        enteredBy: user.email,
        enteredRole: user.role,
        centerKey: row.centerKey,
        calculatedFte,
        ageGroupCount,
        enrollmentVariance: row.enrolledCount - ageGroupCount,
      },
    } satisfies Prisma.FteReportUncheckedCreateInput;

    validated += 1;
    touchedCenterIds.add(centerId);
    if (dryRun) continue;

    if (existing) {
      await prisma.fteReport.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.fteReport.create({ data });
      created += 1;
    }
  }

  if (!dryRun && validated) {
    await writeAuditLog(user, {
      action: "fte_report.bulk_import",
      resource: "FteReport",
      metadata: {
        batchId,
        created,
        updated,
        validated,
        errorCount: errors.length,
        centersTouched: touchedCenterIds.size,
      },
    });
  }

  return NextResponse.json({
    ok: errors.length === 0 || validated > 0,
    dryRun,
    summary: {
      batchId,
      parsedRows: parsed.rows.length,
      validatedRows: validated,
      created,
      updated,
      skipped: parsed.rows.length - validated,
      centersTouched: touchedCenterIds.size,
      errorCount: errors.length,
    },
    errors: errors.slice(0, 25),
  });
}

export const POST = withApiLogging("POST", POSTHandler);
