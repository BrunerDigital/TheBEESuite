import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const files = {
  capacitor: "capacitor.config.ts",
  project: "ios/App/App.xcodeproj/project.pbxproj",
  info: "ios/App/App/Info.plist",
  privacy: "ios/App/App/PrivacyInfo.xcprivacy",
  iconContents: "ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json",
  icon: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  splashContents: "ios/App/App/Assets.xcassets/Splash.imageset/Contents.json",
};

function read(path) {
  assert.ok(existsSync(path), `Missing required file: ${path}`);
  return readFileSync(path, "utf8");
}

function pngMetadata(path) {
  assert.ok(existsSync(path), `Missing PNG: ${path}`);
  const png = readFileSync(path);
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", `${path} is not a PNG`);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png[25],
  };
}

function assertNoAlpha(path) {
  const metadata = pngMetadata(path);
  assert.ok(![4, 6].includes(metadata.colorType), `${path} must not contain an alpha channel`);
  return metadata;
}

const capacitor = read(files.capacitor);
const project = read(files.project);
const info = read(files.info);
const privacy = read(files.privacy);
const storeApps = read("src/lib/app-store-apps.ts");
const packageJson = JSON.parse(read("package.json"));
const submissionPacket = read("docs/APP_STORE_SUBMISSION_PACKET.md");
const connectDraft = read("docs/APP_STORE_CONNECT_CONTENT_DRAFT_2026-07-09.md");
const iconContents = JSON.parse(read(files.iconContents));
const splashContents = JSON.parse(read(files.splashContents));

assert.match(capacitor, /appId:\s*"com\.brunerdigital\.thebeesuite\.parent"/);
assert.match(capacitor, /appName:\s*"BEE Suite Parent Portal"/);
assert.match(capacitor, /url:\s*`https:\/\//);
assert.match(capacitor, /appStartPath:\s*"\/parents"/);
assert.match(capacitor, /allowNavigation:\s*\[productionHost, `\*\.\$\{productionHost\}`\]/);
assert.match(capacitor, /cleartext:\s*false/);
assert.match(capacitor, /errorPath:\s*"offline\.html"/);

assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = com\.brunerdigital\.thebeesuite\.parent;/);
assert.match(project, /MARKETING_VERSION = 1\.0;/);
assert.match(project, /CURRENT_PROJECT_VERSION = 1;/);
assert.match(project, /IPHONEOS_DEPLOYMENT_TARGET = 16\.0;/);
assert.match(project, /TARGETED_DEVICE_FAMILY = 1;/);
assert.doesNotMatch(project, /com\.apple\.developer\.aps-environment/);
assert.doesNotMatch(project, /com\.apple\.developer\.associated-domains/);
assert.match(storeApps, /bundleId:\s*"com\.brunerdigital\.thebeesuite\.parent"/);
assert.match(submissionPacket, /Initial version \| `1\.0`/);
assert.match(connectDraft, /Version \| `1\.0`/);
assert.ok(!packageJson.dependencies?.["@capacitor/push-notifications"], "Native push dependency must remain absent while push is deferred");
assert.ok(!packageJson.dependencies?.["@capacitor/android"], "Android dependency must remain absent until the native Android release is approved");

assert.match(info, /NSCameraUsageDescription/);
assert.match(info, /NSPhotoLibraryUsageDescription/);
assert.match(info, /ITSAppUsesNonExemptEncryption[\s\S]*?<false\/>/);
assert.doesNotMatch(info, /NSFaceIDUsageDescription/);
assert.doesNotMatch(info, /NSLocation|NSMicrophone|NSUserTrackingUsageDescription/);

assert.match(privacy, /NSPrivacyTracking[\s\S]*?<false\/>/);
assert.match(privacy, /NSPrivacyTrackingDomains/);
assert.match(privacy, /NSPrivacyCollectedDataTypes/);
for (const dataType of [
  "Name",
  "EmailAddress",
  "PhoneNumber",
  "UserID",
  "OtherUserContent",
  "PaymentInfo",
  "PurchaseHistory",
  "Health",
  "SensitiveInfo",
]) {
  assert.match(privacy, new RegExp(`NSPrivacyCollectedDataType${dataType}`));
}
assert.match(project, /PrivacyInfo\.xcprivacy in Resources/);

const iconEntry = iconContents.images.find((image) => image.filename === "AppIcon-512@2x.png");
assert.ok(iconEntry, "App icon asset catalog entry is missing");
assert.equal(iconEntry.size, "1024x1024");
const icon = assertNoAlpha(files.icon);
assert.deepEqual([icon.width, icon.height], [1024, 1024]);

assert.equal(splashContents.images.length, 3, "Splash catalog must contain 1x, 2x, and 3x entries");
for (const entry of splashContents.images) {
  assert.ok(["1x", "2x", "3x"].includes(entry.scale), `Unexpected splash scale: ${entry.scale}`);
  const splashPath = `ios/App/App/Assets.xcassets/Splash.imageset/${entry.filename}`;
  const splash = assertNoAlpha(splashPath);
  assert.deepEqual([splash.width, splash.height], [2732, 2732]);
}

const warnings = [];
if (!existsSync("android")) warnings.push("Android native target is not present; Google Play remains preparation-only.");
if (!existsSync("public/.well-known/apple-app-site-association")) warnings.push("Apple universal links are deferred; no AASA file is published from the repository.");
if (!existsSync("public/.well-known/assetlinks.json")) warnings.push("Android App Links are deferred; no assetlinks.json is published from the repository.");
if (!existsSync("ios/App/App/App.entitlements")) warnings.push("No iOS push or Associated Domains entitlements are enabled, matching the deferred v1 scope.");

console.log("PASS mobile store repository configuration");
console.log("PASS iOS identity/version/HTTPS/offline configuration");
console.log("PASS iOS permissions and privacy manifest presence");
console.log("PASS iOS 1024px no-alpha icon and 2732px no-alpha splash assets");
for (const warning of warnings) console.log(`DEFERRED ${warning}`);
