import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canManageClassroomTasks, canManageOperations, getCurrentUser, isParentGuardian } from "@/lib/auth";
import {
  broadcastSegmentSummary,
  familyMatchesBroadcastSegment,
  normalizeMessageBroadcastSegment,
} from "@/lib/message-segmentation";
import { canAccessFamilyRecord, canCreateFamilyMessage, canMessageClassroomFamily } from "@/lib/portal-guardrails";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstName(value: string | null | undefined) {
  return (value ?? "").split(" ").filter(Boolean)[0] ?? "";
}

function sentence(value: string) {
  return value.endsWith(".") || value.endsWith("!") || value.endsWith("?") ? value : `${value}.`;
}

function purposeLine(purpose: string) {
  if (purpose === "documents") return "Please upload or review the requested documents in the parent portal when convenient.";
  if (purpose === "billing") return "Please review the billing details in the parent portal, and our office can help with any questions.";
  if (purpose === "classroom") return "We will keep the classroom team aligned and update the daily report as needed.";
  if (purpose === "attendance") return "Please let us know if your child will be absent, late, or needs schedule support.";
  if (purpose === "broadcast") return "Please review this update and contact the school office with any questions.";
  return "We will follow up with the next step as soon as it is ready.";
}

function buildSuggestions({
  targetLabel,
  subject,
  message,
  purpose,
  isBroadcast,
}: {
  targetLabel: string;
  subject: string;
  message: string;
  purpose: string;
  isBroadcast: boolean;
}) {
  const greeting = isBroadcast ? "Hi {{guardian.firstName}}" : `Hi ${targetLabel}`;
  const baseSubject = subject || (isBroadcast ? "Update from {{center.name}}" : "Follow-up from the school");
  const source = message ? sentence(message.replace(/\s+/g, " ").slice(0, 260)) : purposeLine(purpose);
  return [
    {
      label: "Concise",
      subject: baseSubject,
      body: `${greeting},\n\n${source}\n\nThank you,\n{{sender.name}}`,
    },
    {
      label: "Warm",
      subject: baseSubject,
      body: `${greeting},\n\nThank you for staying connected with us. ${purposeLine(purpose)} If anything is unclear, reply here and our team will help.\n\nThank you,\n{{sender.name}}`,
    },
    {
      label: "Action step",
      subject: baseSubject,
      body: `${greeting},\n\n${source}\n\nNext step: please check the parent portal for any open items or reply to this message if you need help from the school office.\n\nThank you,\n{{sender.name}}`,
    },
  ];
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json();
  const targetMode = clean(body.targetMode) === "broadcast" ? "broadcast" : "family";
  const familyId = clean(body.familyId) || null;
  const subject = clean(body.subject);
  const message = clean(body.message);
  const purpose = clean(body.purpose) || (targetMode === "broadcast" ? "broadcast" : "reply");
  const segment = normalizeMessageBroadcastSegment(body.broadcastSegment);
  const senderIsParent = isParentGuardian(user);
  const senderCanManageOperations = canManageOperations(user);
  const senderCanManageClassroom = canManageClassroomTasks(user);

  const messageGuard = canCreateFamilyMessage({
    isParentGuardian: senderIsParent,
    canManageOperations: senderCanManageOperations,
    canManageClassroomTasks: senderCanManageClassroom,
    familyId: targetMode === "broadcast" ? null : familyId,
  });
  if (!messageGuard.ok) {
    return NextResponse.json({ ok: false, error: messageGuard.error }, { status: messageGuard.status });
  }

  let targetLabel = "{{guardian.firstName}}";
  let recipientCount = 0;

  if (targetMode === "broadcast") {
    if (!senderCanManageOperations || senderIsParent) {
      return NextResponse.json({ ok: false, error: "Broadcast suggestions require school operations access." }, { status: 403 });
    }
    if (!canAccessAllCenters(user) && segment.centerIds.some((centerId) => !user.centerIds.includes(centerId))) {
      return NextResponse.json({ ok: false, error: "One or more selected centers are outside your access scope." }, { status: 403 });
    }
    const scopedCenterIds = canAccessAllCenters(user)
      ? segment.centerIds
      : segment.centerIds.length
        ? segment.centerIds.filter((centerId) => user.centerIds.includes(centerId))
        : user.centerIds;
    const candidates = await prisma.family.findMany({
      where: {
        ...(scopedCenterIds.length ? { centerId: { in: scopedCenterIds } } : {}),
        ...(segment.classroomIds.length
          ? { children: { some: { classroomId: { in: segment.classroomIds } } } }
          : {}),
      },
      take: 1000,
      select: {
        centerId: true,
        customFields: true,
        children: { select: { classroomId: true, enrollmentStatus: true } },
      },
    });
    recipientCount = candidates.filter((family) => familyMatchesBroadcastSegment(family, segment)).length;
    targetLabel = "{{guardian.firstName}}";
  } else {
    if (!familyId) {
      return NextResponse.json({ ok: false, error: "Family is required for reply suggestions." }, { status: 400 });
    }
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      include: {
        guardians: { select: { userId: true, fullName: true } },
        children: { select: { classroomId: true } },
      },
    });
    if (!family) {
      return NextResponse.json({ ok: false, error: "Family not found." }, { status: 404 });
    }

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

    targetLabel = firstName(family.guardians[0]?.fullName) || "there";
    recipientCount = 1;
  }

  const suggestions = buildSuggestions({
    targetLabel,
    subject,
    message,
    purpose,
    isBroadcast: targetMode === "broadcast",
  });
  const aiSuggestion = await prisma.aiSuggestion.create({
    data: {
      type: "message_composer_reply",
      promptContext: {
        targetMode,
        familyId,
        purpose,
        segment,
        segmentSummary: targetMode === "broadcast" ? broadcastSegmentSummary(segment) : null,
        recipientCount,
        generatedBy: "rule_based_guardrailed_draft",
      },
      suggestion: JSON.stringify(suggestions),
      status: "pending_review",
      guardrailNote:
        "Mr. Bee message suggestions are drafts only. A staff member must review before sending. Do not use AI to make safety, medical, custody, legal, billing, or compliance decisions.",
    },
  });

  return NextResponse.json({
    ok: true,
    suggestions,
    suggestionId: aiSuggestion.id,
    guardrailNote: aiSuggestion.guardrailNote,
  });
}
