import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { readStripeConnectedAccountId } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { stripeConnectSavedMethodNeedsReauthorization } from "@/lib/stripe-connect-migration";

type JsonRecord = Record<string, unknown>;

type Candidate = {
  auditId: string;
  billingAccountId: string;
  centerId: string;
  enabledByUserId: string;
  paymentMethodId: string;
  tenantId: string;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function date(value: unknown) {
  const parsed = new Date(clean(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function argValue(name: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1).trim() : "";
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function fingerprint(candidates: Candidate[]) {
  const rows = candidates
    .map((candidate) => [
      candidate.billingAccountId,
      candidate.centerId,
      candidate.paymentMethodId,
      candidate.auditId,
      candidate.enabledByUserId,
    ].join("|"))
    .sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

function idHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function buildPlan(db: Pick<Prisma.TransactionClient, "center" | "family" | "auditLog"> = prisma) {
  const centers = await db.center.findMany({
    where: { status: { notIn: ["closed", "archived"] } },
    select: {
      id: true,
      name: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  });
  const families = centers.length ? await db.family.findMany({
    where: { centerId: { in: centers.map((center) => center.id) } },
    select: {
      centerId: true,
      guardians: { select: { userId: true } },
      billingAccount: { select: { id: true, autopayPlaceholder: true, customFields: true } },
    },
  }) : [];
  const familiesByCenter = new Map<string, typeof families>();
  for (const family of families) {
    if (!family.centerId) continue;
    const rows = familiesByCenter.get(family.centerId) ?? [];
    rows.push(family);
    familiesByCenter.set(family.centerId, rows);
  }
  const accounts = centers.flatMap((center) => (familiesByCenter.get(center.id) ?? []).flatMap((family) => {
    if (!family.billingAccount) return [];
    const centerFields = record(center.customFields);
    const accountFields = record(family.billingAccount.customFields);
    const activeAccountId = readStripeConnectedAccountId(centerFields);
    const savedMethodAccountId = clean(accountFields.stripeDefaultPaymentMethodConnectedAccountId);
    if (!stripeConnectSavedMethodNeedsReauthorization({ activeAccountId, savedMethodAccountId, centerCustomFields: centerFields })) return [];
    if (!(family.billingAccount.autopayPlaceholder === true || accountFields.autopayEnabled === true)) return [];
    if (clean(accountFields.autopayPaymentMethodId)) return [];
    const paymentMethodId = clean(accountFields.stripeDefaultPaymentMethodId);
    const enabledByUserId = clean(accountFields.autopayEnabledByUserId);
    if (!paymentMethodId || !enabledByUserId) return [];
    return [{
      account: family.billingAccount,
      centerId: center.id,
      centerName: center.name,
      enabledByUserId,
      guardianUserIds: family.guardians.map((guardian) => clean(guardian.userId)).filter(Boolean),
      paymentMethodId,
      tenantId: center.organization.tenantId,
    }];
  }));

  const audits = accounts.length ? await db.auditLog.findMany({
    where: {
      action: "billing.autopay.enabled",
      resource: "BillingAccount",
      resourceId: { in: accounts.map((row) => row.account.id) },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, resourceId: true, userId: true, metadata: true, createdAt: true },
  }) : [];
  const latestAuditByAccount = new Map<string, typeof audits[number]>();
  for (const audit of audits) {
    if (audit.resourceId && !latestAuditByAccount.has(audit.resourceId)) latestAuditByAccount.set(audit.resourceId, audit);
  }

  const candidates: Candidate[] = [];
  const blocked: Array<{ billingAccountIdHash: string; centerName: string; reason: string }> = [];
  for (const row of accounts) {
    const fields = record(row.account.customFields);
    const audit = latestAuditByAccount.get(row.account.id);
    const savedAt = date(fields.stripePaymentMethodSavedAt);
    const enabledAt = date(fields.autopayEnabledAt);
    let reason = "";
    if (!row.guardianUserIds.includes(row.enabledByUserId)) reason = "enabled_by_user_not_linked_guardian";
    else if (!audit) reason = "missing_enable_audit";
    else if (clean(audit.userId) !== row.enabledByUserId) reason = "enable_audit_user_mismatch";
    else if (clean(record(audit.metadata).stripeDefaultPaymentMethodId) !== row.paymentMethodId) reason = "enable_audit_payment_method_mismatch";
    else if (!savedAt || !enabledAt || savedAt > enabledAt || enabledAt > audit.createdAt) reason = "consent_timeline_not_proven";
    if (reason || !audit) {
      blocked.push({ billingAccountIdHash: idHash(row.account.id), centerName: row.centerName, reason: reason || "missing_enable_audit" });
      continue;
    }
    candidates.push({
      auditId: audit.id,
      billingAccountId: row.account.id,
      centerId: row.centerId,
      enabledByUserId: row.enabledByUserId,
      paymentMethodId: row.paymentMethodId,
      tenantId: row.tenantId,
    });
  }
  candidates.sort((a, b) => a.billingAccountId.localeCompare(b.billingAccountId));
  blocked.sort((a, b) => a.billingAccountIdHash.localeCompare(b.billingAccountIdHash));
  return { blocked, candidates, fingerprint: fingerprint(candidates) };
}

async function applyPlan(expected: ReturnType<typeof fingerprint>) {
  return prisma.$transaction(async (tx) => {
    const plan = await buildPlan(tx);
    if (plan.fingerprint !== expected) throw new Error("The live consent plan changed inside the transaction. Re-run the preview.");
    const appliedAt = new Date();
    for (const candidate of plan.candidates) {
      const account = await tx.billingAccount.findUnique({
        where: { id: candidate.billingAccountId },
        select: { customFields: true },
      });
      if (!account) throw new Error("A planned billing account no longer exists.");
      const currentFields = record(account.customFields);
      if (clean(currentFields.autopayPaymentMethodId)) throw new Error("A planned billing account already has a consent binding.");
      await tx.billingAccount.update({
        where: { id: candidate.billingAccountId },
        data: {
          customFields: {
            ...currentFields,
            autopayPaymentMethodId: candidate.paymentMethodId,
            autopayConsentBindingBackfilledAt: appliedAt.toISOString(),
            autopayConsentBindingSourceAuditId: candidate.auditId,
            autopayConsentBindingVersion: "audit-backed-v1",
          } as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: candidate.tenantId,
          centerId: candidate.centerId,
          action: "billing.autopay.payment_method_consent_backfilled",
          resource: "BillingAccount",
          resourceId: candidate.billingAccountId,
          metadata: {
            sourceAuditId: candidate.auditId,
            reason: "restore_existing_parent_autopay_consent_binding",
            version: "audit-backed-v1",
          },
        },
      });
    }
    return plan.candidates.length;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 });
}

async function main() {
  loadEnvConfig(process.env.BEE_SUITE_ENV_DIR || process.cwd());
  if (!process.env.DATABASE_URL?.trim()) process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
  const apply = hasArg("--apply");
  const acknowledged = hasArg("--acknowledge-existing-parent-autopay-consent");
  const confirmedFingerprint = argValue("--confirm-fingerprint");
  const plan = await buildPlan();

  if (!apply) {
    console.log(JSON.stringify({
      mode: "read_only_preview",
      readyToBackfill: plan.candidates.length,
      blocked: plan.blocked,
      candidateAccountHashes: plan.candidates.map((candidate) => idHash(candidate.billingAccountId)),
      fingerprint: plan.fingerprint,
      effects: {
        cardCharges: 0,
        externalMessages: 0,
        stripeMutations: 0,
        databaseFieldsAddedPerCandidate: ["autopayPaymentMethodId", "consent_evidence"],
      },
    }, null, 2));
    return;
  }
  if (!acknowledged) throw new Error("--apply requires --acknowledge-existing-parent-autopay-consent.");
  if (!confirmedFingerprint || confirmedFingerprint !== plan.fingerprint) {
    throw new Error(`Fingerprint mismatch. Re-run preview and pass --confirm-fingerprint=${plan.fingerprint}.`);
  }
  const applied = await applyPlan(plan.fingerprint);
  console.log(JSON.stringify({ mode: "apply", applied, fingerprint: plan.fingerprint, cardCharges: 0, externalMessages: 0, stripeMutations: 0 }, null, 2));
}

main().finally(() => prisma.$disconnect());
