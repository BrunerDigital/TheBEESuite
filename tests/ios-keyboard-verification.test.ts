import assert from "node:assert/strict";
import test from "node:test";
import { keyboardPreviewPath, keyboardRequestAllowed, keyboardTestConfiguration } from "../scripts/verify-ios-keyboard.mjs";

test("keyboard harness serves synthetic GET assets and refuses real routes and writes", () => {
  for (const path of ["/", "/device-preview", "/_next/static/chunk.js", "/brand/icon.png"]) assert.equal(keyboardRequestAllowed("GET", path), true);
  for (const path of ["/api/messages", "/api/auth/login", "/parent-portal", "/teacher-portal", "/billing", "/executives"]) assert.equal(keyboardRequestAllowed("GET", path), false);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(keyboardRequestAllowed(method, "/device-preview"), false);
  assert.match(keyboardPreviewPath("parent"), /screen=messages/);
  assert.match(keyboardPreviewPath("teacher"), /view=teacher/);
  assert.throws(() => keyboardPreviewPath("executive"));
});

test("only a matching disposable app gets a loopback configuration; original stays HTTPS", () => {
  for (const role of ["parent", "teacher"]) {
    const source = { appId: `com.brunerdigital.thebeesuite.${role}`, server: { url: "https://thebeesuite.io", appStartPath: role === "parent" ? "/parents" : "/teachers", cleartext: false }, ios: { webContentsDebuggingEnabled: false } };
    const before = structuredClone(source);
    const copy = keyboardTestConfiguration(source, role);
    assert.equal(copy.server.url, "http://localhost:3237");
    assert.equal(copy.server.appStartPath, undefined);
    assert.equal(copy.ios.webContentsDebuggingEnabled, false);
    assert.deepEqual(source, before);
    assert.throws(() => keyboardTestConfiguration(source, role === "parent" ? "teacher" : "parent"));
  }
});
