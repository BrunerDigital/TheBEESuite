import assert from "node:assert/strict";
import test from "node:test";
import { aiSuggestionWhereForViewer, tenantIdsFromAiPromptContext } from "../src/lib/ai-suggestion-scope";

test("tenant-wide suggestion queries are tenant anchored", () => {
  assert.deepEqual(
    aiSuggestionWhereForViewer({
      tenantId: "tenant_a",
      isPlatformOwner: false,
      hasTenantWideAccess: true,
      visibleCenterIds: ["school_a"],
    }),
    {
      OR: [
        { promptContext: { path: ["tenantId"], equals: "tenant_a" } },
        { promptContext: { path: ["tenantIds"], array_contains: ["tenant_a"] } },
      ],
    },
  );
});

test("center-scoped suggestion queries require tenant and center anchors", () => {
  assert.deepEqual(
    aiSuggestionWhereForViewer({
      tenantId: "tenant_a",
      isPlatformOwner: false,
      hasTenantWideAccess: false,
      visibleCenterIds: ["school_a"],
    }),
    {
      AND: [
        {
          OR: [
            { promptContext: { path: ["tenantId"], equals: "tenant_a" } },
            { promptContext: { path: ["tenantIds"], array_contains: ["tenant_a"] } },
          ],
        },
        {
          OR: [
            { promptContext: { path: ["centerId"], equals: "school_a" } },
            { promptContext: { path: ["centerIds"], array_contains: ["school_a"] } },
            { promptContext: { path: ["segment", "centerIds"], array_contains: ["school_a"] } },
          ],
        },
      ],
    },
  );
});

test("context tenant extraction rejects legacy contextless records", () => {
  assert.deepEqual(tenantIdsFromAiPromptContext({ centerId: "school_a" }), []);
  assert.deepEqual(
    tenantIdsFromAiPromptContext({ tenantId: "tenant_a", tenantIds: ["tenant_a", "tenant_b", "tenant_a", 42] }),
    ["tenant_a", "tenant_b"],
  );
});
