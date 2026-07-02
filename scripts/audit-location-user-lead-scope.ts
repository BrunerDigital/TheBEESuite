import "./load-env";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const locationUserRoles = [
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.BILLING_ADMIN,
];

function argValue(name: string) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return "unknown";
  return `${name.slice(0, 2)}***@${domain}`;
}

function cookieFrom(response: Response) {
  const setCookie =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()[0]
      : response.headers.get("set-cookie");
  return setCookie?.split(";")[0] ?? "";
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

async function main() {
  const live = hasFlag("--live");
  const appUrl = (argValue("--app-url") ?? process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://thebeesuite.io").replace(/\/+$/, "");
  const password = argValue("--password") ?? process.env.KIDCITY_DEFAULT_PASSWORD;
  const delayMs = Number.parseInt(argValue("--delay-ms") ?? process.env.KIDCITY_AUDIT_DELAY_MS ?? "0", 10);

  if (live && !password) {
    throw new Error("Live audit requires --password or KIDCITY_DEFAULT_PASSWORD.");
  }

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      email: { endsWith: "@kidcityusa.com" },
      role: { in: locationUserRoles },
      accessGrants: { some: { isActive: true, centerId: { not: null } } },
    },
    orderBy: { email: "asc" },
    select: {
      id: true,
      email: true,
      role: true,
      accessGrants: {
        where: { isActive: true },
        select: {
          id: true,
          scopeType: true,
          role: true,
          centerId: true,
          ownerGroupId: true,
          organizationId: true,
          brandId: true,
          center: {
            select: {
              id: true,
              name: true,
              crmLocationId: true,
              locationId: true,
              city: true,
              state: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const centers = await prisma.center.findMany({
    where: { status: { not: "closed" } },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      _count: { select: { leads: true } },
    },
  });
  const allCenterIds = centers.map((center) => center.id);
  const centerById = new Map(centers.map((center) => [center.id, center]));

  const dbFailures: Array<Record<string, unknown>> = [];
  const liveFailures: Array<Record<string, unknown>> = [];
  let liveChecked = 0;
  let totalLiveLeadsReturned = 0;

  const dbRows = users.map((user) => {
    const centerGrantIds = Array.from(
      new Set(
        user.accessGrants
          .filter((grant) => grant.scopeType === "CENTER" && grant.centerId && grant.center?.status !== "closed")
          .map((grant) => grant.centerId as string),
      ),
    );
    const broadGrants = user.accessGrants.filter((grant) => grant.scopeType !== "CENTER");
    const centerLabels = centerGrantIds.map((id) => centerById.get(id)?.crmLocationId ?? centerById.get(id)?.locationId ?? id);
    const expectedLeadCount = centers
      .filter((center) => centerGrantIds.includes(center.id))
      .reduce((sum, center) => sum + center._count.leads, 0);

    if (!centerGrantIds.length || broadGrants.length) {
      dbFailures.push({
        email: maskEmail(user.email),
        role: user.role,
        issue: !centerGrantIds.length ? "missing_center_grant" : "has_broad_grant",
        broadGrantTypes: broadGrants.map((grant) => grant.scopeType),
        centers: centerLabels,
      });
    }

    return {
      user,
      centerGrantIds,
      centerLabels,
      expectedLeadCount,
      unauthorizedCenterId: allCenterIds.find((id) => !centerGrantIds.includes(id)),
    };
  });

  if (live) {
    for (const [index, row] of dbRows.entries()) {
      if (index > 0 && delayMs > 0) await delay(delayMs);

      const loginResponse = await fetch(`${appUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: row.user.email, password }),
      });

      if (!loginResponse.ok) {
        liveFailures.push({
          email: maskEmail(row.user.email),
          role: row.user.role,
          issue: "login_failed",
          status: loginResponse.status,
          body: await readJson(loginResponse),
          centers: row.centerLabels,
        });
        continue;
      }

      const cookie = cookieFrom(loginResponse);
      const leadResponse = await fetch(`${appUrl}/api/leads`, {
        headers: { Cookie: cookie },
      });
      const leadJson = await readJson(leadResponse);
      liveChecked += 1;

      if (!leadResponse.ok || !Array.isArray(leadJson.leads)) {
        liveFailures.push({
          email: maskEmail(row.user.email),
          role: row.user.role,
          issue: "lead_list_failed",
          status: leadResponse.status,
          body: leadJson,
          centers: row.centerLabels,
        });
        continue;
      }

      totalLiveLeadsReturned += leadJson.leads.length;
      const returnedCenterIds = Array.from(
        new Set(
          leadJson.leads
            .map((lead: { center?: { id?: string } }) => lead.center?.id)
            .filter(Boolean),
        ),
      ) as string[];
      const leakedCenterIds = returnedCenterIds.filter((centerId) => !row.centerGrantIds.includes(centerId));

      if (leakedCenterIds.length) {
        liveFailures.push({
          email: maskEmail(row.user.email),
          role: row.user.role,
          issue: "lead_scope_leak",
          expectedCenters: row.centerLabels,
          returnedCenters: returnedCenterIds.map((id) => centerById.get(id)?.crmLocationId ?? id),
          leakedCenters: leakedCenterIds.map((id) => centerById.get(id)?.crmLocationId ?? id),
          returnedLeadCount: leadJson.leads.length,
        });
      }

      if (row.unauthorizedCenterId) {
        const deniedResponse = await fetch(`${appUrl}/api/leads?centerId=${encodeURIComponent(row.unauthorizedCenterId)}`, {
          headers: { Cookie: cookie },
        });
        if (deniedResponse.status !== 403) {
          liveFailures.push({
            email: maskEmail(row.user.email),
            role: row.user.role,
            issue: "unauthorized_center_not_blocked",
            expectedCenters: row.centerLabels,
            attemptedCenter: centerById.get(row.unauthorizedCenterId)?.crmLocationId ?? row.unauthorizedCenterId,
            status: deniedResponse.status,
            body: await readJson(deniedResponse),
          });
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: live ? "live" : "database",
        appUrl: live ? appUrl : undefined,
        checkedUsers: users.length,
        usersWithCenterOnlyGrants: dbRows.filter((row) => row.centerGrantIds.length && !row.user.accessGrants.some((grant) => grant.scopeType !== "CENTER")).length,
        dbFailures: dbFailures.length,
        liveChecked,
        liveFailures: liveFailures.length,
        totalLiveLeadsReturned,
        samples: dbRows.slice(0, 5).map((row) => ({
          email: maskEmail(row.user.email),
          role: row.user.role,
          centers: row.centerLabels,
          expectedLeadCount: row.expectedLeadCount,
        })),
        failureSamples: [...dbFailures, ...liveFailures].slice(0, 25),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
