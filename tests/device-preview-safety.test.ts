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
  assert.match(workflowSource, /if \(readOnly\)/);
  assert.match(workflowSource, /disabled=\{readOnly \|\| isPending \|\| !name\}/);
  assert.match(kioskSource, /if \(previewMode\)/);
  assert.match(kioskSource, /if \(previewMode \|\| kioskMode/);
  assert.match(appShellSource, /const searchUserEmail = previewMode \? ""/);
  assert.match(appShellSource, /if \(previewMode && !parentFacing\) \{\s*return <UserAvatar/);
  assert.match(appShellSource, /\{previewMode \? \([\s\S]*Preview account[\s\S]*\) : \([\s\S]*ProfilePhotoUploader/);
  assert.match(appShellSource, /parentPortalPreviewFamilySectionHref/);
  assert.match(appShellSource, /!previewMode && canViewAccountBalances\(currentUser\)/);
  assert.match(appShellSource, /\{!previewMode \? \([\s\S]*aria-label="Sign out"/);
});

