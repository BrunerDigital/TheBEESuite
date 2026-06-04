import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageCrmLeads, getCurrentUser } from "@/lib/auth";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { isEmail, sendEmail } from "@/lib/integrations";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageCrmLeads(user)) {
    return NextResponse.json({ ok: false, error: "Lead messaging is not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const subject = clean(body.subject) || "Kid City USA enrollment follow-up";
  const message = clean(body.message);

  if (!message) {
    return NextResponse.json({ ok: false, error: "Message body is required." }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      center: {
        select: {
          id: true,
          name: true,
          email: true,
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

  if (!lead.email || !isEmail(lead.email)) {
    return NextResponse.json({ ok: false, error: "This lead does not have a valid email address." }, { status: 400 });
  }

  const replyTo = lead.center.email && isEmail(lead.center.email) ? lead.center.email : null;
  const email = await sendEmail({
    to: [lead.email],
    subject,
    text: message,
    replyTo,
    fromName: "Kid City USA",
    categories: ["lead_email"],
    customArgs: { leadId: lead.id, centerId: lead.centerId },
  });

  await recordEmailDeliveryAttempt({
    tenantId: user.tenantId,
    centerId: lead.centerId,
    leadId: lead.id,
    purpose: "lead_email",
    to: [lead.email],
    subject,
    text: message,
    replyTo,
    fromName: "Kid City USA",
    result: email,
  });

  if (!email.configured) {
    return NextResponse.json(
      { ok: false, error: "SendGrid is not configured for outbound lead messages.", email },
      { status: 503 },
    );
  }
  if (!email.ok) {
    return NextResponse.json(
      { ok: false, error: email.error || "Lead email could not be queued.", email },
      { status: 502 },
    );
  }

  const note = await prisma.note.create({
    data: {
      leadId: lead.id,
      userId: user.id,
      body: `Reviewed email sent to ${lead.email}. Subject: ${subject}`,
    },
  });

  await writeAuditLog(user, {
    centerId: lead.centerId,
    action: "lead.email.sent",
    resource: "Lead",
    resourceId: lead.id,
    metadata: {
      to: lead.email,
      subject,
      noteId: note.id,
      centerReplyTo: lead.center.email || null,
      providerMessageId: email.id ?? null,
    },
  });

  return NextResponse.json({ ok: true, note, email });
}
