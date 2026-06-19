import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessCenter, getCurrentUser } from "@/lib/auth";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sentence(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.endsWith(".") || trimmed.endsWith("!") || trimmed.endsWith("?") ? trimmed : `${trimmed}.`;
}

function buildDraft({
  familyName,
  program,
  centerName,
  purpose,
  contextPrompt,
}: {
  familyName: string;
  program?: string | null;
  centerName: string;
  purpose: string;
  contextPrompt?: string;
}) {
  const normalizedPurpose = purpose || "follow_up";
  const programText = program || "childcare";
  const context = sentence(contextPrompt || "");

  if (normalizedPurpose === "tour_reminder") {
    return `Hi ${familyName}, this is Kid City USA with a friendly reminder about your interest in ${programText} at ${centerName}. ${context || "We would love to help answer questions and confirm the best next step for your family."}`;
  }

  if (normalizedPurpose === "application_reminder") {
    return `Hi ${familyName}, this is Kid City USA checking in on your ${programText} application for ${centerName}. ${context || "If you need help with any next steps or documents, our team is happy to support you."}`;
  }

  return `Hi ${familyName}, this is Kid City USA following up on your ${programText} inquiry for ${centerName}. ${context || "We would be happy to answer questions, confirm availability, or help schedule your next step."}`;
}

function buildDraftOptions({
  familyName,
  childName,
  program,
  centerName,
  purpose,
  contextPrompt,
}: {
  familyName: string;
  childName?: string | null;
  program?: string | null;
  centerName: string;
  purpose: string;
  contextPrompt?: string;
}) {
  const programText = program || "childcare";
  const childLine = childName ? ` for ${childName}` : "";
  const context = sentence(contextPrompt || "");
  const baseSubject = purpose === "tour_reminder"
    ? `Tour follow-up for ${centerName}`
    : purpose === "application_reminder"
      ? `Application next steps for ${centerName}`
      : `Kid City USA ${programText} follow-up`;
  const nextStep = context || "We can answer questions, confirm availability, or help schedule the next step for your family.";

  return [
    {
      label: "Warm follow-up",
      subject: baseSubject,
      body: `Hi ${familyName},\n\nThank you for your interest in ${programText}${childLine} at ${centerName}. ${nextStep}\n\nThank you,\nKid City USA`,
    },
    {
      label: "Quick next step",
      subject: baseSubject,
      body: `Hi ${familyName},\n\nI wanted to follow up on your ${programText} inquiry for ${centerName}. ${nextStep}\n\nPlease reply here when you have a moment, and we will help with the next step.\n\nThank you,\nKid City USA`,
    },
    {
      label: "Director personal",
      subject: baseSubject,
      body: `Hi ${familyName},\n\nThis is Kid City USA checking in about ${programText}${childLine}. ${nextStep}\n\nWe would be happy to connect directly and make the enrollment process easier for you.\n\nThank you,\nKid City USA`,
    },
  ];
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json();
  const leadId = clean(body.leadId);
  const purpose = clean(body.purpose) || "follow_up";
  const contextPrompt = clean(body.contextPrompt).slice(0, 600);
  const wantsOptions = body.mode === "options" || body.returnOptions === true;

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
          crmLocationId: true,
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
    centerName: lead.center.crmLocationId ?? lead.center.name,
    purpose,
    contextPrompt,
  });
  const suggestions = wantsOptions
    ? buildDraftOptions({
        familyName: lead.familyName,
        childName: lead.childName,
        program: lead.programInterest,
        centerName: lead.center.crmLocationId ?? lead.center.name,
        purpose,
        contextPrompt,
      })
    : null;

  const aiSuggestion = await prisma.aiSuggestion.create({
    data: {
      type: "mr_bee_lead_follow_up",
      promptContext: {
        leadId: lead.id,
        centerId: lead.centerId,
        purpose,
        contextPrompt: contextPrompt || null,
        generatedBy: "rule_based_guardrailed_draft",
      },
      suggestion: suggestions ? JSON.stringify(suggestions) : suggestion,
      status: "pending_review",
      guardrailNote:
        "Mr. Bee drafts are suggestions only. A staff member must review before sending. Do not use AI to make safety, medical, custody, legal, billing, or compliance decisions.",
    },
  });

  return NextResponse.json({
    ok: true,
    suggestion: suggestions?.[0]?.body ?? suggestion,
    suggestions,
    suggestionId: aiSuggestion.id,
    guardrailNote: aiSuggestion.guardrailNote,
  });
}

export const POST = withApiLogging("POST", POSTHandler);
