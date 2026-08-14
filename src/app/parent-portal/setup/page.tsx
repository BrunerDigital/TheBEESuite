import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ParentPortalSetupForm } from "@/components/parent-portal-setup-form";
import { getCurrentUser, isParentGuardian, requiresPasswordResetGate } from "@/lib/auth";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { getParentPortalTenantCenterIds } from "@/lib/parent-portal-family-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ParentPortalSetupPage() {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) {
    redirect("/parents/setup");
  }
  if (requiresPasswordResetGate(user)) {
    redirect("/reset-password?force=1&next=/parent-portal/setup");
  }
  if (!isParentGuardian(user)) {
    redirect("/dashboard");
  }

  const tenantCenterIds = await getParentPortalTenantCenterIds(user.tenantId);
  const guardians = await prisma.guardian.findMany({
    where: { userId: user.id, family: { centerId: { in: tenantCenterIds } } },
    orderBy: { fullName: "asc" },
    include: {
      family: {
        select: {
          id: true,
          name: true,
          centerId: true,
          children: {
            select: { id: true, fullName: true },
            orderBy: { fullName: "asc" },
          },
          _count: {
            select: { children: { where: currentlyEnrolledChildWhere() } },
          },
        },
      },
    },
  });
  const currentGuardians = guardians.filter((guardian) => guardian.family._count.children > 0);
  const scopedGuardians = currentGuardians.length ? currentGuardians : guardians;
  const centerIds = Array.from(new Set(scopedGuardians.map((guardian) => guardian.family.centerId).filter((value): value is string => Boolean(value))));
  const centers = centerIds.length
    ? await prisma.center.findMany({
        where: { id: { in: centerIds } },
        select: { id: true, name: true, crmLocationId: true },
      })
    : [];
  const centerNameById = new Map(centers.map((center) => [center.id, center.crmLocationId ?? center.name]));

  const setupGuardians = scopedGuardians.map((guardian) => ({
    id: guardian.id,
    familyId: guardian.familyId,
    fullName: guardian.fullName,
    email: guardian.email,
    phone: guardian.phone,
    relation: guardian.relation,
    preferredCommunication: guardian.preferredCommunication,
    hasPin: Boolean(guardian.checkInPinHash && guardian.checkInPinSetAt),
    familyName: guardian.family.name,
    centerName: guardian.family.centerId ? centerNameById.get(guardian.family.centerId) ?? null : null,
    children: guardian.family.children.map((child) => ({ id: child.id, fullName: child.fullName })),
  }));

  return (
    <AppShell currentUser={user}>
      <ParentPortalSetupForm guardians={setupGuardians} />
    </AppShell>
  );
}
