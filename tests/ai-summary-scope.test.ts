import assert from "node:assert/strict";
import test from "node:test";
import { aiSummaryWhereForViewer } from "../src/lib/ai-summary-scope";

test("center-scoped directors only load summaries for their visible school", () => {
  assert.deepEqual(
    aiSummaryWhereForViewer({
      hasTenantWideAccess: false,
      visibleCenterIds: ["school_a"],
    }),
    {
      scope: "center",
      scopeId: { in: ["school_a"] },
    },
  );
});

test("center-scoped viewers without a school fail closed", () => {
  assert.deepEqual(
    aiSummaryWhereForViewer({
      hasTenantWideAccess: false,
      visibleCenterIds: [],
    }),
    {
      scope: "center",
      scopeId: { in: ["__no_visible_centers__"] },
    },
  );
});

test("tenant-wide operators retain the cross-school summary view", () => {
  assert.deepEqual(
    aiSummaryWhereForViewer({
      hasTenantWideAccess: true,
      visibleCenterIds: ["school_a", "school_b"],
    }),
    {},
  );
});
