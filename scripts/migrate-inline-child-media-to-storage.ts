import "./load-env";
import { prisma } from "@/lib/prisma";
import { uploadChildMediaBuffer } from "@/lib/supabase-storage";

function parseDataUrl(value: string) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}

async function main() {
  const rows = await prisma.childMedia.findMany({
    where: {
      OR: [
        { url: { startsWith: "data:image/" } },
        { storageKey: { startsWith: "inline-demo-upload" } },
      ],
    },
    include: {
      child: {
        include: {
          family: { select: { centerId: true } },
          classroom: { select: { id: true, centerId: true } },
        },
      },
      uploadedBy: { select: { tenantId: true } },
    },
    take: 500,
  });

  let migrated = 0;
  let skipped = 0;
  for (const row of rows) {
    const parsed = parseDataUrl(row.url);
    if (!parsed) {
      skipped += 1;
      continue;
    }

    const upload = await uploadChildMediaBuffer({
      bytes: parsed.bytes,
      contentType: parsed.contentType,
      originalName: row.storageKey?.replace("inline-demo-upload:", "") || `${row.id}.jpg`,
      tenantId: row.uploadedBy?.tenantId || "legacy",
      centerId: row.child.classroom?.centerId || row.child.family.centerId,
      classroomId: row.child.classroom?.id,
      childId: row.childId,
    });

    await prisma.childMedia.update({
      where: { id: row.id },
      data: {
        url: upload.recordUrl,
        storageKey: upload.storageKey,
      },
    });
    migrated += 1;
  }

  console.log(`Migrated ${migrated} inline child media record(s). Skipped ${skipped}.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
