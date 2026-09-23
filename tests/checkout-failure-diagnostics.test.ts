import assert from "node:assert/strict";
import test from "node:test";
import { checkoutFailureDiagnostics } from "../src/lib/checkout-failure-diagnostics";
import { redactForOperationalLog } from "../src/lib/request-response-logging";

test("checkout diagnostics retain only recognized provider labels", () => {
  const result = checkoutFailureDiagnostics({ error: {
    code: "resource_missing", param: "customer", type: "invalid_request_error",
    message: "No customer cus_private for parent@example.com", request_log_url: "https://private.example/secret",
  } });
  assert.deepEqual(redactForOperationalLog(result), {
    category: "resource_missing", filter: "customer", type: "invalid_request_error",
  });
  assert.doesNotMatch(JSON.stringify(result), /cus_private|parent@|secret/);
});

test("unexpected provider values and malformed bodies cannot leak into logs", () => {
  for (const body of [null, {}, "secret", { error: "secret" }, { error: {
    code: "parent@example.com", param: "metadata[child_private]", type: "cus_private", message: "secret",
  } }]) {
    assert.deepEqual(checkoutFailureDiagnostics(body), { category: "unclassified", filter: "unclassified", type: "unclassified" });
  }
});
