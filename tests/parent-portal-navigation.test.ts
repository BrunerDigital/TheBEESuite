import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PARENT_PORTAL_HREFS,
  PARENT_PORTAL_FAMILY_SECTIONS,
  PARENT_PORTAL_VIEWS,
  normalizeParentPortalView,
  parentPortalFamilySectionHref,
  parentPortalHref,
  parentPortalPreviewHref,
  parentPortalPreviewFamilySectionHref,
  parentPortalWorkspaceHref,
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
  assert.deepEqual(PARENT_PORTAL_FAMILY_SECTIONS, [
    "children",
    "check-in",
    "documents",
    "billing",
    "profile",
    "notifications",
  ]);
  assert.equal(
    parentPortalFamilySectionHref("profile"),
    "/parent-portal?view=family&section=profile",
  );
  assert.equal(
    parentPortalFamilySectionHref("billing"),
    "/parent-portal?view=family&section=billing",
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

test("workspace hrefs preserve family scope and preview routing", () => {
  assert.equal(
    parentPortalWorkspaceHref({
      view: "family",
      familyId: "family A&B",
      section: "documents",
      hash: "contact-request",
    }),
    "/parent-portal?view=family&section=documents&familyId=family+A%26B#contact-request",
  );
  assert.equal(
    parentPortalWorkspaceHref({
      view: "family",
      previewHrefBase: "/device-preview?view=parent&screen=home&campaign=safe#old-anchor",
      familyId: "exec-demo-family",
      section: "children",
      hash: "#incidents",
    }),
    "/device-preview?view=parent&screen=family&campaign=safe&section=children&familyId=exec-demo-family#incidents",
  );
  assert.equal(
    parentPortalWorkspaceHref({
      view: "messages",
      previewHrefBase: "/device-preview?view=parent&section=profile&familyId=family-2#keep-me",
    }),
    "/device-preview?view=parent&familyId=family-2&screen=messages#keep-me",
  );
  assert.equal(
    parentPortalWorkspaceHref({
      view: "payments",
      previewHrefBase: "/device-preview?view=parent&familyId=family-2#old-anchor",
      familyId: null,
      hash: null,
    }),
    "/device-preview?view=parent&screen=payments",
  );
});

test("app shell retains complete guardian navigation without the empty mobile drawer", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");

  for (const view of PARENT_PORTAL_VIEWS) {
    assert.match(shell, new RegExp(`view: ["']${view}["']`));
  }
  assert.match(shell, /const moreItems = parentFacing\s*\? \[\]/);
  assert.match(shell, /aria-label=\{parentFacing \? parentNavigationLabel : "Primary navigation"\}/);
  assert.match(shell, /\{parentFacing \? \(\s*<BrandLogo[\s\S]*compact[\s\S]*size="sm"/);
  assert.doesNotMatch(shell, /\/parent-portal#(?:today|messages|billing|daily-updates|photos)/);
  assert.match(shell, /searchParams\.get\(previewMode \? "screen" : "view"\)/);
  assert.match(shell, /const staticFamilyScope = isParentFacingUser\(currentUser\) && context\.kind === "family"/);
  assert.match(shell, /currentUser\?\.scopeContext && !parentFacing/);
  assert.doesNotMatch(shell, /Live pilot safeguards|AI suggestions require review/);
  assert.match(shell, /const familyId = searchParams\.get\("familyId"\)/);
  assert.match(shell, /return \{ activeView, familyId \}/);
  assert.match(
    shell,
    /return parentPortalWorkspaceHref\(\{[\s\S]*previewHrefBase: previewMode \? previewHrefBase \?\? pathname : undefined,[\s\S]*familyId,[\s\S]*\}\)/,
  );
  assert.match(
    shell,
    /parentPortalShellHref\(parentView, previewMode, previewHrefBase, pathname, familyId\)/,
  );
});

test("primary parent navigation uses document requests across responsive shells", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  const workspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");

  assert.match(
    shell,
    /function ParentPortalDocumentLink\([\s\S]*React\.ComponentPropsWithoutRef<"a">[\s\S]*return <a href=\{href\} \{\.\.\.props\} \/>/,
  );
  assert.equal(shell.match(/<ParentPortalDocumentLink/g)?.length, 2);
  assert.match(shell, /const NavigationLink = parentView \? ParentPortalDocumentLink : Link/);
  assert.match(
    workspace,
    /function ParentPortalDocumentLink\([\s\S]*ComponentPropsWithoutRef<"a">[\s\S]*return <a href=\{href\} \{\.\.\.props\} \/>/,
  );
  assert.doesNotMatch(workspace, /from "next\/link"/);
  assert.doesNotMatch(workspace, /<Link\b/);
  assert.match(
    workspace,
    /<ParentPortalDocumentLink[\s\S]*Incident Report to Review[\s\S]*<\/ParentPortalDocumentLink>/,
  );
});

test("authorized pickup shell navigation stays limited to the parent portal home entry point", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");

  assert.match(
    shell,
    /const authorizedPickupShellItems = parentPortalShellItems\s*\.filter\(\(\{ view \}\) => view === "home"\)\s*\.map\(\(item\) => \(\{[\s\S]*label: "Pickup access"/,
  );
  assert.match(
    shell,
    /if \(currentUser\?\.role === "AUTHORIZED_PICKUP"\) return authorizedPickupShellItems/,
  );
  assert.equal(
    shell.match(/parentNavigationItems\.map\(\(\{ view, label, description, Icon \}\) =>/g)?.length,
    2,
  );
  assert.match(shell, /: parentFacing\s*\? parentNavigationItems/);
  assert.match(shell, /const parentGuardian = currentUser\.role === "PARENT_GUARDIAN"/);
  assert.match(shell, /\{parentGuardian \? \(\s*<>[\s\S]*Profile &amp; security/);
  assert.match(
    shell,
    /function roleUsesBottomNavigation\(currentUser\?: ShellUser\) \{\s*return Boolean\(currentUser && currentUser\.role !== "AUTHORIZED_PICKUP"\);\s*\}/,
  );
  assert.match(shell, /if \(!roleUsesBottomNavigation\(currentUser\)\) return null/);
  assert.match(shell, /const hasRoleBottomNav = roleUsesBottomNavigation\(currentUser\)/);
  assert.match(shell, /hasRoleBottomNav && "pb-24 lg:pb-6 xl:pb-8"/);
});

test("parent account menu exposes real destinations while preview stays mutation-free", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  const avatar = readFileSync("src/components/user-avatar.tsx", "utf8");

  assert.match(shell, /const familyId = parentFacing \? searchParams\.get\("familyId"\) : null/);
  assert.match(shell, /const accountDestination = \(section: "profile" \| "notifications"\) => parentPortalWorkspaceHref\(\{/);
  assert.match(shell, /familyId,[\s\S]*section,[\s\S]*const profileHref = accountDestination\("profile"\)/);
  assert.match(shell, /const notificationsHref = accountDestination\("notifications"\)/);
  assert.match(shell, /render=\{<Link href=\{profileHref\}[\s\S]*Profile &amp; security/);
  assert.match(shell, /render=\{<Link href=\{notificationsHref\}[\s\S]*Notifications/);
  assert.match(shell, /\{previewMode \? \([\s\S]*Preview account[\s\S]*\) : \([\s\S]*ProfilePhotoUploader/);
  assert.match(shell, /\{!previewMode \? \([\s\S]*Sign out[\s\S]*\) : null\}/);
  assert.match(shell, /preferInitialsForDefault=\{parentFacing\}/);
  assert.match(avatar, /const showInitials = preferInitialsForDefault && \(!src \|\| defaultProfilePhotoUrls\.has\(src\)\)/);
  assert.match(avatar, /initialsForName\(name\)/);
});

test("parent correction deep link resolves to a labeled request section", () => {
  const workspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");

  assert.match(workspace, /id="contact-request"[\s\S]*aria-labelledby="contact-request-heading"/);
  assert.match(workspace, /id="contact-request-heading"/);
  assert.match(workspace, /<Label htmlFor="contact-request-details">[\s\S]*<Textarea[\s\S]*id="contact-request-details"/);
  assert.match(workspace, /hash: "contact-request"/);
});
