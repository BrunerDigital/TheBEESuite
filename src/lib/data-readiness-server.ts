import "server-only";

import type { Prisma } from "@prisma/client";
import { canAccessAllCenters, type CurrentUser } from "@/lib/auth";
import {
  buildImportBatchReadinessTask,
  buildImportRowReadinessTask,
  summarizeDataReadiness,
  type DataReadinessDecision,
  type DataReadinessWorkspaceData,
} from "@/lib/data-readiness";
import { prisma } from "@/lib/prisma";

function asRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function decision(value: unknown): DataReadinessDecision | null {
  return ["confirm", "edit", "match_existing", "create_new", "exclude", "request_information", "defer"].includes(String(value))
    ? value as DataReadinessDecision
    : null;
}

function decisionEvidence(metadata: Prisma.JsonValue | null, createdAt: Date) {
  const record = asRecord(metadata);
  return {
    decision: decision(record.decision),
    decisionNote: text(record.note),
    decisionProposedValue: text(record.proposedValue),
    decisionAt: createdAt,
  };
}

function scopedCenterWhere(user: CurrentUser) {
  if (canAccessAllCenters(user)) {
    return { organization: { tenantId: user.tenantId }, status: { not: "closed" } } as const;
  }
  return {
    id: { in: user.centerIds.length ? user.centerIds : ["__no_authorized_center__"] },
    organization: { tenantId: user.tenantId },
    status: { not: "closed" },
  } as const;
}

export async function loadDataReadinessWorkspace(
  user: CurrentUser,
  options: { taskLimit?: number; batchLimit?: number } = {},
): Promise<DataReadinessWorkspaceData & { centers: Array<{ id: string; name: string }>; allowBulkImport: boolean }> {
  const taskLimit = Math.min(Math.max(options.taskLimit ?? 500, 1), 1500);
  const batchLimit = Math.min(Math.max(options.batchLimit ?? 60, 1), 150);
  const centers = await prisma.center.findMany({
    where: scopedCenterWhere(user),
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: { id: true, name: true, crmLocationId: true },
  });
  const centerIds = centers.map((center) => center.id);
  const centerNameById = new Map(centers.map((center) => [center.id, center.crmLocationId || center.name]));

  if (!centerIds.length) {
    return {
      tasks: [],
      batches: [],
      summary: summarizeDataReadiness([]),
      generatedAt: new Date().toISOString(),
      truncated: false,
      centers: [],
      allowBulkImport: false,
    };
  }

  const [batches, issueRows, rowStatusCounts, auditLogs] = await Promise.all([
    prisma.procareImportBatch.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: { createdAt: "desc" },
      take: batchLimit,
      select: {
        id: true,
        centerId: true,
        filename: true,
        status: true,
        summary: true,
        createdAt: true,
        _count: { select: { rows: true } },
      },
    }),
    prisma.procareImportRow.findMany({
      where: {
        batch: { centerId: { in: centerIds } },
        status: { not: "imported" },
      },
      orderBy: [{ batch: { createdAt: "desc" } }, { rowNumber: "asc" }],
      take: taskLimit,
      select: {
        id: true,
        batchId: true,
        rowNumber: true,
        status: true,
        message: true,
        rawData: true,
        createdFamilyId: true,
        createdChildId: true,
        batch: { select: { centerId: true, filename: true, createdAt: true } },
      },
    }),
    prisma.procareImportRow.groupBy({
      by: ["batchId", "status"],
      where: { batch: { centerId: { in: centerIds } } },
      _count: { _all: true },
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId: user.tenantId,
        centerId: { in: centerIds },
        OR: [
          { action: "data_readiness.decision.recorded" },
          { action: "procare.import.reconciliation_exported" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 2500,
      select: { action: true, resource: true, resourceId: true, metadata: true, createdAt: true },
    }),
  ]);

  const latestDecisionByResource = new Map<string, ReturnType<typeof decisionEvidence>>();
  const verifiedBatchIds = new Set<string>();
  for (const audit of auditLogs) {
    if (audit.action === "procare.import.reconciliation_exported" && audit.resourceId) {
      const metadata = asRecord(audit.metadata);
      if (!metadata.decision || String(metadata.decision).toUpperCase() === "PASS") verifiedBatchIds.add(audit.resourceId);
      continue;
    }
    if (audit.action !== "data_readiness.decision.recorded" || !audit.resourceId) continue;
    const key = `${audit.resource}:${audit.resourceId}`;
    if (!latestDecisionByResource.has(key)) latestDecisionByResource.set(key, decisionEvidence(audit.metadata, audit.createdAt));
  }

  const countByBatchStatus = new Map<string, number>();
  let sourceRows = 0;
  for (const row of rowStatusCounts) {
    const count = row._count._all;
    countByBatchStatus.set(`${row.batchId}:${row.status}`, count);
    sourceRows += count;
  }

  const rowTasks = issueRows.map((row) => buildImportRowReadinessTask({
    id: row.id,
    batchId: row.batchId,
    centerId: row.batch.centerId,
    centerName: centerNameById.get(row.batch.centerId) ?? "Authorized school",
    filename: row.batch.filename,
    rowNumber: row.rowNumber,
    status: row.status,
    message: row.message,
    rawData: row.rawData,
    createdFamilyId: row.createdFamilyId,
    createdChildId: row.createdChildId,
    createdAt: row.batch.createdAt,
    ...latestDecisionByResource.get(`ProcareImportRow:${row.id}`),
  }));

  const batchTasks = batches.map((batch) => {
    const summary = asRecord(batch.summary);
    const importedRows = countByBatchStatus.get(`${batch.id}:imported`) ?? number(summary.imported);
    const unresolvedRows = countByBatchStatus.get(`${batch.id}:needs_resolution`) ?? number(summary.unresolved);
    return buildImportBatchReadinessTask({
      id: batch.id,
      centerId: batch.centerId,
      centerName: centerNameById.get(batch.centerId) ?? "Authorized school",
      filename: batch.filename,
      status: batch.status,
      createdAt: batch.createdAt,
      sourceSha256: text(summary.sourceSha256),
      reviewFingerprint: text(summary.reviewFingerprint),
      rowCount: batch._count.rows,
      importedRows,
      unresolvedRows,
      verified: verifiedBatchIds.has(batch.id),
      ...latestDecisionByResource.get(`ProcareImportBatch:${batch.id}`),
    });
  });

  const statusOrder = new Map([["BLOCKED", 0], ["FAILED", 1], ["CONFIRM", 2], ["READY", 3], ["IMPORTED", 4], ["VERIFIED", 5], ["EXCLUDED", 6]]);
  const tasks = [...rowTasks, ...batchTasks].sort((left, right) => (
    (statusOrder.get(left.status) ?? 9) - (statusOrder.get(right.status) ?? 9)
    || left.priority - right.priority
    || right.updatedAt.localeCompare(left.updatedAt)
  ));

  const batchRows = batches.map((batch) => {
    const summary = asRecord(batch.summary);
    return {
      id: batch.id,
      centerId: batch.centerId,
      centerName: centerNameById.get(batch.centerId) ?? "Authorized school",
      filename: batch.filename,
      status: batch.status,
      sourceSha256: text(summary.sourceSha256),
      reviewFingerprint: text(summary.reviewFingerprint),
      rowCount: batch._count.rows,
      importedRows: countByBatchStatus.get(`${batch.id}:imported`) ?? number(summary.imported),
      unresolvedRows: countByBatchStatus.get(`${batch.id}:needs_resolution`) ?? number(summary.unresolved),
      disposedRows: countByBatchStatus.get(`${batch.id}:disposed`) ?? number(summary.disposed),
      createdAt: batch.createdAt.toISOString(),
      verified: verifiedBatchIds.has(batch.id),
    };
  });

  return {
    tasks,
    batches: batchRows,
    summary: summarizeDataReadiness(tasks, sourceRows),
    generatedAt: new Date().toISOString(),
    truncated: issueRows.length === taskLimit,
    centers: centers.map((center) => ({ id: center.id, name: centerNameById.get(center.id) ?? center.name })),
    allowBulkImport: canAccessAllCenters(user),
  };
}
