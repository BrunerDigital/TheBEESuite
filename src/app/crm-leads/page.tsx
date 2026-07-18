import { notFound, redirect } from "next/navigation";
import { renderAuthenticatedModulePage } from "@/app/[slug]/page";
import { AppShell } from "@/components/app-shell";
import { ConsolidatedWorkspaceNav } from "@/components/consolidated-workspace-nav";
import { CrmWorkspace } from "@/components/crm/crm-workspace";
import { canViewCrmLeads, getCurrentUser, getLeadScopeWhere, requiresPasswordResetGate } from "@/lib/auth";
import { loginHrefForNextPath } from "@/lib/login-routing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CrmLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedView = Array.isArray(resolvedSearchParams.view) ? resolvedSearchParams.view[0] : resolvedSearchParams.view;
  if (requestedView === "pipeline" || requestedView === "tours" || requestedView === "waitlist") {
    return renderAuthenticatedModulePage("crm-leads", resolvedSearchParams);
  }

  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect(loginHrefForNextPath("/crm-leads"));
  if (requiresPasswordResetGate(user)) redirect("/reset-password?force=1&next=/crm-leads");
  if (!canViewCrmLeads(user)) notFound();

  const centers = await prisma.center.findMany({
    where: { ...getLeadScopeWhere(user), status: { not: "closed" } },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: { id: true, name: true, crmLocationId: true, locationId: true, city: true, state: true },
  });
  const visibleCenterIds = centers.map((center) => center.id);
  const leads = await prisma.lead.findMany({
    where: {
      centerId: visibleCenterIds.length ? { in: visibleCenterIds } : { in: ["__no_visible_centers__"] },
      status: { notIn: ["closed", "merged"] },
    },
    orderBy: { createdAt: "desc" },
    take: 400,
    include: { center: { select: { id: true, name: true, crmLocationId: true, locationId: true, city: true, state: true } } },
  });

  return (
    <AppShell currentUser={user}>
      <ConsolidatedWorkspaceNav workspace="enrollment" activeView="leads" />
      <CrmWorkspace initialLeads={leads} centers={centers} currentUser={user} />
    </AppShell>
  );
}
