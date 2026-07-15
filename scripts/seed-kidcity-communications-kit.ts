import "./load-env";
import { prisma } from "@/lib/prisma";
import { communicationsKitTemplates } from "@/lib/communications-kit";

async function main() {
  const centers = await prisma.center.findMany({
    where: { status: "active", organization: { name: { contains: "Kid City", mode: "insensitive" } } },
    select: {
      id: true,
      name: true,
      organization: { select: { tenantId: true } },
      accessGrants: {
        where: { isActive: true, role: "CENTER_DIRECTOR", user: { isActive: true } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { userId: true },
      },
    },
  });
  const eligible = centers.filter((center) => center.name !== "Kid City USA - Unassigned Lead Queue" && center.name !== "Kid City USA");
  const rows = eligible.flatMap((center) => communicationsKitTemplates.map((template) => ({
    tenantId: center.organization.tenantId,
    centerId: center.id,
    name: template.name,
    subject: template.subject,
    body: template.body,
    category: template.category,
    channel: "email",
    mergeFields: template.mergeFields,
    isActive: true,
    createdById: center.accessGrants[0]?.userId ?? null,
  })));
  const created = await prisma.messageTemplate.createMany({ data: rows, skipDuplicates: true });
  console.log(JSON.stringify({ ok: true, locations: eligible.length, templatesPerLocation: communicationsKitTemplates.length, expected: rows.length, created: created.count, alreadyPresent: rows.length - created.count }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
