import { createHash } from "node:crypto";
import { agencyClaimServiceStartMin } from "./agency-date-defaults";
import { claimAmountCents, normalizeAgencyRequirements } from "./agency-subsidy-billing";
import { isCurrentlyEnrolledChildRecord } from "./enrollment-status";

export const BULK_CLAIM_PREVIEW_LIMIT = 500;
export const BULK_CLAIM_WRITE_LIMIT = 20;
export type BulkClaimInput = {
  authorizationId: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  dueDate: string;
  serviceUnits: number;
  attendanceDays: number | null;
};
export type BulkClaimRow = BulkClaimInput & {
  childName: string;
  authorizationNumber: string;
  unitType: string;
  rateCents: number;
  claimedCents: number;
  fingerprint: string;
  error: string;
};
export type BulkClaimAuthorization = {
  id: string; centerId: string; agencyProgramId: string; childId: string; familyId: string;
  authorizationNumber: string; status: string; updatedAt: Date;
  coverageStart: Date; coverageEnd: Date; authorizedRateCents: number; authorizedUnits: number | null;
  unitType: string; requiredDocuments: unknown;
  center: { timezone: string | null };
  family: { id: string; centerId: string | null };
  child: { id: string; familyId: string; fullName: string; enrollmentStatus: string; classroomId: string | null };
  agencyProgram: { id: string; centerId: string; status: string; updatedAt: Date; requirements: unknown };
  claims: Array<{ number: string; servicePeriodStart: Date; servicePeriodEnd: Date; lines: Array<{ serviceUnits: number }> }>;
};

export function bulkClaimDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function bulkClaimInput(value: Record<string, unknown>): BulkClaimInput {
  const numeric = (input: unknown) => typeof input === "number" ? input : typeof input === "string" && input.trim() ? Number(input) : NaN;
  return {
    authorizationId: typeof value.authorizationId === "string" ? value.authorizationId.trim() : "",
    servicePeriodStart: typeof value.servicePeriodStart === "string" ? value.servicePeriodStart : "",
    servicePeriodEnd: typeof value.servicePeriodEnd === "string" ? value.servicePeriodEnd : "",
    dueDate: typeof value.dueDate === "string" ? value.dueDate : "",
    serviceUnits: numeric(value.serviceUnits),
    attendanceDays: value.attendanceDays === null || value.attendanceDays === undefined || value.attendanceDays === "" ? null : numeric(value.attendanceDays),
  };
}

export function prepareBulkClaim(authorization: BulkClaimAuthorization, input: BulkClaimInput, centerId: string, programId: string): BulkClaimRow {
  const row: BulkClaimRow = { ...input, childName: authorization.child.fullName, authorizationNumber: authorization.authorizationNumber,
    unitType: authorization.unitType, rateCents: authorization.authorizedRateCents, claimedCents: 0, fingerprint: "", error: "" };
  const fail = (error: string) => ({ ...row, error });
  if (authorization.id !== input.authorizationId || authorization.centerId !== centerId || authorization.agencyProgramId !== programId
    || authorization.agencyProgram.id !== programId || authorization.agencyProgram.centerId !== centerId
    || authorization.family.id !== authorization.familyId || authorization.family.centerId !== centerId
    || authorization.child.id !== authorization.childId || authorization.child.familyId !== authorization.familyId) return { ...fail("Authorization relationships do not belong to this school and agency."), childName: "Authorization needs review", rateCents: 0 };
  if (authorization.status !== "active" || authorization.agencyProgram.status !== "active") return fail("An active authorization and agency are required.");
  if (!isCurrentlyEnrolledChildRecord(authorization.child)) return fail("Child must be currently enrolled with an assigned classroom.");
  const start = bulkClaimDate(input.servicePeriodStart);
  const end = bulkClaimDate(input.servicePeriodEnd);
  if (!start || !end || end < start || (input.dueDate && !bulkClaimDate(input.dueDate))) return fail("Choose valid service dates and an optional valid due date.");
  if (!Number.isFinite(input.serviceUnits) || input.serviceUnits <= 0 || input.serviceUnits > 1_000_000
    || Math.abs(Math.round(input.serviceUnits * 1_000_000) / 1_000_000 - input.serviceUnits) > 1e-9) return fail("Enter positive service units with at most six decimal places.");
  if (input.attendanceDays !== null && (!Number.isInteger(input.attendanceDays) || input.attendanceDays < 0 || input.attendanceDays > (end.getTime() - start.getTime()) / 86_400_000 + 1)) return fail("Attendance days must be a whole number within the service period.");
  const earliest = agencyClaimServiceStartMin(authorization.coverageStart, authorization.center.timezone || "America/New_York");
  const latest = authorization.coverageEnd.toISOString().slice(0, 10);
  if (input.servicePeriodStart < earliest || input.servicePeriodEnd > latest) return fail(`Service dates must be between ${earliest} and ${latest}.`);
  row.claimedCents = claimAmountCents({ serviceUnits: input.serviceUnits, rateCents: authorization.authorizedRateCents });
  if (row.claimedCents <= 0 || row.claimedCents > 2_147_483_647 || !["weekly", "daily", "hourly", "monthly"].includes(authorization.unitType)) return fail("The authorized rate and units must produce a supported positive amount.");
  const overlap = authorization.claims.find((claim) => claim.servicePeriodStart <= end && claim.servicePeriodEnd >= start);
  if (overlap) return fail(`Claim ${overlap.number} already covers some or all of this period.`);
  const usedUnits = authorization.claims.reduce((sum, claim) => sum + claim.lines.reduce((units, line) => units + line.serviceUnits, 0), 0);
  if (authorization.authorizedUnits !== null && Math.round((usedUnits + input.serviceUnits) * 1_000_000) > Math.round(authorization.authorizedUnits * 1_000_000)) return fail("This draft would exceed the authorization's total approved units.");
  row.fingerprint = createHash("sha256").update(JSON.stringify({ input, centerId, programId, childId: authorization.childId, familyId: authorization.familyId,
    authorizationUpdatedAt: authorization.updatedAt, programUpdatedAt: authorization.agencyProgram.updatedAt,
    rateCents: row.rateCents, unitType: row.unitType, claimedCents: row.claimedCents, coverageStart: authorization.coverageStart,
    coverageEnd: authorization.coverageEnd, authorizedUnits: authorization.authorizedUnits, usedUnits,
    requirements: bulkClaimRequirements(authorization) })).digest("hex");
  return row;
}

export function bulkClaimRequirements(authorization: Pick<BulkClaimAuthorization, "requiredDocuments" | "agencyProgram">) {
  return [...normalizeAgencyRequirements(authorization.agencyProgram.requirements), ...normalizeAgencyRequirements(authorization.requiredDocuments)]
    .filter((item, index, all) => item.required && all.findIndex((candidate) => candidate.key === item.key) === index);
}
