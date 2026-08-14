import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const kioskSource = readFileSync("src/components/kiosk-check-in.tsx", "utf8");
const kioskCheckRouteSource = readFileSync("src/app/api/kiosk/check/route.ts", "utf8");
const attendancePageSource = readFileSync("src/app/[slug]/page.tsx", "utf8");
const closingBoardSource = readFileSync("src/components/end-of-day-closing-board.tsx", "utf8");
const exportPackageSource = readFileSync("src/app/api/documents/export-package/route.ts", "utf8");
const credentialCardSource = readFileSync("src/components/guardian-kiosk-credential-card.tsx", "utf8");
const credentialPanelSource = readFileSync("src/components/parent-kiosk-credential-panel.tsx", "utf8");
const pinManagerSource = readFileSync("src/components/guardian-pin-manager.tsx", "utf8");

test("family PIN and QR controls have explicit working and recovery states", () => {
  assert.match(kioskSource, /disabled=\{!pin\.length\}[\s\S]*>Clear<\/Button>/);
  assert.match(kioskSource, /disabled=\{!pin\.length\}[\s\S]*>Delete<\/Button>/);
  assert.match(kioskSource, /disabled=\{isPending \|\| pin\.length !== 4\}/);
  assert.match(kioskSource, /pendingAction === "family_lookup" \? "Verifying…" : "Verify Family PIN"/);
  assert.match(kioskSource, /Use PIN Instead/);
  assert.match(kioskSource, /cameraState === "unavailable"[\s\S]*Try Camera Again/);
  assert.match(kioskSource, /function retryCamera\(\)[\s\S]*setCameraAttempt\(\(current\) => current \+ 1\)/);
  assert.match(kioskSource, /Check the connection and try again/);
  assert.match(kioskSource, /Ask the front desk to verify before trying again/);
});

test("privacy and family actions expose no idle no-op controls", () => {
  assert.match(kioskSource, /const idleResetSeconds = 45/);
  assert.match(kioskSource, /if \(remaining <= 0\) reset\(\)/);
  assert.match(kioskSource, /hasPrivateState \? "flex" : "hidden xl:flex"/);
  assert.match(kioskSource, /\{hasPrivateState \? \([\s\S]*Start Over[\s\S]*\) : null\}/);
  assert.match(kioskSource, /const hasPrivateState = Boolean\(/);
  assert.match(kioskSource, /window\.addEventListener\("pagehide", clearPrivateState\)/);
  assert.match(kioskSource, /window\.addEventListener\("pageshow", clearRestoredPrivateState\)/);
  assert.match(kioskSource, /clearRestoredPrivateState\(event: PageTransitionEvent\)[\s\S]*if \(event\.persisted\) reset\(\)/);
  assert.match(kioskSource, /window\.removeEventListener\("pagehide", clearPrivateState\)/);
  assert.match(kioskSource, /window\.removeEventListener\("pageshow", clearRestoredPrivateState\)/);
  assert.match(kioskSource, /name="selectedChildren"/);
  assert.match(kioskSource, /const selected = event\.currentTarget\.checked/);
  assert.match(kioskSource, /disabled=\{isPending \|\| !canCheckInSelected\}/);
  assert.match(kioskSource, /disabled=\{isPending \|\| !canCheckOutSelected\}/);
  assert.match(kioskSource, /\{lookup\.guardian\.fullName\} confirms the selected children/);
  assert.doesNotMatch(kioskSource, /signatureName|guardianSignature|Type your full name/);
  assert.match(kioskSource, /postKioskJson[\s\S]*["']\/api\/kiosk\/lookup["']/);
  assert.match(kioskSource, /postKioskJson[\s\S]*["']\/api\/kiosk\/check["']/);
});

test("PIN and QR kiosk confirmation is reported separately from signature capture", () => {
  assert.match(kioskCheckRouteSource, /signaturePlaceholder: false/);
  assert.match(kioskCheckRouteSource, /credentialConfirmationMethod/);
  assert.match(kioskCheckRouteSource, /credentialConfirmedBy: guardian\.fullName/);
  assert.doesNotMatch(kioskCheckRouteSource, /signatureName: guardian\.fullName|signatureMethod: "typed"/);

  assert.match(attendancePageSource, /credentialConfirmed = Boolean/);
  assert.match(attendancePageSource, /credentialConfirmations: reconciliationLogs\.filter/);
  assert.match(closingBoardSource, /Confirm Pickup Evidence/);
  assert.match(closingBoardSource, /credentialConfirmed/);
  assert.match(exportPackageSource, /"signatureCaptured", "credentialConfirmed"/);
});

test("guardian credential controls are semantic and fail with actionable messages", () => {
  assert.match(credentialPanelSource, /<form[\s\S]*onSubmit=/);
  assert.match(credentialPanelSource, /type="submit"/);
  assert.match(credentialPanelSource, /exactly 4 numbers/);
  assert.match(pinManagerSource, /<form[\s\S]*onSubmit=/);
  assert.match(pinManagerSource, /type="submit"/);
  assert.match(pinManagerSource, /Check your connection and try again/);
  assert.match(credentialCardSource, /onClick=\{printCheckInCard\}/);
  assert.match(credentialCardSource, /<Link href=\{credential\.kioskPath\} prefetch=\{false\}/);
  assert.match(credentialCardSource, /className="h-auto w-40 max-w-full"/);
  assert.doesNotMatch(credentialCardSource, /navigator\.clipboard|window\.location\.assign|QR scan payload|Kiosk:/);
});
