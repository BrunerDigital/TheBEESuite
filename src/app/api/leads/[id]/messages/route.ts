import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageCrmLeads, getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !from) {
    return NextResponse.json(
      { ok: false, error: "SendGrid is not configured for outbound lead messages." },
      { status: 503 },
    );
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: lead.email }] }],
      from: { email: from, name: "Kid City USA" },
      reply_to: lead.center.email && isEmail(lead.center.email)
        ? { email: lead.center.email, name: lead.center.name }
        : undefined,
      subject,
      content: [
        {
          type: "text/plain",
          value: message,
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: `SendGrid returned ${response.status}.` },
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
    },
  });

  return NextResponse.json({ ok: true, note });
}
