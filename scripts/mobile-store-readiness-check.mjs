import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";

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
    requiredPrivacyTypes: ["PaymentInfo", "PurchaseHistory", "OtherFinancialInfo"],
    excludedPrivacyTypes: [],
    storeIcon: "output/app-store/ios/app-icon-1024-no-alpha.png",
    screenshotDirectory: "output/app-store/ios/screenshots-draft",
    screenshotCount: 5,
    themeColor: "#05070a",
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
    requiredPrivacyTypes: [],
    excludedPrivacyTypes: ["PaymentInfo", "PurchaseHistory", "OtherFinancialInfo"],
    storeIcon: "output/app-store/ios-teacher/app-icon-1024-no-alpha.png",
    screenshotDirectory: "output/app-store/ios-teacher/screenshots-draft",
    screenshotCount: 3,
    themeColor: "#151515",
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

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, "\n");
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
  const sharedScheme = read(`${role.iosPath}/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`);
  const swiftPackage = read(`${role.iosPath}/App/CapApp-SPM/Package.swift`);
  const generatedConfigPath = `${role.iosPath}/App/App/capacitor.config.json`;
  const generatedIndexPath = `${role.iosPath}/App/App/public/index.html`;
  const generatedOfflinePath = `${role.iosPath}/App/App/public/offline.html`;
  const syncEvidenceAvailable = [generatedConfigPath, generatedIndexPath, generatedOfflinePath].every(existsSync);

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
  assert.doesNotMatch(info, /CAPACITOR_DEBUG/);
  assert.doesNotMatch(info, /armv7/);
  assert.doesNotMatch(info, /UISupportedInterfaceOrientations~ipad/);
  assert.match(sharedScheme, /buildForArchiving = "YES"/);
  assert.match(sharedScheme, /buildConfiguration = "Release"/);
  assert.doesNotMatch(swiftPackage, /path: "[^"\n]*\\/, `${role.key} Swift package path must use portable forward slashes`);

  assert.match(privacy, /NSPrivacyTracking[\s\S]*?<false\/>/);
  assert.match(privacy, /NSPrivacyTrackingDomains/);
  assert.match(privacy, /NSPrivacyCollectedDataTypes/);
  for (const dataType of [
    "Name",
    "EmailAddress",
    "PhoneNumber",
    "UserID",
    "OtherUserContent",
    "Health",
    "SensitiveInfo",
    ...role.requiredPrivacyTypes,
  ]) {
    assert.match(privacy, new RegExp(`NSPrivacyCollectedDataType${dataType}`));
  }
  for (const dataType of role.excludedPrivacyTypes) {
    assert.doesNotMatch(privacy, new RegExp(`NSPrivacyCollectedDataType${dataType}`));
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
  assertTextIncludes(offline, `<meta name="theme-color" content="${role.themeColor}"`, `${role.key} offline theme`);
  if (syncEvidenceAvailable) {
    const generatedConfig = JSON.parse(read(generatedConfigPath));
    const generatedIndex = read(generatedIndexPath);
    const generatedOffline = read(generatedOfflinePath);
    assert.equal(normalizeLineEndings(generatedIndex), normalizeLineEndings(index), `${role.key} generated index shell is stale; run ios:${role.key}:sync`);
    assert.equal(normalizeLineEndings(generatedOffline), normalizeLineEndings(offline), `${role.key} generated offline shell is stale; run ios:${role.key}:sync`);
    assert.equal(generatedConfig.appId, role.bundleId, `${role.key} generated Capacitor app id is stale`);
    assert.equal(generatedConfig.server?.appStartPath, role.loginPath, `${role.key} generated launch path is stale`);
  }
  assertTextIncludes(submissionPacket, role.bundleId, `${role.key} submission packet`);
  assertTextIncludes(submissionPacket, role.sku, `${role.key} submission packet`);
  assertTextIncludes(connectDraft, role.bundleId, `${role.key} App Store Connect draft`);
  assertTextIncludes(connectDraft, role.sku, `${role.key} App Store Connect draft`);
  assertTextIncludes(runbook, role.bundleId, `${role.key} runbook`);
  assertTextIncludes(runbook, role.loginPath, `${role.key} runbook`);
  assertTextIncludes(submissionPacket, "September 8, 2026", `${role.key} submission packet verification date`);
  assertTextIncludes(runbook, "Xcode 26", `${role.key} runbook toolchain`);

  const nativeIconPath = `${role.iosPath}/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`;
  const storeIcon = assertNoAlpha(role.storeIcon);
  assert.deepEqual([storeIcon.width, storeIcon.height], [1024, 1024]);
  assert.equal(sha256(role.storeIcon), sha256(nativeIconPath), `${role.key} App Store icon export is stale`);

  const screenshots = readdirSync(role.screenshotDirectory)
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => `${role.screenshotDirectory}/${name}`);
  assert.equal(screenshots.length, role.screenshotCount, `${role.key} screenshot draft count is stale`);
  for (const screenshotPath of screenshots) {
    const screenshot = assertNoAlpha(screenshotPath);
    assert.deepEqual([screenshot.width, screenshot.height], [1290, 2796], `${screenshotPath} must match the 6.9-inch portrait slot`);
  }
  assert.equal(new Set(screenshots.map(sha256)).size, screenshots.length, `${role.key} screenshot drafts must show distinct flows`);

  return {
    iconHash: sha256(nativeIconPath),
    splashHash: sha256(`${role.iosPath}/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png`),
    syncEvidenceAvailable,
  };
}

const shared = {
  capacitor: read("capacitor.config.ts"),
  storeApps: read("src/lib/app-store-apps.ts"),
  packageJson: JSON.parse(read("package.json")),
};

const screenshotManifest = JSON.parse(read("output/app-store/screenshot-drafts-manifest.json"));
assert.equal(screenshotManifest.nonNativeDraft, true, "Screenshot planning assets must stay labeled as non-native drafts");
assert.deepEqual(screenshotManifest.dimensions, { width: 1290, height: 2796 });

assert.match(shared.capacitor, /BEE_SUITE_NATIVE_APP/);
assert.match(shared.capacitor, /url:\s*`https:\/\//);
assert.doesNotMatch(shared.capacitor, /allowNavigation/);
assert.match(shared.capacitor, /cleartext:\s*false/);
assert.match(shared.capacitor, /errorPath:\s*"offline\.html"/);
assert.match(shared.capacitor, /webContentsDebuggingEnabled:\s*false/);
assert.match(shared.capacitor, /preferredContentMode:\s*"mobile"/);
assert.match(shared.capacitor, /contentInset:\s*"automatic"/);
assert.match(shared.capacitor, /allowsLinkPreview:\s*false/);
assert.ok(existsSync("scripts/generate-ios-brand-assets.mjs"), "Missing deterministic iOS brand asset generator");
assert.ok(shared.packageJson.devDependencies?.sharp, "Sharp must be a direct development dependency for deterministic iOS assets");
assert.match(shared.packageJson.engines?.node ?? "", /^24(?:\.x)?$/, "Capacitor 8 repository must pin the deployed Node.js 24 major");
assert.ok(!shared.packageJson.dependencies?.["@capacitor/push-notifications"], "Native push dependency must remain absent while push is deferred");
assert.ok(!shared.packageJson.dependencies?.["@capacitor/android"], "Android dependency must remain absent until the native Android release is approved");

const nativeArtifacts = [];
for (const role of roles) {
  assert.ok(shared.packageJson.scripts?.[`ios:${role.key}:sync`], `Missing ios:${role.key}:sync script`);
  assert.ok(shared.packageJson.scripts?.[`ios:${role.key}:open`], `Missing ios:${role.key}:open script`);
  assert.ok(shared.packageJson.scripts?.[`ios:${role.key}:build`], `Missing ios:${role.key}:build script`);
  nativeArtifacts.push({ role: role.key, ...checkNativeRole(role, shared) });
}

assert.notEqual(nativeArtifacts[0].iconHash, nativeArtifacts[1].iconHash, "Parent and teacher icons must be role-distinct");
assert.notEqual(nativeArtifacts[0].splashHash, nativeArtifacts[1].splashHash, "Parent and teacher launch assets must be role-distinct");
if (nativeArtifacts.every((artifact) => artifact.syncEvidenceAvailable)) {
  console.log("PASS local Capacitor generated shells match tracked source for parent and teacher");
} else {
  console.log("NOTE Capacitor generated shells are ignored build output; run both ios:*:sync commands before opening Xcode");
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
console.log("PASS static HTTPS/debug/navigation settings and shared archive schemes for parent and teacher");
console.log("NOTE Static repository checks do not prove Apple signing, archives, physical-device behavior, TestFlight processing, or Guideline 4.2 acceptance");
for (const warning of warnings) console.log(`DEFERRED ${warning}`);
