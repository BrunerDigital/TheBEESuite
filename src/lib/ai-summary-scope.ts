export function aiSummaryWhereForViewer(input: {
  tenantId: string;
  isPlatformOwner: boolean;
  hasTenantWideAccess: boolean;
  visibleCenterIds: string[];
}) {
  if (input.isPlatformOwner && input.hasTenantWideAccess) {
    return {
      OR: [
        { scope: "platform" },
        { scope: "tenant" },
        {
          scope: "center",
          scopeId: {
            in: input.visibleCenterIds.length
              ? input.visibleCenterIds
              : ["__no_visible_centers__"],
          },
        },
      ],
    };
  }

  if (input.hasTenantWideAccess) {
    return {
      OR: [
        { scope: "tenant", scopeId: input.tenantId },
        {
          scope: "center",
          scopeId: {
            in: input.visibleCenterIds.length
              ? input.visibleCenterIds
              : ["__no_visible_centers__"],
          },
        },
      ],
    };
  }

  return {
    scope: "center",
    scopeId: {
      in: input.visibleCenterIds.length
        ? input.visibleCenterIds
        : ["__no_visible_centers__"],
    },
  };
}
