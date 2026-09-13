import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parentProductPurchasingEnabled } from "../src/lib/parent-product-purchase-availability";

test("dormant parent product ordering is code-closed, not configurable activation", () => {
  assert.equal(parentProductPurchasingEnabled(), false);
  const source = readFileSync("src/lib/parent-product-purchase-availability.ts", "utf8");
  assert.doesNotMatch(source, /process\.env|readFeature|featureFlag/);
  assert.match(source, /return false;/);
  assert.match(readFileSync("src/app/[slug]/page.tsx", "utf8"), /uniformProducts=\{\[\]\}/);
});

test("actual product route rejects bodies and concurrent retries before dormant billing work", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/parent-product-purchase-gate-mocks.mjs", import.meta.url))], {
    cwd: process.cwd(), encoding: "utf8", env, timeout: 30_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /concurrent retries remain closed/);
  assert.match(result.stdout, /original authentication and role denials/);
});

test("new-order availability does not gate existing invoice history or payment paths", () => {
  for (const path of [
    "src/components/parent-portal-workspace.tsx",
    "src/app/api/billing/checkout-session/route.ts",
    "src/app/api/billing/family-payment/route.ts",
    "src/app/api/billing/invoices/route.ts",
  ]) assert.doesNotMatch(readFileSync(path, "utf8"), /parentProductPurchasingEnabled|PRODUCT_PURCHASE_UNAVAILABLE/, path);
  const workspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  assert.match(workspace, /function payProductInvoice\(/);
  const route = readFileSync("src/app/api/parent/products/purchase/route.ts", "utf8");
  const gate = route.indexOf("if (!parentProductPurchasingEnabled())");
  assert.ok(gate > route.indexOf("if (!isParentGuardian(user))"));
  for (const boundary of ["request.json()", "getParentPortalFamilyScope(user.id", "prisma.family.findFirst", "prisma.$transaction", "await writeAuditLog"]) {
    assert.ok(route.indexOf(boundary) > gate, boundary);
  }
});
