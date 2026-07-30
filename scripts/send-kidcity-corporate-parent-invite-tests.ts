import "./load-env";
import { pathToFileURL } from "node:url";
import type { Prisma } from "@prisma/client";
import { resolveWorkspaceBranding } from "@/lib/brand-assets";
import { defaultGuardianPinUpdate } from "@/lib/guardian-kiosk-pin";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import {
  kidCityCorporateRolloutSchools,
  normalizeRolloutEmail,
  rolloutSchoolEmailCandidates,
} from "@/lib/kidcity-corporate-rollout";
import {
  buildParentLoginSetupUrl,
  buildParentPortalInvitationHtml,
  buildParentPortalInvitationText,
  DIRECT_PARENT_PORTAL_INVITE_MODE,
} from "@/lib/parent-portal-invitations";
import { ensureParentPortalLoginForGuardian } from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";

const TEST_SOURCE = "bee_suite_parent_invite_test";
const DEFAULT_RECIPIENT = "brendenbruner@gmail.com";
const REQUIRED_ACKNOWLEDGEMENT = "--acknowledge-production-test-email";

type Args = {
  apply: boolean;
  acknowledged: boolean;
  fixtureOnly: boolean;
  provisionOnly: boolean;
  recipient: string;
  runId: string;
};

type CenterForInvite = {
  id: string;
  name: string;
  email: string | null;
  crmLocationId: string | null;
  organizationId: string;
  organization: {
    tenantId: string;
    name: string;
    tenant: { name: string; slug: string };
    brand: { name: string; slug: string } | null;
  };
  classrooms: Array<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRunId(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  if (!normalized) throw new Error("--run-id must contain at least one letter or number.");
  return normalized;
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export function buildCorporateParentInviteTestLoginEmail({
  recipient,
  school,
  runId,
}: {
  recipient: string;
  school: string;
  runId: string;
}) {
  const normalizedRecipient = recipient.trim().toLowerCase();
  const at = normalizedRecipient.lastIndexOf("@");
  if (at <= 0 || normalizedRecipient.slice(at + 1) !== "gmail.com") {
    throw new Error("Corporate parent invite tests require a Gmail delivery address so isolated + aliases reach the same inbox.");
  }
  const local = normalizedRecipient.slice(0, at).split("+")[0];
  return `${local}+bee-invite-${normalizeSlug(school)}-${normalizeRunId(runId)}@gmail.com`;
}

export function parseCorporateParentInviteTestArgs(argv = process.argv.slice(2)): Args {
  const args: Args = {
    apply: false,
    acknowledged: false,
    fixtureOnly: false,
    provisionOnly: false,
    recipient: DEFAULT_RECIPIENT,
    runId: new Date().toISOString().slice(0, 10).replaceAll("-", ""),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--fixture-only") {
      args.fixtureOnly = true;
    } else if (arg === "--provision-only") {
      args.provisionOnly = true;
    } else if (arg === REQUIRED_ACKNOWLEDGEMENT) {
      args.acknowledged = true;
    } else if (arg === "--to") {
      const value = clean(argv[index + 1]);
      if (!value) throw new Error("--to requires an email address.");
      args.recipient = value.toLowerCase();
      index += 1;
    } else if (arg.startsWith("--to=")) {
      args.recipient = clean(arg.slice("--to=".length)).toLowerCase();
    } else if (arg === "--run-id") {
      args.runId = normalizeRunId(clean(argv[index + 1]));
      index += 1;
    } else if (arg.startsWith("--run-id=")) {
      args.runId = normalizeRunId(clean(arg.slice("--run-id=".length)));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.recipient)) {
    throw new Error("--to must be a valid email address.");
  }
  if (args.fixtureOnly && args.provisionOnly) {
    throw new Error("--fixture-only and --provision-only cannot be used together.");
  }
  if ((args.apply || args.fixtureOnly || args.provisionOnly) && !args.acknowledged) {
    throw new Error(`Production parent-invite test operations require ${REQUIRED_ACKNOWLEDGEMENT}.`);
  }
  return args;
}

async function resolveCorporateRolloutCenters() {
  const centers = await prisma.center.findMany({
    where: {
      organization: {
        tenant: {
          OR: [{ slug: "kid-city-usa" }, { name: { contains: "Kid City", mode: "insensitive" } }],
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      crmLocationId: true,
      organizationId: true,
      organization: {
        select: {
          tenantId: true,
          name: true,
          tenant: { select: { name: true, slug: true } },
          brand: { select: { name: true, slug: true } },
        },
      },
      classrooms: {
        orderBy: { name: "asc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  const byEmail = new Map(
    centers
      .filter((center) => normalizeRolloutEmail(center.email))
      .map((center) => [normalizeRolloutEmail(center.email), center as CenterForInvite]),
  );
  const resolved = kidCityCorporateRolloutSchools.map((school) => {
    const center = rolloutSchoolEmailCandidates(school)
      .map((email) => byEmail.get(email))
      .find((item): item is CenterForInvite => Boolean(item));
    if (!center) throw new Error(`Corporate rollout center was not found for ${school.location}.`);
    return { school, center };
  });
  if (new Set(resolved.map(({ center }) => center.id)).size !== resolved.length) {
    throw new Error("Corporate rollout schools resolved to duplicate center records.");
  }
  return resolved;
}

async function ensureTestFixture({
  center,
  loginEmail,
  runId,
}: {
  center: CenterForInvite;
  loginEmail: string;
  runId: string;
}) {
  let classroomId = center.classrooms[0]?.id ?? null;
  if (!classroomId) {
    const classroomExternalId = `${center.id}:parent-invite-test-classroom`;
    const existingClassroom = await prisma.classroom.findFirst({
      where: { centerId: center.id, sourceSystem: TEST_SOURCE, externalId: classroomExternalId },
      select: { id: true },
    });
    const classroom = existingClassroom
      ? await prisma.classroom.update({
          where: { id: existingClassroom.id },
          data: {
            name: "BEE Parent Invite Test Classroom",
            ageGroup: "Preschool",
            capacity: 1,
            customFields: {
              syntheticTest: true,
              testPurpose: "corporate_parent_invitation",
            } satisfies Prisma.InputJsonObject,
          },
          select: { id: true },
        })
      : await prisma.classroom.create({
          data: {
            centerId: center.id,
            name: "BEE Parent Invite Test Classroom",
            ageGroup: "Preschool",
            capacity: 1,
            sourceSystem: TEST_SOURCE,
            externalId: classroomExternalId,
            customFields: {
              syntheticTest: true,
              testPurpose: "corporate_parent_invitation",
            } satisfies Prisma.InputJsonObject,
          },
          select: { id: true },
        });
    classroomId = classroom.id;
  }

  const externalBase = `${TEST_SOURCE}:${runId}:${center.id}`;
  const existingFamily = await prisma.family.findFirst({
    where: { sourceSystem: TEST_SOURCE, externalId: `${externalBase}:family` },
    select: { id: true, customFields: true },
  });
  const familyData = {
    centerId: center.id,
    name: `Brenden Parent Invite Test - ${center.name}`,
    billingEmail: loginEmail,
    notes: "Synthetic production test record for the corporate parent invitation and onboarding flow.",
    sourceSystem: TEST_SOURCE,
    externalId: `${externalBase}:family`,
    customFields: {
      syntheticTest: true,
      testPurpose: "corporate_parent_invitation",
      testRunId: runId,
      schoolId: center.id,
    } satisfies Prisma.InputJsonObject,
  };
  const family = existingFamily
    ? await prisma.family.update({ where: { id: existingFamily.id }, data: familyData, select: { id: true } })
    : await prisma.family.create({ data: familyData, select: { id: true } });

  const childExternalId = `${externalBase}:child`;
  const existingChild = await prisma.child.findFirst({
    where: { sourceSystem: TEST_SOURCE, externalId: childExternalId },
    select: { id: true },
  });
  const childData = {
    familyId: family.id,
    classroomId,
    fullName: `BEE Invite Test Child - ${center.name}`,
    preferredName: "Invite Test",
    dateOfBirth: new Date("2022-01-15T12:00:00.000Z"),
    ageGroup: "Preschool",
    enrollmentStatus: "enrolled",
    sourceSystem: TEST_SOURCE,
    externalId: childExternalId,
    customFields: {
      syntheticTest: true,
      testPurpose: "corporate_parent_invitation",
      testRunId: runId,
    } satisfies Prisma.InputJsonObject,
  };
  if (existingChild) {
    await prisma.child.update({ where: { id: existingChild.id }, data: childData });
  } else {
    await prisma.child.create({ data: childData });
  }

  const guardianExternalId = `${externalBase}:guardian`;
  const existingGuardian = await prisma.guardian.findFirst({
    where: { sourceSystem: TEST_SOURCE, externalId: guardianExternalId },
    select: { id: true },
  });
  const guardianData = {
    familyId: family.id,
    fullName: "Brenden Bruner - Parent Invite Test",
    email: loginEmail,
    phone: "(317) 555-0130",
    relation: "Test Parent / Guardian",
    preferredCommunication: "Email + portal notification",
    isBillingContact: false,
    sourceSystem: TEST_SOURCE,
    externalId: guardianExternalId,
    customFields: {
      syntheticTest: true,
      testPurpose: "corporate_parent_invitation",
      testRunId: runId,
    } satisfies Prisma.InputJsonObject,
  };
  const guardian = existingGuardian
    ? await prisma.guardian.update({ where: { id: existingGuardian.id }, data: guardianData, select: { id: true } })
    : await prisma.guardian.create({ data: guardianData, select: { id: true } });

  return { familyId: family.id, guardianId: guardian.id };
}

async function sendTests(args: Args) {
  const resolved = await resolveCorporateRolloutCenters();
  const corporateActor = await prisma.user.findUnique({
    where: { email: "corpschools@kidcityusa.com" },
    select: { id: true, tenantId: true, role: true, isActive: true },
  });
  if (!corporateActor?.isActive || corporateActor.role !== "BILLING_ADMIN") {
    throw new Error("The Kid City corporate schools billing account is not active and ready.");
  }

  const plan = resolved.map(({ school, center }) => ({
    location: school.location,
    centerId: center.id,
    centerName: center.name,
    deliveryRecipient: args.recipient,
    loginEmail: buildCorporateParentInviteTestLoginEmail({
      recipient: args.recipient,
      school: school.location,
      runId: args.runId,
    }),
  }));
  if (!args.apply && !args.fixtureOnly && !args.provisionOnly) {
    console.log(JSON.stringify({ ok: true, applied: false, runId: args.runId, tests: plan }, null, 2));
    return { ok: true, applied: false, tests: plan };
  }

  const results = [];
  for (const item of plan) {
    const center = resolved.find(({ center: candidate }) => candidate.id === item.centerId)?.center;
    if (!center) throw new Error(`Center disappeared from the resolved plan: ${item.centerId}`);

    const fixture = await ensureTestFixture({ center, loginEmail: item.loginEmail, runId: args.runId });
    if (args.fixtureOnly) {
      results.push({
        ...item,
        guardianId: fixture.guardianId,
        familyId: fixture.familyId,
        accepted: false,
        fixtureOnly: true,
      });
      continue;
    }

    const provisioned = await ensureParentPortalLoginForGuardian({
      guardianId: fixture.guardianId,
      linkedBy: corporateActor.id,
      linkedReason: TEST_SOURCE,
      resetToInitialPassword: false,
      inviteMode: DIRECT_PARENT_PORTAL_INVITE_MODE,
    });
    if (!provisioned.ok) {
      throw new Error(`${center.name} test parent provisioning failed: ${provisioned.reason}`);
    }

    const guardian = await prisma.guardian.findUnique({
      where: { id: fixture.guardianId },
      select: { checkInPinHash: true, phone: true },
    });
    if (!guardian?.checkInPinHash) {
      const pinData = defaultGuardianPinUpdate({
        guardianId: fixture.guardianId,
        phone: guardian?.phone,
        setById: corporateActor.id,
      });
      if (!pinData) throw new Error(`${center.name} test guardian could not receive a default kiosk PIN.`);
      await prisma.guardian.update({ where: { id: fixture.guardianId }, data: pinData });
    }

    if (args.provisionOnly) {
      results.push({
        ...item,
        guardianId: fixture.guardianId,
        familyId: fixture.familyId,
        credentialCreated: provisioned.credentialCreated,
        accepted: false,
        provisionedOnly: true,
      });
      continue;
    }

    const branding = resolveWorkspaceBranding({
      tenantName: center.organization.tenant.name,
      tenantSlug: center.organization.tenant.slug,
      brandName: center.organization.brand?.name,
      brandSlug: center.organization.brand?.slug,
      organizationName: center.organization.name,
      email: center.email,
    });
    const centerLabel = center.crmLocationId ?? center.name;
    const loginUrl = buildParentLoginSetupUrl("https://thebeesuite.io");
    const text = buildParentPortalInvitationText({
      guardianName: "Brenden Bruner - Parent Invite Test",
      centerLabel,
      email: item.loginEmail,
      loginUrl,
      initialPasswordIssued: provisioned.credentialCreated,
    });
    const html = buildParentPortalInvitationHtml({
      guardianName: "Brenden Bruner - Parent Invite Test",
      centerLabel,
      email: item.loginEmail,
      loginUrl,
      initialPasswordIssued: provisioned.credentialCreated,
      branding,
    });
    const subject = `[TEST ${args.runId}] ${centerLabel}: finish your parent app setup`;
    const dedupeKey = `${TEST_SOURCE}:${args.runId}:${center.id}`;
    const emailResult = await sendEmail({
      to: [args.recipient],
      subject,
      text,
      html,
      fromName: branding.name,
      disableClickTracking: true,
      categories: ["parent_invitation_email", "corporate_parent_invite_test"],
      customArgs: {
        purpose: "parent_invitation_email",
        test: true,
        testRunId: args.runId,
        guardianId: fixture.guardianId,
        familyId: fixture.familyId,
        centerId: center.id,
      },
      tenantId: center.organization.tenantId,
    });
    await recordEmailDeliveryAttempt({
      tenantId: center.organization.tenantId,
      centerId: center.id,
      dedupeKey,
      purpose: "parent_invitation_email",
      to: [args.recipient],
      subject,
      text,
      html,
      fromName: branding.name,
      result: emailResult,
      metadata: {
        test: true,
        testRunId: args.runId,
        loginEmail: item.loginEmail,
        guardianId: fixture.guardianId,
        familyId: fixture.familyId,
        schoolEmail: center.email,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: center.organization.tenantId,
        centerId: center.id,
        userId: corporateActor.id,
        action: "parent_portal.test_invitation_sent",
        resource: "Guardian",
        resourceId: fixture.guardianId,
        metadata: {
          syntheticTest: true,
          testRunId: args.runId,
          deliveryRecipient: args.recipient,
          loginEmail: item.loginEmail,
          emailAcceptedByProvider: emailResult.ok,
          credentialCreated: provisioned.credentialCreated,
        } satisfies Prisma.InputJsonObject,
      },
    });
    if (!emailResult.ok) {
      throw new Error(`${center.name} test invitation was not accepted by SendGrid: ${emailResult.error ?? "unknown error"}`);
    }

    results.push({
      ...item,
      guardianId: fixture.guardianId,
      familyId: fixture.familyId,
      credentialCreated: provisioned.credentialCreated,
      providerMessageId: emailResult.id ?? null,
      accepted: true,
    });
  }

  const result = {
    ok: true,
    applied: true,
    fixtureOnly: args.fixtureOnly,
    provisionOnly: args.provisionOnly,
    runId: args.runId,
    sent: args.provisionOnly || args.fixtureOnly ? 0 : results.length,
    fixtures: results.length,
    provisioned: args.fixtureOnly ? 0 : results.length,
    tests: results,
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  await sendTests(parseCorporateParentInviteTestArgs());
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedScriptUrl) {
  void main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
