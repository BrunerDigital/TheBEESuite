function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateSignatureChildTarget(input: {
  familyId: string;
  childId: string | null;
  childFamilyId?: string | null;
}) {
  if (!input.childId) return { ok: true as const };
  if (!input.childFamilyId || input.childFamilyId !== input.familyId) {
    return {
      ok: false as const,
      status: 403,
      error: "Selected child is not linked to this family.",
    };
  }
  return { ok: true as const };
}

export function resolveSignatureRecipient(input: {
  requestedEmail?: string | null;
  billingEmail?: string | null;
  guardianEmails: Array<string | null | undefined>;
}) {
  const requestedEmail = clean(input.requestedEmail);
  if (requestedEmail && !isEmail(requestedEmail)) {
    return {
      ok: false as const,
      status: 400,
      error: "Recipient email must be a valid email address.",
    };
  }

  const candidates = [
    requestedEmail,
    clean(input.billingEmail),
    ...input.guardianEmails.map(clean),
  ].filter(isEmail);
  const email = candidates[0];
  if (!email) {
    return {
      ok: false as const,
      status: 400,
      error: "A valid recipient email is required before requesting a signature.",
    };
  }

  return { ok: true as const, email };
}
