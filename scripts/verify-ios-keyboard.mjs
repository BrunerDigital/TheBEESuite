import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export function keyboardPreviewPath(role) {
  assert.ok(["parent", "teacher"].includes(role), "Unsupported keyboard role");
  return role === "parent" ? "/device-preview?view=parent&screen=messages&scenario=feature-stress"
    : "/device-preview?view=teacher&scenario=long-content";
}

export function keyboardRequestAllowed(method, pathname) {
  return method === "GET" && (pathname === "/" || pathname === "/device-preview"
    || pathname.startsWith("/_next/") || pathname.startsWith("/brand/")
    || pathname === "/favicon.ico" || pathname === "/manifest.webmanifest");
}

export function keyboardTestConfiguration(original, role) {
  keyboardPreviewPath(role);
  assert.equal(original.appId, `com.brunerdigital.thebeesuite.${role}`);
  return { ...original, server: { url: "http://localhost:3237", cleartext: true },
    ios: { ...original.ios, webContentsDebuggingEnabled: false } };
}

/** Isolated synthetic UI test against the built Capacitor binary, never a signed artifact. */
export async function verifyIOSKeyboard({ role, simulator, simulatorApp, buildRoot, evidencePath, run }) {
  assert.equal(process.platform, "darwin");
  assert.match(simulator, /^[A-F0-9-]{36}$/i);
  // Next loads dotenv automatically: reject a developer checkout with real secrets.
  for (const file of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    assert.ok(!existsSync(file), `Keyboard CI requires a secret-free checkout (${file} exists)`);
  }
  const root = path.join(buildRoot, "keyboard");
  mkdirSync(root);
  const copy = path.join(root, "App.app");
  cpSync(simulatorApp, copy, { recursive: true });
  const configPath = path.join(copy, "capacitor.config.json");
  writeFileSync(configPath, JSON.stringify(keyboardTestConfiguration(JSON.parse(readFileSync(configPath, "utf8")), role)));
  // Only this disposable unsigned copy permits loopback HTTP. Production source
  // and both original SDK products retain their verified HTTPS configuration.
  run("/usr/libexec/PlistBuddy", ["-c", "Add :NSAppTransportSecurity dict", path.join(copy, "Info.plist")]);
  run("/usr/libexec/PlistBuddy", ["-c", "Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true", path.join(copy, "Info.plist")]);
  run("xcrun", ["simctl", "terminate", simulator, `com.brunerdigital.thebeesuite.${role}`]);
  run("xcrun", ["simctl", "install", simulator, copy]);
  run("defaults", ["write", "com.apple.iphonesimulator", "ConnectHardwareKeyboard", "-bool", "false"]);

  cpSync("scripts/ios-keyboard/Host.swift", path.join(root, "Host.swift"));
  cpSync("scripts/ios-keyboard/KeyboardUITests.swift", path.join(root, "KeyboardUITests.swift"));
  const settings = { GENERATE_INFOPLIST_FILE: "YES", CODE_SIGNING_ALLOWED: "NO", SWIFT_VERSION: "5.0", IPHONEOS_DEPLOYMENT_TARGET: "16.0", TARGETED_DEVICE_FAMILY: "1" };
  const spec = { name: "KeyboardQA", settings: { base: settings }, targets: {
    Host: { type: "application", platform: "iOS", sources: ["Host.swift"], settings: { base: { PRODUCT_BUNDLE_IDENTIFIER: "com.brunerdigital.keyboardqa.host", INFOPLIST_KEY_UILaunchScreen_Generation: "YES" } } },
    KeyboardUITests: { type: "bundle.ui-testing", platform: "iOS", sources: ["KeyboardUITests.swift"], dependencies: [{ target: "Host" }], settings: { base: { PRODUCT_BUNDLE_IDENTIFIER: "com.brunerdigital.keyboardqa.tests", SWIFT_ACTIVE_COMPILATION_CONDITIONS: role === "teacher" ? "TEACHER" : "PARENT" } } }
  }, schemes: { KeyboardQA: { build: { targets: { Host: "all", KeyboardUITests: ["test"] } }, test: { targets: ["KeyboardUITests"] } } } };
  writeFileSync(path.join(root, "project.json"), JSON.stringify(spec, null, 2));
  run("xcodegen", ["generate", "--spec", path.join(root, "project.json"), "--project", root]);

  const serverLog = openSync(path.join(evidencePath, "keyboard-preview.log"), "w");
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/fixture" };
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3236"], { env, stdio: ["ignore", serverLog, serverLog] });
  let launchError;
  next.on("error", (error) => { launchError = error; });
  const blocked = [];
  const proxy = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost:3237");
    if (!keyboardRequestAllowed(request.method, url.pathname)) {
      blocked.push({ method: request.method, path: url.pathname });
      response.writeHead(403).end("Synthetic keyboard QA blocks this request"); return;
    }
    try {
      const destination = url.pathname === "/" ? keyboardPreviewPath(role) : `${url.pathname}${url.search}`;
      const upstream = await fetch(`http://127.0.0.1:3236${destination}`);
      response.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream", "Cache-Control": "no-store" });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch { response.writeHead(502).end("Preview unavailable"); }
  });
  try {
    const startupDeadline = Date.now() + 3 * 60 * 1000;
    while (true) {
      if (launchError) throw launchError;
      assert.equal(next.exitCode, null, "Local preview process exited");
      try { if ((await fetch(`http://127.0.0.1:3236${keyboardPreviewPath(role)}`, { signal: AbortSignal.timeout(10000) })).ok) break; } catch { /* bounded startup */ }
      assert.ok(Date.now() < startupDeadline, "Local preview did not start within three minutes");
      await delay(1000);
    }
    await new Promise((resolve, reject) => { proxy.once("error", reject); proxy.listen(3237, "127.0.0.1", resolve); });
    const log = openSync(path.join(evidencePath, "keyboard-xctest.log"), "w");
    try {
      // Async child keeps the loopback proxy responsive while XCTest drives UI.
      await new Promise((resolve, reject) => {
        const test = spawn("xcodebuild", ["-project", path.join(root, "KeyboardQA.xcodeproj"), "-scheme", "KeyboardQA", "-destination", `platform=iOS Simulator,id=${simulator}`, "-derivedDataPath", path.join(root, "DerivedData"), "-resultBundlePath", path.join(evidencePath, "keyboard.xcresult"), "-parallel-testing-enabled", "NO", "CODE_SIGNING_ALLOWED=NO", "test"], { stdio: ["ignore", log, log] });
        const timer = setTimeout(() => { test.kill("SIGTERM"); reject(new Error("Keyboard XCTest exceeded 15 minutes")); }, 15 * 60 * 1000);
        test.once("error", (error) => { clearTimeout(timer); reject(error); });
        test.once("exit", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Keyboard XCTest failed (${code}); see keyboard-xctest.log`)); });
      });
    } finally { closeSync(log); }
    assert.deepEqual(blocked, [], "No unexpected API, write, or navigation attempts");
    run("xcrun", ["xcresulttool", "export", "attachments", "--path", path.join(evidencePath, "keyboard.xcresult"), "--output-path", path.join(evidencePath, "keyboard-screenshots")]);
    return { passed: true, synthetic: true, softwareKeyboard: true, authenticated: false, physicalDevice: false, blockedRequests: blocked.length };
  } finally {
    writeFileSync(path.join(evidencePath, "keyboard-network.json"), JSON.stringify({ blocked }, null, 2));
    proxy.closeAllConnections();
    await new Promise(resolve => proxy.close(resolve));
    next.kill("SIGTERM");
    await Promise.race([new Promise(resolve => next.once("exit", resolve)), delay(5000)]);
    if (next.exitCode === null) next.kill("SIGKILL");
    closeSync(serverLog);
  }
}
