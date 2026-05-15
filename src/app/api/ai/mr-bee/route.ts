import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessCenter, getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildDraft({
  familyName,
  program,
  centerName,
  purpose,
}: {
  familyName: string;
  program?: string | null;
  centerName: string;
  purpose: string;
}) {
  const normalizedPurpose = purpose || "follow_up";
  const programText = program || "childcare";

  if (normalizedPurpose === "tour_reminder") {
    return `Hi ${familyName}, this is Kid City USA with a friendly reminder about your interest in ${programText} at ${centerName}. We would love to help answer questions and confirm the best next step for your family.`;
  }

  if (normalizedPurpose === "application_reminder") {
    return `Hi ${familyName}, this is Kid City USA checking in on your ${programText} application for ${centerName}. If you need help with any next steps or documents, our team is happy to support you.`;
  }

  return `Hi ${familyName}, this is Kid City USA following up on your ${programText} inquiry for ${centerName}. We would be happy to answer questions, confirm availability, or help schedule your next step.`;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json();
  const leadId = clean(body.leadId);
  const purpose = clean(body.purpose) || "follow_up";

  if (!leadId) {
    return NextResponse.json({ ok: false, error: "Lead ID is required." }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      center: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  if (!canAccessCenter(user, lead.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this lead." }, { status: 403 });
  }

  const suggestion = buildDraft({
    familyName: lead.familyName,
    program: lead.programInterest,
    centerName: lead.center.name,
    purpose,
  });

  const aiSuggestion = await prisma.aiSuggestion.create({
    data: {
      type: "mr_bee_lead_follow_up",
      promptContext: {
        leadId: lead.id,
        centerId: lead.centerId,
        purpose,
        generatedBy: "rule_based_guardrailed_draft",
      },
      suggestion,
      status: "pending_review",
      guardrailNote:
        "Mr. Bee drafts are suggestions only. A staff member must review before sending. Do not use AI to make safety, medical, custody, legal, billing, or compliance decisions.",
    },
  });

  return NextResponse.json({
    ok: true,
    suggestion,
    suggestionId: aiSuggestion.id,
    guardrailNote: aiSuggestion.guardrailNote,
  });
}
