import "./load-env";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-fingerprint";

const expected = [
  { id: "cmp4ew6jo000c6alwlln6522l", name: "Kid City USA - Woodland Park - Forest Edge", before: "active", after: "closed", reason: "executive_confirmed_closed_2026-07-31" },
  { id: "cmp4ewd2500366alwocoyhl71", name: "Kid City USA - Duluth", before: "archived", after: "closed", reason: "executive_confirmed_not_opening" },
  { id: "cmp4ewdkk003e6alwds6ksewc", name: "Kid City USA - Brownsburg", before: "active", after: "closed", reason: "executive_confirmed_never_opened_as_kid_city" },
  { id: "cmp4ewdp7003g6alw6m4ovngo", name: "Kid City USA - Elkhart", before: "active", after: "closed", reason: "executive_confirmed_closed_2026-04-24" },
  { id: "cmp4ewdye003k6alwiqyr2vxz", name: "Kid City USA - Fishers", before: "archived", after: "active", reason: "executive_confirmed_active_restore" },
  { id: "cmp4ewfzn004g6alwqbqrzcql", name: "Kid City USA - Lees Summit", before: "active", after: "closed", reason: "executive_confirmed_closed_2026-08-14" },
  { id: "cmp4ewhl000546alwgxtwntq9", name: "Kid City USA - Pearland", before: "archived", after: "closed", reason: "executive_confirmed_closed_2026-03-13" },
  { id: "cmp4ewky2006i6alwgx32blwa", name: "Kid City USA - NV | Las Vegas 3 - Eastern", before: "lead_queue", after: "closed", reason: "executive_confirmed_sold_closed_2026-08-07" },
] as const;

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function loadState(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const rows = await db.center.findMany({
    where: { id: { in: expected.map((item) => item.id) } },
    select: { id: true, name: true, status: true, crmLocationId: true, organization: { select: { tenantId: true } } },
    orderBy: { id: "asc" },
  });
  if (rows.length !== expected.length) throw new Error(`Expected ${expected.length} exact centers; found ${rows.length}.`);
  for (const item of expected) {
    const row = rows.find((candidate) => candidate.id === item.id);
    if (!row || row.name !== item.name) throw new Error(`Center identity changed for ${item.id}.`);
    if (row.status !== item.before && row.status !== item.after) throw new Error(`Unexpected status ${row.status} for ${item.name}.`);
  }
  return rows;
}

function reviewedState(rows: Awaited<ReturnType<typeof loadState>>) {
  return rows.map(({ id, name, status, crmLocationId }) => ({ id, name, status, crmLocationId }));
}

async function main() {
  const before = await loadState();
  const reviewed = reviewedState(before);
  const planFingerprint = fingerprint(reviewed);
  const planned = expected.map((item) => ({
    id: item.id,
    name: item.name,
    from: before.find((row) => row.id === item.id)?.status,
    to: item.after,
    reason: item.reason,
  }));

  if (!process.argv.includes(APPLY_FLAG)) {
    console.log(JSON.stringify({ mode: "preview", planFingerprint, planned }, null, 2));
    return;
  }
  if (option(CONFIRM_FLAG) !== planFingerprint) throw new Error(`Pass ${CONFIRM_FLAG} ${planFingerprint} after reviewing the preview.`);

  await prisma.$transaction(async (tx) => {
    const current = await loadState(tx);
    if (fingerprint(reviewedState(current)) !== planFingerprint) throw new Error("Center state changed after preview; nothing was applied.");

    for (const item of expected) {
      const row = current.find((candidate) => candidate.id === item.id)!;
      if (row.status === item.after) continue;
      await tx.center.update({ where: { id: item.id }, data: { status: item.after } });
      await tx.auditLog.create({ data: {
        tenantId: row.organization.tenantId,
        centerId: row.id,
        action: "operations.center.inquiry_status_reconciled",
        resource: "Center",
        resourceId: row.id,
        metadata: {
          previousStatus: row.status,
          status: item.after,
          reason: item.reason,
          source: "executive_website_email_thread",
          leadsDeleted: 0,
          crmHistoryDeleted: 0,
        },
      } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });

  const after = await loadState();
  for (const item of expected) {
    const row = after.find((candidate) => candidate.id === item.id);
    if (row?.status !== item.after) throw new Error(`Post-check failed for ${item.name}.`);
  }
  console.log(JSON.stringify({ mode: "applied", results: reviewedState(after), leadsDeleted: 0, crmHistoryDeleted: 0 }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
