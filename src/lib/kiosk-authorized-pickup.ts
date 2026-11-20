import type { PrismaClient } from "@prisma/client";
import { isCurrentlyEnrolledChildRecord } from "@/lib/enrollment-status";
import { verifyGuardianPin } from "@/lib/kiosk";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Explicitly reviewed pickup access; emergency-contact status alone grants nothing. */
export function readAuthorizedPickupKioskScope(customFields: unknown) {
  const fields = record(customFields);
  const credential = record(fields.kioskCredential);
  const authorization = record(fields.pickupAuthorization);
  const childIds = authorization.childIds;
  if (credential.enabled !== true
    || typeof credential.pinHash !== "string" || !/^[a-f0-9]{64}$/.test(credential.pinHash)
    || typeof credential.pinSetAt !== "string" || !Number.isFinite(Date.parse(credential.pinSetAt))
    || typeof credential.pinSetById !== "string" || !credential.pinSetById.trim()
    || authorization.source !== "reviewed_registration_forms"
    || authorization.requirePictureId !== true
    || !Array.isArray(childIds) || !childIds.length
    || !childIds.every((id): id is string => typeof id === "string" && Boolean(id.trim()) && id === id.trim())
    || new Set(childIds).size !== childIds.length) return null;
  return { pinHash: credential.pinHash, childIds, requirePictureId: true as const };
}

type PickupChild = {
  id: string;
  enrollmentStatus: string;
  classroomId: string | null;
  classroom: { centerId: string } | null;
};

export function authorizedPickupKioskActor<Child extends PickupChild>(pickup: {
  id: string;
  fullName: string;
  relation: string | null;
  customFields: unknown;
  family: { id: string; name: string; centerId: string | null; custodyNotes: string | null; children: Child[] };
}, centerId: string, pin: string) {
  const scope = readAuthorizedPickupKioskScope(pickup.customFields);
  if (!scope || pickup.family.centerId !== centerId
    || !verifyGuardianPin(`pickup:${pickup.id}`, pin, scope.pinHash)) return null;
  const familyChildIds = new Set(pickup.family.children.map((child) => child.id));
  // An unknown or cross-family authorization ID invalidates the credential entirely.
  if (scope.childIds.some((id) => !familyChildIds.has(id))) return null;
  const authorizedIds = new Set(scope.childIds);
  const children = pickup.family.children.filter((child) => authorizedIds.has(child.id)
    && isCurrentlyEnrolledChildRecord(child) && child.classroom?.centerId === centerId);
  if (!children.length) return null;
  return {
    id: pickup.id,
    fullName: pickup.fullName,
    relation: pickup.relation || "Authorized pickup",
    actorType: "authorized_pickup" as const,
    pickupId: pickup.id,
    requirePictureId: true as const,
    family: { id: pickup.family.id, name: pickup.family.name, custodyNotes: pickup.family.custodyNotes, billingAccount: null, children },
  };
}

export async function findAuthorizedPickupKioskActors(db: Pick<PrismaClient, "authorizedPickup">, centerId: string, pin: string) {
  const pickups = await db.authorizedPickup.findMany({
    where: { family: { centerId }, customFields: { path: ["kioskCredential", "enabled"], equals: true } },
    select: {
      id: true, fullName: true, relation: true, customFields: true,
      family: { select: {
        id: true, name: true, centerId: true, custodyNotes: true,
        children: { orderBy: { fullName: "asc" }, select: {
          id: true, fullName: true, preferredName: true, ageGroup: true, enrollmentStatus: true, classroomId: true,
          classroom: { select: { id: true, name: true, centerId: true } },
        } },
      } },
    },
  });
  return pickups.flatMap((pickup) => {
    const actor = authorizedPickupKioskActor(pickup, centerId, pin);
    return actor ? [actor] : [];
  });
}
