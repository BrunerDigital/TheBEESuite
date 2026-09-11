import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertPackagedConfiguration, nativeTarget, selectSimulatorTemplate, unsignedBuildArguments, SIMULATOR_BOOT_TIMEOUT_MS } from "../scripts/verify-ios-native.mjs";

test("native verifier restricts roles and aligns projects with production routes", () => {
  assert.equal(nativeTarget("parent").project, "ios/App/App.xcodeproj");
  assert.equal(nativeTarget("teacher").project, "ios-teacher/App/App.xcodeproj");
  assert.equal(nativeTarget("parent").launchPath, "/parents");
  assert.equal(nativeTarget("teacher").bundleId, "com.brunerdigital.thebeesuite.teacher");
  for (const invalid of ["director", "", "parent; echo secret", undefined]) assert.throws(() => nativeTarget(invalid));
});

test("both native SDK builds are Release and explicitly unsigned, never archived or uploaded", () => {
  for (const role of ["parent", "teacher"]) for (const sdk of ["iphoneos", "iphonesimulator"]) {
    const args = unsignedBuildArguments(nativeTarget(role), sdk, "/tmp/bee native");
    assert.ok(args.includes("Release"));
    assert.ok(args.includes("CODE_SIGNING_ALLOWED=NO"));
    assert.ok(args.includes("CODE_SIGNING_REQUIRED=NO"));
    assert.equal(args.at(-1), "build");
    assert.ok(!args.some((arg) => /archive|export|allowProvisioning|DEVELOPMENT_TEAM/i.test(arg)));
    assert.ok(args.includes(sdk === "iphoneos" ? "generic/platform=iOS" : "generic/platform=iOS Simulator"));
  }
  assert.throws(() => unsignedBuildArguments(nativeTarget("parent"), "macosx", "/tmp/bee"));
});

test("simulator template excludes old runtimes, unavailable devices and iPads", () => {
  const device = { name: "iPhone 17", isAvailable: true, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17" };
  const devices = { devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-18-5": [device],
    "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [device],
    "com.apple.CoreSimulator.SimRuntime.iOS-26-6": [{ ...device, name: "iPad Pro" }, { ...device, isAvailable: false }],
    "com.apple.CoreSimulator.SimRuntime.tvOS-27-0": [device],
  } };
  assert.equal(selectSimulatorTemplate(devices).runtime, "com.apple.CoreSimulator.SimRuntime.iOS-26-0");
  assert.throws(() => selectSimulatorTemplate({ devices: {} }), /No available iPhone/);
  assert.throws(() => selectSimulatorTemplate({ devices: { "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [{ ...device, deviceTypeIdentifier: undefined }] } }));
});

test("simulator selection orders multi-digit versions numerically", () => {
  const device = { name: "iPhone 17", isAvailable: true, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17" };
  assert.equal(selectSimulatorTemplate({ devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-26-9": [device],
    "com.apple.CoreSimulator.SimRuntime.iOS-26-10": [device],
  } }).runtime, "com.apple.CoreSimulator.SimRuntime.iOS-26-10");
});

test("compiled bundle must preserve role, HTTPS, offline recovery and disabled inspection", () => {
  for (const role of ["parent", "teacher"]) {
    const target = nativeTarget(role);
    const config = { appId: target.bundleId, server: { url: "https://thebeesuite.io", appStartPath: target.launchPath,
      cleartext: false, errorPath: "offline.html" }, ios: { webContentsDebuggingEnabled: false } };
    assert.doesNotThrow(() => assertPackagedConfiguration(config, target));
    for (const server of [{ ...config.server, url: "http://localhost:3000" }, { ...config.server, appStartPath: "/dashboard" },
      { ...config.server, cleartext: true }, { ...config.server, allowNavigation: ["*"] }, { ...config.server, errorPath: undefined }]) {
      assert.throws(() => assertPackagedConfiguration({ ...config, server }, target));
    }
    assert.throws(() => assertPackagedConfiguration({ ...config, appId: "com.other.app" }, target));
    assert.throws(() => assertPackagedConfiguration({ ...config, ios: { webContentsDebuggingEnabled: true } }, target));
  }
});

test("native workflow uses read-only permissions, both roles, pinned actions and no credentials", () => {
  const workflow = readFileSync(".github/workflows/ios-native-verify.yml", "utf8");
  assert.match(workflow, /runs-on: macos-26/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /role: \[parent, teacher\]/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /path: output\/audit\/ios-native\/\*\/evidence\//);
  assert.doesNotMatch(workflow, /secrets\.|pull_request_target|write-all|contents: write|\.p12|apple-id|app-store-connect/i);
  for (const line of workflow.split("\n").filter((line) => line.includes("uses:"))) assert.match(line, /@[a-f0-9]{40}\b/);
  const deploymentIgnore = readFileSync(".vercelignore", "utf8");
  assert.match(deploymentIgnore, /^\.github\/\*\r?$/m);
  assert.match(deploymentIgnore, /^!\.github\/workflows\r?$/m);
  assert.match(deploymentIgnore, /^\.github\/workflows\/\*\r?$/m);
  assert.match(deploymentIgnore, /^!\.github\/workflows\/ios-native-verify\.yml\r?$/m);
  assert.match(deploymentIgnore, /^\.env\.\*\r?$/m);
});

test("native verification preserves existing simulators and does not overstate evidence", () => {
  const script = readFileSync("scripts/verify-ios-native.mjs", "utf8");
  assert.match(script, /simctl", "create"/);
  assert.match(script, /simctl", "delete", createdDevice/);
  assert.doesNotMatch(script, /simctl", "erase"|delete", "all"|dotenv|APP_REVIEW_.*PASSWORD|process\.env\.GITHUB_TOKEN/);
  for (const gate of ["signed", "archived", "uploaded", "authenticatedFlowsTested", "physicalDeviceTested", "screenshotsAreStoreReady"]) {
    assert.ok(script.includes(`${gate}: false`));
  }
});

test("fresh simulator migration has a bounded initialization window and starts before compilation", () => {
  assert.ok(SIMULATOR_BOOT_TIMEOUT_MS >= 10 * 60 * 1000 && SIMULATOR_BOOT_TIMEOUT_MS <= 15 * 60 * 1000);
  const script = readFileSync("scripts/verify-ios-native.mjs", "utf8");
  assert.ok(script.indexOf('["simctl", "boot", createdDevice]') < script.indexOf('for (const sdk of ["iphoneos", "iphonesimulator"])'));
  assert.match(script, /timeout: SIMULATOR_BOOT_TIMEOUT_MS/);
});
