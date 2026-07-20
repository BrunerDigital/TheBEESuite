import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const capacitorConfig = readFileSync("capacitor.config.ts", "utf8");
const project = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
const infoPlist = readFileSync("ios/App/App/Info.plist", "utf8");

test("parent iOS release identity stays aligned", () => {
  assert.match(capacitorConfig, /appId:\s*"com\.brunerdigital\.thebeesuite\.parent"/);
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = com\.brunerdigital\.thebeesuite\.parent;/);
  assert.match(project, /MARKETING_VERSION = 1\.0;/);
  assert.match(project, /CURRENT_PROJECT_VERSION = 1;/);
});

test("parent iOS v1 remains iPhone-only and HTTPS-only", () => {
  assert.match(project, /IPHONEOS_DEPLOYMENT_TARGET = 16\.0;/);
  assert.match(project, /TARGETED_DEVICE_FAMILY = 1;/);
  assert.match(capacitorConfig, /url:\s*`https:\/\//);
  assert.match(capacitorConfig, /appStartPath:\s*"\/parents"/);
  assert.match(capacitorConfig, /cleartext:\s*false/);
});

test("parent iOS v1 does not declare unfinished native capabilities", () => {
  assert.doesNotMatch(infoPlist, /NSFaceIDUsageDescription/);
  assert.doesNotMatch(project, /com\.apple\.developer\.aps-environment/);
  assert.doesNotMatch(project, /com\.apple\.developer\.associated-domains/);
});

test("parent iOS privacy and permission metadata is present", () => {
  const privacyManifest = readFileSync("ios/App/App/PrivacyInfo.xcprivacy", "utf8");

  assert.match(infoPlist, /NSCameraUsageDescription/);
  assert.match(infoPlist, /NSPhotoLibraryUsageDescription/);
  assert.match(infoPlist, /ITSAppUsesNonExemptEncryption/);
  assert.match(privacyManifest, /NSPrivacyTracking/);
  assert.match(privacyManifest, /NSPrivacyCollectedDataTypes/);
});

test("mobile store configuration audit passes", () => {
  const output = execFileSync(process.execPath, ["scripts/mobile-store-readiness-check.mjs"], { encoding: "utf8" });

  assert.match(output, /PASS mobile store repository configuration/);
  assert.match(output, /PASS iOS 1024px no-alpha icon and 2732px no-alpha splash assets/);
  assert.match(output, /DEFERRED Android native target is not present/);
});

test("v1 UI describes database alerts as in-app notifications, not native push", () => {
  const messagePanel = readFileSync("src/components/message-reply-panel.tsx", "utf8");
  const preferencePanel = readFileSync("src/components/notification-preferences-panel.tsx", "utf8");
  const integrationRoute = readFileSync("src/app/api/integrations/push/route.ts", "utf8");

  assert.doesNotMatch(messagePanel, /push\/in-app notifications/i);
  assert.doesNotMatch(messagePanel, /Queue push\/in-app/i);
  assert.match(messagePanel, /in-app notifications queued/i);
  assert.match(preferencePanel, /In-app on/);
  assert.match(preferencePanel, /<TableHead>In-app<\/TableHead>/);
  assert.doesNotMatch(integrationRoute, /PUSH_PROVIDER_KEY/);
  assert.match(integrationRoute, /configured:\s*false/);
  assert.match(integrationRoute, /deliveryMode:\s*"in_app_only"/);
});
