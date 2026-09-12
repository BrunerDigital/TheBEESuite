import type { Prisma } from "@prisma/client";
import { automationTenantScopeWhere } from "./automation-tenant-scope";
import { recordPagination } from "./record-pagination";

export function automationPageHref(page: number) {
  const query = new URLSearchParams({ view: "automations" });
  if (page > 1) query.set("automationPage", String(page));
  return `/campaigns?${query}#automation-builder`;
}

/** Call inside a repeatable-read snapshot so totals and pages agree. */
export async function readAutomationPage(client: Pick<Prisma.TransactionClient, "automation" | "automationRun">, tenantId: string, requested: unknown, now: Date) {
  const scope = automationTenantScopeWhere(tenantId);
  const [total, active, paused, recentRuns] = await Promise.all([
    client.automation.count({ where: scope }),
    client.automation.count({ where: { ...scope, status: "active" } }),
    client.automation.count({ where: { ...scope, status: "paused" } }),
    client.automationRun.count({ where: { automation: scope, createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } } }),
  ]);
  const page = recordPagination(requested, total, 50);
  const automations = await client.automation.findMany({ where: scope, orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }], skip: page.skip, take: page.pageSize,
    include: { brand: { select: { name: true } }, runs: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } },
  });
  return { automations, stats: { total, active, paused, recentRuns }, pagination: { ...page, previousHref: page.page > 1 ? automationPageHref(page.page - 1) : null, nextHref: page.page < page.totalPages ? automationPageHref(page.page + 1) : null } };
}
