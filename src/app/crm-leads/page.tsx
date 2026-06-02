import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CrmWorkspace } from "@/components/crm/crm-workspace";
import { canViewCrmLeads, getCurrentUser, getLeadScopeWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CrmLeadsPage() {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect("/login?next=/crm-leads");
  if (user.mustResetPassword) redirect("/reset-password?force=1&next=/crm-leads");
  if (!canViewCrmLeads(user)) notFound();

  const centerWhere = { ...getLeadScopeWhere(user), status: { not: "closed" } };
  const centers = await prisma.center.findMany({
    where: centerWhere,
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      city: true,
      state: true,
    },
  });
  const visibleCenterIds = centers.map((center) => center.id);
  const leadWhere = {
    centerId: visibleCenterIds.length ? { in: visibleCenterIds } : { in: ["__no_visible_centers__"] },
  };

  const leads = await prisma.lead.findMany({
    where: leadWhere,
    orderBy: { createdAt: "desc" },
    take: 400,
    include: {
      center: {
        select: {
          id: true,
          name: true,
          crmLocationId: true,
          locationId: true,
          city: true,
          state: true,
        },
      },
    },
  });

  return (
    <AppShell currentUser={user}>
      <CrmWorkspace initialLeads={leads} centers={centers} currentUser={user} />
    </AppShell>
  );
}
