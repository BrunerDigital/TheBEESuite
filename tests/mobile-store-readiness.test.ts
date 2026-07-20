import assert from "node:assert/strict";
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
