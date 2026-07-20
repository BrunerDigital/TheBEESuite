import { createHash, randomBytes } from "node:crypto";
import type { CurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  buildPasswordResetTokenUrl,
  generateSupabasePasswordRecoveryLink,
  getAppBaseUrl,
  getParentPortalPasswordResetRedirectUrl,
  updateSupabaseAuthUserPasswordByEmail,
} from "@/lib/supabase-auth";

export const PARENT_SETUP_LINK_TTL_MS = 60 * 60 * 1000;

export function parentSetupTokenFingerprint(tokenHash: string) {
  return createHash("sha256").update(tokenHash).digest("hex");
}

export function parentSetupTokenUsable(input: {
  status: string;
  expiresAt: Date;
  claimedAt?: Date | null;
  usedAt?: Date | null;
  revokedAt?: Date | null;
}, now = new Date()) {
  if (input.usedAt || input.status === "used") return { ok: false as const, reason: "used" as const };
  if (input.revokedAt || input.status === "revoked") return { ok: false as const, reason: "revoked" as const };
  if (input.expiresAt.getTime() <= now.getTime() || input.status === "expired") {
    return { ok: false as const, reason: "expired" as const };
  }
  if (input.claimedAt || input.status === "claimed") return { ok: false as const, reason: "claimed" as const };
  if (input.status !== "issued") return { ok: false as const, reason: "invalid" as const };
  return { ok: true as const };
}

export async function issueParentPortalSetupLink({
  requestUrl,
  user,
  parentUserId,
  guardianId,
  email,
  centerId,
  familyId,
  reason,
}: {
  requestUrl: string;
  user: CurrentUser;
  parentUserId: string;
  guardianId: string;
  email: string;
  centerId: string;
  familyId: string;
  reason: string;
}) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + PARENT_SETUP_LINK_TTL_MS);
  const recovery = await generateSupabasePasswordRecoveryLink({
    email,
    redirectTo: getParentPortalPasswordResetRedirectUrl(requestUrl),
  });
  if (!recovery.ok) {
    return { ok: false as const, error: recovery.error || "Parent password setup link could not be created." };
  }
  // Generate the recovery capability before replacing the prior credential so
  // a provider failure cannot lock out an existing parent. This function only
  // runs when an authorized school user explicitly sends a setup link; merely
  // deploying the code changes no real credential.
  const transitioned = await updateSupabaseAuthUserPasswordByEmail({
    email,
    password: randomBytes(48).toString("base64url"),
    metadataSource: "parent_setup_transition",
  });
  if (!transitioned.ok) {
    return { ok: false as const, error: transitioned.error || "Parent password setup could not be secured." };
  }

  const tokenFingerprint = parentSetupTokenFingerprint(recovery.tokenHash);
  const setupUrl = buildPasswordResetTokenUrl({
    tokenHash: recovery.tokenHash,
    appBaseUrl: getAppBaseUrl(requestUrl),
    nextPath: "/parent-portal/setup",
  });

  const token = await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { id: parentUserId, role: "PARENT_GUARDIAN" },
      data: { mustResetPassword: true, sessionVersion: { increment: 1 } },
    });
    await tx.parentPortalSetupToken.updateMany({
      where: { userId: parentUserId, status: { in: ["issued", "claimed"] } },
      data: { status: "revoked", revokedAt: issuedAt },
    });
    return tx.parentPortalSetupToken.create({
      data: {
        tenantId: user.tenantId,
        centerId,
        familyId,
        guardianId,
        userId: parentUserId,
        email,
        tokenHash: tokenFingerprint,
        status: "issued",
        deliveryStatus: "pending",
        reason,
        expiresAt,
        issuedById: user.id,
      },
    });
  });

  await writeAuditLog(user, {
    centerId,
    action: "parent_portal.setup_link_issued",
    resource: "ParentPortalSetupToken",
    resourceId: token.id,
    metadata: { familyId, guardianId, parentUserId, reason, expiresAt: expiresAt.toISOString() },
  });

  return { ok: true as const, tokenId: token.id, setupUrl, expiresAt };
}

export async function recordParentPortalSetupLinkDelivery({
  tokenId,
  delivered,
}: {
  tokenId: string;
  delivered: boolean;
}) {
  await prisma.parentPortalSetupToken.update({
    where: { id: tokenId },
    data: { deliveryStatus: delivered ? "delivered" : "failed" },
  });
}

export async function claimParentPortalSetupToken(tokenHash: string, now = new Date()) {
  const tokenFingerprint = parentSetupTokenFingerprint(tokenHash);
  const token = await prisma.parentPortalSetupToken.findUnique({ where: { tokenHash: tokenFingerprint } });
  if (!token) return { ok: true as const, tracked: false as const };

  const usable = parentSetupTokenUsable(token, now);
  if (!usable.ok) {
    await prisma.parentPortalSetupToken.update({
      where: { id: token.id },
      data: {
        ...(usable.reason === "expired" ? { status: "expired" } : {}),
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        lastFailureReason: usable.reason,
      },
    });
    return { ok: false as const, tracked: true as const, reason: usable.reason, tokenId: token.id };
  }

  const claimed = await prisma.parentPortalSetupToken.updateMany({
    where: {
      id: token.id,
      status: "issued",
      claimedAt: null,
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { status: "claimed", claimedAt: now, attemptCount: { increment: 1 }, lastAttemptAt: now, lastFailureReason: null },
  });
  if (claimed.count !== 1) {
    await prisma.parentPortalSetupToken.update({
      where: { id: token.id },
      data: { lastFailureReason: "replay" },
    });
    return { ok: false as const, tracked: true as const, reason: "replay" as const, tokenId: token.id };
  }
  return { ok: true as const, tracked: true as const, token };
}

export async function releaseParentPortalSetupToken(tokenId: string, failureReason = "provider_failure") {
  await prisma.parentPortalSetupToken.updateMany({
    where: { id: tokenId, status: "claimed", usedAt: null, revokedAt: null },
    data: { status: "issued", claimedAt: null, lastFailureReason: failureReason },
  });
}

export async function completeParentPortalSetupToken(tokenId: string, completedAt = new Date()) {
  return prisma.parentPortalSetupToken.updateMany({
    where: { id: tokenId, status: "claimed", usedAt: null, revokedAt: null },
    data: { status: "used", usedAt: completedAt, lastFailureReason: null },
  });
}
