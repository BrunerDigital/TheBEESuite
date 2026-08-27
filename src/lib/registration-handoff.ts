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

type RegistrationHandoffCenter = {
  id: string;
  crmLocationId?: string | null;
  locationId?: string | null;
  name?: string | null;
};

function normalizedSelector(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function resolveRegistrationHandoffCenter(
  requestedSelector: string,
  availableCenters: readonly RegistrationHandoffCenter[],
) {
  const selector = normalizedSelector(requestedSelector);
  if (!selector) return "";

  const matches = availableCenters.filter((center) =>
    [center.id, center.crmLocationId, center.locationId, center.name]
      .map(normalizedSelector)
      .includes(selector),
  );

  return matches.length === 1 ? matches[0].id : "";
}

export function registrationLeadLookupWhere(centerId: string, email: string) {
  return {
    centerId: centerId.trim(),
    email: email.trim().toLowerCase(),
    status: { not: "lost" },
  } as const;
}
