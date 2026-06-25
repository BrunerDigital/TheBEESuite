import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { apiHttpMethods, discoverApiRouteSpecs } from "../scripts/api-route-test-inventory";

test("API route smoke inventory covers every route file and exported method", () => {
  const specs = discoverApiRouteSpecs();

  assert.ok(specs.length >= 90, `Expected the API inventory to include every current route, found ${specs.length}.`);
  assert.deepEqual(
    specs.filter((spec) => !existsSync(spec.filePath)).map((spec) => spec.filePath),
    [],
    "Every API smoke spec must point to a real route.ts file.",
  );
  assert.deepEqual(
    specs.filter((spec) => spec.methods.length === 0).map((spec) => spec.routePath),
    [],
    "Every API route file must export at least one HTTP method for smoke coverage.",
  );

  const methodChecks = specs.flatMap((spec) => spec.methods.map((method) => `${method} ${spec.routePath}`));
  assert.ok(methodChecks.length >= specs.length, "The smoke runner must exercise at least one method for every route.");
  assert.ok(methodChecks.includes("GET /api/health"));
  assert.ok(methodChecks.includes("POST /api/communications/messages"));
  assert.ok(methodChecks.includes("POST /api/billing/autopay"));
  assert.ok(methodChecks.includes("POST /api/billing/family-payment"));
  assert.ok(methodChecks.includes("POST /api/billing/payment-method-request/checkout"));
  assert.ok(methodChecks.includes("GET /api/cron/autopay-invoices"));
  assert.ok(methodChecks.includes("POST /api/billing/stripe-webhook"));
  assert.ok(methodChecks.includes("POST /api/twilio/inbound"));

  for (const spec of specs) {
    assert.match(spec.routePath, /^\/api\//);
    assert.equal(spec.routePath.includes("["), false, `${spec.routePath} should use smoke-test values for dynamic params.`);
    for (const method of spec.methods) {
      assert.ok(apiHttpMethods.includes(method), `${method} is not a supported route-handler method.`);
    }
  }
});
