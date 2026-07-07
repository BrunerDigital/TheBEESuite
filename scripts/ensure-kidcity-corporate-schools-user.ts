import "./load-env";
import { pathToFileURL } from "node:url";
import { Prisma, UserRole } from "@prisma/client";
import {
  type KidCityCorporateRolloutSchool,
  kidCityCorporateRolloutSchools,
  normalizeRolloutEmail,
  rolloutSchoolEmailCandidates,
  rolloutSchoolEmailCorrections,
} from "@/lib/kidcity-corporate-rollout";
import { prisma } from "@/lib/prisma";
import { upsertSupabaseAuthUserWithPassword } from "@/lib/supabase-auth";

const CORPORATE_SCHOOLS_EMAIL = "corpschools@kidcityusa.com";
const CORPORATE_SCHOOLS_NAME = "Kid City USA Corporate Schools";
const ROLLOUT_SOURCE = "kidcity_corporate_school_rollout_2026_07";

type RolloutCenter = {
  id: string;
  name: string;
  email: string | null;
  city: string | null;
  state: string | null;
  tenantId: string;
  organizationId: string | null;
};

function defaultPassword() {
  return process.env.KIDCITY_CORPORATE_SCHOOLS_PASSWORD || process.env.KIDCITY_DEFAULT_PASSWORD || process.env.DEMO_PASSWORD || "BusyBees";
}

function jsonObject(value: Prisma.JsonObject): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

async function findKidCityCenters() {
  return prisma.center.findMany({
    where: {
      organization: {
        tenant: {
          OR: [{ slug: "kid-city-usa" }, { name: { contains: "Kid City", mode: "insensitive" } }],
        },
      },
    },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      city: true,
      state: true,
      organizationId: true,
      organization: { select: { tenantId: true } },
    },
  });
}

function resolveRolloutMatches(centers: Awaited<ReturnType<typeof findKidCityCenters>>) {
  const centersByEmail = new Map<string, RolloutCenter>();
  for (const center of centers) {
    const email = normalizeRolloutEmail(center.email);
    if (!email) continue;
    centersByEmail.set(email, {
      id: center.id,
      name: center.name,
      email: center.email,
      city: center.city,
      state: center.state,
      tenantId: center.organization.tenantId,
      organizationId: center.organizationId,
    });
  }

  const matches = kidCityCorporateRolloutSchools.map((school) => {
    const candidates = rolloutSchoolEmailCandidates(school);
    const center = candidates.map((email) => centersByEmail.get(email)).find((item): item is RolloutCenter => Boolean(item));
    return { school, candidates, center: center ?? null };
  });
  const unmatched = matches.filter((match) => !match.center);
  if (unmatched.length) {
    throw new Error(
      `Could not match rollout schools to centers: ${unmatched
        .map((match) => `${match.school.location} (${match.candidates.join(", ")})`)
        .join("; ")}`,
    );
  }

  const centerIds = matches.map((match) => match.center?.id).filter((id): id is string => Boolean(id));
  const duplicateIds = centerIds.filter((id, index) => centerIds.indexOf(id) !== index);
  if (duplicateIds.length) {
    throw new Error(`Rollout schools matched duplicate center IDs: ${Array.from(new Set(duplicateIds)).join(", ")}`);
  }

  return matches as Array<{
    school: KidCityCorporateRolloutSchool;
    candidates: string[];
    center: RolloutCenter;
  }>;
}

function grantPermissions(match: {
  school: KidCityCorporateRolloutSchool;
  center: RolloutCenter;
}) {
  return jsonObject({
    source: ROLLOUT_SOURCE,
    rollout: "kidcity-corporate-procare-cutover-2026-07",
    canManagePayoutOnboarding: true,
    schoolLocation: match.school.location,
    requestedEmail: normalizeRolloutEmail(match.school.requestedEmail),
    canonicalEmail: normalizeRolloutEmail(match.school.canonicalEmail),
    matchedCenterEmail: normalizeRolloutEmail(match.center.email),
    pilot: Boolean(match.school.pilot),
  });
}

export async function ensureKidCityCorporateSchoolsUser() {
  const matches = resolveRolloutMatches(await findKidCityCenters());
  const firstCenter = matches[0]?.center;
  if (!firstCenter) throw new Error("No rollout centers were resolved.");

  const appUser = await prisma.user.upsert({
    where: { email: CORPORATE_SCHOOLS_EMAIL },
    update: {
      tenantId: firstCenter.tenantId,
      organizationId: firstCenter.organizationId,
      name: CORPORATE_SCHOOLS_NAME,
      role: UserRole.BILLING_ADMIN,
      isActive: true,
      mustResetPassword: false,
    },
    create: {
      tenantId: firstCenter.tenantId,
      organizationId: firstCenter.organizationId,
      email: CORPORATE_SCHOOLS_EMAIL,
      name: CORPORATE_SCHOOLS_NAME,
      role: UserRole.BILLING_ADMIN,
      isActive: true,
      mustResetPassword: false,
    },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  const grants = [];
  for (const match of matches) {
    const existingGrant = await prisma.userAccessGrant.findFirst({
      where: {
        userId: appUser.id,
        centerId: match.center.id,
        scopeType: "CENTER",
        isActive: true,
      },
      select: { id: true },
    });
    const data = {
      tenantId: match.center.tenantId,
      organizationId: match.center.organizationId,
      centerId: match.center.id,
      role: UserRole.BILLING_ADMIN,
      scopeType: "CENTER",
      permissions: grantPermissions(match),
      isActive: true,
      startsAt: null,
      endsAt: null,
    };
    const grant = existingGrant
      ? await prisma.userAccessGrant.update({
          where: { id: existingGrant.id },
          data,
          select: { id: true, centerId: true, role: true, scopeType: true },
        })
      : await prisma.userAccessGrant.create({
          data: { ...data, userId: appUser.id },
          select: { id: true, centerId: true, role: true, scopeType: true },
        });

    grants.push({
      ...grant,
      location: match.school.location,
      centerName: match.center.name,
      centerEmail: match.center.email,
      pilot: Boolean(match.school.pilot),
    });
  }

  const auth = await upsertSupabaseAuthUserWithPassword({
    email: CORPORATE_SCHOOLS_EMAIL,
    name: CORPORATE_SCHOOLS_NAME,
    password: defaultPassword(),
    role: UserRole.BILLING_ADMIN,
    source: ROLLOUT_SOURCE,
    updateExistingPassword: false,
  });

  const result = {
    appUser,
    auth,
    grantsCreatedOrUpdated: grants.length,
    centers: grants,
    emailCorrections: rolloutSchoolEmailCorrections(),
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  await ensureKidCityCorporateSchoolsUser();
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedScriptUrl) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
