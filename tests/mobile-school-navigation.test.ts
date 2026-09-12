import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { activeShellNavigationHref, mobileScopeDetail } from "../src/lib/shell-navigation-state";

test("role navigation follows direct URLs and history with specific payment views", () => {
  const items = [{ href: "/dashboard" }, { href: "/billing-invoices" }, { href: "/billing-invoices?view=payments" }, { href: "/family-detail?view=messages" }];
  assert.equal(activeShellNavigationHref(items, "/billing-invoices", "view=payments&centerId=fake"), "/billing-invoices?view=payments");
  assert.equal(activeShellNavigationHref(items, "/billing-invoices", "familyId=fake"), "/billing-invoices");
  assert.equal(activeShellNavigationHref(items, "/family-detail", "view=messages&familyId=fake"), "/family-detail?view=messages");
  assert.equal(activeShellNavigationHref(items, "/family-detail", "view=profile"), null);
  assert.equal(activeShellNavigationHref(items, "/dashboard", ""), "/dashboard");
  assert.equal(activeShellNavigationHref(items, "/audit-logs", ""), null);
  assert.equal(activeShellNavigationHref([{ href: "//example.test" }, { href: "/dashboard#section" }], "/dashboard", ""), null);
});

test("mobile drawer preserves authorized navigation and closes through its own controlled state", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  assert.match(shell, /<Sheet open=\{mobileNavigationOpen\} onOpenChange=\{setMobileNavigationOpen\}/);
  assert.match(shell, /<SidebarNav mobileDrawer close=\{\(\) => setMobileNavigationOpen\(false\)\}/);
  assert.match(shell, /primaryNavigation\.has\(slug\) && canAccessShellModule\(currentUser, slug\)/);
  assert.match(shell, /!primaryNavigation\.has\(slug\) && canAccessShellModule\(currentUser, slug\)/);
  assert.match(shell, /data-\[side=left\]:w-\[min\(320px,100vw\)\]/);
  assert.match(shell, /data-\[side=bottom\]:max-h-\[82dvh\]/);
  assert.match(shell, /<SheetHeader[^>]*>[\s\S]*?<SheetTitle className="text-left">More/);
  assert.match(shell, /activeShellNavigationHref\(items, pathname, searchParams\.toString\(\)\)/);
  assert.match(shell, /<ScopeContextLink currentUser=\{currentUser\} mobile=\{mobileDrawer\}[^>]*onNavigate=\{close\}/);
  assert.match(shell, /<AccountMenu currentUser=\{currentUser\}[^\n]*previewMode=\{previewMode\}[^\n]*onNavigate=\{close\}/);
  assert.match(shell, /!event\.defaultPrevented && event\.button === 0 && !event\.metaKey && !event\.ctrlKey/);
  assert.match(shell, /const showDetail = !\(mobile && context\.kind === "school" && displayedDetail === "1 school"\)/);
  assert.match(shell, /onSelected=\{\(\) => \{ setWorkspaceOpen\(false\); onNavigate\?\.\(\); \}\}/);
});

test("compact scope detail removes only the exact duplicated role", () => {
  assert.equal(mobileScopeDetail("Sunshine Academy · Teacher", "Teacher"), "Sunshine Academy");
  assert.equal(mobileScopeDetail("Center Director · 1 school", "Center Director"), "1 school");
  assert.equal(mobileScopeDetail("3 schools · Regional Manager", "Regional Manager"), "3 schools");
  assert.equal(mobileScopeDetail("Sunshine Group · Carmel, IN · Platform Owner", "Platform Owner"), "Sunshine Group · Carmel, IN");
  assert.equal(mobileScopeDetail("Teacher's Academy", "Teacher"), "Teacher's Academy");
  assert.equal(mobileScopeDetail("Sunshine Academy · Teacher", ""), "Sunshine Academy · Teacher");
});

test("shared mobile chrome wraps labels without scaling decorative space or shrinking text", () => {
  const css = readFileSync("src/app/product-ui.css", "utf8");
  assert.match(css, /\.app-scope-context-mobile > span > span\s*\{[^}]*white-space: normal;[^}]*overflow: visible/);
  assert.match(css, /\.app-mobile-drawer nav :is\(a, summary\) > span\s*\{[^}]*white-space: normal/);
  assert.match(css, /:is\(\.app-mobile-drawer, \.app-more-navigation\) \[data-slot="sheet-close"\]\s*\{[^}]*width: 44px;[^}]*height: 44px/);
  assert.match(css, /\.bee-app-frame:has\(\.app-bottom-navigation\) \.app-header\s*\{\s*position: relative/);
  assert.match(css, /\.bee-app-frame \.dashboard-workspace h1\s*\{[^}]*overflow-wrap: anywhere/);
  const fixture = readFileSync("src/app/device-preview/page.tsx", "utf8");
  assert.match(fixture, /role === "assistant-director" \? "ASSISTANT_DIRECTOR" : "CENTER_DIRECTOR"/);
  assert.match(fixture, /process\.env\.NODE_ENV !== "development"\) notFound\(\)/);
  assert.match(readFileSync("src/components/dashboard.tsx", "utf8"), /<h1 className="mt-2 max-w-3xl break-words text-pretty/);
});
