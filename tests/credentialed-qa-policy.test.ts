import assert from "node:assert/strict";
import test from "node:test";
import { credentialedQaBaseUrl, credentialedQaRequestAllowed } from "../scripts/credentialed-qa-policy";

test("QA credentials reject lookalike, external, and credential-bearing origins", () => {
  for (const url of ["https://thebeesuite.io.evil.test", "https://evil.test", "http://thebeesuite.io", "https://thebeesuite.io:8443", "https://user:pass@thebeesuite.io", "https://thebeesuite.io/?token=secret", "https://thebeesuite.io/login"]) {
    assert.throws(() => credentialedQaBaseUrl(url, true));
  }
  assert.throws(() => credentialedQaBaseUrl("https://thebeesuite.io", false));
  assert.equal(credentialedQaBaseUrl("https://www.thebeesuite.io", true), "https://thebeesuite.io");
  assert.equal(credentialedQaBaseUrl("http://127.0.0.1:3015", false), "http://127.0.0.1:3015");
});

const base = { baseUrl: "https://thebeesuite.io", url: "https://thebeesuite.io/api/auth/login", method: "POST", body: null as string | null, resourceType: "fetch", email: "qa@synthetic.thebeesuite.io", password: "local-test-only" };

test("QA permits only the exact selected login and heartbeat payloads", () => {
  const login = { email: base.email, password: base.password, next: "/dashboard", loginPortal: "directors", appMode: "web", deviceLabel: "QA browser" };
  assert.equal(credentialedQaRequestAllowed({ ...base, body: JSON.stringify(login) }), true);
  for (const payload of [{ ...login, email: "real@example.com" }, { ...login, password: "other" }, { ...login, next: "https://evil.test" }, { ...login, role: "PLATFORM_OWNER" }, null, []]) {
    assert.equal(credentialedQaRequestAllowed({ ...base, body: JSON.stringify(payload) }), false);
  }
  assert.equal(credentialedQaRequestAllowed({ ...base, body: "malformed" }), false);
  const heartbeat = { ...base, url: `${base.baseUrl}/api/device-sessions`, body: JSON.stringify({ action: "heartbeat" }) };
  assert.equal(credentialedQaRequestAllowed(heartbeat), true);
  for (const payload of [{ action: "revoke" }, { action: "heartbeat", userId: "another-user" }]) {
    assert.equal(credentialedQaRequestAllowed({ ...heartbeat, body: JSON.stringify(payload) }), false);
  }
});

test("QA denies business writes and external requests before transmission", () => {
  for (const path of ["/api/payments", "/api/messages", "/api/users", "/api/stripe", "/dashboard"]) {
    assert.equal(credentialedQaRequestAllowed({ ...base, url: `${base.baseUrl}${path}`, body: "{}" }), false);
  }
  assert.equal(credentialedQaRequestAllowed({ ...base, url: "https://external.test/collect", body: "{}" }), false);
  assert.equal(credentialedQaRequestAllowed({ ...base, url: "https://external.test", method: "GET", resourceType: "document" }), false);
  assert.equal(credentialedQaRequestAllowed({ ...base, url: "https://external.test/script.js", method: "GET", resourceType: "script" }), false);
  assert.equal(credentialedQaRequestAllowed({ ...base, url: "https://external.test/image.png", method: "GET", resourceType: "image" }), true);
  assert.equal(credentialedQaRequestAllowed({ ...base, url: `${base.baseUrl}/dashboard`, method: "GET", resourceType: "document" }), true);
});
