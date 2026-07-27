import { EnrollmentStage, Prisma, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageCrmLeads, getCurrentUser } from "@/lib/auth";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import {
  buildRegistrationShareEmail,
  buildRegistrationLeadCustomFields,
  buildRegistrationShareUrl,
  MAX_REGISTRATION_SHARE_RECIPIENTS,
  parseRegistrationShareRecipients,
  stageAfterRegistrationShare,
} from "@/lib/registration-sharing";
import { getAppBaseUrl } from "@/lib/supabase-auth";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageCrmLeads(user)) {
    return NextResponse.json({ ok: false, error: "Registration sharing is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const centerId = clean(body.centerId);
  const leadId = clean(body.leadId);
  const requestedRecipients = parseRegistrationShareRecipients(body.emails);

  if (!centerId) {
    return NextResponse.json({ ok: false, error: "School is required." }, { status: 400 });
  }
  if (!leadId && requestedRecipients.invalidEmails.length) {
    return NextResponse.json(
      { ok: false, error: "One or more email addresses are invalid.", invalidEmails: requestedRecipients.invalidEmails },
      { status: 400 },
    );
  }
  if (!leadId && !requestedRecipients.emails.length) {
    return NextResponse.json({ ok: false, error: "Enter at least one family email address." }, { status: 400 });
  }
  if (!leadId && requestedRecipients.emails.length > MAX_REGISTRATION_SHARE_RECIPIENTS) {
    return NextResponse.json(
      { ok: false, error: `Send to no more than ${MAX_REGISTRATION_SHARE_RECIPIENTS} email addresses at a time.` },
      { status: 400 },
    );
  }

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      city: true,
      state: true,
      email: true,
      status: true,
      organization: { select: { tenantId: true } },
    },
  });
  if (!center || center.status === "closed") {
    return NextResponse.json({ ok: false, error: "School is not available for online registration." }, { status: 404 });
  }
  if (center.organization.tenantId !== user.tenantId && user.role !== UserRole.PLATFORM_OWNER) {
    return NextResponse.json({ ok: false, error: "This school is outside your tenant scope." }, { status: 403 });
  }
  if (!canAccessCenter(user, center.id)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this school." }, { status: 403 });
  }

  const lead = leadId
    ? await prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          centerId: true,
          email: true,
          familyName: true,
          stage: true,
          customFields: true,
        },
      })
    : null;
  if (leadId && !lead) {
    return NextResponse.json({ ok: false, error: "CRM lead was not found." }, { status: 404 });
  }
  if (lead && lead.centerId !== center.id) {
    return NextResponse.json({ ok: false, error: "The selected lead belongs to a different school." }, { status: 409 });
  }

  const leadRecipients = lead ? parseRegistrationShareRecipients(lead.email) : null;
  const emails = leadRecipients?.emails ?? requestedRecipients.emails;
  if (!emails.length) {
    return NextResponse.json({ ok: false, error: "The selected lead does not have a valid email address." }, { status: 400 });
  }

  const schoolLabel = center.crmLocationId
    ?? [center.name, [center.city, center.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const registrationUrl = buildRegistrationShareUrl(getAppBaseUrl(request.url), center.id);
  const message = buildRegistrationShareEmail({
    schoolLabel,
    registrationUrl,
    senderName: user.name,
  });
  const emailResult = await sendEmail({
    to: emails,
    subject: message.subject,
    text: message.text,
    replyTo: center.email,
    fromName: schoolLabel,
    disableClickTracking: true,
    categories: ["registration_share"],
    customArgs: {
      centerId: center.id,
      leadId: lead?.id,
      purpose: "registration_share",
    },
    tenantId: center.organization.tenantId,
  });

  await recordEmailDeliveryAttempt({
    tenantId: center.organization.tenantId,
    centerId: center.id,
    leadId: lead?.id ?? null,
    purpose: "registration_email",
    to: emails,
    subject: message.subject,
    text: message.text,
    replyTo: center.email,
    fromName: schoolLabel,
    result: emailResult,
    metadata: {
      registrationUrl,
      requestedByUserId: user.id,
    },
  });
  const attemptedAt = new Date();
  const crmResult = lead
    ? await prisma.$transaction(async (tx) => {
        const currentLead = await tx.lead.findUniqueOrThrow({
          where: { id: lead.id },
          select: { stage: true, customFields: true },
        });
        const updatedLead = await tx.lead.update({
          where: { id: lead.id },
          data: {
            stage: emailResult.ok
              ? stageAfterRegistrationShare(currentLead.stage) as EnrollmentStage
              : currentLead.stage,
            customFields: buildRegistrationLeadCustomFields(currentLead.customFields, {
              status: emailResult.ok ? "sent" : "failed",
              attemptedAt: attemptedAt.toISOString(),
              sentAt: emailResult.ok ? attemptedAt.toISOString() : null,
              registrationUrl,
              sentByUserId: user.id,
              recipientCount: emails.length,
            }) as Prisma.InputJsonObject,
          },
          select: {
            id: true,
            stage: true,
            customFields: true,
          },
        });
        const note = await tx.note.create({
          data: {
            leadId: lead.id,
            userId: user.id,
            restricted: true,
            body: emailResult.ok
              ? `School-specific registration form sent to the CRM lead by ${user.name}.`
              : `Registration form delivery was attempted by ${user.name}, but the email provider reported a failure.`,
          },
        });
        return { lead: updatedLead, note };
      })
    : null;

  await writeAuditLog(user, {
    centerId: center.id,
    action: "registration.share_email.attempted",
    resource: lead ? "Lead" : "Center",
    resourceId: lead?.id ?? center.id,
    metadata: {
      leadId: lead?.id ?? null,
      recipients: emails,
      recipientCount: emails.length,
      delivered: emailResult.ok,
      providerConfigured: emailResult.configured,
      registrationUrl,
    },
  });

  if (!emailResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: emailResult.error || "The email provider could not send the registration form. You can still copy and share the link.",
        registrationUrl,
        lead: crmResult?.lead ?? null,
        note: crmResult?.note ?? null,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    emailsQueued: emails.length,
    registrationUrl,
    lead: crmResult?.lead ?? null,
    note: crmResult?.note ?? null,
  });
}

export const POST = withApiLogging("POST", POSTHandler);
