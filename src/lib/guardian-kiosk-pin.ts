import { hashGuardianPin, normalizePin } from "@/lib/kiosk";

export function defaultGuardianPinFromPhone(phone: unknown) {
  const digits = typeof phone === "string" ? phone.replace(/\D/g, "") : "";
  return normalizePin(digits.slice(-4));
}

export function defaultGuardianPinUpdate({
  guardianId,
  phone,
  setById,
  now = new Date(),
}: {
  guardianId: string;
  phone: unknown;
  setById: string;
  now?: Date;
}) {
  const pin = defaultGuardianPinFromPhone(phone);
  if (!pin) return null;

  return {
    checkInPinHash: hashGuardianPin(guardianId, pin),
    checkInPinSetAt: now,
    checkInPinSetById: setById,
  };
}
