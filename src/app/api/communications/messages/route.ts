import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, canManageClassroomTasks, canManageOperations, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordCommunicationSmsDeliveryAttempt, recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail, sendSms } from "@/lib/integrations";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { defaultMessageTemplates, renderMessageTemplate } from "@/lib/message-templates";
import {
  broadcastSegmentIsEmpty,
  broadcastSegmentSummary,
  familyMatchesBroadcastSegment,
  normalizeMessageBroadcastSegment,
} from "@/lib/message-segmentation";
import { canAccessFamilyRecord, canCreateFamilyMessage, canMessageClassroomFamily } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";
import { twilioStatusCallbackUrl, uniqueSmsRecipients } from "@/lib/twilio-messaging";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type MessageFamilyForDelivery = {
  id: string;
  name: string;
  centerId: string | null;
  billingEmail: string | null;
  customFields?: unknown;
  guardians: Array<{
    userId: string | null;
    email: string | null;
    fullName: string;
    phone: string | null;
    preferredCommunication: string | null;
  }>;
  children: Array<{
    fullName: string;
    classroomId: string | null;
    enrollmentStatus?: string | null;
    classroom?: { name: string } | null;
  }>;
};

type MessageCenterContext = {
  name: string;
  email: string | null;
  phone: string | null;
};

function firstName(value: string | null | undefined) {
  return (value ?? "").split(" ").filter(Boolean)[0] ?? "";
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function roleLabel(role: string) {
  return role.replaceAll("_", " ").toLowerCase();
}

function buildTemplateContext({
  family,
  center,
  senderName,
  senderRole,
}: {
  family: MessageFamilyForDelivery | null;
  center: MessageCenterContext | null;
  senderName: string;
  senderRole: string;
}) {
  const primaryGuardian = family?.guardians[0] ?? null;
  const childNames = family?.children.map((child) => child.fullName) ?? [];
  return {
    familyName: family?.name,
    guardianFirstName: firstName(primaryGuardian?.fullName),
    guardianFullName: primaryGuardian?.fullName,
    guardianEmail: primaryGuardian?.email,
    childNames,
    childFirstNames: childNames.map(firstName).filter(Boolean),
    classroomNames: uniqueStrings(family?.children.map((child) => child.classroom?.name) ?? []),
    centerName: center?.name,
    centerEmail: center?.email,
    centerPhone: center?.phone,
    senderName,
    senderRole: roleLabel(senderRole),
    today: new Date(),
  };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json();
  const familyId = clean(body.familyId) || null;
  const targetMode = clean(body.targetMode) === "broadcast" ? "broadcast" : "family";
  const broadcastSegment = normalizeMessageBroadcastSegment(body.broadcastSegment);
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
    familyId: targetMode === "broadcast" ? null : familyId,
  });
  if (!messageGuard.ok) {
    return NextResponse.json({ ok: false, error: messageGuard.error }, { status: messageGuard.status });
  }

  if (targetMode === "broadcast") {
    if (!senderCanManageOperations || senderIsParent) {
      return NextResponse.json({ ok: false, error: "Broadcast messaging requires school operations access." }, { status: 403 });
    }
    if (replyToMessageId) {
      return NextResponse.json({ ok: false, error: "Broadcast messages cannot be sent as thread replies." }, { status: 400 });
    }

    const requestedCenterIds = broadcastSegment.centerIds;
    const scopedCenterIds = canAccessAllCenters(user)
      ? requestedCenterIds
      : requestedCenterIds.length
        ? requestedCenterIds.filter((centerId) => user.centerIds.includes(centerId))
        : user.centerIds;
    if (!canAccessAllCenters(user) && requestedCenterIds.some((centerId) => !user.centerIds.includes(centerId))) {
      return NextResponse.json({ ok: false, error: "One or more selected centers are outside your access scope." }, { status: 403 });
    }

    if (broadcastSegment.classroomIds.length) {
      const selectedClassrooms = await prisma.classroom.findMany({
        where: { id: { in: broadcastSegment.classroomIds } },
        select: { id: true, centerId: true },
      });
      if (selectedClassrooms.length !== broadcastSegment.classroomIds.length) {
        return NextResponse.json({ ok: false, error: "One or more selected classrooms are unavailable." }, { status: 400 });
      }
      const inaccessibleClassroom = selectedClassrooms.find((classroom) =>
        !canAccessAllCenters(user) && !user.centerIds.includes(classroom.centerId),
      );
      if (inaccessibleClassroom) {
        return NextResponse.json({ ok: false, error: "One or more selected classrooms are outside your access scope." }, { status: 403 });
      }
    }

    const familyWhere: Prisma.FamilyWhereInput = {
      ...(scopedCenterIds.length ? { centerId: { in: scopedCenterIds } } : {}),
      ...(broadcastSegment.classroomIds.length
        ? { children: { some: { classroomId: { in: broadcastSegment.classroomIds } } } }
        : {}),
    };
    const candidateFamilies = await prisma.family.findMany({
      where: familyWhere,
      orderBy: { name: "asc" },
      take: 1000,
      include: {
        guardians: { select: { userId: true, email: true, fullName: true, phone: true, preferredCommunication: true } },
        children: {
          select: {
            fullName: true,
            classroomId: true,
            enrollmentStatus: true,
            classroom: { select: { name: true } },
          },
        },
      },
    });
    const targetFamilies = candidateFamilies.filter((family) => familyMatchesBroadcastSegment(family, broadcastSegment));
    if (!targetFamilies.length) {
      const emptyDetail = broadcastSegmentIsEmpty(broadcastSegment) ? "No visible families are available." : "No families match the selected segment.";
      return NextResponse.json({ ok: false, error: emptyDetail }, { status: 400 });
    }

    const familyCenterIds = uniqueStrings(targetFamilies.map((family) => family.centerId));
    const centerRows = await prisma.center.findMany({
      where: { id: { in: familyCenterIds } },
      select: { id: true, name: true, email: true, phone: true },
    });
    const centerById = new Map(centerRows.map((center) => [center.id, center]));

    let selectedTemplate: { subject: string; body: string } | null = null;
    if (templateId && !templateId.startsWith("default-")) {
      selectedTemplate = await prisma.messageTemplate.findFirst({
        where: {
          id: templateId,
          tenantId: user.tenantId,
          isActive: true,
          OR: [{ centerId: null }, { centerId: { in: familyCenterIds } }],
        },
        select: { subject: true, body: true },
      });
    } else if (templateId) {
      selectedTemplate = defaultMessageTemplates.find((item) => item.id === templateId) ?? null;
    }
    if (selectedTemplate) {
      subject = clean(body.subject) || selectedTemplate.subject;
      message = clean(body.message) || selectedTemplate.body;
    }

    if (assignedToId) {
      const assignee = await prisma.user.findFirst({
        where: {
          id: assignedToId,
          tenantId: user.tenantId,
          isActive: true,
          ...(canAccessAllCenters(user)
            ? {}
            : {
                OR: [
                  { staffProfile: { centerId: { in: familyCenterIds } } },
                  { accessGrants: { some: { isActive: true, centerId: { in: familyCenterIds } } } },
                ],
              }),
        },
        select: { id: true },
      });
      if (!assignee) {
        return NextResponse.json({ ok: false, error: "Assigned staff user is not available for this broadcast." }, { status: 400 });
      }
    }

    const statusCallbackUrl = sendSmsCopy ? twilioStatusCallbackUrl(request) : null;
    const broadcastParentUserIds = uniqueStrings(targetFamilies.flatMap((familyRow) => familyRow.guardians.map((guardian) => guardian.userId)));
    const broadcastNotificationPreferences = sendPushCopy && broadcastParentUserIds.length
      ? await prisma.notificationPreference.findMany({
          where: {
            tenantId: user.tenantId,
            type: "messages",
            OR: [
              { userId: { in: broadcastParentUserIds } },
              { role: UserRole.PARENT_GUARDIAN },
            ],
          },
          select: { userId: true, pushEnabled: true },
        })
      : [];
    const pushDisabledUserIds = new Set(
      broadcastNotificationPreferences
        .filter((preference) => preference.userId && !preference.pushEnabled)
        .map((preference) => preference.userId as string),
    );
    const createdMessages = [];
    const emailResults = [];
    const smsResults = [];
    const pushNotifications = [];

    for (const targetFamily of targetFamilies) {
      const center = targetFamily.centerId ? centerById.get(targetFamily.centerId) ?? null : null;
      const context = buildTemplateContext({
        family: targetFamily,
        center,
        senderName: user.name,
        senderRole: user.role,
      });
      const renderedSubject = renderMessageTemplate(subject, context);
      const renderedMessage = renderMessageTemplate(message, context);
      const created = await prisma.message.create({
        data: {
          familyId: targetFamily.id,
          senderId: user.id,
          assignedToId,
          templateId: templateId && !templateId.startsWith("default-") ? templateId : null,
          threadKey: `family:${targetFamily.id}`,
          subject: renderedSubject,
          body: renderedMessage,
          channel: "broadcast",
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
            broadcast: {
              segment: broadcastSegment,
              summary: broadcastSegmentSummary(broadcastSegment),
              recipientCount: targetFamilies.length,
            },
          },
        },
      });
      createdMessages.push(created);

      const parentEmails = uniqueStrings([targetFamily.billingEmail, ...targetFamily.guardians.map((guardian) => guardian.email)]);
      if (sendEmailCopy) {
        const email = await sendEmail({
          to: parentEmails,
          subject: `Message from ${user.name}: ${renderedSubject}`,
          text: renderedMessage,
          replyTo: user.email,
          fromName: "The BEE Suite",
          categories: ["communication_email", "broadcast"],
          customArgs: { messageId: created.id, familyId: targetFamily.id, centerId: targetFamily.centerId },
          tenantId: user.tenantId,
        });
        await recordEmailDeliveryAttempt({
          tenantId: user.tenantId,
          centerId: targetFamily.centerId,
          messageId: created.id,
          purpose: "communication_email",
          to: parentEmails,
          subject: `Message from ${user.name}: ${renderedSubject}`,
          text: renderedMessage,
          replyTo: user.email,
          result: email,
          metadata: { familyId: targetFamily.id, broadcast: true },
        });
        emailResults.push(email);
      }

      if (sendSmsCopy) {
        const smsRecipients = uniqueSmsRecipients(
          targetFamily.guardians
            .filter((guardian) => guardian.preferredCommunication === "sms")
            .map((guardian) => guardian.phone),
        );
        for (const to of smsRecipients) {
          const result = await sendSms({ to, body: renderedMessage, statusCallbackUrl, tenantId: user.tenantId });
          await recordCommunicationSmsDeliveryAttempt({
            tenantId: user.tenantId,
            centerId: targetFamily.centerId,
            messageId: created.id,
            to,
            body: renderedMessage,
            statusCallbackUrl,
            result,
          });
          smsResults.push({
            ok: result.ok,
            configured: result.configured,
            provider: result.provider,
            id: result.id ?? null,
            error: result.error ?? null,
          });
        }
      }

      if (sendPushCopy) {
        const parentUserIds = uniqueStrings(targetFamily.guardians.map((guardian) => guardian.userId));
        for (const userId of parentUserIds) {
          if (!pushDisabledUserIds.has(userId)) {
            pushNotifications.push(await prisma.notification.create({
              data: {
                userId,
                title: `New school message: ${renderedSubject}`,
                body: `${user.name}: ${renderedMessage}`,
                type: "message",
                priority,
              },
            }));
          }
        }
      }
    }

    await writeAuditLog(user, {
      centerId: user.primaryCenterId,
      action: "message.broadcast.created",
      resource: "Message",
      resourceId: createdMessages[0]?.id ?? null,
      metadata: {
        channel: "broadcast",
        priority,
        recipientCount: targetFamilies.length,
        messageIds: createdMessages.map((messageRow) => messageRow.id),
        segment: broadcastSegment,
        segmentSummary: broadcastSegmentSummary(broadcastSegment),
        emailCopyRequested: sendEmailCopy,
        emailCopySent: emailResults.filter((result) => result.ok).length,
        smsCopyRequested: sendSmsCopy,
        smsCopyAttempted: smsResults.length,
        smsCopySent: smsResults.filter((result) => result.ok).length,
        pushCopyRequested: sendPushCopy,
        pushCopyQueued: pushNotifications.length,
        assignedToId,
        templateId,
      },
    });

    return NextResponse.json({
      ok: true,
      recipientCount: targetFamilies.length,
      messageCount: createdMessages.length,
      messages: createdMessages,
      email: {
        attempted: sendEmailCopy ? targetFamilies.length : 0,
        sent: emailResults.filter((result) => result.ok).length,
        configured: emailResults.some((result) => result.configured),
        provider: "sendgrid",
      },
      sms: {
        attempted: smsResults.length,
        sent: smsResults.filter((result) => result.ok).length,
        configured: smsResults.some((result) => result.configured),
        provider: "twilio",
        error: sendSmsCopy && smsResults.length === 0 ? "No SMS-preferred guardian phone numbers are available." : smsResults.find((result) => result.error)?.error ?? null,
        results: smsResults,
      },
      push: {
        attempted: pushNotifications.length,
        queued: pushNotifications.length,
        provider: "in_app_notification",
        configured: Boolean(process.env.PUSH_PROVIDER_KEY),
      },
    }, { status: 201 });
  }

  let family: MessageFamilyForDelivery | null = null;
  let familyCenter: MessageCenterContext | null = null;
  if (familyId) {
    family = await prisma.family.findUnique({
      where: { id: familyId },
      include: {
        guardians: { select: { userId: true, email: true, fullName: true, phone: true, preferredCommunication: true } },
        children: {
          select: {
            fullName: true,
            classroomId: true,
            enrollmentStatus: true,
            classroom: { select: { name: true } },
          },
        },
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

  const templateContext = buildTemplateContext({
    family,
    center: familyCenter,
    senderName: user.name,
    senderRole: user.role,
  });
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
