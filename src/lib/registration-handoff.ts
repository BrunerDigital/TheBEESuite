export function registrationHandoffHref(centerId: string) {
  const normalizedCenterId = centerId.trim();
  return normalizedCenterId
    ? `/registration?centerId=${encodeURIComponent(normalizedCenterId)}`
    : "/registration";
}
