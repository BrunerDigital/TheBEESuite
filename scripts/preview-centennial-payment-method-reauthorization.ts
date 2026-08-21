import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";
import { paymentMethodRequestRecipientOptions } from "@/lib/payment-method-request-forms";
import { readStripeConnectMigration, stripeConnectSavedMethodNeedsReauthorization } from "@/lib/stripe-connect-migration";
import { readStripeConnectedAccountId } from "@/lib/integrations";

loadEnvConfig(process.env.BEE_SUITE_ENV_DIR || process.cwd());

const CENTER_ID = "cms3g2the000i6a7wdd8pa20s";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  const [center, families] = await Promise.all([prisma.center.findUnique({
    where: { id: CENTER_ID },
    select: {
      id: true, name: true, status: true, customFields: true,
    },
  }), prisma.family.findMany({
    where: { centerId: CENTER_ID },
    select: {
      id: true, billingEmail: true,
      guardians: { select: { id: true, fullName: true, email: true, userId: true } },
      billingAccount: { select: { autopayPlaceholder: true, customFields: true } },
    },
  })]);
  if (!center || center.status !== "active") throw new Error("The active Centennial center was not found.");
  const migration = readStripeConnectMigration(center.customFields);
  const activeAccountId = readStripeConnectedAccountId(center.customFields);
  if (!migration.cutoverAt || activeAccountId !== migration.targetAccountId) throw new Error("Centennial is not cut over to its prepared target account.");

  const candidates = families.flatMap((family) => {
    if (!family.billingAccount) return [];
    const fields = record(family.billingAccount.customFields);
    const savedMethodId = clean(fields.stripeDefaultPaymentMethodId);
    const savedMethodAccountId = clean(fields.stripeDefaultPaymentMethodConnectedAccountId);
    const requiresReauthorization = stripeConnectSavedMethodNeedsReauthorization({
      activeAccountId,
      savedMethodAccountId,
      centerCustomFields: center.customFields,
    });
    if (!savedMethodId || !requiresReauthorization) return [];
    const recipients = paymentMethodRequestRecipientOptions({ billingEmail: family.billingEmail, guardians: family.guardians });
    const selectedRecipient = recipients[0] ?? null;
    return [{
      familyId: family.id,
      recipientCount: recipients.length,
      selectedRecipientEmail: selectedRecipient?.email ?? null,
      guardianIds: selectedRecipient?.guardianIds ?? [],
      userIds: selectedRecipient?.userIds ?? [],
      autopayEnabled: family.billingAccount.autopayPlaceholder === true || fields.autopayEnabled === true,
      paymentMethodType: clean(fields.stripePaymentMethodType) || "unknown",
      savedMethodAccountId,
    }];
  }).sort((a, b) => a.familyId.localeCompare(b.familyId));

  const fingerprint = createHash("sha256").update(JSON.stringify(candidates.map((item) => ({
    familyId: item.familyId,
    recipient: item.selectedRecipientEmail,
    savedMethodAccountId: item.savedMethodAccountId,
  })))).digest("hex");

  console.log(JSON.stringify({
    mode: "read_only_preview",
    centerId: center.id,
    centerName: center.name,
    cutoverAt: migration.cutoverAt,
    sourceAccountId: migration.sourceAccountId,
    activeAccountId,
    candidateFamilies: candidates.length,
    candidateAutopayFamilies: candidates.filter((item) => item.autopayEnabled).length,
    familiesWithoutRecipient: candidates.filter((item) => !item.selectedRecipientEmail).length,
    paymentMethodTypes: Object.fromEntries(Array.from(new Set(candidates.map((item) => item.paymentMethodType))).sort().map((type) => [type, candidates.filter((item) => item.paymentMethodType === type).length])),
    candidates: candidates.map((item) => ({
      familyId: item.familyId,
      guardianIds: item.guardianIds,
      userIds: item.userIds,
      recipientCount: item.recipientCount,
      recipientEmailHash: item.selectedRecipientEmail
        ? createHash("sha256").update(item.selectedRecipientEmail).digest("hex")
        : null,
      autopayEnabled: item.autopayEnabled,
      paymentMethodType: item.paymentMethodType,
      savedMethodAccountId: item.savedMethodAccountId,
      requiresReauthorization: true,
    })),
    fingerprint,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
