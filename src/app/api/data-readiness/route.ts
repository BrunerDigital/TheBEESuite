import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { canBulkConfirmReadinessTask, dataReadinessCsv, summarizeDataReadiness, type DataReadinessDecision } from "@/lib/data-readiness";
import { filterDataReadinessTasksForContext, normalizeDataReadinessContext } from "@/lib/data-readiness-context";
import { loadDataReadinessWorkspace } from "@/lib/data-readiness-server";
import { canManageOperations, getCurrentUser } from "@/lib/auth";
import { dataReadinessCenterEnabled } from "@/lib/honeyglass";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decisions = new Set<DataReadinessDecision>([
  "confirm",
  "edit",
  "match_existing",
  "create_new",
  "exclude",
  "request_information",
  "defer",
]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

async function requireAccess() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, status: 401, error: "Authentication required." };
  if (!dataReadinessCenterEnabled()) return { ok: false as const, status: 404, error: "Data Readiness Center is disabled." };
  if (!canManageOperations(user)) return { ok: false as const, status: 403, error: "Data readiness decisions are not allowed for this role." };
  return { ok: true as const, user };
}

async function GETHandler(request: NextRequest) {
  const access = await requireAccess();
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const mode = request.nextUrl.searchParams.get("mode");
  const workspace = await loadDataReadinessWorkspace(access.user, mode === "count" ? { taskLimit: 1500, batchLimit: 150 } : undefined);
  const requestedContext = clean(request.nextUrl.searchParams.get("context"), 40);
  const context = normalizeDataReadinessContext(requestedContext);
  if (requestedContext && !context) {
    return NextResponse.json({ ok: false, error: "Unknown data readiness context." }, { status: 400 });
  }
  const requestedCategory = clean(request.nextUrl.searchParams.get("category"), 120);
  const contextTasks = filterDataReadinessTasksForContext(workspace.tasks, context);
  const tasks = requestedCategory
    ? contextTasks.filter((task) => task.category === requestedCategory)
    : contextTasks;
  const summary = context || requestedCategory ? summarizeDataReadiness(tasks, tasks.length) : workspace.summary;
  if (mode === "count") {
    return NextResponse.json({ ok: true, context, summary }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const filename = `bee-suite-data-readiness-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(dataReadinessCsv(tasks), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return NextResponse.json({ ok: true, context, data: context || requestedCategory ? { ...workspace, tasks, summary } : workspace }, { headers: { "Cache-Control": "private, no-store" } });
}

async function PATCHHandler(request: NextRequest) {
  const access = await requireAccess();
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const body = await request.json().catch(() => null) as {
    taskIds?: unknown;
    action?: unknown;
    note?: unknown;
    proposedValue?: unknown;
  } | null;
  const taskIds = Array.isArray(body?.taskIds)
    ? [...new Set(body.taskIds.map((value) => clean(value, 160)).filter(Boolean))].slice(0, 100)
    : [];
  const action = clean(body?.action, 40) as DataReadinessDecision;
  const note = clean(body?.note, 1000);
  const proposedValue = clean(body?.proposedValue, 500);
  if (!taskIds.length || !decisions.has(action)) {
    return NextResponse.json({ ok: false, error: "Choose at least one readiness task and a valid decision." }, { status: 400 });
  }
  if ((action === "edit" || action === "exclude" || action === "request_information") && !note) {
    return NextResponse.json({ ok: false, error: "Add a plain-language note for this decision." }, { status: 400 });
  }

  const workspace = await loadDataReadinessWorkspace(access.user, { taskLimit: 1500, batchLimit: 150 });
  const taskById = new Map(workspace.tasks.map((task) => [task.id, task]));
  const selectedTasks = taskIds.map((id) => taskById.get(id)).filter((task) => Boolean(task));
  if (selectedTasks.length !== taskIds.length) {
    return NextResponse.json({ ok: false, error: "One or more tasks are no longer available in your school scope. Refresh and try again." }, { status: 409 });
  }
  if (selectedTasks.length > 1 && (action !== "confirm" || selectedTasks.some((task) => !task || !canBulkConfirmReadinessTask(task)))) {
    return NextResponse.json({
      ok: false,
      error: "Bulk confirmation is limited to low-risk rows with stable source IDs and identical safe validation conditions.",
    }, { status: 409 });
  }

  await prisma.$transaction(selectedTasks.map((task) => prisma.auditLog.create({
    data: {
      tenantId: access.user.tenantId,
      centerId: task!.centerId,
      userId: access.user.id,
      action: "data_readiness.decision.recorded",
      resource: task!.resource,
      resourceId: task!.resourceId,
      metadata: {
        decision: action,
        note,
        proposedValue,
        priorStatus: task!.status,
        risk: task!.risk,
        category: task!.category,
        batchId: task!.batchId,
        sourceRow: task!.sourceRow ?? 0,
        evidenceOnly: true,
        operationalRecordChanged: false,
      } satisfies Prisma.InputJsonObject,
    },
  })));

  return NextResponse.json({
    ok: true,
    recorded: selectedTasks.length,
    operationalRecordChanged: false,
    message: "Readiness evidence recorded. No family, child, staff, access, billing, or import record was changed.",
  });
}

export const GET = withApiLogging("GET", GETHandler);
export const PATCH = withApiLogging("PATCH", PATCHHandler);
