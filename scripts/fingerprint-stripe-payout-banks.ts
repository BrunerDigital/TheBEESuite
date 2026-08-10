import "./load-env";
import { createHash } from "node:crypto";
import { listStripeConnectedAccountPayoutBanks, readStripeConnectedAccountId } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

async function main() {
  const centers = await prisma.center.findMany({
    where: { status: { notIn: ["closed", "archived", "inactive"] } },
    orderBy: { id: "asc" },
    select: { id: true, customFields: true, organization: { select: { tenantId: true } } },
  });
  const rows: string[] = [];
  let connectedAccounts = 0;
  let payoutBanks = 0;

  for (const center of centers) {
    const accountId = readStripeConnectedAccountId(center.customFields);
    if (!accountId) continue;
    connectedAccounts += 1;
    const result = await listStripeConnectedAccountPayoutBanks({
      accountId,
      tenantId: center.organization.tenantId,
    });
    if (!result.ok) throw new Error(`Payout bank fingerprint failed for one connected school: ${result.error || "Stripe request failed."}`);
    for (const bank of result.banks) {
      payoutBanks += 1;
      rows.push([
        center.id,
        accountId,
        bank.id,
        bank.last4 || "",
        bank.status || "",
        bank.currency || "",
        bank.country || "",
        bank.defaultForCurrency ? "default" : "secondary",
      ].join("|"));
    }
  }

  const fingerprint = createHash("sha256").update(rows.sort().join("\n")).digest("hex");
  console.log(JSON.stringify({ connectedAccounts, payoutBanks, fingerprint }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Payout bank fingerprint failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
