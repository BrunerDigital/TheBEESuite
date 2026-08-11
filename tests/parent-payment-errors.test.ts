import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  PARENT_PAYMENT_METHOD_UNAVAILABLE_MESSAGE,
  PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
  paymentServiceError,
} from "../src/lib/parent-payment-errors";

test("parent payment errors never expose processor configuration details", () => {
  assert.equal(
    paymentServiceError({
      parentFacing: true,
      providerError: "Webhook secret is missing for tenant school-1",
      fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
    }),
    PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
  );
  assert.equal(
    paymentServiceError({
      parentFacing: true,
      providerError: "Provider setup failed",
      fallback: PARENT_PAYMENT_METHOD_UNAVAILABLE_MESSAGE,
    }),
    PARENT_PAYMENT_METHOD_UNAVAILABLE_MESSAGE,
  );
});

test("authorized staff retain actionable payment diagnostics", () => {
  assert.equal(
    paymentServiceError({
      parentFacing: false,
      providerError: "Online payment confirmation is not configured for this school.",
      fallback: PARENT_PAYMENT_UNAVAILABLE_MESSAGE,
    }),
    "Online payment confirmation is not configured for this school.",
  );
});

test("parent workspace never renders raw provider identifiers or readiness details", () => {
  const source = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  assert.match(source, /return "Other payment"/);
  assert.doesNotMatch(source, /checkoutReadiness\.blockingReason/);
});

test("parent billing routes filter provider details before returning them", () => {
  for (const routePath of [
    "src/app/api/billing/family-payment/route.ts",
    "src/app/api/billing/checkout-session/route.ts",
    "src/app/api/billing/payment-method-session/route.ts",
  ]) {
    const source = readFileSync(routePath, "utf8");
    assert.match(source, /paymentServiceError\(/, routePath);
    assert.doesNotMatch(
      source,
      /error:\s*(?:session|customer|portal|setup|accountStatus)\.error\b/,
      routePath,
    );
    assert.match(source, /\? \{\} : \{ billingApproval \}/, routePath);
  }
  for (const routePath of [
    "src/app/api/billing/family-payment/route.ts",
    "src/app/api/billing/checkout-session/route.ts",
  ]) {
    const source = readFileSync(routePath, "utf8");
    assert.match(source, /parentCheckout[\s\S]{0,80}\? \{\}[\s\S]{0,120}requirements: readiness\.requirementFields/);
  }
});

test("public web manifests bypass authenticated session proxy work", () => {
  const source = readFileSync("src/proxy.ts", "utf8");
  assert.match(source, /webmanifest/);
  assert.match(source, /PUBLIC_SESSIONLESS_PATHS/);
  for (const path of ["/app", "/eula", "/privacy", "/resources", "/support", "/terms"]) {
    assert.match(source, new RegExp(`"${path}"`));
  }
  assert.ok(
    source.indexOf("PUBLIC_SESSIONLESS_PATHS.has") < source.indexOf("return updateSession(request)"),
  );
});
