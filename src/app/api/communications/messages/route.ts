import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { canAccessAllCenters, canManageOperations, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { sendEmail } from "@/lib/integrations";
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
    const hasCenterAccess = canAccessAllCenters(user) || !family.centerId || user.centerIds.includes(family.centerId);
    if (!hasCenterAccess && !isFamilyGuardian) {
      return NextResponse.json({ ok: false, error: "You do not have access to this family." }, { status: 403 });
    }
  } else if (!canManageOperations(user) && !isParentGuardian(user)) {
    return NextResponse.json({ ok: false, error: "Message creation is not allowed for this role." }, { status: 403 });
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
    ? await prisma.staffProfile.findMany({
        where: {
          centerId: family.centerId,
          user: { isActive: true, role: { in: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR] } },
        },
        select: { userId: true, user: { select: { email: true } } },
        take: 10,
      })
    : [];

  await Promise.all([
    ...directors.map((director) =>
      prisma.notification.create({
        data: {
          userId: director.userId,
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
        to: directors.map((director) => director.user.email),
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
