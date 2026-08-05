export function enrollmentStatusHref(centerId?: string | null) {
  const params = new URLSearchParams({ report: "enrollment_status" });
  if (centerId) params.set("centerId", centerId);
  return `/analytics?${params.toString()}`;
}
