import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PARENT_PORTAL_HREFS,
  PARENT_PORTAL_VIEWS,
  normalizeParentPortalView,
  parentPortalFamilySectionHref,
  parentPortalHref,
  parentPortalPreviewHref,
  parentPortalPreviewFamilySectionHref,
} from "@/lib/parent-portal-navigation";

test("parent portal views normalize unknown input to a safe home view", () => {
  assert.deepEqual(PARENT_PORTAL_VIEWS, ["home", "updates", "messages", "payments", "family"]);
  assert.equal(normalizeParentPortalView("UPDATES"), "updates");
  assert.equal(normalizeParentPortalView("  payments  "), "payments");
  assert.equal(normalizeParentPortalView("billing"), "home");
  assert.equal(normalizeParentPortalView(undefined), "home");
});

test("parent portal hrefs use one query-view contract", () => {
  assert.equal(parentPortalHref("home"), "/parent-portal?view=home");
  assert.deepEqual(PARENT_PORTAL_HREFS, {
    home: "/parent-portal?view=home",
    updates: "/parent-portal?view=updates",
    messages: "/parent-portal?view=messages",
    payments: "/parent-portal?view=payments",
    family: "/parent-portal?view=family",
  });
});

test("parent preview hrefs preserve preview routing and select a read-only screen", () => {
  assert.equal(
    parentPortalPreviewHref("/device-preview?view=parent", "messages"),
    "/device-preview?view=parent&screen=messages",
  );
  assert.equal(
    parentPortalPreviewHref("/device-preview?view=parent&screen=home", "family"),
    "/device-preview?view=parent&screen=family",
  );
  assert.equal(
    parentPortalPreviewHref("/device-preview?view=parent#preview", "payments"),
    "/device-preview?view=parent&screen=payments#preview",
  );
});

test("parent account destinations open the exact family settings section", () => {
  assert.equal(
    parentPortalFamilySectionHref("profile"),
    "/parent-portal?view=family&section=profile",
  );
  assert.equal(
    parentPortalFamilySectionHref("notifications"),
    "/parent-portal?view=family&section=notifications",
  );
  assert.equal(
    parentPortalPreviewFamilySectionHref("/device-preview?view=parent", "profile"),
    "/device-preview?view=parent&screen=family&section=profile",
  );
  assert.equal(
    parentPortalPreviewFamilySectionHref("/device-preview?view=parent", "notifications"),
    "/device-preview?view=parent&screen=family&section=notifications",
  );
});

test("app shell gives parent-facing users complete navigation without the empty mobile drawer", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");

  for (const view of PARENT_PORTAL_VIEWS) {
    assert.match(shell, new RegExp(`view: ["']${view}["']`));
  }
  assert.match(shell, /const moreItems = parentFacing\s*\? \[\]/);
  assert.match(shell, /aria-label=\{parentFacing \? "Family portal navigation" : "Role quick navigation"\}/);
  assert.match(shell, /\{parentFacing \? \(\s*<BrandLogo[\s\S]*compact[\s\S]*size="sm"/);
  assert.doesNotMatch(shell, /\/parent-portal#(?:today|messages|billing|daily-updates|photos)/);
  assert.match(shell, /searchParams\.get\(previewMode \? "screen" : "view"\)/);
  assert.match(shell, /parentPortalPreviewHref\(previewHrefBase \?\? pathname, view\)/);
  assert.match(shell, /const staticFamilyScope = isParentFacingUser\(currentUser\) && context\.kind === "family"/);
  assert.match(shell, /currentUser\?\.scopeContext && !parentFacing/);
  assert.doesNotMatch(shell, /Live pilot safeguards|AI suggestions require review/);
});

test("parent account menu exposes real destinations while preview stays mutation-free", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  const avatar = readFileSync("src/components/user-avatar.tsx", "utf8");

  assert.match(shell, /const profileHref = previewMode[\s\S]*parentPortalFamilySectionHref\("profile"\)/);
  assert.match(shell, /const notificationsHref = previewMode[\s\S]*parentPortalFamilySectionHref\("notifications"\)/);
  assert.match(shell, /render=\{<Link href=\{profileHref\}[\s\S]*Profile &amp; security/);
  assert.match(shell, /render=\{<Link href=\{notificationsHref\}[\s\S]*Notifications/);
  assert.match(shell, /\{previewMode \? \([\s\S]*Preview account[\s\S]*\) : \([\s\S]*ProfilePhotoUploader/);
  assert.match(shell, /\{!previewMode \? \([\s\S]*Sign out[\s\S]*\) : null\}/);
  assert.match(shell, /preferInitialsForDefault=\{parentFacing\}/);
  assert.match(avatar, /const showInitials = preferInitialsForDefault && \(!src \|\| defaultProfilePhotoUrls\.has\(src\)\)/);
  assert.match(avatar, /initialsForName\(name\)/);
});
