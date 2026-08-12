import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const previewSource = readFileSync("src/app/device-preview/page.tsx", "utf8");
const proxySource = readFileSync("src/proxy.ts", "utf8");
const appShellSource = readFileSync("src/components/app-shell.tsx", "utf8");
const workflowSource = readFileSync("src/components/automation-workflow-builder.tsx", "utf8");
const kioskSource = readFileSync("src/components/kiosk-check-in.tsx", "utf8");

test("device preview is development-only and uses fake identifiers", () => {
  assert.match(previewSource, /process\.env\.NODE_ENV !== ["']development["']/);
  assert.match(previewSource, /export const dynamic = ["']force-dynamic["']/);
  assert.match(previewSource, /notFound\(\)/);
  assert.match(proxySource, /process\.env\.NODE_ENV !== ["']development["']/);
  assert.match(proxySource, /request\.nextUrl\.pathname === ["']\/device-preview["']/);
  assert.match(proxySource, /status: 404/);
  assert.match(proxySource, /return NextResponse\.next\(\)/);
  assert.match(previewSource, /preview-center/);
  assert.doesNotMatch(previewSource, /prisma\.|auth\.admin|method:\s*["'](?:POST|PUT|PATCH|DELETE)/i);
  assert.match(previewSource, /<AppShell previewMode/);
  assert.match(previewSource, /<ParentPortalWorkspace/);
  assert.match(previewSource, /previewMode/);
  assert.match(previewSource, /normalizeParentPortalView\(screen\)/);
  assert.match(previewSource, /<AutomationWorkflowBuilder data=\{workflowData\} readOnly/);
  assert.match(previewSource, /<KioskCheckIn previewMode/);
  assert.match(previewSource, /familyOnly=\{role === ["']kiosk["']\}/);
  assert.match(previewSource, /initialMode=\{role === ["']kiosk-staff["'] \? ["']staff["'] : ["']family["']\}/);
  assert.match(workflowSource, /if \(readOnly\)/);
  assert.match(workflowSource, /disabled=\{readOnly \|\| isPending \|\| !name\}/);
  assert.match(kioskSource, /if \(previewMode\)/);
  assert.match(kioskSource, /if \(previewMode \|\| activeKioskMode/);
  assert.match(appShellSource, /const searchUserEmail = previewMode \? ""/);
  assert.match(appShellSource, /if \(previewMode && !parentFacing\) \{\s*return <UserAvatar/);
  assert.match(appShellSource, /\{previewMode \? \([\s\S]*Preview account[\s\S]*\) : \([\s\S]*ProfilePhotoUploader/);
  assert.match(appShellSource, /parentPortalWorkspaceHref/);
  assert.match(appShellSource, /!previewMode && canViewAccountBalances\(currentUser\)/);
  assert.match(appShellSource, /\{!previewMode \? \([\s\S]*aria-label="Sign out"/);
});

test("preview shell navigation and data hooks remain inside the inert preview", () => {
  assert.match(appShellSource, /function previewSafeShellHref\(/);
  assert.match(appShellSource, /if \(!previewMode\) return targetHref;/);
  assert.ok((appShellSource.match(/previewSafeShellHref\(/g) ?? []).length >= 8);
  assert.doesNotMatch(appShellSource, /href=\{context\.href\}/);
  assert.doesNotMatch(appShellSource, /const href = shellModuleHref\(currentUser, slug\)/);
  assert.match(appShellSource, /const showWorkspaceTools = !previewMode && !parentFacing;/);
  assert.match(appShellSource, /if \(previewMode \|\| !canViewDataReadiness\) return;/);
  assert.match(appShellSource, /\[canViewDataReadiness, previewMode, readinessContext, readinessRequestKey\]/);
  assert.match(appShellSource, /if \(previewMode \|\| !searchUserEmail \|\| query\.length < 2\)/);
  assert.match(appShellSource, /\[previewMode, searchQuery, searchUserEmail\]/);
  assert.match(appShellSource, /<ScopeContextLink currentUser=\{currentUser\} mobile previewMode=\{previewMode\} previewHrefBase=\{previewHrefBase\}/);
});

test("shell navigation uses the earlier full sidebar breakpoint and equal mobile tabs", () => {
  assert.match(appShellSource, /lg:block xl:hidden/);
  assert.match(appShellSource, /bg-sidebar\/90 backdrop-blur-xl xl:block/);
  assert.match(appShellSource, /lg:pl-20 xl:pl-72/);
  assert.match(appShellSource, /mx-auto grid max-w-md items-stretch gap-1/);
  assert.doesNotMatch(appShellSource, /featured\s*&&/);
  assert.doesNotMatch(appShellSource, /-mt-5 min-h-16/);
  assert.ok((appShellSource.match(/focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/g) ?? []).length >= 10);
});

