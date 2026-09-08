import type { Prisma } from "@prisma/client";

const NO_VISIBLE_SUGGESTION = "__no_visible_ai_suggestion__";

function tenantAnchorWhere(tenantId: string): Prisma.AiSuggestionWhereInput {
  return {
    OR: [
      { promptContext: { path: ["tenantId"], equals: tenantId } },
      { promptContext: { path: ["tenantIds"], array_contains: [tenantId] } },
    ],
  };
}

export function aiSuggestionWhereForViewer(input: {
  tenantId: string;
  isPlatformOwner: boolean;
  hasTenantWideAccess: boolean;
  visibleCenterIds: string[];
}): Prisma.AiSuggestionWhereInput {
  if (input.isPlatformOwner && input.hasTenantWideAccess) return {};

  const tenantWhere = tenantAnchorWhere(input.tenantId);
  if (input.hasTenantWideAccess) return tenantWhere;
  if (!input.visibleCenterIds.length) return { id: NO_VISIBLE_SUGGESTION };

  return {
    AND: [
      tenantWhere,
      {
        OR: input.visibleCenterIds.flatMap((centerId) => [
          { promptContext: { path: ["centerId"], equals: centerId } },
          { promptContext: { path: ["centerIds"], array_contains: [centerId] } },
          { promptContext: { path: ["segment", "centerIds"], array_contains: [centerId] } },
        ]),
      },
    ],
  };
}

export function tenantIdsFromAiPromptContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const context = value as Record<string, unknown>;
  const tenantId = typeof context.tenantId === "string" ? context.tenantId.trim() : "";
  const tenantIds = Array.isArray(context.tenantIds)
    ? context.tenantIds
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
    : [];
  return Array.from(new Set([tenantId, ...tenantIds].filter(Boolean)));
}
