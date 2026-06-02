import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { canAccessAllCenters, canManageOperations, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { sendEmail } from "@/lib/integrations";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { canAccessFamilyRecord, canCreateFamilyMessage } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json();
  const familyId = clean(body.familyId) || null;
  const subject = clean(body.subject) || "Portal message";
  const message = clean(body.message);
  const channel = clean(body.channel) || "portal";
  const priority = clean(body.priority) || "normal";
  const sendEmailCopy = Boolean(body.sendEmailCopy);

  if (!message) {
    return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
  }

  const messageGuard = canCreateFamilyMessage({
    isParentGuardian: isParentGuardian(user),
    canManageOperations: canManageOperations(user),
    familyId,
  });
  if (!messageGuard.ok) {
    return NextResponse.json({ ok: false, error: messageGuard.error }, { status: messageGuard.status });
  }

  let family: {
    id: string;
    name: string;
    centerId: string | null;
    billingEmail: string | null;
    guardians: Array<{ userId: string | null; email: string | null }>;
  } | null = null;
  if (familyId) {
    family = await prisma.family.findUnique({
      where: { id: familyId },
      include: { guardians: { select: { userId: true, email: true } } },
    });
    if (!family) return NextResponse.json({ ok: false, error: "Family not found." }, { status: 404 });

    const isFamilyGuardian = family.guardians.some((guardian) => guardian.userId === user.id);
    const hasCenterAccess = canAccessAllCenters(user) || Boolean(family.centerId && user.centerIds.includes(family.centerId));
    const accessGuard = canAccessFamilyRecord({
      isParentGuardian: isParentGuardian(user),
      isLinkedGuardian: isFamilyGuardian,
      hasCenterAccess,
    });
    if (!accessGuard.ok) {
      return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
    }
  }

  const created = await prisma.message.create({
    data: {
      familyId,
      senderId: user.id,
      subject,
      body: message,
      channel,
      priority,
      sentiment: priority === "high" ? "needs_review" : "neutral",
    },
  });

  const directors = family?.centerId
    ? await getCenterLeadershipUsers({
        centerId: family.centerId,
        roles: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR],
      })
    : [];

  await Promise.all([
    ...directors.map((director) =>
      prisma.notification.create({
        data: {
          userId: director.id,
          title: `New parent message: ${subject}`,
          body: family ? `${family.name}: ${message}` : message,
          type: "message",
          priority,
        },
      }),
    ),
  ]);

  const email = sendEmailCopy && family
    ? await sendEmail({
        to: directors.map((director) => director.email),
        subject: `Portal message from ${family.name}: ${subject}`,
        text: message,
        fromName: "The Bee Suite",
      })
    : { ok: false, configured: false, provider: "sendgrid" as const };

  await writeAuditLog(user, {
    centerId: family?.centerId ?? user.primaryCenterId,
    action: "message.created",
    resource: "Message",
    resourceId: created.id,
    metadata: {
      familyId,
      channel,
      priority,
      emailCopySent: email.ok,
    },
  });

  return NextResponse.json({ ok: true, message: created, email }, { status: 201 });
}
