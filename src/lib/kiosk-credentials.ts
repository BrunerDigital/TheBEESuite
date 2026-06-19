import { createGuardianQrToken } from "@/lib/kiosk";

type GuardianCredentialRecord = {
  id: string;
  fullName: string;
  checkInPinSetAt?: Date | string | null;
  checkInPinHash?: string | null;
  family: {
    id: string;
    name: string;
    centerId?: string | null;
    centerName?: string | null;
  };
};

export type GuardianKioskCredential = {
  guardianId: string;
  guardianName: string;
  familyId: string;
  familyName: string;
  centerId: string | null;
  centerName: string | null;
  hasPin: boolean;
  pinSetAt: string | null;
  qrToken: string | null;
  kioskPath: string;
};

export type GuardianKioskCredentialSummary = {
  total: number;
  pinReady: number;
  qrReady: number;
  missingPin: number;
};

export function kioskPathForCenter(centerId?: string | null, mode?: "family" | "staff") {
  const basePath = centerId ? `/check-in/${centerId}` : "/check-in";
  return mode ? `${basePath}?mode=${mode}` : basePath;
}

function serializePinSetAt(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildGuardianKioskCredential(record: GuardianCredentialRecord): GuardianKioskCredential {
  const pinSetAt = serializePinSetAt(record.checkInPinSetAt);
  const qrToken = createGuardianQrToken({
    centerId: record.family.centerId,
    guardianId: record.id,
    checkInPinSetAt: record.checkInPinSetAt ?? null,
    checkInPinHash: record.checkInPinHash ?? null,
  });

  return {
    guardianId: record.id,
    guardianName: record.fullName,
    familyId: record.family.id,
    familyName: record.family.name,
    centerId: record.family.centerId ?? null,
    centerName: record.family.centerName ?? null,
    hasPin: Boolean(pinSetAt && record.checkInPinHash),
    pinSetAt,
    qrToken,
    kioskPath: kioskPathForCenter(record.family.centerId),
  };
}

export function summarizeGuardianKioskCredentials(
  credentials: GuardianKioskCredential[],
): GuardianKioskCredentialSummary {
  return {
    total: credentials.length,
    pinReady: credentials.filter((credential) => credential.hasPin).length,
    qrReady: credentials.filter((credential) => Boolean(credential.qrToken)).length,
    missingPin: credentials.filter((credential) => !credential.hasPin).length,
  };
}
