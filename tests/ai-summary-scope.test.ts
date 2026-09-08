import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { aiSummaryWhereForViewer } from "../src/lib/ai-summary-scope";

test("center-scoped directors only load summaries for their visible school", () => {
  assert.deepEqual(
    aiSummaryWhereForViewer({
      tenantId: "tenant_a",
      isPlatformOwner: false,
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
      tenantId: "tenant_a",
      isPlatformOwner: false,
      hasTenantWideAccess: false,
      visibleCenterIds: [],
    }),
    {
      scope: "center",
      scopeId: { in: ["__no_visible_centers__"] },
    },
  );
});

test("tenant-wide operators load only their tenant and visible center summaries", () => {
  assert.deepEqual(
    aiSummaryWhereForViewer({
      tenantId: "tenant_a",
      isPlatformOwner: false,
      hasTenantWideAccess: true,
      visibleCenterIds: ["school_a", "school_b"],
    }),
    {
      OR: [
        { scope: "tenant", scopeId: "tenant_a" },
        { scope: "center", scopeId: { in: ["school_a", "school_b"] } },
      ],
    },
  );
});

test("platform owners retain platform, tenant, and visible center summaries", () => {
  assert.deepEqual(
    aiSummaryWhereForViewer({
      tenantId: "platform_tenant",
      isPlatformOwner: true,
      hasTenantWideAccess: true,
      visibleCenterIds: ["school_a", "school_b"],
    }),
    {
      OR: [
        { scope: "platform" },
        { scope: "tenant" },
        { scope: "center", scopeId: { in: ["school_a", "school_b"] } },
      ],
    },
  );
});

test("tenant-wide AI summary audits never write a tenant id into the center foreign key", () => {
  const source = readFileSync("src/app/api/ai/command/route.ts", "utf8");
  assert.match(
    source,
    /centerId:\s*selectedCenters\.length === 1 \? selectedCenters\[0\]\.id : null/,
  );
  assert.doesNotMatch(source, /writeAuditLog\(user,[\s\S]*?centerId:\s*scopeId,/);
});
