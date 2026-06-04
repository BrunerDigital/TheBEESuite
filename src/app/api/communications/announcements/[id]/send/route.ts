import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail, uniqueEmails } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function visibleCenterIds(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  if (!canAccessAllCenters(user)) return user.centerIds;
  const centers = await prisma.center.findMany({
    where: {
      status: { not: "closed" },
      organization: { tenantId: user.tenantId },
    },
    select: { id: true },
  });
  return centers.map((center) => center.id);
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Announcement email sending is not allowed for this role." }, { status: 403 });
  }

  const { id } = await context.params;
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    include: {
      center: {
        select: {
          id: true,
          name: true,
          email: true,
          crmLocationId: true,
          organization: { select: { tenantId: true } },
        },
      },
    },
  });
  if (!announcement) return NextResponse.json({ ok: false, error: "Announcement not found." }, { status: 404 });
  if (announcement.centerId && !canAccessCenter(user, announcement.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this announcement." }, { status: 403 });
  }
  if (announcement.center?.organization.tenantId && announcement.center.organization.tenantId !== user.tenantId) {
    return NextResponse.json({ ok: false, error: "You do not have access to this tenant announcement." }, { status: 403 });
  }

  const centerIds = announcement.centerId ? [announcement.centerId] : await visibleCenterIds(user);
  if (!centerIds.length) return NextResponse.json({ ok: false, error: "No centers are available for this announcement." }, { status: 400 });

  const families = await prisma.family.findMany({
    where: { centerId: { in: centerIds } },
    take: 1000,
    select: {
      billingEmail: true,
      guardians: { select: { email: true } },
    },
  });
  const recipients = uniqueEmails(
    families.flatMap((family) => [
      family.billingEmail ?? "",
      ...family.guardians.map((guardian) => guardian.email ?? ""),
    ]),
  ).slice(0, 1000);
  if (!recipients.length) {
    return NextResponse.json({ ok: false, error: "No family email recipients were found for this announcement." }, { status: 400 });
  }

  const subject = `Announcement: ${announcement.title}`;
  const email = await sendEmail({
    to: recipients,
    subject,
    text: announcement.body,
    replyTo: announcement.center?.email ?? user.email,
    fromName: announcement.center?.name ?? "The BEE Suite",
    categories: ["announcement_email"],
    customArgs: { announcementId: announcement.id, centerId: announcement.centerId },
  });

  await recordEmailDeliveryAttempt({
    tenantId: user.tenantId,
    centerId: announcement.centerId,
    purpose: "announcement_email",
    to: recipients,
    subject,
    text: announcement.body,
    replyTo: announcement.center?.email ?? user.email,
    fromName: announcement.center?.name ?? "The BEE Suite",
    result: email,
    metadata: {
      announcementId: announcement.id,
      centerCount: centerIds.length,
    },
  });

  if (email.ok) {
    await prisma.announcement.update({
      where: { id: announcement.id },
      data: { status: "sent", sendAt: new Date() },
    });
  }

  await writeAuditLog(user, {
    centerId: announcement.centerId,
    action: email.ok ? "announcement.email.sent" : "announcement.email.not_sent",
    resource: "Announcement",
    resourceId: announcement.id,
    metadata: {
      recipientCount: recipients.length,
      centerCount: centerIds.length,
      provider: email.provider,
      providerMessageId: email.id ?? null,
      configured: email.configured,
      error: email.error ?? null,
    },
  });

  return NextResponse.json({
    ok: email.ok,
    email,
    recipientCount: recipients.length,
    error: email.ok ? undefined : email.error || "Announcement email could not be queued.",
  }, { status: email.ok ? 200 : email.configured ? 502 : 503 });
}
