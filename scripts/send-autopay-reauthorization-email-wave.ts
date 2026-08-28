import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { sendEmail, readStripeConnectedAccountId } from "@/lib/integrations";
import {
  buildPaymentMethodRequestFormUrl,
  buildPaymentMethodRequestShortFormUrl,
  createPaymentMethodRequestToken,
  isValidPaymentRequestEmail,
  paymentMethodRequestRecipientOptions,
  storePaymentMethodRequestShortLink,
  PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
} from "@/lib/payment-method-request-forms";
import { prisma } from "@/lib/prisma";
import { stripeConnectSavedMethodNeedsReauthorization } from "@/lib/stripe-connect-migration";
import { stripeSchoolReadinessFlowFromFields } from "@/lib/stripe-school-readiness-flow";

loadEnvConfig(process.env.BEE_SUITE_ENV_DIR || process.cwd());
if (!process.env.DATABASE_URL?.trim()) process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;

const CAMPAIGN = "autopay-reauthorization-initial-v1-2026-08-28";
const SUBJECT = "One quick payment update — your autopay will remain enabled";
const APP_BASE_URL = "https://thebeesuite.io";

type Candidate = {
  billingAccountId: string;
  centerEmail: string | null;
  centerId: string;
  centerName: string;
  dedupeKey: string;
  enabledByUserId: string;
  familyId: string;
  familyName: string;
  recipientEmail: string;
  recipientLabel: string;
  tenantId: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function argValue(name: string) {
  const value = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return value ? value.slice(name.length + 1).trim() : "";
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function fingerprint(candidates: Candidate[]) {
  const rows = candidates.map((candidate) => [
    candidate.centerId,
    candidate.familyId,
    candidate.billingAccountId,
    candidate.enabledByUserId,
    candidate.recipientEmail,
    candidate.dedupeKey,
    SUBJECT,
  ].join("|")).sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

function emailText(candidate: Candidate, formUrl: string) {
  const greeting = candidate.recipientLabel && candidate.recipientLabel !== "Guardian"
    ? candidate.recipientLabel
    : "there";
  const support = candidate.centerEmail && isValidPaymentRequestEmail(candidate.centerEmail)
    ? `reply to this email or contact ${candidate.centerEmail}`
    : "contact your school office";
  return [
    `Hi ${greeting},`,
    "",
    `We know you recently confirmed autopay for ${candidate.familyName}, and we're sorry to ask you for one additional step.`,
    "",
    `${candidate.centerName} has updated the secure Stripe account used to process and deposit tuition payments. For security reasons, Stripe cannot automatically move saved payment details from one account to another. This means Stripe needs you to securely save your preferred payment method once on the updated account.`,
    "",
    "A few important things to know:",
    "",
    "- Your existing autopay choice will remain enabled.",
    "- You will not need to confirm or turn on autopay again.",
    "- No payment will be charged while completing this update.",
    "- This is not related to a security incident or data breach.",
    `- ${candidate.centerName} and The BEE Suite do not see or store your complete card information. The secure form is provided by Stripe.`,
    "",
    "Please use your private link below:",
    "",
    formUrl,
    "",
    "The process should take only a couple of minutes. After Stripe securely saves the replacement method, your existing autopay preference will continue with the updated account.",
    "",
    "We understand that being asked to revisit something you recently completed is frustrating. We sincerely apologize for the inconvenience and appreciate your help completing this final update.",
    "",
    `If you have questions or the link does not work, please ${support}. Please do not send card or bank information by email.`,
    "",
    "Thank you,",
    candidate.centerName,
    "Powered securely by The BEE Suite and Stripe",
  ].join("\n");
}

async function buildPlan() {
  const centers = await prisma.center.findMany({
    where: { status: "active" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  });
  const centerById = new Map(centers.map((center) => [center.id, center]));
  const families = await prisma.family.findMany({
    where: {
      centerId: { in: centers.map((center) => center.id) },
      children: { some: currentlyEnrolledChildWhere() },
    },
    select: {
      id: true,
      centerId: true,
      name: true,
      billingEmail: true,
      guardians: { select: { id: true, fullName: true, email: true, userId: true } },
      billingAccount: { select: { id: true, autopayPlaceholder: true, customFields: true } },
    },
  });
  const candidates: Candidate[] = [];
  const blocked: Array<{ centerName: string; familyHash: string; reason: string }> = [];
  for (const family of families) {
    const center = family.centerId ? centerById.get(family.centerId) : null;
    if (!center || !family.billingAccount) continue;
    const fields = record(family.billingAccount.customFields);
    const autopayEnabled = family.billingAccount.autopayPlaceholder === true || fields.autopayEnabled === true;
    const savedMethodId = clean(fields.stripeDefaultPaymentMethodId);
    const consentMethodId = clean(fields.autopayPaymentMethodId);
    const savedMethodAccountId = clean(fields.stripeDefaultPaymentMethodConnectedAccountId);
    const enabledByUserId = clean(fields.autopayEnabledByUserId);
    const activeAccountId = readStripeConnectedAccountId(center.customFields);
    const requiresReauthorization = stripeConnectSavedMethodNeedsReauthorization({
      activeAccountId,
      savedMethodAccountId,
      centerCustomFields: center.customFields,
    });
    if (!autopayEnabled || !savedMethodId || !requiresReauthorization) continue;
    if (!consentMethodId || consentMethodId !== savedMethodId) {
      blocked.push({ centerName: center.name, familyHash: hash(family.id), reason: "exact_autopay_payment_method_binding_not_proven" });
      continue;
    }
    if (!enabledByUserId) {
      blocked.push({ centerName: center.name, familyHash: hash(family.id), reason: "enabling_guardian_not_recorded" });
      continue;
    }
    const readiness = stripeSchoolReadinessFlowFromFields({ customFields: center.customFields, centerName: center.name });
    if (!readiness.canAcceptParentPayments) {
      blocked.push({ centerName: center.name, familyHash: hash(family.id), reason: `school_not_payment_ready:${readiness.stage}` });
      continue;
    }
    const recipient = paymentMethodRequestRecipientOptions({
      billingEmail: family.billingEmail,
      guardians: family.guardians,
    }).find((option) => enabledByUserId && option.userIds.includes(enabledByUserId));
    if (!recipient || !isValidPaymentRequestEmail(recipient.email)) {
      blocked.push({ centerName: center.name, familyHash: hash(family.id), reason: "enabled_guardian_recipient_not_available" });
      continue;
    }
    candidates.push({
      billingAccountId: family.billingAccount.id,
      centerEmail: center.email,
      centerId: center.id,
      centerName: center.name,
      dedupeKey: `${CAMPAIGN}:${family.id}:${enabledByUserId}`,
      enabledByUserId,
      familyId: family.id,
      familyName: family.name,
      recipientEmail: recipient.email,
      recipientLabel: recipient.label,
      tenantId: center.organization.tenantId,
    });
  }
  candidates.sort((a, b) => a.dedupeKey.localeCompare(b.dedupeKey));
  const existing = candidates.length ? await prisma.integrationDelivery.findMany({
    where: { dedupeKey: { in: candidates.map((candidate) => candidate.dedupeKey) } },
    select: { dedupeKey: true, status: true },
  }) : [];
  const existingByKey = new Map(existing.map((delivery) => [delivery.dedupeKey, delivery.status]));
  const sendable = candidates.filter((candidate) => !existingByKey.has(candidate.dedupeKey));
  return {
    blocked,
    candidates,
    existing: candidates.filter((candidate) => existingByKey.has(candidate.dedupeKey)).map((candidate) => ({
      familyHash: hash(candidate.familyId),
      status: existingByKey.get(candidate.dedupeKey),
    })),
    fingerprint: fingerprint(sendable),
    sendable,
  };
}

async function sendCandidate(candidate: Candidate) {
  const token = createPaymentMethodRequestToken({
    familyId: candidate.familyId,
    centerId: candidate.centerId,
    tenantId: candidate.tenantId,
    email: candidate.recipientEmail,
    intent: "payment_method_reauthorization",
  });
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  let formUrl = buildPaymentMethodRequestFormUrl(APP_BASE_URL, token);
  try {
    const code = await storePaymentMethodRequestShortLink({
      token,
      tenantId: candidate.tenantId,
      centerId: candidate.centerId,
      familyId: candidate.familyId,
      email: candidate.recipientEmail,
      expiresAt,
    });
    formUrl = buildPaymentMethodRequestShortFormUrl(APP_BASE_URL, code);
  } catch {
    // The signed full URL remains valid if the short-link table is unavailable.
  }
  const text = emailText(candidate, formUrl);
  const delivery = await prisma.integrationDelivery.create({
    data: {
      tenantId: candidate.tenantId,
      centerId: candidate.centerId,
      dedupeKey: candidate.dedupeKey,
      provider: "sendgrid",
      purpose: PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
      direction: "outbound",
      recipient: "1 recipient",
      status: "attempting",
      attempts: 1,
      maxAttempts: 1,
      payload: {
        campaign: CAMPAIGN,
        to: [candidate.recipientEmail],
        subject: SUBJECT,
        text,
        replyTo: candidate.centerEmail,
        fromName: candidate.centerName,
        formUrl,
        familyId: candidate.familyId,
        billingAccountId: candidate.billingAccountId,
        enabledByUserId: candidate.enabledByUserId,
        expiresAt: expiresAt.toISOString(),
      } as Prisma.InputJsonObject,
    },
  });
  const result = await sendEmail({
    to: [candidate.recipientEmail],
    subject: SUBJECT,
    text,
    replyTo: candidate.centerEmail,
    fromName: candidate.centerName,
    disableClickTracking: true,
    categories: [PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE],
    customArgs: {
      campaign: CAMPAIGN,
      familyId: candidate.familyId,
      centerId: candidate.centerId,
      purpose: PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
      intent: "payment_method_reauthorization",
    },
    tenantId: candidate.tenantId,
  });
  await prisma.$transaction([
    prisma.integrationDelivery.update({
      where: { id: delivery.id },
      data: {
        providerMessageId: result.id ?? null,
        status: result.ok ? "accepted" : "failed",
        lastResult: result as Prisma.InputJsonObject,
        lastError: result.error ?? null,
        nextAttemptAt: null,
      },
    }),
    prisma.auditLog.create({
      data: {
        tenantId: candidate.tenantId,
        centerId: candidate.centerId,
        action: result.ok ? "billing.autopay_reauthorization_email.accepted" : "billing.autopay_reauthorization_email.failed",
        resource: "BillingAccount",
        resourceId: candidate.billingAccountId,
        metadata: {
          campaign: CAMPAIGN,
          deliveryId: delivery.id,
          familyId: candidate.familyId,
          enabledByUserId: candidate.enabledByUserId,
          providerMessageId: result.id ?? null,
        },
      },
    }),
  ]);
  return { ok: result.ok, configured: result.configured, deliveryId: delivery.id, error: result.error ?? null };
}

async function main() {
  const apply = hasArg("--apply");
  const acknowledged = hasArg("--confirm-approved-autopay-reauthorization-email-wave");
  const confirmedFingerprint = argValue("--confirm-fingerprint");
  const plan = await buildPlan();
  const schoolCounts = Object.fromEntries([...new Set(plan.sendable.map((candidate) => candidate.centerName))].sort().map((name) => [
    name,
    plan.sendable.filter((candidate) => candidate.centerName === name).length,
  ]));
  if (!apply) {
    console.log(JSON.stringify({
      mode: "read_only_preview",
      campaign: CAMPAIGN,
      subject: SUBJECT,
      sendable: plan.sendable.length,
      alreadyRecorded: plan.existing.length,
      recordedStatuses: Object.fromEntries(plan.existing.reduce((entries, item) => entries.set(item.status ?? "unknown", (entries.get(item.status ?? "unknown") ?? 0) + 1), new Map<string, number>())),
      blocked: plan.blocked,
      schoolCounts,
      recipientHashes: plan.sendable.map((candidate) => hash(candidate.recipientEmail)),
      fingerprint: plan.fingerprint,
      effectsOnApply: {
        emailsAttempted: plan.sendable.length,
        inAppNotifications: 0,
        cardCharges: 0,
        stripeSessionsCreated: 0,
        autopayChanges: 0,
      },
    }, null, 2));
    return;
  }
  if (!acknowledged) throw new Error("Apply requires --confirm-approved-autopay-reauthorization-email-wave.");
  if (!confirmedFingerprint || confirmedFingerprint !== plan.fingerprint) {
    throw new Error(`Fingerprint mismatch. Re-run preview and pass --confirm-fingerprint=${plan.fingerprint}.`);
  }
  const results = [];
  for (const candidate of plan.sendable) {
    results.push(await sendCandidate(candidate));
  }
  const post = await buildPlan();
  console.log(JSON.stringify({
    mode: "apply",
    campaign: CAMPAIGN,
    attempted: results.length,
    accepted: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    failures: results.filter((result) => !result.ok).map((result) => ({ deliveryId: result.deliveryId, configured: result.configured, error: result.error })),
    remainingSendable: post.sendable.length,
    recordedStatuses: Object.fromEntries(post.existing.reduce((entries, item) => entries.set(item.status ?? "unknown", (entries.get(item.status ?? "unknown") ?? 0) + 1), new Map<string, number>())),
    cardCharges: 0,
    stripeSessionsCreated: 0,
    autopayChanges: 0,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
