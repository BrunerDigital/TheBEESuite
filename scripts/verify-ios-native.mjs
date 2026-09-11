import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export function nativeTarget(role) {
  assert.ok(["parent", "teacher"].includes(role), "Role must be parent or teacher");
  return {
    role,
    project: `${role === "teacher" ? "ios-teacher" : "ios"}/App/App.xcodeproj`,
    bundleId: `com.brunerdigital.thebeesuite.${role}`,
    launchPath: role === "teacher" ? "/teachers" : "/parents",
  };
}

export function selectSimulatorTemplate(devices) {
  const candidates = Object.entries(devices.devices ?? {}).flatMap(([runtime, entries]) => {
    const version = runtime.match(/^com\.apple\.CoreSimulator\.SimRuntime\.iOS-(\d+)-(\d+)(?:-(\d+))?$/);
    if (!version || Number(version[1]) < 26) return [];
    return entries.filter((device) => device.isAvailable === true
      && /^iPhone\b/.test(device.name)
      && /^com\.apple\.CoreSimulator\.SimDeviceType\.iPhone-/.test(device.deviceTypeIdentifier ?? ""))
      .map((device) => ({ runtime, deviceType: device.deviceTypeIdentifier, name: device.name,
        rank: Number(version[1]) * 10000 + Number(version[2]) * 100 + Number(version[3] ?? 0) }));
  }).sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
  assert.ok(candidates.length, "No available iPhone simulator with iOS 26 or later; install an iOS runtime in Xcode");
  return candidates[0];
}

export function unsignedBuildArguments(target, sdk, buildRoot) {
  assert.ok(["iphoneos", "iphonesimulator"].includes(sdk), "Unsupported iOS SDK");
  return ["-project", target.project, "-scheme", "App", "-configuration", "Release",
    "-sdk", sdk, "-destination", sdk === "iphoneos" ? "generic/platform=iOS" : "generic/platform=iOS Simulator",
    "-derivedDataPath", path.join(buildRoot, sdk), "-resultBundlePath", path.join(buildRoot, `${sdk}.xcresult`),
    "CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO", "build"];
}

export function assertPackagedConfiguration(config, target) {
  assert.equal(config.appId, target.bundleId, "Packaged role must match the selected app");
  assert.equal(config.server?.url, "https://thebeesuite.io");
  assert.equal(config.server?.appStartPath, target.launchPath);
  assert.equal(config.server?.cleartext, false);
  assert.equal(config.server?.errorPath, "offline.html");
  assert.equal(config.server?.allowNavigation, undefined);
  assert.equal(config.ios?.webContentsDebuggingEnabled, false);
}

export async function verifyNative(role) {
  const target = nativeTarget(role);
  assert.equal(process.platform, "darwin", "Native verification requires macOS/Xcode. Use the iOS native verification GitHub workflow from Windows.");
  const outputRoot = path.resolve("output/audit/ios-native");
  mkdirSync(outputRoot, { recursive: true });
  const buildRoot = mkdtempSync(path.join(outputRoot, `${role}-`));
  const evidencePath = path.join(buildRoot, "evidence");
  mkdirSync(evidencePath);
  const report = { role, bundleId: target.bundleId, startedAt: new Date().toISOString(),
    status: "running", checks: [], signed: false, archived: false, uploaded: false,
    authenticatedFlowsTested: false, physicalDeviceTested: false, screenshotsAreStoreReady: false };
  const save = () => writeFileSync(path.join(evidencePath, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  function run(command, args, { log, timeout = 120000 } = {}) {
    const fd = log ? openSync(path.join(evidencePath, log), "w") : null;
    let result;
    try {
      result = spawnSync(command, args, { encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024,
        stdio: fd === null ? "pipe" : ["ignore", fd, fd] });
    } finally { if (fd !== null) closeSync(fd); }
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${command} failed (${result.status}); ${log ? `see ${log}` : result.stderr?.slice(-2000)}`);
    return result.stdout?.trim() ?? "";
  }
  const check = (name) => { report.checks.push(name); console.log(`PASS ${role}: ${name}`); save(); };
  let createdDevice;
  try {
    report.sourceCommit = run("git", ["rev-parse", "HEAD"]);
    assert.equal(run("git", ["status", "--porcelain", "--untracked-files=no"]), "", "Start with a clean tracked tree");
    report.xcode = run("xcodebuild", ["-version"]);
    report.deviceSdk = run("xcrun", ["--sdk", "iphoneos", "--show-sdk-version"]);
    report.simulatorSdk = run("xcrun", ["--sdk", "iphonesimulator", "--show-sdk-version"]);
    assert.ok(Number(report.xcode.match(/^Xcode (\d+)/)?.[1]) >= 26, "Xcode 26 or later is required");
    assert.ok(Number(report.deviceSdk.split(".")[0]) >= 26 && Number(report.simulatorSdk.split(".")[0]) >= 26, "iOS 26 SDKs required");
    check("Apple upload-minimum toolchain detected (no upload performed)");
    run(process.execPath, ["scripts/run-capacitor-app.mjs", role, "sync", "ios"], { log: "capacitor-sync.log" });
    run("git", ["diff", "--exit-code", "--", "ios", "ios-teacher", "native", "capacitor.config.ts"]);
    run(process.execPath, ["scripts/mobile-store-readiness-check.mjs"], { log: "store-check.log" });
    check("Capacitor sync and static checks; tracked native source unchanged");

    for (const sdk of ["iphoneos", "iphonesimulator"]) {
      console.log(`Building ${role} Release for ${sdk} without signing`);
      run("xcodebuild", unsignedBuildArguments(target, sdk, buildRoot), { log: `${sdk}-build.log`, timeout: 15 * 60 * 1000 });
      const app = path.join(buildRoot, sdk, "Build", "Products", `Release-${sdk}`, "App.app");
      assert.ok(existsSync(path.join(app, "App")), "Compiled app executable missing");
      const info = JSON.parse(run("plutil", ["-convert", "json", "-o", "-", path.join(app, "Info.plist")]));
      assert.equal(info.CFBundleIdentifier, target.bundleId);
      assert.deepEqual(info.UIDeviceFamily, [1]);
      assert.equal(info.MinimumOSVersion, "16.0");
      assert.equal(info.DTPlatformName, sdk);
      assert.equal(info.ITSAppUsesNonExemptEncryption, false);
      assertPackagedConfiguration(JSON.parse(readFileSync(path.join(app, "capacitor.config.json"), "utf8")), target);
      assert.ok(existsSync(path.join(app, "PrivacyInfo.xcprivacy")), "Privacy manifest must be in compiled resources");
      for (const file of ["index.html", "offline.html"]) {
        assert.equal(readFileSync(path.join(app, "public", file), "utf8").replaceAll("\r\n", "\n"),
          readFileSync(`native/${role}-shell/${file}`, "utf8").replaceAll("\r\n", "\n"));
      }
      check(`${sdk} Release compiled; bundle, privacy manifest, HTTPS and offline resources verified`);
    }

    const template = selectSimulatorTemplate(JSON.parse(run("xcrun", ["simctl", "list", "devices", "available", "--json"])));
    report.simulator = { name: template.name, runtime: template.runtime };
    // Create a new isolated simulator; never boot, erase or reuse a user's existing device.
    createdDevice = run("xcrun", ["simctl", "create", `BEE verification ${role} ${Date.now()}`, template.deviceType, template.runtime]);
    assert.match(createdDevice, /^[A-F0-9-]{36}$/i, "Unexpected created simulator identifier");
    run("xcrun", ["simctl", "boot", createdDevice]);
    run("xcrun", ["simctl", "bootstatus", createdDevice, "-b"], { log: "simulator-boot.log", timeout: 300000 });
    const simulatorApp = path.join(buildRoot, "iphonesimulator", "Build", "Products", "Release-iphonesimulator", "App.app");
    run("xcrun", ["simctl", "install", createdDevice, simulatorApp]);
    check("Unsigned Release installed on isolated iPhone simulator");
    for (const launch of ["cold", "relaunch"]) {
      const result = run("xcrun", ["simctl", "launch", "--terminate-running-process", createdDevice, target.bundleId]);
      assert.ok(result.includes(target.bundleId), "App launch did not report selected bundle");
      await setTimeout(10000);
      const processes = run("xcrun", ["simctl", "spawn", createdDevice, "launchctl", "list"]);
      assert.ok(processes.split("\n").some((line) => line.includes(target.bundleId) && /^\d+\s/.test(line)), "App must still be running after launch");
      run("xcrun", ["simctl", "io", createdDevice, "screenshot", path.join(evidencePath, `${launch}-public-launch.png`)]);
      check(`${launch} launch stays running; unauthenticated screenshot captured (visual review required)`);
    }
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    if (createdDevice && /^[A-F0-9-]{36}$/i.test(createdDevice)) {
      // The UUID comes only from this process's successful simctl create call.
      const cleanup = spawnSync("xcrun", ["simctl", "delete", createdDevice], { encoding: "utf8", timeout: 60000 });
      report.isolatedSimulatorDeleted = cleanup.status === 0;
      if (cleanup.status !== 0) { report.status = "failed"; report.cleanupError = "Delete only the isolated simulator created by this run"; }
    }
    report.finishedAt = new Date().toISOString();
    save();
    console.log(`Evidence: ${path.relative(process.cwd(), evidencePath)}`);
  }
  assert.equal(report.status, "passed", "Native verification did not complete cleanly");
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  verifyNative(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
