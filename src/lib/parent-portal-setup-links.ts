import { createHash } from "node:crypto";
import type { CurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  buildPasswordResetTokenUrl,
  generateSupabasePasswordRecoveryLink,
  getAppBaseUrl,
  getParentPortalPasswordResetRedirectUrl,
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
  if (!recovery.ok) return recovery;

  const tokenFingerprint = parentSetupTokenFingerprint(recovery.tokenHash);
  const setupUrl = buildPasswordResetTokenUrl({
    tokenHash: recovery.tokenHash,
    appBaseUrl: getAppBaseUrl(requestUrl),
    nextPath: "/parent-portal/setup",
  });

  const token = await prisma.$transaction(async (tx) => {
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
