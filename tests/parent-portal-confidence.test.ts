import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("parent billing and password settings confirm changes where they happen", () => {
  const portal = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");

  assert.match(portal, /Autopay status confirmed/);
  assert.match(portal, /setAutopayStatusOverride/);
  assert.match(portal, /Password changed successfully/);
  assert.match(portal, /Show passwords/);
  assert.match(portal, /type=\{showPasswords \? "text" : "password"\}/);
});

test("notification dropdown uses role-safe destinations and a closing menu item", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");

  assert.match(shell, /storedNotificationHrefForRole\(notification, currentUser\?\.role\)/);
  assert.match(shell, /<DropdownMenuItem[\s\S]*Open parent portal/);
});
