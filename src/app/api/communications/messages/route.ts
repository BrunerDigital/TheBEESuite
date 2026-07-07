import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, canManageClassroomTasks, canManageOperations, getCurrentUser, isParentGuardian } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getCenterLeadershipUsers } from "@/lib/location-users";
import { messageAttachmentKind, type StoredMessageAttachment } from "@/lib/message-attachments";
import {
  messageNotificationPreferenceRoles,
  shouldNotifyLeadershipOfFamilyMessage,
  uniqueMessageNotificationUsers,
} from "@/lib/message-notification-recipients";
import { appendInAppMessageReplyInstructions, buildAbsoluteMessageReplyUrl } from "@/lib/message-reply-routing";
import { defaultMessageTemplates, renderMessageTemplate } from "@/lib/message-templates";
import {
  broadcastSegmentIsEmpty,
  broadcastSegmentSummary,
  familyMatchesBroadcastSegment,
  normalizeMessageBroadcastSegment,
} from "@/lib/message-segmentation";
import { canAccessFamilyRecord, canCreateFamilyMessage, canMessageClassroomFamily } from "@/lib/portal-guardrails";
import {
  deliverNotificationExternalChannels,
  resolveNotificationDeliveryRecipientChannels,
  type NotificationDeliveryRecipient,
  type NotificationDeliverySummary,
} from "@/lib/notification-delivery";
import type { NotificationPreferenceRecord } from "@/lib/notification-preferences";
import { prisma } from "@/lib/prisma";
import { contentTypeForDocumentFile, uploadMessageAttachmentBuffer } from "@/lib/supabase-storage";
import { getAppBaseUrl } from "@/lib/supabase-auth";
import { twilioStatusCallbackUrl } from "@/lib/twilio-messaging";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

const maxMessageAttachments = 5;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function parseJsonField(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

type MessageTargetMode = "family" | "broadcast" | "staff";

type MessageRequestInput = {
  familyId: string | null;
  targetMode: MessageTargetMode;
  broadcastSegment: unknown;
  templateId: string | null;
  assignedToId: string | null;
  replyToMessageId: string | null;
  subject: string;
  message: string;
  channel: string;
  priority: string;
  sendEmailCopy: boolean;
  sendSmsCopy: boolean;
  sendPushCopy: boolean;
  files: File[];
};

function normalizeTargetMode(value: unknown): MessageTargetMode {
  const target = clean(value);
  if (target === "broadcast" || target === "staff") return target;
  return "family";
}

function uploadedMessageFiles(values: unknown[]) {
  return values.filter((value): value is File => value instanceof File && value.size > 0);
}

async function readMessageRequest(request: NextRequest): Promise<MessageRequestInput> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return {
      familyId: clean(formData.get("familyId")) || null,
      targetMode: normalizeTargetMode(formData.get("targetMode")),
      broadcastSegment: parseJsonField(formData.get("broadcastSegment")),
      templateId: clean(formData.get("templateId")) || null,
      assignedToId: clean(formData.get("assignedToId")) || null,
      replyToMessageId: clean(formData.get("replyToMessageId")) || null,
      subject: clean(formData.get("subject")),
      message: clean(formData.get("message")),
      channel: clean(formData.get("channel")) || "portal",
      priority: clean(formData.get("priority")) || "normal",
      sendEmailCopy: parseBoolean(formData.get("sendEmailCopy")),
      sendSmsCopy: parseBoolean(formData.get("sendSmsCopy")),
      sendPushCopy: formData.has("sendPushCopy") ? parseBoolean(formData.get("sendPushCopy")) : true,
      files: uploadedMessageFiles([
        ...formData.getAll("attachments"),
        ...formData.getAll("attachment"),
        ...formData.getAll("files"),
      ]),
    };
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  return {
    familyId: clean(body.familyId) || null,
    targetMode: normalizeTargetMode(body.targetMode),
    broadcastSegment: body.broadcastSegment,
    templateId: clean(body.templateId) || null,
    assignedToId: clean(body.assignedToId) || null,
    replyToMessageId: clean(body.replyToMessageId) || null,
    subject: clean(body.subject),
    message: clean(body.message),
    channel: clean(body.channel) || "portal",
    priority: clean(body.priority) || "normal",
    sendEmailCopy: parseBoolean(body.sendEmailCopy),
    sendSmsCopy: parseBoolean(body.sendSmsCopy),
    sendPushCopy: body.sendPushCopy === undefined ? true : parseBoolean(body.sendPushCopy),
    files: [],
  };
}

function messageMetadata(
  metadata: Record<string, unknown>,
  attachments: StoredMessageAttachment[],
): Prisma.InputJsonValue {
  const next = attachments.length
    ? { ...metadata, attachmentCount: attachments.length, attachments }
    : metadata;
  return next as Prisma.InputJsonValue;
}

async function uploadMessageAttachments({
  files,
  user,
  centerId,
  familyId,
  threadKey,
}: {
  files: File[];
  user: { id: string; tenantId: string };
  centerId?: string | null;
  familyId?: string | null;
  threadKey?: string | null;
}) {
  if (!files.length) return [];
  if (files.length > maxMessageAttachments) {
    throw new Error(`Attach up to ${maxMessageAttachments} files per message.`);
  }

  const uploadedAt = new Date().toISOString();
  const attachments: StoredMessageAttachment[] = [];
  for (const file of files) {
    const contentType = contentTypeForDocumentFile(file);
    const upload = await uploadMessageAttachmentBuffer({
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType,
      originalName: file.name,
      tenantId: user.tenantId,
      centerId,
      familyId,
      threadKey,
      uploadedById: user.id,
    });
    attachments.push({
      id: randomUUID(),
      filename: file.name || "attachment",
      contentType,
      size: file.size,
      bucket: upload.bucket,
      storageKey: upload.storageKey,
      url: upload.recordUrl,
      kind: messageAttachmentKind(contentType),
      uploadedAt,
      uploadedById: user.id,
    });
  }
  return attachments;
}

function staffThreadKey(senderId: string, recipientId: string) {
  return `staff:${[senderId, recipientId].sort().join(":")}`;
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

function familyNotificationDeliveryRecipients(family: MessageFamilyForDelivery): NotificationDeliveryRecipient[] {
  return [
    {
      role: UserRole.PARENT_GUARDIAN,
      email: family.billingEmail,
      smsOptIn: false,
    },
    ...family.guardians.map((guardian) => ({
      userId: guardian.userId,
      role: UserRole.PARENT_GUARDIAN,
      email: guardian.email,
      phone: guardian.phone,
      smsOptIn: guardian.preferredCommunication === "sms",
    })),
  ];
}

function leadershipNotificationDeliveryRecipients(
  leaders: Array<{ id: string; email: string; role: string; phone: string | null }>,
): NotificationDeliveryRecipient[] {
  return leaders.map((leader) => ({
    userId: leader.id,
    role: leader.role,
    email: leader.email,
    phone: leader.phone,
  }));
}

function pushEnabledForMessageRecipient(
  recipient: NotificationDeliveryRecipient,
  preferences: NotificationPreferenceRecord[],
) {
  return resolveNotificationDeliveryRecipientChannels({
    type: "messages",
    recipient,
    preferences,
  }).pushEnabled;
}

function emptyDeliverySummary({
  emailRequested,
  smsRequested,
}: {
  emailRequested: boolean;
  smsRequested: boolean;
}): NotificationDeliverySummary {
  return {
    email: {
      requested: emailRequested,
      attempted: 0,
      sent: 0,
      configured: false,
      provider: "sendgrid",
      error: emailRequested ? "No email-enabled recipients are available." : null,
      recipients: [],
    },
    sms: {
      requested: smsRequested,
      attempted: 0,
      sent: 0,
      configured: false,
      provider: "twilio",
      error: smsRequested ? "No SMS-enabled recipients are available." : null,
      recipients: [],
      results: [],
    },
  };
}

function combineDeliverySummaries(summaries: NotificationDeliverySummary[]) {
  const smsResults = summaries.flatMap((summary) => summary.sms.results);
  return {
    email: {
      attempted: summaries.reduce((total, summary) => total + summary.email.attempted, 0),
      sent: summaries.reduce((total, summary) => total + summary.email.sent, 0),
      configured: summaries.some((summary) => summary.email.configured),
      provider: "sendgrid",
      error: summaries.find((summary) => summary.email.error)?.email.error ?? null,
      recipients: uniqueStrings(summaries.flatMap((summary) => summary.email.recipients)),
    },
    sms: {
      attempted: summaries.reduce((total, summary) => total + summary.sms.attempted, 0),
      sent: summaries.reduce((total, summary) => total + summary.sms.sent, 0),
      configured: summaries.some((summary) => summary.sms.configured),
      provider: "twilio",
      error: summaries.find((summary) => summary.sms.error)?.sms.error ?? null,
      recipients: uniqueStrings(summaries.flatMap((summary) => summary.sms.recipients)),
      results: smsResults,
    },
  };
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

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const input = await readMessageRequest(request);
  const familyId = input.familyId;
  const targetMode = input.targetMode;
  const broadcastSegment = normalizeMessageBroadcastSegment(input.broadcastSegment);
  const templateId = input.templateId;
  const assignedToId = input.assignedToId;
  const replyToMessageId = input.replyToMessageId;
  let subject = input.subject || "Portal message";
  let message = input.message;
  const channel = input.channel;
  const priority = input.priority;
  const sendEmailCopy = input.sendEmailCopy;
  const sendSmsCopy = input.sendSmsCopy;
  const sendPushCopy = input.sendPushCopy;
  const senderIsParent = isParentGuardian(user);
  const senderCanManageOperations = canManageOperations(user);
  const senderCanManageClassroom = canManageClassroomTasks(user);
  const appBaseUrl = getAppBaseUrl(request.url);

  if (!message && !input.files.length) {
    return NextResponse.json({ ok: false, error: "Message or attachment is required." }, { status: 400 });
  }
  if (input.files.length > maxMessageAttachments) {
    return NextResponse.json({ ok: false, error: `Attach up to ${maxMessageAttachments} files per message.` }, { status: 400 });
  }
  if (!message) {
    message = "Attached file(s)";
  }

  if (targetMode === "staff") {
    if (senderIsParent) {
      return NextResponse.json({ ok: false, error: "Staff messages are not available from parent accounts." }, { status: 403 });
    }
    if (!assignedToId) {
      return NextResponse.json({ ok: false, error: "Choose a staff recipient before sending." }, { status: 400 });
    }
    if (assignedToId === user.id) {
      return NextResponse.json({ ok: false, error: "Choose a different staff recipient." }, { status: 400 });
    }

    const recipient = await prisma.user.findFirst({
      where: {
        id: assignedToId,
        tenantId: user.tenantId,
        isActive: true,
        role: { in: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.TEACHER] },
        ...(canAccessAllCenters(user)
          ? {}
          : {
              OR: [
                { staffProfile: { centerId: { in: user.centerIds } } },
                { accessGrants: { some: { isActive: true, centerId: { in: user.centerIds } } } },
              ],
            }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        staffProfile: { select: { centerId: true } },
        accessGrants: {
          where: { isActive: true },
          select: { centerId: true },
        },
      },
    });
    if (!recipient) {
      return NextResponse.json({ ok: false, error: "Staff recipient is not available in your school scope." }, { status: 400 });
    }

    const recipientIsTeacher = recipient.role === UserRole.TEACHER;
    const recipientIsDirector = recipient.role === UserRole.CENTER_DIRECTOR || recipient.role === UserRole.ASSISTANT_DIRECTOR;
    const senderIsTeacher = user.role === UserRole.TEACHER;
    const senderCanMessageTeacher = senderCanManageOperations && recipientIsTeacher;
    const senderCanMessageDirector = senderIsTeacher && recipientIsDirector;
    if (!senderCanMessageTeacher && !senderCanMessageDirector) {
      return NextResponse.json({ ok: false, error: "Direct staff messages are limited to director and teacher conversations." }, { status: 403 });
    }

    const threadKey = staffThreadKey(user.id, recipient.id);
    if (replyToMessageId) {
      const replyTarget = await prisma.message.findFirst({
        where: { id: replyToMessageId, threadKey },
        select: { id: true },
      });
      if (!replyTarget) {
        return NextResponse.json({ ok: false, error: "Reply target message is not available for this staff thread." }, { status: 400 });
      }
    }

    let attachments: StoredMessageAttachment[] = [];
    try {
      attachments = await uploadMessageAttachments({
        files: input.files,
        user,
        centerId: recipient.staffProfile?.centerId ?? user.primaryCenterId,
        threadKey,
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Attachment could not be uploaded." },
        { status: 502 },
      );
    }

    const created = await prisma.message.create({
      data: {
        familyId: null,
        senderId: user.id,
        assignedToId: recipient.id,
        replyToMessageId,
        threadKey,
        subject,
        body: message,
        channel: "staff",
        priority,
        sentiment: priority === "high" ? "needs_review" : "neutral",
        metadata: messageMetadata({
          deliveryChannels: {
            portal: true,
            email: false,
            sms: false,
            push: sendPushCopy,
          },
          staffThread: {
            participantIds: [user.id, recipient.id],
            senderRole: user.role,
            recipientRole: recipient.role,
          },
        }, attachments),
      },
    });

    const notification = sendPushCopy
      ? await prisma.notification.create({
          data: {
            userId: recipient.id,
            title: `New staff message: ${subject}`,
            body: `${user.name}: ${message}`,
            type: "message",
            priority,
          },
        })
      : null;

    await writeAuditLog(user, {
      centerId: recipient.staffProfile?.centerId ?? user.primaryCenterId,
      action: "message.staff.created",
      resource: "Message",
      resourceId: created.id,
      metadata: {
        recipientId: recipient.id,
        recipientRole: recipient.role,
        channel: "staff",
        priority,
        attachmentCount: attachments.length,
        pushCopyRequested: sendPushCopy,
        pushCopyQueued: notification ? 1 : 0,
      },
    });

    return NextResponse.json({
      ok: true,
      message: created,
      push: {
        attempted: sendPushCopy ? 1 : 0,
        queued: notification ? 1 : 0,
        provider: "in_app_notification",
        configured: Boolean(process.env.PUSH_PROVIDER_KEY),
      },
    }, { status: 201 });
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
    let broadcastAttachments: StoredMessageAttachment[] = [];
    try {
      broadcastAttachments = await uploadMessageAttachments({
        files: input.files,
        user,
        centerId: user.primaryCenterId,
        threadKey: "broadcast",
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Attachment could not be uploaded." },
        { status: 502 },
      );
    }

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
      subject = input.subject || selectedTemplate.subject;
      message = input.message || selectedTemplate.body;
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
    const broadcastNotificationPreferences: NotificationPreferenceRecord[] = (sendEmailCopy || sendSmsCopy || sendPushCopy)
      ? await prisma.notificationPreference.findMany({
          where: {
            tenantId: user.tenantId,
            type: "messages",
            OR: [
              ...(broadcastParentUserIds.length ? [{ userId: { in: broadcastParentUserIds } }] : []),
              { role: UserRole.PARENT_GUARDIAN },
            ],
          },
          select: { userId: true, role: true, type: true, emailEnabled: true, smsEnabled: true, pushEnabled: true },
        })
      : [];
    const createdMessages = [];
    const deliverySummaries: NotificationDeliverySummary[] = [];
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
          metadata: messageMetadata({
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
          }, broadcastAttachments),
        },
      });
      createdMessages.push(created);

      const parentReplyUrl = buildAbsoluteMessageReplyUrl({
        appBaseUrl,
        audience: "parent",
        replyToMessageId: created.id,
        familyId: targetFamily.id,
        subject: renderedSubject,
      });
      const delivery = await deliverNotificationExternalChannels({
        tenantId: user.tenantId,
        centerId: targetFamily.centerId,
        messageId: created.id,
        type: "messages",
        title: `Message from ${user.name}: ${renderedSubject}`,
        body: appendInAppMessageReplyInstructions(renderedMessage, parentReplyUrl),
        recipients: familyNotificationDeliveryRecipients(targetFamily),
        preferences: broadcastNotificationPreferences,
        emailRequested: sendEmailCopy,
        smsRequested: sendSmsCopy,
        replyTo: null,
        fromName: "The BEE Suite",
        statusCallbackUrl,
        emailPurpose: "communication_email",
        smsPurpose: "communication_sms",
        metadata: { familyId: targetFamily.id, broadcast: true },
      });
      deliverySummaries.push(delivery);

      if (sendPushCopy) {
        for (const guardian of targetFamily.guardians) {
          if (guardian.userId && pushEnabledForMessageRecipient({
            userId: guardian.userId,
            role: UserRole.PARENT_GUARDIAN,
          }, broadcastNotificationPreferences)) {
            pushNotifications.push(await prisma.notification.create({
              data: {
                userId: guardian.userId,
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
    const deliveryTotals = combineDeliverySummaries(deliverySummaries);

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
        emailCopySent: deliveryTotals.email.sent,
        smsCopyRequested: sendSmsCopy,
        smsCopyAttempted: deliveryTotals.sms.attempted,
        smsCopySent: deliveryTotals.sms.sent,
        pushCopyRequested: sendPushCopy,
        pushCopyQueued: pushNotifications.length,
        assignedToId,
        templateId,
        attachmentCount: broadcastAttachments.length,
      },
    });

    return NextResponse.json({
      ok: true,
      recipientCount: targetFamilies.length,
      messageCount: createdMessages.length,
      messages: createdMessages,
      email: {
        ...deliveryTotals.email,
      },
      sms: {
        ...deliveryTotals.sms,
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
      subject = input.subject || template.subject;
      message = input.message || template.body;
    }
  } else if (templateId) {
    const template = defaultMessageTemplates.find((item) => item.id === templateId);
    if (template) {
      subject = input.subject || template.subject;
      message = input.message || template.body;
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

  let replyTargetMessage: { id: string; senderId: string | null; assignedToId: string | null } | null = null;
  if (replyToMessageId) {
    const parentMessage = await prisma.message.findFirst({
      where: { id: replyToMessageId, ...(familyId ? { familyId } : {}) },
      select: { id: true, senderId: true, assignedToId: true },
    });
    if (!parentMessage) {
      return NextResponse.json({ ok: false, error: "Reply target message is not available." }, { status: 400 });
    }
    replyTargetMessage = parentMessage;
  }

  let attachments: StoredMessageAttachment[] = [];
  try {
    attachments = await uploadMessageAttachments({
      files: input.files,
      user,
      centerId: family?.centerId ?? user.primaryCenterId,
      familyId,
      threadKey: familyId ? `family:${familyId}` : `internal:${user.primaryCenterId ?? user.tenantId}`,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Attachment could not be uploaded." },
      { status: 502 },
    );
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
      metadata: messageMetadata({
        deliveryChannels: {
          portal: true,
          email: sendEmailCopy,
          sms: sendSmsCopy,
          push: sendPushCopy,
        },
        templateId,
      }, attachments),
    },
  });

  const shouldNotifyLeadership = shouldNotifyLeadershipOfFamilyMessage({
    senderIsParent,
    senderRole: user.role,
  });
  const directors = shouldNotifyLeadership && family?.centerId
    ? await getCenterLeadershipUsers({
        centerId: family.centerId,
        excludeUserId: user.id,
        roles: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR],
      })
    : [];
  const directStaffRecipientIds = uniqueStrings([
    replyTargetMessage?.senderId,
    replyTargetMessage?.assignedToId,
    assignedToId,
  ]).filter((id) => id !== user.id);
  const directStaffRecipients = directStaffRecipientIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: directStaffRecipientIds },
          tenantId: user.tenantId,
          isActive: true,
          role: { notIn: [UserRole.PARENT_GUARDIAN, UserRole.AUTHORIZED_PICKUP] },
        },
        select: {
          id: true,
          email: true,
          role: true,
          staffProfile: { select: { phone: true } },
        },
      })
    : [];
  const staffNotificationUsers = uniqueMessageNotificationUsers([
    ...directors,
    ...directStaffRecipients.map((recipient) => ({
      id: recipient.id,
      email: recipient.email,
      role: recipient.role,
      phone: recipient.staffProfile?.phone ?? null,
    })),
  ], user.id);
  const parentUserIds = !senderIsParent && family
    ? Array.from(new Set(family.guardians.map((guardian) => guardian.userId).filter((value): value is string => Boolean(value))))
    : [];

  const notificationUserIds = [...staffNotificationUsers.map((recipient) => recipient.id), ...parentUserIds];
  const notificationPreferenceRoles = messageNotificationPreferenceRoles({
    staffRecipients: staffNotificationUsers,
    notifyParents: Boolean(!senderIsParent && family),
  });
  const notificationPreferenceRows: NotificationPreferenceRecord[] = sendEmailCopy || sendSmsCopy || sendPushCopy
    ? await prisma.notificationPreference.findMany({
        where: {
          tenantId: user.tenantId,
          type: "messages",
          OR: [
            ...(notificationUserIds.length ? [{ userId: { in: notificationUserIds } }] : []),
            { role: { in: notificationPreferenceRoles } },
          ],
        },
        select: { userId: true, role: true, type: true, emailEnabled: true, smsEnabled: true, pushEnabled: true },
      })
    : [];
  const pushNotifications = await Promise.all([
    ...staffNotificationUsers.map((recipient) =>
      sendPushCopy && pushEnabledForMessageRecipient({
        userId: recipient.id,
        role: recipient.role,
      }, notificationPreferenceRows) ? prisma.notification.create({
        data: {
          userId: recipient.id,
          title: senderIsParent
            ? `New parent message: ${subject}`
            : user.role === UserRole.TEACHER
              ? `Teacher-family message: ${subject}`
              : `New family message: ${subject}`,
          body: family
            ? senderIsParent
              ? `${family.name}: ${message}`
              : `${user.name} to ${family.name}: ${message}`
            : message,
          type: "message",
          priority,
        },
      }) : null,
    ),
    ...(!senderIsParent ? family?.guardians ?? [] : []).map((guardian) =>
      sendPushCopy && guardian.userId && pushEnabledForMessageRecipient({
        userId: guardian.userId,
        role: UserRole.PARENT_GUARDIAN,
      }, notificationPreferenceRows) ? prisma.notification.create({
        data: {
          userId: guardian.userId,
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

  const emailSubject = senderIsParent && family ? `Portal message from ${family.name}: ${subject}` : `Message from ${user.name}: ${subject}`;
  const staffReplyUrl = family
    ? buildAbsoluteMessageReplyUrl({
        appBaseUrl,
        audience: "staff",
        replyToMessageId: created.id,
        familyId: family.id,
        subject,
      })
    : null;
  const parentReplyUrl = family
    ? buildAbsoluteMessageReplyUrl({
        appBaseUrl,
        audience: "parent",
        replyToMessageId: created.id,
        familyId: family.id,
        subject,
      })
    : null;
  const emailReplyUrl = senderIsParent ? staffReplyUrl : parentReplyUrl;
  const deliveryRecipients = family
    ? senderIsParent
      ? leadershipNotificationDeliveryRecipients(staffNotificationUsers)
      : familyNotificationDeliveryRecipients(family)
    : [];
  const statusCallbackUrl = sendSmsCopy && deliveryRecipients.length ? twilioStatusCallbackUrl(request) : null;
  const delivery = family
    ? await deliverNotificationExternalChannels({
        tenantId: user.tenantId,
        centerId: family.centerId,
        messageId: created.id,
        type: "messages",
        title: emailSubject,
        body: emailReplyUrl ? appendInAppMessageReplyInstructions(message, emailReplyUrl) : message,
        recipients: deliveryRecipients,
        preferences: notificationPreferenceRows,
        emailRequested: sendEmailCopy,
        smsRequested: sendSmsCopy,
        replyTo: null,
        fromName: "The BEE Suite",
        statusCallbackUrl,
        emailPurpose: "communication_email",
        smsPurpose: "communication_sms",
        metadata: { familyId: family.id },
      })
    : emptyDeliverySummary({ emailRequested: sendEmailCopy, smsRequested: sendSmsCopy });

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
      emailCopyRequested: sendEmailCopy,
      emailCopyAttempted: delivery.email.attempted,
      emailCopySent: delivery.email.sent,
      smsCopyRequested: sendSmsCopy,
      smsCopyAttempted: delivery.sms.attempted,
      smsCopySent: delivery.sms.sent,
      pushCopyRequested: sendPushCopy,
      pushCopyQueued: pushNotifications.filter(Boolean).length,
      assignedToId,
      templateId,
      attachmentCount: attachments.length,
    },
  });

  return NextResponse.json({
    ok: true,
    message: created,
    email: delivery.email,
    sms: delivery.sms,
    push: {
      attempted: notificationUserIds.length,
      queued: pushNotifications.filter(Boolean).length,
      provider: "in_app_notification",
      configured: Boolean(process.env.PUSH_PROVIDER_KEY),
    },
  }, { status: 201 });
}

export const POST = withApiLogging("POST", POSTHandler);
