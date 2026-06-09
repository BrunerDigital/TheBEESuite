import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultNotificationPreferenceChannels,
  resolveNotificationPreferenceChannels,
  roleLabel,
} from "../src/lib/notification-preferences";

test("notification preference defaults are type-aware", () => {
  assert.deepEqual(defaultNotificationPreferenceChannels("incidents"), {
    emailEnabled: true,
    smsEnabled: true,
    pushEnabled: true,
  });
  assert.deepEqual(defaultNotificationPreferenceChannels("classroom"), {
    emailEnabled: false,
    smsEnabled: false,
    pushEnabled: true,
  });
});

test("role default applies when a user has no override", () => {
  const resolved = resolveNotificationPreferenceChannels({
    type: "billing",
    target: { mode: "user", userId: "user-1", role: "BILLING_ADMIN" },
    preferences: [
      {
        userId: null,
        role: "BILLING_ADMIN",
        type: "billing",
        emailEnabled: true,
        smsEnabled: true,
        pushEnabled: false,
      },
    ],
  });

  assert.deepEqual(resolved, {
    emailEnabled: true,
    smsEnabled: true,
    pushEnabled: false,
    source: "role",
  });
});

test("user override wins over role default", () => {
  const resolved = resolveNotificationPreferenceChannels({
    type: "fte_reports",
    target: { mode: "user", userId: "director-1", role: "CENTER_DIRECTOR" },
    preferences: [
      {
        userId: null,
        role: "CENTER_DIRECTOR",
        type: "fte_reports",
        emailEnabled: true,
        smsEnabled: true,
        pushEnabled: true,
      },
      {
        userId: "director-1",
        role: null,
        type: "fte_reports",
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: false,
      },
    ],
  });

  assert.deepEqual(resolved, {
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: false,
    source: "user",
  });
});

test("role labels are human readable", () => {
  assert.equal(roleLabel("CENTER_DIRECTOR"), "Center Director");
  assert.equal(roleLabel("READ_ONLY_AUDITOR"), "Read Only Auditor");
});
