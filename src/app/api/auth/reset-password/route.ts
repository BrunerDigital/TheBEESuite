import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateSupabasePassword, verifySupabaseRecoveryTokenHash } from "@/lib/supabase-auth";
import {
  claimParentPortalSetupToken,
  completeParentPortalSetupToken,
  releaseParentPortalSetupToken,
} from "@/lib/parent-portal-setup-links";

import { logOperationalError, withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    accessToken?: unknown;
    tokenHash?: unknown;
    password?: unknown;
  } | null;
  const accessToken = clean(body?.accessToken);
  const tokenHash = clean(body?.tokenHash);
  const password = clean(body?.password);

  if (!accessToken && !tokenHash) {
    return NextResponse.json({ ok: false, error: "Password reset link is missing or expired." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  let claimedSetupTokenId = "";
  let passwordUpdated = false;
  try {
    let resetAccessToken = accessToken;
    let verifiedEmail = "";
    if (!resetAccessToken && tokenHash) {
      const claim = await claimParentPortalSetupToken(tokenHash);
      if (!claim.ok) {
        return NextResponse.json(
          { ok: false, error: "This parent setup link is expired, already used, or replaced. Request a fresh link." },
          { status: 400 },
        );
      }
      claimedSetupTokenId = claim.tracked ? claim.token.id : "";
      const verified = await verifySupabaseRecoveryTokenHash(tokenHash);
      if (!verified.ok) {
        if (claimedSetupTokenId) await releaseParentPortalSetupToken(claimedSetupTokenId);
        logOperationalError("auth.reset_password.supabase_token_hash_failed", null);
        return NextResponse.json(
          { ok: false, error: "Password reset link is invalid or expired. Request a fresh reset link." },
          { status: 400 },
        );
      }
      resetAccessToken = verified.accessToken;
      verifiedEmail = verified.email;
    }

    const response = await updateSupabasePassword(resetAccessToken, password);
    if (!response.ok) {
      if (claimedSetupTokenId) await releaseParentPortalSetupToken(claimedSetupTokenId);
      logOperationalError("auth.reset_password.supabase_update_failed", null, { status: response.status });
      return NextResponse.json(
        { ok: false, error: "Password reset link is invalid or expired. Request a fresh reset link." },
        { status: 400 },
      );
    }
    passwordUpdated = true;
    const payload = (await response.json().catch(() => null)) as { email?: string; user?: { email?: string } } | null;
    const email = verifiedEmail || (payload?.email ?? payload?.user?.email ?? "").toLowerCase();
    if (email) {
      const users = await prisma.user.findMany({
        where: { email },
        select: { id: true, tenantId: true },
      });
      await prisma.user.updateMany({
        where: { email },
        data: {
          mustResetPassword: false,
          sessionVersion: { increment: 1 },
        },
      });
      if (claimedSetupTokenId) {
        const completedAt = new Date();
        await completeParentPortalSetupToken(claimedSetupTokenId, completedAt);
        const completedToken = await prisma.parentPortalSetupToken.findUnique({ where: { id: claimedSetupTokenId } });
        if (completedToken) {
          await prisma.auditLog.create({
            data: {
              tenantId: completedToken.tenantId,
              userId: completedToken.userId,
              centerId: completedToken.centerId,
              action: "parent_portal.setup_link_completed",
              resource: "ParentPortalSetupToken",
              resourceId: completedToken.id,
              metadata: { guardianId: completedToken.guardianId, familyId: completedToken.familyId, completedAt: completedAt.toISOString() },
            },
          });
        }
      } else {
        await Promise.all(users.map((user) => prisma.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            action: "auth.password_recovery_completed",
            resource: "User",
            resourceId: user.id,
          },
        })));
      }
    }
  } catch (error) {
    if (claimedSetupTokenId && !passwordUpdated) await releaseParentPortalSetupToken(claimedSetupTokenId).catch(() => undefined);
    logOperationalError("auth.reset_password.supabase_update_error", error);
    return NextResponse.json(
      { ok: false, error: "Password reset service is unavailable right now." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Password updated. You can now sign in with your new password.",
  });
}

export const POST = withApiLogging("POST", POSTHandler);
