import assert from "node:assert/strict";
import test from "node:test";
import { filterTelemetryEvent, isCredentialDiagnosticPath, isPublicTelemetryLocation, normalizeDiagnosticPath } from "../src/lib/telemetry-privacy";
import { normalizeClientErrorReportPayload, redactClientDiagnosticText } from "../src/lib/client-error-reporting";
import { redactHeadersForOperationalLog } from "../src/lib/request-response-logging";

const base = "https://fixture.invalid";
const token = "FakePayloadSentinel.FakeSignatureSentinel";
const privatePaths = [
  `/payment-method-form/${token}`, "/payment-method-form/r/FakeShortCode", "/payment-method-form/abc",
  "/payment-method-form/%61%62%63", `/%70ayment-method-form/${token}`, `/%2570ayment-method-form/${token}`,
  "/payment-method-form%2fr%2fFakeShortCode", "/payment-method-form%252fr%252fFakeShortCode",
  "/payment-method-form/%QQ", "/payment-method-form/../reset-password?code=FakeShortCode",
  "/reset-password", "/parents/setup", "/parent-portal/setup", "/stripe-reauthorization/corporate",
  "/login?access_token=FakeShortCode", "/login#token_hash=FakeShortCode", "/login?tokenHash=FakeShortCode",
  "/login?next=%2Fpayment-method-form%2Fr%2FFakeShortCode",
];
for (const path of privatePaths) test(`credential diagnostic boundary case ${privatePaths.indexOf(path) + 1}`, () => {
  assert.equal(isCredentialDiagnosticPath(path), true);
  const result = normalizeClientErrorReportPayload({ path, message: token, stackSample: token, componentStack: token,
    errorType: token, metadata: { [token]: token, status: token, token } });
  assert.equal(JSON.stringify(result).includes("Sentinel"), false);
  assert.equal(JSON.stringify(result).includes("FakeShortCode"), false);
  assert.equal(result.message, null);
});

for (const path of [...privatePaths, "/parent-portal", "/teacher-portal", "/dashboard", "/families/fake7", "/unknown-route", "/?token=FakeShortCode", "/support#FakeShortCode", "/%73upport"]) {
  test(`SDK refuses private or ambiguous page ${[...privatePaths, "/parent-portal", "/teacher-portal", "/dashboard", "/families/fake7", "/unknown-route", "/?token=FakeShortCode", "/support#FakeShortCode", "/%73upport"].indexOf(path) + 1}`, () => {
    assert.equal(isPublicTelemetryLocation(base + path), false);
    for (const type of ["pageview", "vital"]) {
      assert.equal(filterTelemetryEvent({ type, url: base + path }, base), null);
      assert.equal(filterTelemetryEvent({ type, url: base }, base + path), null);
      assert.equal(filterTelemetryEvent({ type, url: base }, base, base + path), null);
    }
  });
}

test("reviewed static public page views and vitals retain useful safe fields", () => {
  for (const origin of [base, "https://thebeesuite.io", "https://www.thebeesuite.io", "https://fake-preview.vercel.app"]) {
    const url = origin + "/support";
    assert.deepEqual(filterTelemetryEvent({ type: "pageview", url }, url), { type: "pageview", url });
    assert.deepEqual(filterTelemetryEvent({ type: "vital", url, route: `/payment-method-form/${token}` }, url), { type: "vital", url, route: "/support" });
  }
  for (const url of ["javascript:alert(1)", "data:text/plain,fake", "https://other.invalid/support", "https://user:secret@fixture.invalid/support", "https://fixture.invalid/\\support"]) {
    assert.equal(filterTelemetryEvent({ type: "pageview", url }, base), null);
  }
  assert.equal(filterTelemetryEvent({ type: "event", url: base }, base), null);
});

test("diagnostics remove short, encoded, dotted and unknown route identifiers", () => {
  for (const id of ["fake7", token, "%66ake7", "123", "fake@example.test"]) {
    assert.equal(normalizeDiagnosticPath(`/parent-portal/families/${id}?child=FakeChild`), "/parent-portal/families/:id");
    assert.equal(normalizeDiagnosticPath(`/documents/${id}`), "/documents/:id");
  }
  assert.equal(normalizeDiagnosticPath("/FakeShortCode"), "/:route");
  assert.equal(normalizeDiagnosticPath("/dashboard?child=FakeChild"), "/dashboard");
});

test("free text redacts before truncation and metadata uses fixed diagnostic keys", () => {
  for (const copy of [base + `/payment-method-form/${token}`, `/payment-method-form/r/FakeShortCode`, encodeURIComponent(base + `/payment-method-form/${token}`), `token=${token}`, token]) {
    const report = normalizeClientErrorReportPayload({ path: "/dashboard", errorType: copy, message: "x".repeat(150) + copy,
      stackSample: `TypeError: ${copy}\n at handler (https://fixture.invalid/_next/static/chunks/fake.js:42:3)`, componentStack: copy,
      metadata: { [copy]: copy, filename: copy, token: copy, status: copy, line: 42, column: 3, attempt: Infinity, digest: "123456" } });
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes("Sentinel"), false);
    assert.equal(serialized.includes("FakeShortCode"), false);
    assert.equal(serialized.includes("https://"), false);
    assert.equal(report.errorType, "ClientError");
    if (copy.startsWith("token=")) assert.equal(report.stackSample, "[REDACTED]");
    else assert.match(report.stackSample!, /TypeError:/);
    assert.deepEqual(report.metadata, { line: 42, column: 3, digest: "123456" });
  }
  assert.equal(redactClientDiagnosticText("Loading chunk failed"), "Loading chunk failed");
});

test("Referer is never copied into operational logs, even for cached clients", () => {
  const headers = new Headers({ Referer: base + `/payment-method-form/${token}?email=fake@example.test` });
  assert.equal(redactHeadersForOperationalLog(headers).referer, "[REDACTED]");
});

test("quoted or spaced credential fields are suppressed completely and idempotently", () => {
  for (const value of ['{"token":"FakeShortCode"}', "Authorization: Bearer FakeShortCode", '{"password":"FakeSecret"}', 'token = "Fake Secret"', "Basic FakeEncodedSecret", "'access_token': 'Fake Secret'"]) {
    const report = normalizeClientErrorReportPayload({ path: "/dashboard", message: value, stackSample: value, componentStack: value });
    assert.equal(report.message, "[REDACTED]"); assert.equal(report.stackSample, "[REDACTED]"); assert.equal(report.componentStack, "[REDACTED]");
    assert.deepEqual(normalizeClientErrorReportPayload(report), report);
  }
});
