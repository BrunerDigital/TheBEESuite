import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageCrmLeads, getCurrentUser } from "@/lib/auth";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { isEmail, sendEmail, type EmailAttachment } from "@/lib/integrations";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const MAX_ATTACHMENTS = 5;
const MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function base64ByteLength(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

function parseEmailAttachments(value: unknown): EmailAttachment[] {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_ATTACHMENTS) {
    throw new Error(`Attach up to ${MAX_ATTACHMENTS} files per email.`);
  }

  let totalBytes = 0;
  return value.map((item) => {
    const record = item && typeof item === "object" && !Array.isArray(item)
      ? item as Record<string, unknown>
      : {};
    const filename = clean(record.filename).replace(/[\\/:*?"<>|]/g, "-").slice(0, 120);
    const type = clean(record.type).slice(0, 120) || "application/octet-stream";
    const rawContent = clean(record.content);
    const content = rawContent.replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");

    if (!filename) throw new Error("Each attachment needs a file name.");
    if (!content || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) {
      throw new Error(`Attachment ${filename} could not be read.`);
    }

    totalBytes += base64ByteLength(content);
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new Error("Attachments must be 8 MB or less combined.");
    }

    return {
      filename,
      content,
      type,
      disposition: "attachment",
    } satisfies EmailAttachment;
  });
}

async function POSTHandler(request: NextRequest, context: RouteContext) {
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
  let attachments: EmailAttachment[] = [];

  try {
    attachments = parseEmailAttachments(body.attachments);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Attachments could not be processed." },
      { status: 400 },
    );
  }

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
    tenantId: user.tenantId,
    attachments,
  });

  const attachmentMetadata = attachments.map((attachment) => ({
    filename: attachment.filename,
    type: attachment.type ?? "application/octet-stream",
  }));

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
    maxAttempts: attachments.length ? 1 : undefined,
    metadata: attachments.length ? { attachmentCount: attachments.length, attachments: attachmentMetadata } : undefined,
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
      body: `Reviewed email sent to ${lead.email}. Subject: ${subject}${attachments.length ? ` Attachments: ${attachments.map((attachment) => attachment.filename).join(", ")}` : ""}`,
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
      attachmentCount: attachments.length,
      attachments: attachmentMetadata,
    },
  });

  return NextResponse.json({ ok: true, note, email });
}

export const POST = withApiLogging("POST", POSTHandler);
