import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer, request as requestLoopback } from "node:http";
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
    || /^\/__nextjs_font\/[a-zA-Z0-9._-]+\.woff2$/.test(pathname)
    || pathname === "/sw.js" || pathname === "/favicon.ico" || pathname === "/manifest.webmanifest");
}

export function keyboardTestConfiguration(original, role, proxyPort) {
  keyboardPreviewPath(role);
  assert.ok(Number.isInteger(proxyPort) && proxyPort > 0 && proxyPort < 65536, "Valid local proxy port required");
  assert.equal(original.appId, `com.brunerdigital.thebeesuite.${role}`);
  return { ...original, server: { url: `http://localhost:${proxyPort}`, cleartext: true },
    ios: { ...original.ios, webContentsDebuggingEnabled: false } };
}

export function keyboardPhaseTimeout(deadline, limit, now = Date.now()) {
  const remaining = deadline - now;
  assert.ok(remaining > 0, "Shared native verification deadline reached");
  return Math.min(remaining, limit);
}

async function unusedLoopbackPort() {
  const reservation = createServer();
  await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  return port;
}


export function createKeyboardPreviewProxy({ role, previewPort, blocked = [] }) {
  keyboardPreviewPath(role);
  assert.ok(Number.isInteger(previewPort) && previewPort > 0 && previewPort < 65536);
  const proxy = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (!keyboardRequestAllowed(request.method, url.pathname)) {
      blocked.push({ method: request.method, path: url.pathname });
      response.writeHead(403).end("Synthetic keyboard QA blocks this request"); return;
    }
    if (url.pathname === "/sw.js") {
      response.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" })
        .end("// Synthetic keyboard QA: no fetch handlers, caching or background work.\n"); return;
    }
    // Ordinary HTTP probes do not upgrade; WebSocket HMR is handled below.
    if (url.pathname === "/_next/hmr" || url.pathname === "/_next/webpack-hmr") {
      response.writeHead(204).end(); return;
    }
    // Preserve the fixture URL in WebKit as well as on the server; client-side
    // navigation and hydration must see the same pathname and query.
    if (url.pathname === "/") {
      response.writeHead(302, { Location: keyboardPreviewPath(role), "Cache-Control": "no-store" }).end(); return;
    }
    const destination = `${url.pathname}${url.search}`;
    // Host and port are fixed transport options, never derived from a request URL.
    const upstream = requestLoopback({ hostname: "127.0.0.1", port: previewPort, path: destination, method: "GET" }, (local) => {
      response.writeHead(local.statusCode ?? 502, { "Content-Type": local.headers["content-type"] ?? "application/octet-stream", "Cache-Control": "no-store" });
      local.pipe(response);
    });
    upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end("Preview unavailable"); });
    upstream.end();
  });

  const upgraded = new Set();
  proxy.on("upgrade", (request, client, clientHead) => {
    const url = new URL(request.url, "http://localhost");
    if (request.method !== "GET" || !["/_next/hmr", "/_next/webpack-hmr"].includes(url.pathname)
      || typeof request.headers["sec-websocket-key"] !== "string") {
      blocked.push({ method: "UPGRADE", path: url.pathname });
      client.destroy(); return;
    }
    // Turbopack waits for this local development connection before hydrating.
    // Only the HMR protocol reaches the isolated, credential-free Next child.
    const upstream = requestLoopback({ hostname: "127.0.0.1", port: previewPort,
      path: `${url.pathname}${url.search}`, method: "GET", headers: {
        Connection: "Upgrade", Upgrade: "websocket",
        "Sec-WebSocket-Key": request.headers["sec-websocket-key"], "Sec-WebSocket-Version": "13",
      } });
    upstream.once("upgrade", (response, socket, head) => {
      upgraded.add(client); upgraded.add(socket);
      const headers = ["upgrade", "connection", "sec-websocket-accept", "sec-websocket-protocol"]
        .filter(name => typeof response.headers[name] === "string")
        .map(name => `${name}: ${response.headers[name]}`).join("\r\n");
      client.write(`HTTP/1.1 101 Switching Protocols\r\n${headers}\r\n\r\n`);
      if (head.length) client.write(head);
      if (clientHead.length) socket.write(clientHead);
      client.on("error", () => socket.destroy()); socket.on("error", () => client.destroy());
      client.once("close", () => { upgraded.delete(client); socket.destroy(); });
      socket.once("close", () => { upgraded.delete(socket); client.destroy(); });
      client.pipe(socket); socket.pipe(client);
    });
    upstream.once("response", response => { response.resume(); client.destroy(); });
    upstream.once("error", () => client.destroy());
    upstream.end();
  });
  return { proxy, destroyUpgrades: () => { for (const socket of upgraded) socket.destroy(); } };
}

/** Isolated synthetic UI test against the built Capacitor binary, never a signed artifact. */
export async function verifyIOSKeyboard({ role, simulator, simulatorApp, buildRoot, evidencePath, run, deadline }) {
  assert.equal(process.platform, "darwin");
  assert.match(simulator, /^[A-F0-9-]{36}$/i);
  const keyboardDeadline = deadline - 30000; // Leave time to export evidence and clean up.
  // Next loads dotenv automatically: reject a developer checkout with real secrets.
  for (const file of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    assert.ok(!existsSync(file), `Keyboard CI requires a secret-free checkout (${file} exists)`);
  }
  const proxyPort = await unusedLoopbackPort();
  const root = path.join(buildRoot, "keyboard");
  mkdirSync(root);
  const copy = path.join(root, "App.app");
  cpSync(simulatorApp, copy, { recursive: true });
  const configPath = path.join(copy, "capacitor.config.json");
  writeFileSync(configPath, JSON.stringify(keyboardTestConfiguration(JSON.parse(readFileSync(configPath, "utf8")), role, proxyPort)));
  // Only this disposable unsigned copy permits loopback HTTP. Production source
  // and both original SDK products retain their verified HTTPS configuration.
  run("/usr/libexec/PlistBuddy", ["-c", "Add :NSAppTransportSecurity dict", path.join(copy, "Info.plist")]);
  run("/usr/libexec/PlistBuddy", ["-c", "Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true", path.join(copy, "Info.plist")]);
  run("xcrun", ["simctl", "terminate", simulator, `com.brunerdigital.thebeesuite.${role}`]);
  run("xcrun", ["simctl", "install", simulator, copy]);

  cpSync("scripts/ios-keyboard/Host.swift", path.join(root, "Host.swift"));
  cpSync("scripts/ios-keyboard/KeyboardUITests.swift", path.join(root, "KeyboardUITests.swift"));
  const settings = { GENERATE_INFOPLIST_FILE: "YES", CODE_SIGNING_ALLOWED: "NO", SWIFT_VERSION: "5.0", IPHONEOS_DEPLOYMENT_TARGET: "16.0", TARGETED_DEVICE_FAMILY: "1" };
  const spec = { name: "KeyboardQA", settings: { base: settings }, targets: {
    Host: { type: "application", platform: "iOS", sources: ["Host.swift"], settings: { base: { PRODUCT_BUNDLE_IDENTIFIER: "com.brunerdigital.keyboardqa.host", INFOPLIST_KEY_UILaunchScreen_Generation: "YES" } } },
    KeyboardUITests: { type: "bundle.ui-testing", platform: "iOS", sources: ["KeyboardUITests.swift"], dependencies: [{ target: "Host" }], settings: { base: { PRODUCT_BUNDLE_IDENTIFIER: "com.brunerdigital.keyboardqa.tests", SWIFT_ACTIVE_COMPILATION_CONDITIONS: role === "teacher" ? "TEACHER" : "PARENT" } } }
  }, schemes: { KeyboardQA: { build: { targets: { Host: "all", KeyboardUITests: ["test"] } }, test: { targets: ["KeyboardUITests"] } } } };
  writeFileSync(path.join(root, "project.json"), JSON.stringify(spec, null, 2));
  run("xcodegen", ["generate", "--spec", path.join(root, "project.json"), "--project", root]);

  const previewPort = await unusedLoopbackPort();
  const preference = spawnSync("defaults", ["read", "com.apple.iphonesimulator", "ConnectHardwareKeyboard"], { encoding: "utf8", timeout: 10000 });
  assert.ok(!preference.error, "Could not read Simulator keyboard preference");
  const previousKeyboard = preference.status === 0 ? preference.stdout.trim() : null;
  assert.ok(previousKeyboard === null || ["0", "1"].includes(previousKeyboard), "Unexpected Simulator keyboard preference");
  const serverLog = openSync(path.join(evidencePath, "keyboard-preview.log"), "w");
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/fixture" };
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(previewPort)], { env, stdio: ["ignore", serverLog, serverLog] });
  let launchError;
  next.on("error", (error) => { launchError = error; });
  const blocked = [];
  const { proxy, destroyUpgrades } = createKeyboardPreviewProxy({ role, previewPort, blocked });
  try {
    console.log(`Starting ${role} synthetic keyboard preview`);
    const startupDeadline = Date.now() + keyboardPhaseTimeout(keyboardDeadline, 3 * 60 * 1000);
    run("defaults", ["write", "com.apple.iphonesimulator", "ConnectHardwareKeyboard", "-bool", "false"]);
    while (true) {
      if (launchError) throw launchError;
      assert.equal(next.exitCode, null, "Local preview process exited");
      // Require this child's readiness before probing: a port collision must fail,
      // never accidentally verify another checkout's preview server.
      if (/Ready in/.test(readFileSync(path.join(evidencePath, "keyboard-preview.log"), "utf8"))) {
        try { if ((await fetch(`http://127.0.0.1:${previewPort}${keyboardPreviewPath(role)}`, { signal: AbortSignal.timeout(keyboardPhaseTimeout(startupDeadline, 10000)) })).ok) break; } catch { /* bounded startup */ }
      }
      assert.ok(Date.now() < startupDeadline, "Local preview did not start within three minutes");
      await delay(1000);
    }
    await new Promise((resolve, reject) => { proxy.once("error", reject); proxy.listen(proxyPort, "127.0.0.1", resolve); });
    console.log(`Running ${role} keyboard XCTest`);
    const testTimeout = keyboardPhaseTimeout(keyboardDeadline, 15 * 60 * 1000);
    const log = openSync(path.join(evidencePath, "keyboard-xctest.log"), "w");
    try {
      // Async child keeps the loopback proxy responsive while XCTest drives UI.
      await new Promise((resolve, reject) => {
        const test = spawn("xcodebuild", ["-project", path.join(root, "KeyboardQA.xcodeproj"), "-scheme", "KeyboardQA", "-destination", `platform=iOS Simulator,id=${simulator}`, "-derivedDataPath", path.join(root, "DerivedData"), "-resultBundlePath", path.join(evidencePath, "keyboard.xcresult"), "-parallel-testing-enabled", "NO", "CODE_SIGNING_ALLOWED=NO", "test"], { stdio: ["ignore", log, log] });
        let timedOut = false;
        let forceKill;
        const timer = setTimeout(() => {
          timedOut = true;
          test.kill("SIGTERM");
          forceKill = setTimeout(() => test.kill("SIGKILL"), 5000);
        }, testTimeout);
        test.once("error", (error) => { clearTimeout(timer); clearTimeout(forceKill); reject(error); });
        test.once("exit", (code) => {
          clearTimeout(timer); clearTimeout(forceKill);
          if (timedOut) reject(new Error("Keyboard XCTest exceeded its bounded deadline"));
          else if (code === 0) resolve();
          else reject(new Error(`Keyboard XCTest failed (${code}); see keyboard-xctest.log`));
        });
      });
    } finally {
      closeSync(log);
      if (existsSync(path.join(evidencePath, "keyboard.xcresult"))) {
        run("xcrun", ["xcresulttool", "export", "attachments", "--path", path.join(evidencePath, "keyboard.xcresult"), "--output-path", path.join(evidencePath, "keyboard-screenshots")]);
      }
    }
    assert.deepEqual(blocked, [], "No unexpected API, write, or navigation attempts");
    return { passed: true, synthetic: true, softwareKeyboard: true, authenticated: false, physicalDevice: false, blockedRequests: blocked.length };
  } finally {
    const restore = previousKeyboard === null
      ? ["delete", "com.apple.iphonesimulator", "ConnectHardwareKeyboard"]
      : ["write", "com.apple.iphonesimulator", "ConnectHardwareKeyboard", "-bool", previousKeyboard === "1" ? "true" : "false"];
    const restored = spawnSync("defaults", restore, { encoding: "utf8", timeout: 10000 });
    if (restored.status !== 0) console.error("Could not restore Simulator keyboard preference:", restored.stderr);
    writeFileSync(path.join(evidencePath, "keyboard-network.json"), JSON.stringify({ blocked }, null, 2));
    destroyUpgrades();
    proxy.closeAllConnections();
    await new Promise(resolve => proxy.close(resolve));
    next.kill("SIGTERM");
    await Promise.race([new Promise(resolve => next.once("exit", resolve)), delay(5000)]);
    if (next.exitCode === null) next.kill("SIGKILL");
    closeSync(serverLog);
    assert.equal(restored.status, 0, "Restore Simulator hardware-keyboard preference");
  }
}
