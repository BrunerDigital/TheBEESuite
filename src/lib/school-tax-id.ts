function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeEin(value: unknown) {
  const digits = clean(value).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length !== 9) return null;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function isValidEinInput(value: unknown) {
  const raw = clean(value);
  return !raw || Boolean(normalizeEin(raw));
}

export function readSchoolEin(customFields: unknown) {
  const fields = record(customFields);
  return normalizeEin(fields.schoolEin ?? fields.ein ?? fields.federalEin ?? fields.federalTaxId);
}

export function schoolEinCustomFields(customFields: unknown, einValue: unknown, metadata: { savedAt: string; savedByEmail?: string | null; savedByUserId?: string | null }) {
  const next = { ...record(customFields) };
  const normalized = normalizeEin(einValue);

  if (normalized) {
    next.schoolEin = normalized;
    next.schoolEinUpdatedAt = metadata.savedAt;
    next.schoolEinUpdatedByEmail = metadata.savedByEmail ?? null;
    next.schoolEinUpdatedByUserId = metadata.savedByUserId ?? null;
  } else {
    delete next.schoolEin;
    delete next.ein;
    delete next.federalEin;
    delete next.federalTaxId;
    delete next.schoolEinUpdatedAt;
    delete next.schoolEinUpdatedByEmail;
    delete next.schoolEinUpdatedByUserId;
  }

  return next;
}
