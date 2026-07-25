export function aiSummaryWhereForViewer(input: {
  hasTenantWideAccess: boolean;
  visibleCenterIds: string[];
}) {
  if (input.hasTenantWideAccess) return {};

  return {
    scope: "center",
    scopeId: {
      in: input.visibleCenterIds.length
        ? input.visibleCenterIds
        : ["__no_visible_centers__"],
    },
  };
}
