import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { isEmail } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublicLocation = {
  crmLocationId: string;
  locationId: string;
  name: string;
  city?: string;
  state?: string;
};

type PublicLocationFile = {
  locations: PublicLocation[];
};

const allowedRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
]);

function loadPublicLocations() {
  const file = JSON.parse(
    readFileSync(join(process.cwd(), "public", "kidcity-locations.json"), "utf8"),
  ) as PublicLocationFile;
  return file.locations.filter((location) => location.crmLocationId && location.locationId);
}

async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!allowedRoles.has(user.role)) {
    return NextResponse.json({ ok: false, error: "Brand, regional, or platform access required." }, { status: 403 });
  }

  const locations = loadPublicLocations();
  const rows = await Promise.all(
    locations.map(async (location) => {
      const center = await prisma.center.findFirst({
        where: {
          status: { not: "closed" },
          OR: [
            { crmLocationId: location.crmLocationId },
            { locationId: location.locationId },
            { name: location.name },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          crmLocationId: true,
          locationId: true,
          email: true,
        },
      });

      const fallbackLocationUsers = center
        ? await prisma.userAccessGrant.count({
            where: {
              centerId: center.id,
              isActive: true,
              role: { in: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN] },
              user: {
                isActive: true,
                email: { endsWith: "@kidcityusa.com" },
              },
            },
          })
        : 0;
      const legacyDirectorProfiles = center
        ? await prisma.staffProfile.count({
            where: {
              centerId: center.id,
              user: {
                isActive: true,
                email: { endsWith: "@kidcityusa.com" },
                role: { in: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN] },
              },
            },
          })
        : 0;
      const fallbackLocationUserTargets = fallbackLocationUsers + legacyDirectorProfiles;

      const hasCenterEmail = Boolean(center?.email && isEmail(center.email));
      return {
        publicLocationId: location.locationId,
        crmLocationId: location.crmLocationId,
        name: location.name,
        city: location.city ?? "",
        state: location.state ?? "",
        centerId: center?.id ?? null,
        centerName: center?.name ?? null,
        matchedByCrmLocationId: center?.crmLocationId === location.crmLocationId,
        matchedByPublicLocationId: center?.locationId === location.locationId,
        hasNotificationTarget: hasCenterEmail || fallbackLocationUserTargets > 0,
        notificationTargetType: hasCenterEmail ? "center_email" : fallbackLocationUserTargets > 0 ? "location_user_fallback" : "none",
        fallbackLocationUserTargets,
      };
    }),
  );

  const missingCenter = rows.filter((row) => !row.centerId);
  const missingNotificationTarget = rows.filter((row) => row.centerId && !row.hasNotificationTarget);
  const crmLocationMatches = rows.filter((row) => row.matchedByCrmLocationId).length;
  const publicLocationMatches = rows.filter((row) => row.matchedByPublicLocationId).length;

  return NextResponse.json({
    ok: missingCenter.length === 0 && missingNotificationTarget.length === 0,
    summary: {
      publicLocations: locations.length,
      mappedCenters: rows.length - missingCenter.length,
      crmLocationMatches,
      publicLocationMatches,
      notificationReady: rows.length - missingCenter.length - missingNotificationTarget.length,
      missingCenter: missingCenter.length,
      missingNotificationTarget: missingNotificationTarget.length,
      checkedAt: new Date().toISOString(),
    },
    missingCenter: missingCenter.map(({ publicLocationId, crmLocationId, name, city, state }) => ({
      publicLocationId,
      crmLocationId,
      name,
      city,
      state,
    })),
    missingNotificationTarget: missingNotificationTarget.map(({ publicLocationId, crmLocationId, name, centerName, notificationTargetType }) => ({
      publicLocationId,
      crmLocationId,
      name,
      centerName,
      notificationTargetType,
    })),
  });
}

export const GET = withApiLogging("GET", GETHandler);
