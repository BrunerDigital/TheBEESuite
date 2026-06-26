import assert from "node:assert/strict";
import test from "node:test";
import {
  parentPortalAccessDisabled,
  parentPortalAccessFields,
  parentPortalLinkedFields,
} from "@/lib/parent-portal-logins";

test("parent portal access defaults to enabled unless disabled by director", () => {
  assert.equal(parentPortalAccessDisabled(undefined), false);
  assert.equal(parentPortalAccessDisabled({ parentPortal: { loginEnabled: true } }), false);
  assert.equal(parentPortalAccessDisabled({ parentPortal: { accessDisabled: true } }), true);
  assert.equal(parentPortalAccessDisabled({ parentPortal: { loginEnabled: false } }), true);
});

test("director opt-out metadata can be toggled back on", () => {
  const disabled = parentPortalAccessFields({
    customFields: { note: "keep" },
    enabled: false,
    actorEmail: "director@example.com",
  });

  assert.equal(parentPortalAccessDisabled(disabled), true);
  assert.equal((disabled as { note?: string }).note, "keep");

  const enabled = parentPortalLinkedFields({
    customFields: disabled,
    loginEmail: "parent@example.com",
    linkedBy: "director@example.com",
  });

  assert.equal(parentPortalAccessDisabled(enabled), false);
  assert.equal(
    ((enabled as { parentPortal: { loginEmail: string } }).parentPortal.loginEmail),
    "parent@example.com",
  );
});
