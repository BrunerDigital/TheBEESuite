export type ProcareGuardianImportRecord = {
  name: string;
  guardianEmail: string;
  guardianPhone: string;
  externalId: string | null;
  relation: string;
  billingContact: boolean;
  employer: string;
};

function normalizedName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizedPhone(value: string) {
  return value.replace(/\D/g, "");
}

function sameGuardian(
  existing: ProcareGuardianImportRecord,
  incoming: ProcareGuardianImportRecord,
) {
  if (existing.externalId && incoming.externalId) {
    return existing.externalId.toLowerCase() === incoming.externalId.toLowerCase();
  }
  if (existing.guardianEmail && incoming.guardianEmail) {
    return existing.guardianEmail.toLowerCase() === incoming.guardianEmail.toLowerCase();
  }
  const existingPhone = normalizedPhone(existing.guardianPhone);
  const incomingPhone = normalizedPhone(incoming.guardianPhone);
  if (existingPhone && incomingPhone) return existingPhone === incomingPhone;
  return Boolean(
    (existing.billingContact || incoming.billingContact)
    && existing.name
    && incoming.name
    && normalizedName(existing.name) === normalizedName(incoming.name),
  );
}

function preferredRelation(existing: string, incoming: string) {
  return /^(secondary\s+)?guardian$/i.test(existing) && incoming ? incoming : existing;
}

export function mergeProcareGuardianImports(
  guardianImports: ProcareGuardianImportRecord[],
) {
  const merged: ProcareGuardianImportRecord[] = [];
  for (const guardian of guardianImports) {
    if (!guardian.name && !guardian.guardianEmail && !guardian.guardianPhone) continue;
    const existingIndex = merged.findIndex((candidate) => sameGuardian(candidate, guardian));
    if (existingIndex < 0) {
      merged.push(guardian);
      continue;
    }
    const existing = merged[existingIndex];
    merged[existingIndex] = {
      name: existing.name || guardian.name,
      guardianEmail: existing.guardianEmail || guardian.guardianEmail,
      guardianPhone: existing.guardianPhone || guardian.guardianPhone,
      externalId: existing.externalId || guardian.externalId,
      relation: preferredRelation(existing.relation, guardian.relation),
      billingContact: existing.billingContact || guardian.billingContact,
      employer: existing.employer || guardian.employer,
    };
  }
  return merged;
}
