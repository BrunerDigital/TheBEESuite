import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const roles = [
  {
    key: "parent",
    appName: "BEE Suite Parent Portal",
    displayNamePattern: /<string>BEE Suite<\/string>/,
    bundleId: "com.brunerdigital.thebeesuite.parent",
    sku: "BEE-SUITE-PARENT-IOS",
    loginPath: "/parents",
    workspacePath: "/parent-portal",
    webDir: "native/parent-shell",
    iosPath: "ios",
    submissionPacket: "docs/APP_STORE_SUBMISSION_PACKET.md",
    connectDraft: "docs/APP_STORE_CONNECT_CONTENT_DRAFT_2026-07-09.md",
    runbook: "docs/PARENT_IOS_BUILD_RUNBOOK.md",
    cameraPurpose: /Parents can take photos of requested documents or attach images to messages for their school\./,
    photoPurpose: /Parents can choose photos and files to send to their school through the parent portal\./,
  },
  {
    key: "teacher",
    appName: "BEE Suite Teacher Portal",
    displayNamePattern: /<string>BEE Teacher<\/string>/,
    bundleId: "com.brunerdigital.thebeesuite.teacher",
    sku: "BEE-SUITE-TEACHER-IOS",
    loginPath: "/teachers",
    workspacePath: "/teacher-portal",
    webDir: "native/teacher-shell",
    iosPath: "ios-teacher",
    submissionPacket: "docs/TEACHER_APP_STORE_SUBMISSION_PACKET.md",
    connectDraft: "docs/TEACHER_APP_STORE_CONNECT_CONTENT_DRAFT_2026-07-28.md",
    runbook: "docs/TEACHER_IOS_BUILD_RUNBOOK.md",
    cameraPurpose: /Teachers can take classroom photos for parent-approved media updates and school records\./,
    photoPurpose: /Teachers can choose photos and files for classroom updates, daily reports, and school documentation\./,
  },
];

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

function assertTextIncludes(text, expected, label) {
  assert.ok(text.includes(expected), `${label} must include ${expected}`);
}

function checkNativeRole(role, shared) {
  const project = read(`${role.iosPath}/App/App.xcodeproj/project.pbxproj`);
  const info = read(`${role.iosPath}/App/App/Info.plist`);
  const privacy = read(`${role.iosPath}/App/App/PrivacyInfo.xcprivacy`);
  const iconContents = JSON.parse(read(`${role.iosPath}/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json`));
  const splashContents = JSON.parse(read(`${role.iosPath}/App/App/Assets.xcassets/Splash.imageset/Contents.json`));
  const index = read(`${role.webDir}/index.html`);
  const offline = read(`${role.webDir}/offline.html`);
  const submissionPacket = read(role.submissionPacket);
  const connectDraft = read(role.connectDraft);
  const runbook = read(role.runbook);

  assert.match(shared.capacitor, new RegExp(`appId: "${role.bundleId.replaceAll(".", "\\.")}"`));
  assert.match(shared.capacitor, new RegExp(`appName: "${role.appName}"`));
  assert.match(shared.capacitor, new RegExp(`webDir: "${role.webDir.replace("/", "\\/")}"`));
  assert.match(shared.capacitor, new RegExp(`appStartPath: "${role.loginPath}"`));
  assert.match(shared.capacitor, new RegExp(`iosPath: "${role.iosPath}"`));

  assert.match(project, new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = ${role.bundleId.replaceAll(".", "\\.")};`));
  assert.match(project, /MARKETING_VERSION = 1\.0;/);
  assert.match(project, /CURRENT_PROJECT_VERSION = 1;/);
  assert.match(project, /IPHONEOS_DEPLOYMENT_TARGET = 16\.0;/);
  assert.match(project, /TARGETED_DEVICE_FAMILY = 1;/);
  assert.doesNotMatch(project, /com\.apple\.developer\.aps-environment/);
  assert.doesNotMatch(project, /com\.apple\.developer\.associated-domains/);
  assert.match(project, /PrivacyInfo\.xcprivacy in Resources/);

  assert.match(shared.storeApps, new RegExp(`bundleId: "${role.bundleId.replaceAll(".", "\\.")}"`));
  assert.match(shared.storeApps, new RegExp(`sku: "${role.sku}"`));
  assert.match(shared.storeApps, new RegExp(`loginPath: "${role.loginPath}"`));
  assert.match(shared.storeApps, new RegExp(`workspacePath: "${role.workspacePath}"`));

  assert.match(info, role.displayNamePattern);
  assert.match(info, /NSCameraUsageDescription/);
  assert.match(info, role.cameraPurpose);
  assert.match(info, /NSPhotoLibraryUsageDescription/);
  assert.match(info, role.photoPurpose);
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

  const iconEntry = iconContents.images.find((image) => image.filename === "AppIcon-512@2x.png");
  assert.ok(iconEntry, `${role.key} app icon asset catalog entry is missing`);
  assert.equal(iconEntry.size, "1024x1024");
  const icon = assertNoAlpha(`${role.iosPath}/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`);
  assert.deepEqual([icon.width, icon.height], [1024, 1024]);

  assert.equal(splashContents.images.length, 3, `${role.key} splash catalog must contain 1x, 2x, and 3x entries`);
  for (const entry of splashContents.images) {
    assert.ok(["1x", "2x", "3x"].includes(entry.scale), `Unexpected ${role.key} splash scale: ${entry.scale}`);
    const splashPath = `${role.iosPath}/App/App/Assets.xcassets/Splash.imageset/${entry.filename}`;
    const splash = assertNoAlpha(splashPath);
    assert.deepEqual([splash.width, splash.height], [2732, 2732]);
  }

  assertTextIncludes(index, `https://thebeesuite.io${role.loginPath}`, `${role.key} shell`);
  assertTextIncludes(offline, `https://thebeesuite.io${role.loginPath}`, `${role.key} offline shell`);
  assertTextIncludes(submissionPacket, role.bundleId, `${role.key} submission packet`);
  assertTextIncludes(submissionPacket, role.sku, `${role.key} submission packet`);
  assertTextIncludes(connectDraft, role.bundleId, `${role.key} App Store Connect draft`);
  assertTextIncludes(connectDraft, role.sku, `${role.key} App Store Connect draft`);
  assertTextIncludes(runbook, role.bundleId, `${role.key} runbook`);
  assertTextIncludes(runbook, role.loginPath, `${role.key} runbook`);
}

const shared = {
  capacitor: read("capacitor.config.ts"),
  storeApps: read("src/lib/app-store-apps.ts"),
  packageJson: JSON.parse(read("package.json")),
};

assert.match(shared.capacitor, /BEE_SUITE_NATIVE_APP/);
assert.match(shared.capacitor, /url:\s*`https:\/\//);
assert.match(shared.capacitor, /allowNavigation:\s*\[productionHost, `\*\.\$\{productionHost\}`\]/);
assert.match(shared.capacitor, /cleartext:\s*false/);
assert.match(shared.capacitor, /errorPath:\s*"offline\.html"/);
assert.ok(!shared.packageJson.dependencies?.["@capacitor/push-notifications"], "Native push dependency must remain absent while push is deferred");
assert.ok(!shared.packageJson.dependencies?.["@capacitor/android"], "Android dependency must remain absent until the native Android release is approved");

for (const role of roles) {
  assert.ok(shared.packageJson.scripts?.[`ios:${role.key}:sync`], `Missing ios:${role.key}:sync script`);
  assert.ok(shared.packageJson.scripts?.[`ios:${role.key}:open`], `Missing ios:${role.key}:open script`);
  assert.ok(shared.packageJson.scripts?.[`ios:${role.key}:build`], `Missing ios:${role.key}:build script`);
  checkNativeRole(role, shared);
}

const warnings = [];
if (!existsSync("android")) warnings.push("Android native target is not present; Google Play remains preparation-only.");
if (!existsSync("public/.well-known/apple-app-site-association")) warnings.push("Apple universal links are deferred; no AASA file is published from the repository.");
if (!existsSync("public/.well-known/assetlinks.json")) warnings.push("Android App Links are deferred; no assetlinks.json is published from the repository.");
for (const role of roles) {
  if (!existsSync(`${role.iosPath}/App/App/App.entitlements`)) warnings.push(`No ${role.key} iOS push or Associated Domains entitlements are enabled, matching the deferred v1 scope.`);
}

console.log("PASS mobile store repository configuration for parent and teacher");
console.log("PASS iOS identity/version/HTTPS/offline configuration for parent and teacher");
console.log("PASS iOS permissions and privacy manifest presence for parent and teacher");
console.log("PASS iOS 1024px no-alpha icon and 2732px no-alpha splash assets for parent and teacher");
for (const warning of warnings) console.log(`DEFERRED ${warning}`);
