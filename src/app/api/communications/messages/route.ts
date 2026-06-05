import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { canAccessAllCenters, canManageClassroomTasks, canManageOperations, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordCommunicationSmsDeliveryAttempt, recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail, sendSms } from "@/lib/integrations";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { defaultMessageTemplates, renderMessageTemplate } from "@/lib/message-templates";
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
  const templateId = clean(body.templateId) || null;
  const assignedToId = clean(body.assignedToId) || null;
  const replyToMessageId = clean(body.replyToMessageId) || null;
  let subject = clean(body.subject) || "Portal message";
  let message = clean(body.message);
  const channel = clean(body.channel) || "portal";
  const priority = clean(body.priority) || "normal";
  const sendEmailCopy = Boolean(body.sendEmailCopy);
  const sendSmsCopy = Boolean(body.sendSmsCopy);
  const sendPushCopy = body.sendPushCopy === undefined ? true : Boolean(body.sendPushCopy);
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
    children: Array<{ fullName: string; classroomId: string | null }>;
  } | null = null;
  let familyCenter: { name: string; email: string | null; phone: string | null } | null = null;
  if (familyId) {
    family = await prisma.family.findUnique({
      where: { id: familyId },
      include: {
        guardians: { select: { userId: true, email: true, fullName: true, phone: true, preferredCommunication: true } },
        children: { select: { fullName: true, classroomId: true } },
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
    familyCenter = family.centerId
      ? await prisma.center.findUnique({
          where: { id: family.centerId },
          select: { name: true, email: true, phone: true },
        })
      : null;
  }

  if (templateId && !templateId.startsWith("default-")) {
    const template = await prisma.messageTemplate.findFirst({
      where: {
        id: templateId,
        tenantId: user.tenantId,
        isActive: true,
        OR: [{ centerId: null }, ...(family?.centerId ? [{ centerId: family.centerId }] : [])],
      },
      select: { subject: true, body: true },
    });
    if (template) {
      subject = clean(body.subject) || template.subject;
      message = clean(body.message) || template.body;
    }
  } else if (templateId) {
    const template = defaultMessageTemplates.find((item) => item.id === templateId);
    if (template) {
      subject = clean(body.subject) || template.subject;
      message = clean(body.message) || template.body;
    }
  }

  const primaryGuardian = family?.guardians[0] ?? null;
  const [guardianFirstName = ""] = (primaryGuardian?.fullName ?? "").split(" ");
  const templateContext = {
    familyName: family?.name,
    guardianFirstName,
    guardianFullName: primaryGuardian?.fullName,
    childNames: family?.children.map((child) => child.fullName),
    centerName: familyCenter?.name,
    centerEmail: familyCenter?.email,
    centerPhone: familyCenter?.phone,
    senderName: user.name,
  };
  subject = renderMessageTemplate(subject, templateContext);
  message = renderMessageTemplate(message, templateContext);

  if (assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: {
        id: assignedToId,
        tenantId: user.tenantId,
        isActive: true,
        ...(family?.centerId && !canAccessAllCenters(user)
          ? {
              OR: [
                { staffProfile: { centerId: family.centerId } },
                { accessGrants: { some: { isActive: true, centerId: family.centerId } } },
              ],
            }
          : {}),
      },
      select: { id: true },
    });
    if (!assignee) {
      return NextResponse.json({ ok: false, error: "Assigned staff user is not available for this family." }, { status: 400 });
    }
  }

  if (replyToMessageId) {
    const parentMessage = await prisma.message.findFirst({
      where: { id: replyToMessageId, ...(familyId ? { familyId } : {}) },
      select: { id: true },
    });
    if (!parentMessage) {
      return NextResponse.json({ ok: false, error: "Reply target message is not available." }, { status: 400 });
    }
  }

  const created = await prisma.message.create({
    data: {
      familyId,
      senderId: user.id,
      assignedToId,
      replyToMessageId,
      templateId: templateId && !templateId.startsWith("default-") ? templateId : null,
      threadKey: familyId ? `family:${familyId}` : `internal:${user.primaryCenterId ?? user.tenantId}`,
      subject,
      body: message,
      channel,
      priority,
      sentiment: priority === "high" ? "needs_review" : "neutral",
      metadata: {
        deliveryChannels: {
          portal: true,
          email: sendEmailCopy,
          sms: sendSmsCopy,
          push: sendPushCopy,
        },
        templateId,
      },
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

  const notificationUserIds = sendPushCopy
    ? [...directors.map((director) => director.id), ...parentUserIds]
    : [];
  const notificationPreferenceRows = notificationUserIds.length
    ? await prisma.notificationPreference.findMany({
        where: {
          tenantId: user.tenantId,
          type: "messages",
          OR: [
            { userId: { in: notificationUserIds } },
            { role: { in: senderIsParent ? [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR] : [UserRole.PARENT_GUARDIAN] } },
          ],
        },
        select: { userId: true, role: true, pushEnabled: true },
      })
    : [];
  const pushDisabledUserIds = new Set(notificationPreferenceRows.filter((preference) => preference.userId && !preference.pushEnabled).map((preference) => preference.userId as string));
  const pushNotifications = await Promise.all([
    ...directors.map((director) =>
      sendPushCopy && !pushDisabledUserIds.has(director.id) ? prisma.notification.create({
        data: {
          userId: director.id,
          title: `New parent message: ${subject}`,
          body: family ? `${family.name}: ${message}` : message,
          type: "message",
          priority,
        },
      }) : null,
    ),
    ...parentUserIds.map((userId) =>
      sendPushCopy && !pushDisabledUserIds.has(userId) ? prisma.notification.create({
        data: {
          userId,
          title: `New school message: ${subject}`,
          body: `${user.name}: ${message}`,
          type: "message",
          priority,
        },
      }) : null,
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
      tenantId: user.tenantId,
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
      const result = await sendSms({ to, body: message, statusCallbackUrl, tenantId: user.tenantId });
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
      pushCopyRequested: sendPushCopy,
      pushCopyQueued: pushNotifications.filter(Boolean).length,
      assignedToId,
      templateId,
    },
  });

  return NextResponse.json({
    ok: true,
    message: created,
    email,
    sms,
    push: {
      attempted: notificationUserIds.length,
      queued: pushNotifications.filter(Boolean).length,
      provider: "in_app_notification",
      configured: Boolean(process.env.PUSH_PROVIDER_KEY),
    },
  }, { status: 201 });
}
