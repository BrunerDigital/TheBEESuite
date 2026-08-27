import "./load-env";

import { EnrollmentStage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const APPLY = "--create-haleigh-loogootee-inquiry";
const EXPECTED = [
  { gmailId: "1a041c54dfbd33b6", email: "laurabanh52@gmail.com", location: "CO | Highlands Ranch" },
  { gmailId: "1a041afce1d646d6", email: "dwest7541@gmail.com", location: "CO | Woodland Park - East Midland" },
  { gmailId: "1a0410deed05bd8a", email: "joshuarhocking11@gmail.com", location: "TX | Tyler" },
] as const;
const HALEIGH = {
  gmailId: "1a03bfa63e7431d4",
  email: "haleighnonte@gmail.com",
  name: "Haleigh Nonte",
  receivedAt: new Date("2026-08-25T22:50:44-04:00"),
  location: "IN | Loogootee",
};

function object(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

async function main() {
  const centers = await prisma.center.findMany({
    where: { OR: [
      { crmLocationId: { contains: "Highlands Ranch", mode: "insensitive" } },
      { crmLocationId: { contains: "Woodland Par", mode: "insensitive" } },
      { crmLocationId: { contains: "Tyler", mode: "insensitive" } },
      { crmLocationId: { contains: "Loogootee", mode: "insensitive" } },
      { name: { contains: "Loogootee", mode: "insensitive" } },
    ] },
    select: { id: true, name: true, status: true, crmLocationId: true, locationId: true, customFields: true },
    orderBy: { name: "asc" },
  });
  const loogootee = centers.find((center) => `${center.name} ${center.crmLocationId} ${center.locationId}`.toLowerCase().includes("loogootee"));
  if (!loogootee || loogootee.status !== "active") throw new Error("The authoritative Loogootee center is not active.");
  const loogooteeFields = object(loogootee.customFields);

  const emails = [...EXPECTED.map((item) => item.email), HALEIGH.email];
  const leads = await prisma.lead.findMany({
    where: { OR: [{ email: { in: emails, mode: "insensitive" } }, { externalId: { in: [...EXPECTED.map((item) => `gmail-inquiry:${item.gmailId}`), `gmail-inquiry:${HALEIGH.gmailId}`] } }] },
    select: { id: true, centerId: true, email: true, externalId: true, createdAt: true, center: { select: { name: true, status: true, crmLocationId: true } } },
    orderBy: [{ email: "asc" }, { createdAt: "asc" }],
  });

  const automated = EXPECTED.map((expected) => {
    const exact = leads.filter((lead) => lead.email?.toLowerCase() === expected.email);
    return { ...expected, count: exact.length, routes: exact.map((lead) => ({ id: lead.id, createdAt: lead.createdAt, center: lead.center.name, status: lead.center.status, crmLocationId: lead.center.crmLocationId, source: lead.externalId?.startsWith("gmail-inquiry:") ? "gmail_repair" : "canonical_intake" })) };
  });
  const haleighMatches = leads.filter((lead) => lead.email?.toLowerCase() === HALEIGH.email || lead.externalId === `gmail-inquiry:${HALEIGH.gmailId}`);

  if (process.argv.includes(APPLY) && haleighMatches.length === 0) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.lead.findFirst({ where: { OR: [{ externalId: `gmail-inquiry:${HALEIGH.gmailId}` }, { centerId: loogootee.id, email: { equals: HALEIGH.email, mode: "insensitive" } }] }, select: { id: true } });
      if (existing) return;
      await tx.lead.create({ data: {
        centerId: loogootee.id,
        externalId: `gmail-inquiry:${HALEIGH.gmailId}`,
        familyName: HALEIGH.name,
        parentFirstName: "Haleigh",
        parentLastName: "Nonte",
        email: HALEIGH.email,
        leadSource: "Direct email enrollment inquiry",
        ageGroupInterest: "Infant",
        programInterest: "Infant care",
        stage: EnrollmentStage.NEW_INQUIRY,
        score: 70,
        status: "open",
        createdAt: HALEIGH.receivedAt,
        customFields: { source: "gmail_direct_reply", gmailMessageId: HALEIGH.gmailId, requestedLocation: HALEIGH.location, schoolCrmLocationId: loogootee.crmLocationId, schoolPhone: typeof loogooteeFields.phone === "string" ? loogooteeFields.phone : null } as Prisma.InputJsonObject,
        tasks: { create: [{ title: `Follow up with ${HALEIGH.name}`, status: "open" }] },
        notes: { create: [{ body: "Direct email inquiry: interested in infant enrollment at Kid City USA Loogootee. Availability, tuition, and enrollment are not promised." }] },
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  const afterHaleigh = await prisma.lead.findMany({ where: { OR: [{ externalId: `gmail-inquiry:${HALEIGH.gmailId}` }, { centerId: loogootee.id, email: { equals: HALEIGH.email, mode: "insensitive" } }] }, select: { id: true, centerId: true, externalId: true, center: { select: { name: true, status: true, crmLocationId: true, customFields: true } } } });
  const publicContact = Object.fromEntries(Object.entries(loogooteeFields).filter(([key, value]) => typeof value === "string" && /phone|email|address|website/i.test(key)));
  console.log(JSON.stringify({ mode: process.argv.includes(APPLY) ? "apply" : "dry-run", loogootee: { id: loogootee.id, name: loogootee.name, status: loogootee.status, crmLocationId: loogootee.crmLocationId, publicContact }, automated, haleigh: { beforeCount: haleighMatches.length, afterCount: afterHaleigh.length, route: afterHaleigh.map((lead) => ({ center: lead.center.name, status: lead.center.status, crmLocationId: lead.center.crmLocationId })) } }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
