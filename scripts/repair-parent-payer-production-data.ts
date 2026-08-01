import "./load-env";
import { createClient } from "@supabase/supabase-js";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const TEST_SOURCE = "bee_suite_parent_invite_test";
const REPAIR_SOURCE = "parent_payer_production_repair_2026_07_31";
const CURRENT = ["enrolled", "active", "current"];
const TEST_EMAIL_PREFIX = "brendenbruner+bee-invite-";
const TEST_EMAIL_DOMAIN = "@gmail.com";
const EXPECTED = {
  testFamilies: 28,
  testChildren: 29,
  testGuardians: 28,
  testUsers: 28,
  testDeliveries: 3,
  longmontFamilies: 8,
  longmontPayers: 15,
} as const;

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function cleanEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function digits(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function repairedCustomFields(value: Prisma.JsonValue | null, details: Prisma.InputJsonObject) {
  return {
    ...object(value),
    familyLinkRepair: {
      source: REPAIR_SOURCE,
      repairedAt: new Date().toISOString(),
      ...details,
    },
  } satisfies Prisma.InputJsonObject;
}

function isSyntheticEmail(email: string) {
  return email.startsWith(TEST_EMAIL_PREFIX) && email.endsWith(TEST_EMAIL_DOMAIN);
}

async function listAuthUsers() {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)?.trim();
  invariant(url && key, "Supabase admin credentials are required to remove synthetic Auth identities.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return { client, users };
}

async function readPlan(db: Prisma.TransactionClient | typeof prisma) {
  const [testFamilies, longmontCenters, leesCenter, beachCenter] = await Promise.all([
    db.family.findMany({
      where: { sourceSystem: TEST_SOURCE },
      select: {
        id: true, centerId: true, name: true,
        guardians: { select: { id: true, userId: true, email: true, sourceSystem: true, _count: { select: { checkLogs: true, dataDeletionRequests: true } } } },
        children: { select: { id: true, fullName: true, sourceSystem: true, customFields: true, _count: { select: { medicalNotes: true, allergies: true, enrollments: true, attendance: true, checkLogs: true, dailyReports: true, incidents: true, documents: true, media: true, medicationLogs: true, locationTransitions: true } }, liveLocation: { select: { id: true } } } },
        _count: { select: { pickups: true, emergencyContacts: true, messages: true, documents: true, notesList: true, surveyResponses: true, dataDeletionRequests: true, refundRequests: true } },
        billingAccount: { select: { id: true, _count: { select: { invoices: true, payments: true, ledgerEntries: true } } } },
      },
      orderBy: { id: "asc" },
    }),
    db.center.findMany({ where: { name: { contains: "Longmont", mode: "insensitive" } }, select: { id: true, name: true } }),
    db.center.findFirst({ where: { name: "Kid City USA - Lees Summit" }, select: { id: true, name: true } }),
    db.center.findFirst({ where: { name: "Kid City USA - Beach Blvd" }, select: { id: true, name: true } }),
  ]);
  invariant(longmontCenters.length === 1, `Expected one Longmont center; found ${longmontCenters.length}.`);
  invariant(leesCenter, "Lee's Summit center was not found.");
  invariant(beachCenter, "Beach Blvd center was not found.");

  const testGuardianIds = testFamilies.flatMap((family) => family.guardians.map((guardian) => guardian.id));
  const testChildIds = testFamilies.flatMap((family) => family.children.map((child) => child.id));
  const testUserIds = [...new Set(testFamilies.flatMap((family) => family.guardians.map((guardian) => guardian.userId).filter((id): id is string => Boolean(id))))];
  const testUsers = await db.user.findMany({
    where: { id: { in: testUserIds } },
    select: {
      id: true, email: true, role: true,
      guardians: { select: { id: true, sourceSystem: true, family: { select: { sourceSystem: true } } } },
      _count: { select: { guardians: true, accessGrants: true, deviceSessions: true, auditLogs: true, notifications: true, notificationPreferences: true, notes: true, messages: true, assignedMessages: true, movedChildLocations: true, childLocationTransitions: true, medicationLogs: true, uploadedMedia: true, procareImports: true, dataDeletionRequests: true, requestedRefunds: true, reviewedRefunds: true } },
    },
    orderBy: { email: "asc" },
  });

  const noPayerLongmont = await db.family.findMany({
    where: {
      centerId: longmontCenters[0].id,
      children: { some: { enrollmentStatus: { in: CURRENT, mode: "insensitive" } } },
      guardians: { none: { isBillingContact: true } },
    },
    select: { id: true, name: true, guardians: { select: { id: true, fullName: true, email: true, isBillingContact: true } } },
    orderBy: { name: "asc" },
  });
  const longmontPayers = noPayerLongmont.flatMap((family) => family.guardians.filter((guardian) => cleanEmail(guardian.email)).map((guardian) => ({ ...guardian, familyId: family.id, familyName: family.name })));

  const [delsheka, oakleafLeads, jeremiMissing, jeremiSources, leesChildren, leesGuardians, beachChildren] = await Promise.all([
    db.guardian.findMany({ where: { fullName: { equals: "Delsheka Brown", mode: "insensitive" }, isBillingContact: true }, select: { id: true, fullName: true, email: true, phone: true, family: { select: { id: true, centerId: true, name: true, children: { select: { enrollmentStatus: true } } } } } }),
    db.lead.findMany({ where: { email: { equals: "delsheka@gmail.com", mode: "insensitive" } }, select: { id: true, centerId: true, parentFirstName: true, parentLastName: true, email: true, phone: true } }),
    db.guardian.findMany({ where: { fullName: { equals: "Enriauez, Jeremi", mode: "insensitive" }, isBillingContact: true }, select: { id: true, fullName: true, email: true, phone: true, family: { select: { id: true, centerId: true, name: true, children: { select: { enrollmentStatus: true } } } } } }),
    db.guardian.findMany({ where: { fullName: { equals: "Enriquez, Jeremi", mode: "insensitive" }, email: { not: null } }, select: { id: true, fullName: true, email: true, phone: true, family: { select: { centerId: true } } } }),
    db.child.findMany({ where: { id: { in: ["cmruzaii3014fle04liwd96kj", "cmruzawg401crle042d9fzybh"] }, family: { centerId: leesCenter.id } }, select: { id: true, familyId: true, fullName: true, externalId: true, customFields: true, _count: { select: { medicalNotes: true, allergies: true, enrollments: true, attendance: true, checkLogs: true, dailyReports: true, incidents: true, documents: true, media: true, medicationLogs: true, locationTransitions: true } }, liveLocation: { select: { id: true } }, family: { select: { id: true, emergencyContacts: { select: { id: true } }, _count: { select: { children: true, guardians: true, pickups: true, emergencyContacts: true, messages: true, documents: true, notesList: true, surveyResponses: true, dataDeletionRequests: true, refundRequests: true } }, billingAccount: { select: { id: true } } } } } }),
    db.guardian.findMany({ where: { family: { centerId: leesCenter.id }, externalId: { in: ["210978", "180526"] }, isBillingContact: true }, select: { id: true, externalId: true, email: true, familyId: true, family: { select: { externalId: true, children: { select: { id: true, enrollmentStatus: true } } } } } }),
    db.child.findMany({ where: { id: { in: ["cmruzkjam001skt04ifeh4f3s", "cmruzkhrm0017kt04c9w9x6vh"] }, family: { centerId: beachCenter.id } }, select: { id: true, familyId: true, fullName: true, externalId: true, dateOfBirth: true, customFields: true, _count: { select: { medicalNotes: true, allergies: true, enrollments: true, attendance: true, checkLogs: true, dailyReports: true, incidents: true, documents: true, media: true, medicationLogs: true, locationTransitions: true } }, liveLocation: { select: { id: true } }, family: { select: { id: true, _count: { select: { children: true, guardians: true, pickups: true, emergencyContacts: true, messages: true, documents: true, notesList: true, surveyResponses: true, dataDeletionRequests: true, refundRequests: true } }, billingAccount: { select: { id: true } } } } } }),
  ]);

  const beachDestinations = await db.family.findMany({
    where: { centerId: beachCenter.id, externalId: { in: ["EASON", "PEREZ"] } },
    select: { id: true, externalId: true, billingEmail: true, guardians: { where: { isBillingContact: true }, select: { id: true, email: true } }, children: { select: { id: true, fullName: true, dateOfBirth: true, externalId: true } } },
  });

  const testEmails = testUsers.map((user) => user.email.toLowerCase());
  const [setupTokens, deliveries, testClassrooms] = await Promise.all([
    db.parentPortalSetupToken.findMany({ where: { OR: [{ familyId: { in: testFamilies.map((family) => family.id) } }, { guardianId: { in: testGuardianIds } }, { userId: { in: testUserIds } }, { email: { in: testEmails } }] }, select: { id: true } }),
    db.integrationDelivery.findMany({ where: { payload: { path: ["test"], equals: true } }, select: { id: true, recipient: true, providerMessageId: true, payload: true } }),
    db.classroom.findMany({ where: { sourceSystem: TEST_SOURCE }, select: { id: true, _count: { select: { children: true, staff: true, dailyReports: true, incidents: true, attendance: true, checkLogs: true, media: true, currentChildLocations: true, childLocationTransitionsFrom: true, childLocationTransitionsTo: true } } } }),
  ]);
  const testFamilyIds = new Set(testFamilies.map((family) => family.id));
  const testGuardianIdSet = new Set(testGuardianIds);
  const testDeliveries = deliveries.filter((delivery) => {
    const payload = object(delivery.payload);
    return payload.test === true && typeof payload.familyId === "string" && testFamilyIds.has(payload.familyId) && typeof payload.guardianId === "string" && testGuardianIdSet.has(payload.guardianId);
  });

  return { testFamilies, testGuardianIds, testChildIds, testUsers, noPayerLongmont, longmontPayers, delsheka, oakleafLeads, jeremiMissing, jeremiSources, leesChildren, leesGuardians, beachChildren, beachDestinations, setupTokens, testDeliveries, testClassrooms };
}

function assertPlan(plan: Awaited<ReturnType<typeof readPlan>>) {
  invariant(plan.testFamilies.length === EXPECTED.testFamilies, `Expected ${EXPECTED.testFamilies} test families; found ${plan.testFamilies.length}.`);
  invariant(plan.testChildIds.length === EXPECTED.testChildren, `Expected ${EXPECTED.testChildren} test children; found ${plan.testChildIds.length}.`);
  invariant(plan.testGuardianIds.length === EXPECTED.testGuardians, `Expected ${EXPECTED.testGuardians} test guardians; found ${plan.testGuardianIds.length}.`);
  invariant(plan.testUsers.length === EXPECTED.testUsers, `Expected ${EXPECTED.testUsers} test users; found ${plan.testUsers.length}.`);
  invariant(plan.testDeliveries.length === EXPECTED.testDeliveries, `Expected ${EXPECTED.testDeliveries} synthetic invite deliveries; found ${plan.testDeliveries.length}.`);
  invariant(plan.testUsers.every((user) => user.role === "PARENT_GUARDIAN" && isSyntheticEmail(user.email.toLowerCase()) && user.guardians.length === 1 && user.guardians[0].sourceSystem === TEST_SOURCE && user.guardians[0].family.sourceSystem === TEST_SOURCE), "A proposed test-user deletion is not exclusively linked to a synthetic parent-invite fixture.");
  invariant(plan.testFamilies.every((family) => !family.billingAccount && Object.values(family._count).every((count) => count === 0)), "A synthetic family has protected operational dependencies.");
  invariant(plan.testFamilies.every((family) => family.guardians.every((guardian) => guardian.sourceSystem === TEST_SOURCE && Object.values(guardian._count).every((count) => count === 0))), "A synthetic guardian has protected operational dependencies.");
  const testChildDeps = plan.testFamilies.flatMap((family) => family.children.filter((child) => child.liveLocation || Object.values(child._count).some((count) => count !== 0)).map((child) => ({ family: family.name, childId: child.id, fullName: child.fullName, sourceSystem: child.sourceSystem, syntheticTest: object(child.customFields).syntheticTest, liveLocation: Boolean(child.liveLocation), counts: child._count })));
  invariant(testChildDeps.length === 0, `A synthetic child has protected operational dependencies: ${JSON.stringify(testChildDeps)}`);
  const disallowedUserDeps = plan.testUsers.flatMap((user) => Object.entries(user._count).filter(([key, count]) => count > 0 && !["guardians", "deviceSessions", "auditLogs", "notifications"].includes(key)).map(([key, count]) => `${user.email}:${key}:${count}`));
  invariant(disallowedUserDeps.length === 0, `Synthetic users have protected dependencies: ${disallowedUserDeps.join(", ")}`);
  invariant(plan.testClassrooms.every((room) => Object.entries(room._count).every(([key, count]) => key === "children" || count === 0)), "A synthetic classroom has non-child operational dependencies.");
  invariant(plan.noPayerLongmont.length === EXPECTED.longmontFamilies, `Expected ${EXPECTED.longmontFamilies} Longmont families without payers; found ${plan.noPayerLongmont.length}.`);
  invariant(plan.longmontPayers.length === EXPECTED.longmontPayers, `Expected ${EXPECTED.longmontPayers} valid-email Longmont guardians to select as payers; found ${plan.longmontPayers.length}.`);
  invariant(plan.noPayerLongmont.every((family) => family.guardians.some((guardian) => cleanEmail(guardian.email))), "A Longmont no-payer family has no evidence-backed email guardian.");
  invariant(plan.delsheka.length === 1 && !cleanEmail(plan.delsheka[0].email) && digits(plan.delsheka[0].phone) === "9048886194", "Delsheka Brown target no longer matches the guarded state.");
  invariant(plan.oakleafLeads.length === 1 && plan.oakleafLeads[0].centerId === plan.delsheka[0].family.centerId && digits(plan.oakleafLeads[0].phone) === digits(plan.delsheka[0].phone) && `${plan.oakleafLeads[0].parentFirstName} ${plan.oakleafLeads[0].parentLastName}`.trim().toLowerCase() === "delsheka brown", "Delsheka Brown email source does not match name, phone, and school.");
  invariant(plan.jeremiMissing.length === 1 && !cleanEmail(plan.jeremiMissing[0].email), "Jeremi Enriquez missing-email target no longer matches the guarded state.");
  invariant(plan.jeremiSources.length === 1 && plan.jeremiSources[0].family.centerId === plan.jeremiMissing[0].family.centerId && digits(plan.jeremiSources[0].phone) === digits(plan.jeremiMissing[0].phone) && cleanEmail(plan.jeremiSources[0].email) === "enriavezjeremi@gmail.com", "Jeremi Enriquez source does not match phone and school.");
  invariant(plan.leesChildren.length === 2 && plan.leesGuardians.length === 2, "Lee's Summit relink targets no longer match the guarded state.");
  const unsafeLees = plan.leesChildren.filter((child) => !(child.family._count.children === 1 && child.family._count.guardians === 0 && child.family._count.emergencyContacts === child.family.emergencyContacts.length && !child.family.billingAccount && Object.entries(child.family._count).every(([key, count]) => ["children", "guardians", "emergencyContacts"].includes(key) || count === 0)));
  invariant(unsafeLees.length === 0, `A Lee's Summit orphan family has protected dependencies: ${JSON.stringify(unsafeLees.map((child) => ({ child: child.fullName, familyId: child.familyId, counts: child.family._count, billing: child.family.billingAccount })))}`);
  invariant(plan.leesGuardians.every((guardian) => cleanEmail(guardian.email) && guardian.family.externalId), "A Lee's Summit destination payer lacks an email or account identity.");
  invariant(plan.beachChildren.length === 2 && plan.beachDestinations.length === 2, "Beach relink targets no longer match the guarded state.");
  invariant(plan.beachChildren.every((child) => child.family._count.children === 1 && child.family._count.guardians === 0 && !child.family.billingAccount && !child.liveLocation && Object.values(child._count).every((count) => count === 0) && Object.entries(child.family._count).every(([key, count]) => key === "children" || key === "guardians" || count === 0)), "A Beach orphan record has protected dependencies.");
  invariant(plan.beachDestinations.every((family) => cleanEmail(family.billingEmail) && family.guardians.some((guardian) => cleanEmail(guardian.email))), "A Beach destination family lacks an evidence-backed payer.");
}

function summary(plan: Awaited<ReturnType<typeof readPlan>>) {
  return {
    syntheticCleanup: { families: plan.testFamilies.length, children: plan.testChildIds.length, guardians: plan.testGuardianIds.length, appUsers: plan.testUsers.length, authEmails: plan.testUsers.length, setupTokens: plan.setupTokens.length, deliveries: plan.testDeliveries.length, classrooms: plan.testClassrooms.length },
    payerSelections: plan.noPayerLongmont.map((family) => ({ family: family.name, selected: family.guardians.filter((guardian) => cleanEmail(guardian.email)).map((guardian) => guardian.fullName) })),
    emailRepairs: [{ family: plan.delsheka[0]?.family.name, guardian: plan.delsheka[0]?.fullName }, { family: plan.jeremiMissing[0]?.family.name, guardian: plan.jeremiMissing[0]?.fullName }],
    familyRelinks: [...plan.leesChildren, ...plan.beachChildren].map((child) => child.fullName),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm-production-parent-payer-repair");
  const plan = await readPlan(prisma);
  assertPlan(plan);
  const auth = await listAuthUsers();
  const authByEmail = new Map(auth.users.filter((user) => user.email).map((user) => [user.email!.toLowerCase(), user]));
  const targetAuthUsers = plan.testUsers.map((user) => authByEmail.get(user.email.toLowerCase())).filter((user): user is NonNullable<typeof user> => Boolean(user));
  invariant(targetAuthUsers.length === EXPECTED.testUsers, `Expected ${EXPECTED.testUsers} matching synthetic Supabase Auth users; found ${targetAuthUsers.length}.`);
  invariant(targetAuthUsers.every((user) => user.email && isSyntheticEmail(user.email.toLowerCase())), "A Supabase Auth deletion target is outside the synthetic invite namespace.");

  if (!apply) {
    console.log(JSON.stringify({ ok: true, dryRun: true, ...summary(plan), messagesOrInvitesSent: 0, billingRecordsChanged: 0 }, null, 2));
    return;
  }
  invariant(confirmed, "Apply mode requires --confirm-production-parent-payer-repair.");

  await prisma.$transaction(async (tx) => {
    const current = await readPlan(tx);
    assertPlan(current);
    const repairedAt = new Date().toISOString();

    await tx.guardian.updateMany({ where: { id: { in: current.longmontPayers.map((guardian) => guardian.id) }, isBillingContact: false }, data: { isBillingContact: true } });
    await tx.guardian.update({ where: { id: current.delsheka[0].id }, data: { email: "delsheka@gmail.com" } });
    await tx.guardian.update({ where: { id: current.jeremiMissing[0].id }, data: { email: "enriavezjeremi@gmail.com" } });

    const leesDestinationByPerson = new Map(current.leesGuardians.map((guardian) => [guardian.externalId!, guardian.familyId]));
    for (const child of current.leesChildren) {
      const personId = child.id === "cmruzaii3014fle04liwd96kj" ? "210978" : "180526";
      const destinationFamilyId = leesDestinationByPerson.get(personId);
      invariant(destinationFamilyId, `Missing Lee's Summit destination for relationship person ${personId}.`);
      await tx.child.update({ where: { id: child.id }, data: { familyId: destinationFamilyId, customFields: repairedCustomFields(child.customFields, { fromFamilyId: child.familyId, toFamilyId: destinationFamilyId, evidence: `procare_relationship_person_id:${personId}` }) } });
      await tx.emergencyContact.updateMany({ where: { id: { in: child.family.emergencyContacts.map((contact) => contact.id) } }, data: { familyId: destinationFamilyId } });
      await tx.family.delete({ where: { id: child.familyId } });
    }

    const beachDestinationByAccount = new Map(current.beachDestinations.map((family) => [family.externalId!, family.id]));
    for (const child of current.beachChildren) {
      const account = child.fullName === "Lila Eason" ? "EASON" : "PEREZ";
      const destinationFamilyId = beachDestinationByAccount.get(account);
      invariant(destinationFamilyId, `Missing Beach destination account ${account}.`);
      await tx.child.update({ where: { id: child.id }, data: { familyId: destinationFamilyId, customFields: repairedCustomFields(child.customFields, { fromFamilyId: child.familyId, toFamilyId: destinationFamilyId, evidence: `procare_account_and_child_identity:${account}` }) } });
      await tx.family.delete({ where: { id: child.familyId } });
    }

    const providerMessageIds = current.testDeliveries.map((delivery) => delivery.providerMessageId).filter((id): id is string => Boolean(id));
    if (providerMessageIds.length) await tx.sendGridEventReceipt.deleteMany({ where: { providerMessageId: { in: providerMessageIds } } });
    await tx.integrationDelivery.deleteMany({ where: { id: { in: current.testDeliveries.map((delivery) => delivery.id) } } });
    await tx.parentPortalSetupToken.deleteMany({ where: { id: { in: current.setupTokens.map((token) => token.id) } } });
    const testUserIds = current.testUsers.map((user) => user.id);
    await tx.deviceSession.updateMany({ where: { revokedById: { in: testUserIds }, userId: { notIn: testUserIds } }, data: { revokedById: null } });
    await tx.deviceSession.deleteMany({ where: { userId: { in: testUserIds } } });
    await tx.notification.deleteMany({ where: { userId: { in: testUserIds } } });
    await tx.auditLog.updateMany({ where: { userId: { in: testUserIds } }, data: { userId: null } });
    await tx.guardian.deleteMany({ where: { id: { in: current.testGuardianIds } } });
    await tx.child.deleteMany({ where: { id: { in: current.testChildIds } } });
    await tx.family.deleteMany({ where: { id: { in: current.testFamilies.map((family) => family.id) } } });
    await tx.user.deleteMany({ where: { id: { in: testUserIds } } });
    await tx.classroom.deleteMany({ where: { id: { in: current.testClassrooms.map((room) => room.id) } } });

    const touchedCenterIds = [...new Set([
      ...current.testFamilies.map((family) => family.centerId),
      current.delsheka[0].family.centerId,
      current.jeremiMissing[0].family.centerId,
    ].filter((id): id is string => Boolean(id)))];
    const centers = await tx.center.findMany({ where: { id: { in: touchedCenterIds } }, select: { id: true, organization: { select: { tenantId: true } } } });
    for (const center of centers) {
      await tx.auditLog.create({ data: { tenantId: center.organization.tenantId, centerId: center.id, action: "parent_payer.production_data.repaired", resource: "family", metadata: { source: REPAIR_SOURCE, repairedAt, syntheticFixturesRemoved: current.testFamilies.filter((family) => family.centerId === center.id).length, messagesOrInvitesSent: 0, billingRecordsChanged: 0 } } });
    }
  }, { maxWait: 20_000, timeout: 60_000 });

  const authFailures: Array<{ email: string; message: string }> = [];
  for (const user of targetAuthUsers) {
    const { error } = await auth.client.auth.admin.deleteUser(user.id);
    if (error) authFailures.push({ email: user.email ?? user.id, message: error.message });
  }
  invariant(authFailures.length === 0, `Database repair completed, but synthetic Auth cleanup had failures: ${JSON.stringify(authFailures)}`);

  const [remainingTests, remainingAuth] = await Promise.all([
    prisma.family.count({ where: { sourceSystem: TEST_SOURCE } }),
    listAuthUsers(),
  ]);
  const remainingSyntheticAuth = remainingAuth.users.filter((user) => user.email && isSyntheticEmail(user.email.toLowerCase()));
  invariant(remainingTests === 0, `Synthetic families remain after apply: ${remainingTests}.`);
  invariant(remainingSyntheticAuth.length === 0, `Synthetic Supabase Auth identities remain after apply: ${remainingSyntheticAuth.length}.`);
  const remainingLongmontNoPayer = await prisma.family.count({ where: { centerId: plan.noPayerLongmont[0] ? (await prisma.family.findUnique({ where: { id: plan.noPayerLongmont[0].id }, select: { centerId: true } }))?.centerId : undefined, children: { some: { enrollmentStatus: { in: CURRENT, mode: "insensitive" } } }, guardians: { none: { isBillingContact: true } } } });
  invariant(remainingLongmontNoPayer === 0, `Longmont still has ${remainingLongmontNoPayer} current families without a payer.`);
  console.log(JSON.stringify({ ok: true, applied: true, ...summary(plan), authUsersDeleted: targetAuthUsers.length, messagesOrInvitesSent: 0, billingRecordsChanged: 0 }, null, 2));
}

main().finally(() => prisma.$disconnect());
