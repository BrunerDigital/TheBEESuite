import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clientErrorFingerprintParts,
  normalizeClientErrorReportPayload,
  redactClientDiagnosticText,
} from "../src/lib/client-error-reporting";

test("client diagnostic text redacts obvious PII", () => {
  const text = redactClientDiagnosticText(
    "Failed for parent@example.com at (555) 123-4567 with card 4242424242424242",
    200,
  );

  assert.equal(text.includes("parent@example.com"), false);
  assert.equal(text.includes("(555) 123-4567"), false);
  assert.equal(text.includes("4242424242424242"), false);
  assert.match(text, /\[REDACTED\]/);
});

test("client error reports strip query strings and sensitive identifiers from paths", () => {
  const report = normalizeClientErrorReportPayload({
    source: "window.error",
    errorType: "TypeError",
    message: "Cannot read property of undefined",
    path: "/parent-portal/families/clz1234567890123?child=Ava",
    metadata: {
      status: "failed",
      email: "parent@example.com",
      attempt: 2,
      nested: { ignored: true },
    },
  });

  assert.equal(report.source, "window.error");
  assert.equal(report.errorType, "TypeError");
  assert.equal(report.path, "/parent-portal/families/:id");
  assert.deepEqual(report.metadata, {
    status: "failed",
    email: "[REDACTED]",
    attempt: 2,
  });
});

test("client error fingerprint parts are stable and low detail", () => {
  const report = normalizeClientErrorReportPayload({
    source: "window.unhandledrejection",
    errorType: "ChunkLoadError",
    message: "Loading chunk failed",
    stackSample: "ChunkLoadError: Loading chunk failed at https://thebeesuite.io/_next/static/chunk.js",
    path: "/parent-portal",
  });

  assert.deepEqual(clientErrorFingerprintParts(report).slice(0, 4), [
    "window.unhandledrejection",
    "ChunkLoadError",
    "Loading chunk failed",
    "/parent-portal",
  ]);
});
