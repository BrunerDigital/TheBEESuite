import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { canAccessAllCenters, canManageClassroomTasks, canManageOperations, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordCommunicationSmsDeliveryAttempt, recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail, sendSms } from "@/lib/integrations";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { canAccessFamilyRecord, canCreateFamilyMessage, canMessageClassroomFamily } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";
import { twilioStatusCallbackUrl, uniqueSmsRecipients } from "@/lib/twilio-messaging";

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
  const sendSmsCopy = Boolean(body.sendSmsCopy);
  const senderIsParent = isParentGuardian(user);
  const senderCanManageOperations = canManageOperations(user);
  const senderCanManageClassroom = canManageClassroomTasks(user);

  if (!message) {
    return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
  }

  const messageGuard = canCreateFamilyMessage({
    isParentGuardian: senderIsParent,
    canManageOperations: senderCanManageOperations,
    canManageClassroomTasks: senderCanManageClassroom,
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
    guardians: Array<{ userId: string | null; email: string | null; fullName: string; phone: string | null; preferredCommunication: string | null }>;
    children: Array<{ classroomId: string | null }>;
  } | null = null;
  if (familyId) {
    family = await prisma.family.findUnique({
      where: { id: familyId },
      include: {
        guardians: { select: { userId: true, email: true, fullName: true, phone: true, preferredCommunication: true } },
        children: { select: { classroomId: true } },
      },
    });
    if (!family) return NextResponse.json({ ok: false, error: "Family not found." }, { status: 404 });

    const isFamilyGuardian = family.guardians.some((guardian) => guardian.userId === user.id);
    const hasCenterAccess = canAccessAllCenters(user) || Boolean(family.centerId && user.centerIds.includes(family.centerId));
    let hasClassroomAccess = false;
    if (!senderCanManageOperations && senderCanManageClassroom && !isFamilyGuardian) {
      const staffProfile = await prisma.staffProfile.findUnique({
        where: { userId: user.id },
        select: { classroomId: true },
      });
      const classroomGuard = canMessageClassroomFamily({
        assignedClassroomId: staffProfile?.classroomId,
        familyChildClassroomIds: family.children.map((child) => child.classroomId),
      });
      if (!classroomGuard.ok) {
        return NextResponse.json({ ok: false, error: classroomGuard.error }, { status: classroomGuard.status });
      }
      hasClassroomAccess = true;
    }
    const accessGuard = canAccessFamilyRecord({
      isParentGuardian: senderIsParent,
      isLinkedGuardian: isFamilyGuardian,
      hasCenterAccess: senderCanManageOperations ? hasCenterAccess : hasClassroomAccess,
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

  const directors = senderIsParent && family?.centerId
    ? await getCenterLeadershipUsers({
        centerId: family.centerId,
        roles: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR],
      })
    : [];
  const parentUserIds = !senderIsParent && family
    ? Array.from(new Set(family.guardians.map((guardian) => guardian.userId).filter((value): value is string => Boolean(value))))
    : [];
  const parentEmails = family
    ? [family.billingEmail, ...family.guardians.map((guardian) => guardian.email)].filter((value): value is string => Boolean(value))
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
    ...parentUserIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          title: `New school message: ${subject}`,
          body: `${user.name}: ${message}`,
          type: "message",
          priority,
        },
      }),
    ),
  ]);

  if (!senderIsParent && familyId) {
    await prisma.message.updateMany({
      where: {
        familyId,
        readAt: null,
        senderId: { not: user.id },
      },
      data: { readAt: new Date() },
    });
  }

  const emailRecipients = senderIsParent ? directors.map((director) => director.email) : parentEmails;
  const emailSubject = senderIsParent && family ? `Portal message from ${family.name}: ${subject}` : `Message from ${user.name}: ${subject}`;
  const emailReplyTo = senderIsParent ? family?.billingEmail : user.email;
  const email = sendEmailCopy && family
    ? await sendEmail({
        to: emailRecipients,
        subject: emailSubject,
        text: message,
        replyTo: emailReplyTo,
        fromName: "The BEE Suite",
        categories: ["communication_email"],
        customArgs: { messageId: created.id, familyId: family.id, centerId: family.centerId },
      })
    : { ok: false, configured: false, provider: "sendgrid" as const };
  if (sendEmailCopy && family) {
    await recordEmailDeliveryAttempt({
      tenantId: user.tenantId,
      centerId: family.centerId,
      messageId: created.id,
      purpose: "communication_email",
      to: emailRecipients,
      subject: emailSubject,
      text: message,
      replyTo: emailReplyTo,
      result: email,
      metadata: { familyId: family.id },
    });
  }
  const smsRecipients = sendSmsCopy && family && !senderIsParent
    ? uniqueSmsRecipients(
        family.guardians
          .filter((guardian) => guardian.preferredCommunication === "sms")
          .map((guardian) => guardian.phone),
      )
    : [];
  const statusCallbackUrl = smsRecipients.length ? twilioStatusCallbackUrl(request) : null;
  const smsResults = await Promise.all(
    smsRecipients.map(async (to) => {
      const result = await sendSms({ to, body: message, statusCallbackUrl });
      await recordCommunicationSmsDeliveryAttempt({
        tenantId: user.tenantId,
        centerId: family?.centerId ?? null,
        messageId: created.id,
        to,
        body: message,
        statusCallbackUrl,
        result,
      });
      return {
        ok: result.ok,
        configured: result.configured,
        provider: result.provider,
        id: result.id ?? null,
        error: result.error ?? null,
      };
    }),
  );
  const sms = {
    attempted: smsRecipients.length,
    sent: smsResults.filter((result) => result.ok).length,
    configured: smsResults.some((result) => result.configured),
    provider: "twilio",
    error: sendSmsCopy && !senderIsParent && family && smsRecipients.length === 0
      ? "No SMS-preferred guardian phone numbers are available."
      : smsResults.find((result) => result.error)?.error ?? null,
    results: smsResults,
  };

  await writeAuditLog(user, {
    centerId: family?.centerId ?? user.primaryCenterId,
    action: "message.created",
    resource: "Message",
    resourceId: created.id,
    metadata: {
      familyId,
      channel,
      priority,
      direction: senderIsParent ? "parent_to_school" : family ? "school_to_parent" : "internal",
      emailCopySent: email.ok,
      smsCopyRequested: sendSmsCopy,
      smsCopyAttempted: sms.attempted,
      smsCopySent: sms.sent,
    },
  });

  return NextResponse.json({ ok: true, message: created, email, sms }, { status: 201 });
}
