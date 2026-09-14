import { Prisma, UserRole, type PrismaClient } from "@prisma/client";
import type { CurrentUser } from "./auth";
import { teamAccessGrantWhere, teamStaffProfileWhere } from "./team-permissions-scope";
import { announcementCreateId, announcementDraftSignature, announcementRecordSignature, isPublishedAnnouncement, isSchoolParentAudience, normalizeAnnouncementDraft, schoolParentAudience, type AnnouncementIntent } from "./announcement-workflow";

export class AnnouncementWorkflowError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const conflict = "This announcement changed or is no longer available. Load its saved version before continuing.";
const roles = new Set<UserRole>([UserRole.PLATFORM_OWNER, UserRole.BRAND_ADMIN, UserRole.REGIONAL_MANAGER, UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR]);
type Actor = Pick<CurrentUser, "id" | "email" | "role" | "identityTenantId" | "tenantId" | "sessionVersion" | "deviceSessionId" | "centerIds" | "workspace">;
type Database = Pick<PrismaClient, "$transaction">;
export const announcementRecordSelect = { id: true, centerId: true, title: true, body: true, audience: true, status: true, sendAt: true } satisfies Prisma.AnnouncementSelect;

export async function authorizeAnnouncementActor(tx: Prisma.TransactionClient, actor: Actor, centerId: string | null) {
  if (!roles.has(actor.role) || !actor.id || !actor.identityTenantId || !Number.isSafeInteger(actor.sessionVersion) || actor.sessionVersion < 0) throw new AnnouncementWorkflowError("Announcement editing is not allowed for this account.", 403);
  if (centerId ? !actor.centerIds.includes(centerId) : actor.role !== "PLATFORM_OWNER" || actor.workspace?.mode !== "all") throw new AnnouncementWorkflowError("Choose an authorized school workspace before editing this announcement.", 403);
  const center = centerId ? await tx.center.findFirst({ where: { id: centerId, status: { not: "closed" } }, select: { organization: { select: { tenantId: true } } } }) : null;
  const tenantId = center?.organization.tenantId ?? actor.identityTenantId;
  if (centerId && !center || actor.role !== "PLATFORM_OWNER" && tenantId !== actor.identityTenantId) throw new AnnouncementWorkflowError("This school is not available in your account.", 403);
  const scope = { tenantId, visibleCenterIds: centerId ? [centerId] : [], tenantWide: false, at: new Date() };
  const schoolAssigned = actor.role === "CENTER_DIRECTOR" || actor.role === "ASSISTANT_DIRECTOR";
  const user = await tx.user.findFirst({ where: { id: actor.id, email: actor.email, tenantId: actor.identityTenantId, role: actor.role, isActive: true, sessionVersion: actor.sessionVersion, mustResetPassword: false,
    ...(schoolAssigned ? { OR: [{ staffProfile: teamStaffProfileWhere(scope) }, { accessGrants: { some: { AND: [teamAccessGrantWhere(scope), { scopeType: "CENTER", centerId, role: actor.role }] } } }] } : {}) }, select: { id: true } });
  if (!user || actor.deviceSessionId && !await tx.deviceSession.findFirst({ where: { id: actor.deviceSessionId, userId: actor.id, tenantId: actor.identityTenantId, revokedAt: null }, select: { id: true } })) throw new AnnouncementWorkflowError("Your editing session or school access changed. Sign in again and review the saved announcement.", 403);
  return tenantId;
}

export async function loadAnnouncementForActor(database: Database, actor: Actor, id: string) {
  return database.$transaction(async tx => {
    const target = await tx.announcement.findUnique({ where: { id }, select: { centerId: true } });
    if (!target) return null;
    await authorizeAnnouncementActor(tx, actor, target.centerId);
    return tx.announcement.findFirst({ where: { id, centerId: target.centerId }, select: announcementRecordSelect });
  }, { isolationLevel: "Serializable" });
}

export async function saveAnnouncement(options: { database: Database; actor: Actor; input: unknown }) {
  const input = options.input && typeof options.input === "object" ? options.input as Record<string, unknown> : {};
  const id = typeof input.id === "string" ? input.id.trim() : "", intent = input.intent as AnnouncementIntent;
  const draft = normalizeAnnouncementDraft(input), createId = announcementCreateId(input.requestId);
  if (!["save", "publish"].includes(intent) || ["status", "audience", "sendAt", "expiresAt"].some(key => key in input)) throw new AnnouncementWorkflowError("Use the announcement editor to save a draft or publish a saved announcement.", 400);
  if (!draft.title || !draft.body || draft.title.length > 160 || draft.body.length > 10000 || (draft.centerId?.length ?? 0) > 120 || id.length > 120) throw new AnnouncementWorkflowError("Choose a school and enter a title (up to 160 characters) and message (up to 10,000 characters).", 400);
  if (!id && (!createId || intent !== "save")) throw new AnnouncementWorkflowError("Save a new draft before publishing it.", 400);
  if (!id && !draft.centerId && input.platformWide !== true) throw new AnnouncementWorkflowError("Explicitly choose the platform-wide audience before creating an all-school notice.", 400);
  try {
    return await options.database.$transaction(async tx => {
      const tenantId = await authorizeAnnouncementActor(tx, options.actor, draft.centerId);
      const existing = await tx.announcement.findUnique({ where: { id: id || createId! }, select: announcementRecordSelect });
      if (existing && existing.centerId !== draft.centerId) throw new AnnouncementWorkflowError("An announcement cannot be moved to another school.", 403);
      if (id && !existing) throw new AnnouncementWorkflowError("Announcement not found in this school.", 404);
      if (!id && existing) {
        // Stable creation ID plus an atomic creator audit makes an explicit
        // retry safe after a lost response, without creating a second record.
        const created = await tx.auditLog.findFirst({ where: { tenantId, centerId: draft.centerId, userId: options.actor.id, resource: "announcement", resourceId: existing.id, action: "operations.announcement.created" }, select: { id: true } });
        if (!created || existing.status !== "draft" || existing.sendAt !== null || !isSchoolParentAudience(existing.audience) || announcementDraftSignature(existing) !== announcementDraftSignature(draft)) throw new AnnouncementWorkflowError(conflict, 409);
        return existing;
      }
      if (existing && (typeof input.expectedRecordSignature !== "string" || announcementRecordSignature(existing) !== input.expectedRecordSignature)) throw new AnnouncementWorkflowError(conflict, 409);
      if (existing && intent === "save" && announcementDraftSignature(normalizeAnnouncementDraft(existing)) === announcementDraftSignature(draft)) return existing;
      if (existing && intent === "save" && isPublishedAnnouncement(existing.status) && announcementDraftSignature(existing) !== announcementDraftSignature(draft) && input.confirmPublishedEdit !== true) throw new AnnouncementWorkflowError("Confirm the school and visible announcement before saving published changes.", 400);
      if (intent === "publish" && (!existing || existing.status !== "draft" || !isSchoolParentAudience(existing.audience) || announcementDraftSignature(normalizeAnnouncementDraft(existing)) !== announcementDraftSignature(draft))) throw new AnnouncementWorkflowError("Publish only the saved school-parent draft. Save and review your changes first. Targeted or legacy delivery settings are not supported by this publisher.", 409);
      let record;
      if (existing) {
        const changed = await tx.announcement.updateMany({ where: { id: existing.id, centerId: existing.centerId, title: existing.title, body: existing.body, status: existing.status, sendAt: existing.sendAt, audience: { equals: existing.audience === null ? Prisma.AnyNull : existing.audience } },
          data: { title: draft.title, body: draft.body, ...(intent === "publish" ? { status: "published", sendAt: new Date() } : {}) } });
        if (changed.count !== 1) throw new AnnouncementWorkflowError(conflict, 409);
        record = await tx.announcement.findFirst({ where: { id: existing.id, centerId: draft.centerId }, select: announcementRecordSelect });
        if (!record) throw new AnnouncementWorkflowError(conflict, 409);
      } else record = await tx.announcement.create({ data: { id: createId!, ...draft, audience: schoolParentAudience, status: "draft", sendAt: null }, select: announcementRecordSelect });
      await tx.auditLog.create({ data: { tenantId, centerId: draft.centerId, userId: options.actor.id, resource: "announcement", resourceId: record.id, action: `operations.announcement.${!id ? "created" : intent === "publish" ? "published" : "updated"}`, metadata: { portalOnly: true, deliveryDispatched: false } } });
      return record;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) throw new AnnouncementWorkflowError(conflict, 409);
    throw error;
  }
}
