import { UserRole } from "@prisma/client";
import { getDashboardCenterScopeWhere, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schoolRoles = new Set<UserRole>([UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR]);

export async function resolveMarketingCenter(
  user: CurrentUser,
  requestedCenterId: unknown,
) {
  const requested = typeof requestedCenterId === "string" ? requestedCenterId.trim() : "";
  if (schoolRoles.has(user.role)) {
    if (!user.primaryCenterId) throw new Error("A school assignment is required before managing social profiles.");
    if (requested && requested !== user.primaryCenterId) throw new Error("That school is outside your authorized scope.");
    const center = await prisma.center.findFirst({
      where: { AND: [{ id: user.primaryCenterId, status: "active" }, getDashboardCenterScopeWhere(user)] },
      select: { id: true, name: true, crmLocationId: true },
    });
    if (!center) throw new Error("Your assigned school is not available.");
    return center;
  }

  if (!requested) throw new Error("Choose a school before loading social messages or reviews.");
  const center = await prisma.center.findFirst({
    where: { AND: [{ id: requested, status: "active" }, getDashboardCenterScopeWhere(user)] },
    select: { id: true, name: true, crmLocationId: true },
  });
  if (!center) throw new Error("That school is outside your authorized scope.");
  return center;
}
