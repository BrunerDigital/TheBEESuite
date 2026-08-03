import "./load-env";
import { Prisma } from "@prisma/client";
import { writeSystemAuditLog } from "@/lib/audit";
import { claimIntegrationDeliveryForRetry, computeIntegrationDeliveryState } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import { DEFAULT_PARENT_INITIAL_PASSWORD } from "@/lib/parent-portal-invitations";
import { parentPortalInvitationSentFields } from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";
import { verifySupabasePassword } from "@/lib/supabase-auth";

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-granbury-parent-invite-timeout-retry";
const CENTER_ID = "cmp4ewhge00526alw7t62nwg4";
const CORPORATE_ACTOR_EMAIL = "corpschools@kidcityusa.com";
const TIMEOUT_ERROR = "The operation was aborted due to timeout";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

async function recordFailedClaim({
  deliveryId,
  attempts,
  maxAttempts,
  error,
}: {
  deliveryId: string;
  attempts: number;
  maxAttempts: number;
  error: string;
}) {
  const result = { ok: false, error };
  const state = computeIntegrationDeliveryState({ result, attempts, maxAttempts });
  const updated = await prisma.integrationDelivery.updateMany({
    where: { id: deliveryId, status: "pending", attempts },
    data: {
      status: state.status,
      lastResult: result as Prisma.InputJsonObject,
      lastError: error,
      nextAttemptAt: state.nextAttemptAt,
      deliveredAt: state.deliveredAt,
    },
  });
  if (updated.count !== 1) throw new Error("The Granbury delivery changed after its retry claim failed.");
}

async function main() {
  const apply = process.argv.includes(APPLY_FLAG);
  const confirmed = process.argv.includes(CONFIRM_FLAG);
  if (apply && !confirmed) throw new Error(`Live retry requires ${APPLY_FLAG} ${CONFIRM_FLAG}.`);

  const pending = await prisma.integrationDelivery.findMany({
    where: {
      centerId: CENTER_ID,
      purpose: "parent_invitation_email",
      provider: "sendgrid",
      status: "pending",
      lastError: TIMEOUT_ERROR,
      providerMessageId: null,
      createdAt: { gte: new Date("2026-08-03T00:00:00Z") },
    },
    select: {
      id: true,
      tenantId: true,
      attempts: true,
      maxAttempts: true,
      payload: true,
      nextAttemptAt: true,
    },
  });
  if (pending.length !== 1) throw new Error(`Expected one scoped Granbury timeout delivery; found ${pending.length}.`);
  const delivery = pending[0];
  if (delivery.nextAttemptAt && delivery.nextAttemptAt > new Date()) throw new Error("The scoped retry window has not elapsed.");
  const payload = record(delivery.payload);
  const recipients = strings(payload.to);
  if (recipients.length !== 1) throw new Error("The scoped delivery does not have exactly one recipient.");
  const guardianId = clean(payload.guardianId);
  const familyId = clean(payload.familyId);
  if (!guardianId || !familyId || clean(payload.centerId) !== CENTER_ID) throw new Error("The scoped delivery identity payload changed.");

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    scopedPendingDeliveries: pending.length,
    attemptsBefore: delivery.attempts,
    retryWindowElapsed: true,
    recipientCount: recipients.length,
  }, null, 2));
  if (!apply) return;

  const claim = await claimIntegrationDeliveryForRetry({
    id: delivery.id,
    attempts: delivery.attempts,
  });
  if (!claim.claimed) throw new Error("The scoped Granbury delivery was claimed by another retry worker.");

  let result: Awaited<ReturnType<typeof sendEmail>>;
  try {
    result = await sendEmail({
      to: recipients,
      subject: clean(payload.subject),
      text: clean(payload.text),
      html: clean(payload.html) || undefined,
      replyTo: clean(payload.replyTo) || undefined,
      fromName: clean(payload.fromName) || "The BEE Suite",
      disableClickTracking: true,
      categories: ["parent_invitation_email"],
      customArgs: { guardianId, familyId, centerId: CENTER_ID, authorizedImportedWave: "true" },
      tenantId: delivery.tenantId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The scoped SendGrid retry threw an unknown error.";
    await recordFailedClaim({
      deliveryId: delivery.id,
      attempts: claim.attempts,
      maxAttempts: delivery.maxAttempts,
      error: message,
    });
    throw error;
  }
  if (!result.ok) {
    const error = result.error ?? "unknown_error";
    await recordFailedClaim({
      deliveryId: delivery.id,
      attempts: claim.attempts,
      maxAttempts: delivery.maxAttempts,
      error,
    });
    throw new Error(`The scoped SendGrid retry was not accepted: ${error}`);
  }

  const matchingGuardians = await prisma.guardian.findMany({
    where: {
      email: { equals: recipients[0], mode: "insensitive" },
      family: { centerId: CENTER_ID },
    },
    select: { id: true, customFields: true },
  });
  if (!matchingGuardians.length || !matchingGuardians.some((guardian) => guardian.id === guardianId)) {
    throw new Error("The scoped recipient no longer resolves to the expected Granbury guardian.");
  }

  await prisma.$transaction(async (tx) => {
    const deliveryUpdate = await tx.integrationDelivery.updateMany({
      where: {
        id: delivery.id,
        status: "pending",
        attempts: claim.attempts,
        providerMessageId: null,
      },
      data: {
        status: "accepted",
        providerMessageId: result.id ?? null,
        lastResult: result as Prisma.InputJsonObject,
        lastError: null,
        nextAttemptAt: null,
        deliveredAt: null,
      },
    });
    if (deliveryUpdate.count !== 1) throw new Error("The Granbury delivery changed after provider acceptance.");
    for (const guardian of matchingGuardians) {
      await tx.guardian.update({
        where: { id: guardian.id },
        data: { customFields: parentPortalInvitationSentFields(guardian.customFields) },
      });
    }
  });

  const loginWorks = await verifySupabasePassword(recipients[0], DEFAULT_PARENT_INITIAL_PASSWORD);
  if (!loginWorks) throw new Error("The scoped Granbury parent password verification failed after SendGrid acceptance.");
  const actor = await prisma.user.findUnique({
    where: { email: CORPORATE_ACTOR_EMAIL },
    select: { id: true, tenantId: true, isActive: true },
  });
  if (!actor?.isActive || actor.tenantId !== delivery.tenantId) throw new Error("The Kid City audit actor is unavailable.");
  await writeSystemAuditLog({
    tenantId: delivery.tenantId,
    centerId: CENTER_ID,
    action: "parent_portal.guardian_invitation_timeout_retry_accepted",
    resource: "Guardian",
    resourceId: guardianId,
    metadata: {
      familyId,
      deliveryId: delivery.id,
      authorizedActorUserId: actor.id,
      providerAccepted: true,
      passwordVerified: true,
      directProfileEvidenceAuthorizedByUser: true,
      originalTimeoutError: TIMEOUT_ERROR,
    },
  });
  console.log(JSON.stringify({
    mode: "apply-result",
    accepted: 1,
    passwordVerified: 1,
    deliveryRecordReused: true,
  }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
