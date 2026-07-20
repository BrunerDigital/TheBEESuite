export function registrationHandoffHref(centerId: string) {
  const normalizedCenterId = centerId.trim();
  return normalizedCenterId
    ? `/registration?centerId=${encodeURIComponent(normalizedCenterId)}`
    : "/registration";
}

export function resolveRegistrationHandoffCenterId(requestedCenterId: string, availableCenterIds: readonly string[]) {
  const normalizedCenterId = requestedCenterId.trim();
  return availableCenterIds.includes(normalizedCenterId) ? normalizedCenterId : "";
}

export function registrationLeadLookupWhere(centerId: string, email: string) {
  return {
    centerId: centerId.trim(),
    email: email.trim().toLowerCase(),
    status: { not: "lost" },
  } as const;
}
