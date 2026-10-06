export function resolveAgencyWorkspaceCenter(centers: readonly { id: string }[], requestedCenterId?: string) {
  if (requestedCenterId) return centers.some((center) => center.id === requestedCenterId) ? requestedCenterId : "";
  return centers[0]?.id ?? "";
}
