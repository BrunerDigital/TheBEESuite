import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { AnnouncementWorkflowError, announcementRecordSelect, authorizeAnnouncementActor } from "./announcement-persistence";
import { announcementCreateId, announcementRecordSignature, isPublishedAnnouncement, isSchoolParentAudience } from "./announcement-workflow";
import { currentlyEnrolledChildWhere } from "./enrollment-status";
import { externalProviderEmails, uniqueEmails, type IntegrationSendResult } from "./integrations";

type Database = Pick<PrismaClient, "$transaction">;
type Actor = Parameters<typeof authorizeAnnouncementActor>[1];
type Mail = { to: string[]; subject: string; text: string; replyTo: string; fromName: string; tenantId: string; disableClickTracking: boolean; categories: string[]; customArgs: Record<string, string> };
const purpose = "announcement_email";
const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const text = (value: unknown) => typeof value === "string" ? value : "";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const attemptSelect = { id: true, tenantId: true, centerId: true, status: true, payload: true } satisfies Prisma.IntegrationDeliverySelect;
type Attempt = Prisma.IntegrationDeliveryGetPayload<{ select: typeof attemptSelect }>;

export function announcementEmailStatus(attempt: Pick<Attempt, "id" | "status" | "payload">) {
  const payload = record(attempt.payload);
  // A batch webhook event describes one recipient, never all recipients.
  const status = ["accepted", "delivered"].includes(attempt.status) ? "queued" : ["attempting", "unknown"].includes(attempt.status) ? "unconfirmed" : "follow_up";
  return { id: attempt.id, status, recipientCount: count(payload.recipientCount ?? payload.effectiveRecipientCount) };
}

async function snapshot(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  const announcement = await tx.announcement.findUnique({ where: { id }, select: announcementRecordSelect });
  if (!announcement) throw new AnnouncementWorkflowError("Announcement not found.", 404);
  if (!announcement.centerId) throw new AnnouncementWorkflowError("Choose one school before sending an announcement email.", 400);
  const tenantId = await authorizeAnnouncementActor(tx, actor, announcement.centerId);
  const school = await tx.center.findFirst({ where: { id: announcement.centerId, organization: { tenantId }, status: { not: "closed" } }, select: { id: true, name: true, crmLocationId: true, email: true } });
  if (!school) throw new AnnouncementWorkflowError("The announcement school is no longer available.", 403);
  const dedupeKey = `announcement-email:${tenantId}:${announcement.id}`;
  // Include legacy post-send attempts: old clients and records must not bypass the hold.
  const existing = await tx.integrationDelivery.findFirst({ where: { tenantId, centerId: school.id, provider: "sendgrid", purpose, OR: [{ dedupeKey }, { payload: { path: ["announcementId"], equals: announcement.id } }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: attemptSelect });
  const subject = `Announcement: ${announcement.title}`;
  const basic = { announcementId: id, centerId: school.id, schoolName: school.crmLocationId || school.name, subject, body: announcement.body };
  if (existing) {
    const payload = record(existing.payload);
    return { tenantId, school, announcement, dedupeKey, existing, recipients: [] as string[], replyTo: school.email || actor.email,
      preview: { ...basic, subject: text(payload.subject) || subject, body: text(payload.text) || announcement.body, familyCount: count(payload.familyCount), recipientCount: count(payload.recipientCount ?? payload.effectiveRecipientCount), suppressedRecipientCount: count(payload.suppressedRecipientCount), fingerprint: "", attempt: announcementEmailStatus(existing) } };
  }
  if (!isPublishedAnnouncement(announcement.status) || !isSchoolParentAudience(announcement.audience)) throw new AnnouncementWorkflowError("Publish and review a whole-school parent announcement before preparing email. Targeted or legacy audiences cannot be broadened.", 409);
  const families = await tx.family.findMany({ where: { centerId: school.id, children: { some: { ...currentlyEnrolledChildWhere(), classroom: { centerId: school.id, center: { organization: { tenantId } } } } } },
    orderBy: { id: "asc" }, take: 1001, select: { id: true, billingEmail: true, guardians: { orderBy: { id: "asc" }, select: { email: true } } } });
  if (families.length > 1000) throw new AnnouncementWorkflowError("This school has more than 1,000 current families. No email was sent. Contact support for a separately reviewed delivery plan.", 409);
  const requested = uniqueEmails(families.flatMap(family => [family.billingEmail ?? "", ...family.guardians.map(guardian => guardian.email ?? "")]).map(email => email.toLowerCase())).sort();
  const recipients = externalProviderEmails(requested);
  if (recipients.length > 1000) throw new AnnouncementWorkflowError("This announcement has more than 1,000 email recipients. No email was sent. Contact support for a separately reviewed delivery plan.", 409);
  if (!recipients.length) throw new AnnouncementWorkflowError("No eligible email addresses were found for current families. No email was sent.", 409);
  const replyTo = school.email || actor.email;
  const fingerprint = hash([actor.id, tenantId, school.id, school.name, replyTo, announcementRecordSignature(announcement), families.map(family => family.id), recipients]);
  return { tenantId, school, announcement, dedupeKey, existing, recipients, replyTo,
    preview: { ...basic, familyCount: families.length, recipientCount: recipients.length, suppressedRecipientCount: requested.length - recipients.length, fingerprint, attempt: null } };
}
export type AnnouncementEmailPreview = Awaited<ReturnType<typeof snapshot>>["preview"];
export async function previewAnnouncementEmail(database: Database, actor: Actor, id: string) {
  return database.$transaction(async tx => (await snapshot(tx, actor, id)).preview, { isolationLevel: "Serializable" });
}

export async function sendAnnouncementEmail(options: { database: Database; actor: Actor; id: string; input: unknown; send: (mail: Mail) => Promise<IntegrationSendResult> }) {
  const input = record(options.input);
  if (input.confirmEmail !== true || !announcementCreateId(input.requestId) || typeof input.expectedFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedFingerprint)) throw new AnnouncementWorkflowError("Review the saved email and current-family audience before confirming delivery.", 400);
  let reservation;
  try {
    reservation = await options.database.$transaction(async tx => {
      const current = await snapshot(tx, options.actor, options.id);
      if (current.existing) {
        const prior = record(current.existing.payload);
        if (prior.requestId !== input.requestId || prior.fingerprint !== input.expectedFingerprint || prior.actorId !== options.actor.id) throw new AnnouncementWorkflowError("An existing email attempt has different confirmed details. Check email status to review that saved attempt; do not send again.", 409);
        return { ...current, attempt: current.existing, dispatch: false };
      }
      if (current.preview.fingerprint !== input.expectedFingerprint) throw new AnnouncementWorkflowError("The announcement or current-family audience changed. Review a fresh preview before sending.", 409);
      const attempt = await tx.integrationDelivery.create({ data: { id: `announcement_delivery_${randomUUID()}`, tenantId: current.tenantId, centerId: current.school.id, dedupeKey: current.dedupeKey, provider: "sendgrid", purpose, direction: "outbound", status: "attempting", attempts: 1, maxAttempts: 1, nextAttemptAt: null,
        recipient: `${current.recipients.length} recipients`, payload: { announcementId: options.id, requestId: text(input.requestId), actorId: options.actor.id, fingerprint: current.preview.fingerprint, subject: current.preview.subject, text: current.preview.body, recipientCount: current.recipients.length, familyCount: current.preview.familyCount, suppressedRecipientCount: current.preview.suppressedRecipientCount, automaticRetryAllowed: false } }, select: attemptSelect });
      await tx.auditLog.create({ data: { tenantId: current.tenantId, centerId: current.school.id, userId: options.actor.id, action: "announcement.email.reserved", resource: "announcement", resourceId: options.id, metadata: { attemptId: attempt.id, recipientCount: current.recipients.length, automaticRetryAllowed: false } } });
      return { ...current, attempt, dispatch: true };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new AnnouncementWorkflowError("Another delivery request is being resolved. Check email status; do not send again.", 409);
    throw error;
  }
  if (!reservation.dispatch) return { ok: true, announcementId: options.id, centerId: reservation.school.id, attempt: announcementEmailStatus(reservation.attempt) };
  // No provider calls occur before durable reservation + audit. Every later
  // failure stays held, even if the provider accepted before losing its response.
  let result: IntegrationSendResult;
  try {
    result = await options.send({ to: reservation.recipients, subject: reservation.preview.subject, text: reservation.preview.body, replyTo: reservation.replyTo, fromName: reservation.school.name, tenantId: reservation.tenantId, disableClickTracking: true, categories: [purpose], customArgs: { announcementId: options.id, centerId: reservation.school.id, deliveryId: reservation.attempt.id } });
  } catch { result = { ok: false, configured: true, provider: "sendgrid", acceptanceUnknown: true }; }
  const accepted = result.ok && result.provider === "sendgrid";
  const state = accepted ? "accepted" : result.configured && !result.skipped ? "unknown" : "failed";
  try {
    const finalized = await options.database.$transaction(async tx => {
      await tx.integrationDelivery.updateMany({ where: { id: reservation.attempt.id, tenantId: reservation.tenantId, centerId: reservation.school.id, status: "attempting" }, data: { status: state, providerMessageId: accepted ? result.id ?? null : null, nextAttemptAt: null, lastResult: { ok: accepted, acceptanceUnknown: state === "unknown" }, lastError: accepted ? null : "Delivery needs review. Automatic retry is disabled." } });
      await tx.auditLog.create({ data: { tenantId: reservation.tenantId, centerId: reservation.school.id, userId: options.actor.id, action: accepted ? "announcement.email.queued" : "announcement.email.needs_review", resource: "announcement", resourceId: options.id, metadata: { attemptId: reservation.attempt.id, recipientCount: reservation.recipients.length, automaticRetryAllowed: false } } });
      return tx.integrationDelivery.findFirst({ where: { id: reservation.attempt.id, tenantId: reservation.tenantId, centerId: reservation.school.id }, select: attemptSelect });
    }, { isolationLevel: "Serializable" });
    if (finalized) return { ok: true, announcementId: options.id, centerId: reservation.school.id, attempt: announcementEmailStatus(finalized) };
  } catch { /* Keep the durable reservation held when receipt storage is uncertain. */ }
  return { ok: true, announcementId: options.id, centerId: reservation.school.id, attempt: announcementEmailStatus(reservation.attempt) };
}
