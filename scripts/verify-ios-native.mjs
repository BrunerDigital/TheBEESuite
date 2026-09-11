import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

// A fresh iOS 26 simulator performs OS data migration before SpringBoard is ready.
export const SIMULATOR_BOOT_TIMEOUT_MS = 12 * 60 * 1000;
export const VERIFICATION_TIMEOUT_MS = 45 * 60 * 1000;

export function launchProcessId(output, target) {
  const line = output.split("\n").find((value) => value.trim().startsWith(`${target.bundleId}:`))?.trim();
  const pid = line?.slice(target.bundleId.length + 1).trim();
  assert.match(pid ?? "", /^[1-9]\d*$/, "Launcher must return the selected bundle's process ID");
  return pid;
}

export function assertProcessAlive(pid, probe = process.kill) {
  assert.match(pid, /^[1-9]\d*$/, "Only a positive launcher PID may be probed");
  assert.ok(Number.isSafeInteger(Number(pid)), "Launcher PID must be a safe integer");
  // Simulator UIKit processes run on the Mac host; the simulator has no kill binary.
  // Signal zero checks existence/permission without sending a signal.
  probe(Number(pid), 0);
}

export function matchingCrashReport(contents, pid, target) {
  try {
    // Apple .ips files contain a metadata JSON line followed by the crash JSON body.
    const report = JSON.parse(contents.slice(contents.indexOf("\n") + 1));
    return report.pid === Number(pid) && report.bundleInfo?.CFBundleIdentifier === target.bundleId ? report : null;
  } catch { return null; }
}

export function loginScreenVisible(text, target) {
  const normalized = text.toLowerCase().replace(/[\s\u2010-\u2015-]+/g, " ");
  return normalized.includes(target.role === "teacher" ? "teacher sign in" : "parent and guardian sign in");
}

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
  assert.equal(config.server?.url, `https://thebeesuite.io${target.launchPath}`);
  assert.equal(config.server?.appStartPath, undefined, "Remote role routes must not become nonexistent local launch resources");
  assert.equal(config.server?.cleartext, false);
  assert.equal(config.server?.errorPath, "offline.html");
  assert.equal(config.server?.allowNavigation, undefined);
  assert.equal(config.ios?.webContentsDebuggingEnabled, false);
}

export async function verifyNative(role) {
  const target = nativeTarget(role);
  assert.equal(process.platform, "darwin", "Native verification requires macOS/Xcode. Use the iOS native verification GitHub workflow from Windows.");
  const deadline = Date.now() + VERIFICATION_TIMEOUT_MS;
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
    const remaining = deadline - Date.now();
    assert.ok(remaining > 0, "Shared 45-minute native verification deadline reached; preserving cleanup and evidence time");
    report.activeCommand = [command, ...args].join(" ");
    save();
    console.log(`RUN ${role}: ${command} ${args.slice(0, 3).join(" ")}`);
    const fd = log ? openSync(path.join(evidencePath, log), "w") : null;
    let result;
    try {
      result = spawnSync(command, args, { encoding: "utf8", timeout: Math.min(timeout, remaining), maxBuffer: 16 * 1024 * 1024,
        stdio: fd === null ? "pipe" : ["ignore", fd, fd] });
    } finally { if (fd !== null) closeSync(fd); }
    assert.ifError(result.error && new Error(`${report.activeCommand}: ${result.error.message}`));
    assert.equal(result.status, 0, `${command} failed (${result.status}); ${log ? `see ${log}` : result.stderr?.slice(-2000)}`);
    return result.stdout?.trim() ?? "";
  }
  const check = (name) => { report.checks.push(name); console.log(`PASS ${role}: ${name}`); save(); };
  function captureLaunchDiagnostics() {
    if (!createdDevice || !report.launchedProcess) return;
    const { launch, pid } = report.launchedProcess;
    // This is an isolated, public-only simulator: scope logs to this app/PID. Never
    // copy an entire host log archive, app container or another user's crash report.
    const fd = openSync(path.join(evidencePath, `${launch}-process.log`), "w");
    try {
      const result = spawnSync("xcrun", ["simctl", "spawn", createdDevice, "log", "show", "--last", "5m", "--style", "compact",
        "--predicate", `processID == ${pid} OR eventMessage CONTAINS "${target.bundleId}"`],
      { stdio: ["ignore", fd, fd], timeout: 60000 });
      report.processLogCaptured = result.status === 0;
    } finally { closeSync(fd); }
    const crashDirectory = path.join(homedir(), "Library/Logs/DiagnosticReports");
    report.matchingCrashReports = [];
    if (!existsSync(crashDirectory)) return;
    for (const file of readdirSync(crashDirectory).filter((file) => /^App[-_].*\.ips$/.test(file))) {
      const source = path.join(crashDirectory, file);
      const info = statSync(source);
      if (!info.isFile() || info.mtimeMs < Date.parse(report.startedAt) || info.size > 8 * 1024 * 1024) continue;
      const contents = readFileSync(source, "utf8");
      const crash = matchingCrashReport(contents, pid, target);
      if (!crash) continue;
      writeFileSync(path.join(evidencePath, `${launch}-${file}`), contents);
      report.matchingCrashReports.push({ file, exception: crash.exception, termination: crash.termination });
    }
  }
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

    const template = selectSimulatorTemplate(JSON.parse(run("xcrun", ["simctl", "list", "devices", "available", "--json"])));
    report.simulator = { name: template.name, runtime: template.runtime };
    // Never reuse a user's device. Keep first boot separate from actool compilation:
    // both use CoreSimulator services and can contend on small hosted runners.
    createdDevice = run("xcrun", ["simctl", "create", `BEE verification ${role} ${Date.now()}`, template.deviceType, template.runtime]);
    assert.match(createdDevice, /^[A-F0-9-]{36}$/i, "Unexpected created simulator identifier");

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

    run("xcrun", ["simctl", "boot", createdDevice]);
    run("xcrun", ["simctl", "bootstatus", createdDevice, "-b"], { log: "simulator-boot.log", timeout: SIMULATOR_BOOT_TIMEOUT_MS });
    const simulatorApp = path.join(buildRoot, "iphonesimulator", "Build", "Products", "Release-iphonesimulator", "App.app");
    run("xcrun", ["simctl", "install", createdDevice, simulatorApp]);
    check("Unsigned Release installed on isolated iPhone simulator");
    for (const launch of ["cold", "relaunch"]) {
      const result = run("xcrun", ["simctl", "launch", "--terminate-running-process", createdDevice, target.bundleId]);
      const pid = launchProcessId(result, target);
      report.launchedProcess = { launch, pid };
      let loginVisible = false;
      for (let attempt = 1; attempt <= 6 && !loginVisible; attempt++) {
        await setTimeout(10000);
        const screenshot = path.join(evidencePath, `${launch}-public-launch.png`);
        // Capture failure evidence before the liveness assertion, including a real crash/home screen.
        run("xcrun", ["simctl", "io", createdDevice, "screenshot", screenshot]);
        assertProcessAlive(pid);
        const recognized = JSON.parse(run("swift", ["scripts/recognize-ios-screen.swift", screenshot]));
        loginVisible = loginScreenVisible(recognized.text, target);
        writeFileSync(path.join(evidencePath, `${launch}-screen-check.json`), `${JSON.stringify({ attempt, pid, loginVisible, text: recognized.text }, null, 2)}\n`);
      }
      assert.ok(loginVisible, "Native screenshot must show the correct role-specific sign-in screen");
      check(`${launch} launch process alive and native sign-in heading recognized; screenshot captured`);
    }
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    try { captureLaunchDiagnostics(); }
    catch (diagnosticError) { report.diagnosticError = diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError); }
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
