import assert from "node:assert/strict";
import { createServer, request, type Server } from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createKeyboardPreviewProxy, keyboardPreviewPath, keyboardRequestAllowed } from "../scripts/verify-ios-keyboard.mjs";
import { injectNavigationDiagnostics, MAX_DIAGNOSTIC_HTML_BYTES, MAX_NAVIGATION_EVENTS, NAVIGATION_EVENT_PATH, NAVIGATION_SCRIPT_PATH, navigationDiagnosticsSource, parseNavigationDiagnostic } from "../scripts/ios-keyboard/navigation-diagnostics.mjs";

const fixture = keyboardPreviewPath("teacher");
const validEvent = (seq = 1) => ({ seq, timeMs: 123, event: "click", phase: "after-dispatch", ready: true,
  pathMatches: true, hash: "report", collapsed: "false", noteExists: true, noteVisible: true,
  defaultPrevented: false, cancelable: true, trusted: true, target: "shortcut", active: "report",
  button: 0, pointerType: "touch", x: 289, y: 399 });
const query = (event: unknown) => `?e=${encodeURIComponent(JSON.stringify(event))}`;
const listen = (server: Server): Promise<number> => new Promise(resolve => server.listen(0, "127.0.0.1", () => {
  const address = server.address(); assert.ok(address && typeof address === "object"); resolve(address.port);
}));
const close = async (server: Server) => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); };

test("navigation evidence accepts only bounded enumerated metadata", () => {
  assert.deepEqual(parseNavigationDiagnostic(query(validEvent())), validEvent());
  const bad = [null, [], {}, { ...validEvent(), url: "https://example.com/private" },
    { ...validEvent(), event: "arbitrary text" }, { ...validEvent(), target: "a child name" },
    { ...validEvent(), hash: "#private" }, { ...validEvent(), collapsed: "unknown" },
    { ...validEvent(), seq: 0 }, { ...validEvent(), seq: 129 }, { ...validEvent(), timeMs: 900001 },
    { ...validEvent(), x: 8193 }, { ...validEvent(), y: 0.5 }, { ...validEvent(), trusted: "true" },
    { ...validEvent(), button: 10 }, { ...validEvent(), pointerType: "arbitrary" }];
  for (const value of bad) assert.equal(parseNavigationDiagnostic(query(value)), null);
  for (const value of ["", "?e=not-json", query(validEvent()) + "&e={}", query(validEvent()) + "&extra=1", "?e=" + "a".repeat(7000)]) {
    assert.equal(parseNavigationDiagnostic(value), null);
  }
});

test("proxy injects only the exact synthetic teacher HTML and consumes evidence without forwarding", async () => {
  const forwarded: Array<string | undefined> = [];
  let status = 200, mime = "text/html; charset=utf-8";
  const html = "<!doctype html><html><head><title>Fake</title></head><body>Synthetic café</body></html>";
  const upstream = createServer((req, res) => { forwarded.push(req.url); res.writeHead(status, { "Content-Type": mime }); res.write(html.slice(0, 22)); res.end(html.slice(22)); });
  const previewPort = await listen(upstream);
  const blocked: Array<{ method: string | undefined; path: string }> = [];
  const { proxy, navigationDiagnostics } = createKeyboardPreviewProxy({ role: "teacher", previewPort, blocked });
  const port = await listen(proxy), base = `http://127.0.0.1:${port}`;
  try {
    assert.equal(await (await fetch(base + fixture)).text(), injectNavigationDiagnostics(html));
    assert.equal(navigationDiagnostics.injectedDocuments, 1);
    assert.equal(await (await fetch(base + fixture + "&other=1")).text(), html);
    assert.equal(await (await fetch(base + "/device-preview?view=parent")).text(), html);
    mime = "text/plain";
    assert.equal(await (await fetch(base + fixture)).text(), html);
    mime = "text/html"; status = 500;
    assert.equal((await fetch(base + fixture)).status, 500);
    const before = forwarded.length;
    const script = await fetch(base + NAVIGATION_SCRIPT_PATH);
    assert.equal(script.status, 200);
    assert.match(await script.text(), /installNavigationDiagnostics/);
    assert.equal(navigationDiagnostics.scriptRequests, 1);
    assert.equal((await fetch(base + NAVIGATION_SCRIPT_PATH + "?arbitrary=1")).status, 400);
    assert.equal((await fetch(base + NAVIGATION_EVENT_PATH + query(validEvent()))).status, 204);
    assert.equal((await fetch(base + NAVIGATION_EVENT_PATH + query(validEvent()))).status, 400, "Duplicate sequence is refused");
    assert.equal((await fetch(base + NAVIGATION_EVENT_PATH + query({ ...validEvent(2), text: "not permitted" }))).status, 400);
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) for (const path of [NAVIGATION_EVENT_PATH, NAVIGATION_SCRIPT_PATH]) {
      assert.equal((await fetch(base + path, { method })).status, 403);
    }
    const bodyStatus = await new Promise(resolve => {
      const req = request(base + NAVIGATION_EVENT_PATH + query(validEvent(2)), { method: "GET", headers: { "Content-Length": "1" } }, res => { res.resume(); res.once("end", () => resolve(res.statusCode)); });
      req.end("x");
    });
    assert.equal(bodyStatus, 403, "GET bodies are not a data-upload escape hatch");
    assert.equal(forwarded.length, before, "No reserved evidence resource reaches Next");
    assert.deepEqual(navigationDiagnostics.events, [validEvent()]);
    for (const path of ["/api/messages", "/teacher-portal", "/parents", "/billing"]) assert.equal((await fetch(base + path)).status, 403);
    assert.equal((await fetch(base + fixture, { method: "POST" })).status, 403);
    assert.equal(forwarded.length, before, "Live routes and writes still never reach Next");
    assert.ok(blocked.length > 0);
  } finally { await close(proxy); await close(upstream); }
});

test("parent proxy cannot serve or collect reserved teacher diagnostics", async () => {
  const forwarded: Array<string | undefined> = [];
  const html = "<html><head></head><body>Fake parent</body></html>";
  const upstream = createServer((req, res) => { forwarded.push(req.url); res.writeHead(200, { "Content-Type": "text/html" }).end(html); });
  const previewPort = await listen(upstream);
  const { proxy, navigationDiagnostics } = createKeyboardPreviewProxy({ role: "parent", previewPort });
  const base = `http://127.0.0.1:${await listen(proxy)}`;
  try {
    assert.equal(await (await fetch(base + keyboardPreviewPath("parent"))).text(), html);
    for (const path of [NAVIGATION_SCRIPT_PATH, NAVIGATION_EVENT_PATH + query(validEvent())]) assert.equal((await fetch(base + path)).status, 403);
    assert.equal(forwarded.length, 1);
    assert.equal(navigationDiagnostics.enabled, false);
    assert.deepEqual(navigationDiagnostics.events, []);
  } finally { await close(proxy); await close(upstream); }
});

test("missing head and oversized fixture fail visibly without partial injection", async () => {
  let html = "<html><body>Missing head</body></html>";
  const upstream = createServer((_req, res) => res.writeHead(200, { "Content-Type": "text/html" }).end(html));
  const previewPort = await listen(upstream);
  const { proxy, navigationDiagnostics } = createKeyboardPreviewProxy({ role: "teacher", previewPort });
  const base = `http://127.0.0.1:${await listen(proxy)}`;
  try {
    const missing = await fetch(base + fixture);
    assert.equal(missing.status, 502); assert.doesNotMatch(await missing.text(), /<script/);
    html = "<html><head></head><body>" + "x".repeat(MAX_DIAGNOSTIC_HTML_BYTES) + "</body></html>";
    const oversized = await fetch(base + fixture);
    assert.equal(oversized.status, 502); assert.doesNotMatch(await oversized.text(), /<script/);
    assert.equal(navigationDiagnostics.htmlFailures, 2);
    assert.equal(navigationDiagnostics.injectedDocuments, 0);
  } finally { await close(proxy); await close(upstream); }
});

test("evidence storage has a hard event cap", async () => {
  const { proxy, navigationDiagnostics } = createKeyboardPreviewProxy({ role: "teacher", previewPort: 1 });
  const base = `http://127.0.0.1:${await listen(proxy)}`;
  try {
    for (let seq = 1; seq <= MAX_NAVIGATION_EVENTS; seq++) assert.equal((await fetch(base + NAVIGATION_EVENT_PATH + query(validEvent(seq)))).status, 204);
    assert.equal((await fetch(base + NAVIGATION_EVENT_PATH + query(validEvent(129)))).status, 400);
    assert.equal(navigationDiagnostics.events.length, MAX_NAVIGATION_EVENTS);
  } finally { await close(proxy); }
});

test("injected observer records final event cancellation and hash/collapse without reading input values", () => {
  const emitted: Array<{ event: string; phase: string; defaultPrevented: boolean; hash: string; collapsed: string; noteVisible: boolean }> = [];
  const documentListeners = new Map<string, () => void>(), timers: Array<() => void> = [], frames: Array<() => void> = [];
  let observer: () => void = () => { throw new Error("Observer was not installed"); };
  class Element {
    id: string;
    shortcut: boolean;
    hidden = false;
    collapsed = "true";
    constructor(id = "", shortcut = false) { this.id = id; this.shortcut = shortcut; }
    closest(selector: string) {
      if (selector === 'a[href="#teacher-daily-report"]') return this.shortcut ? this : null;
      if (selector === "#teacher-daily-report") return this.id === "teacher-daily-report" || this.id === "teacher-note-for-parents" ? this : null;
      if (selector === "[hidden]") return this.hidden ? this : null;
      return null;
    }
    getClientRects() { return [1]; }
    getAttribute(name: string) { assert.equal(name, "data-collapsed"); return this.collapsed; }
    get value() { throw new Error("Diagnostics must not read field values"); }
    get textContent() { throw new Error("Diagnostics must not read text"); }
  }
  type SyntheticEvent = { target?: Element; defaultPrevented?: boolean; cancelable?: boolean; isTrusted?: boolean; button?: number; pointerType?: string; clientX?: number; clientY?: number };
  const listeners = new Map<string, Array<{ callback: (event: SyntheticEvent) => void; capture: boolean }>>();
  const shortcut = new Element("", true), report = new Element("teacher-daily-report"), note = new Element("teacher-note-for-parents");
  report.collapsed = "true"; note.hidden = true;
  const document = { documentElement: { dataset: {} as Record<string, string> }, activeElement: shortcut,
    getElementById: (id: string) => id === report.id ? report : id === note.id ? note : null,
    addEventListener: (type: string, callback: () => void) => documentListeners.set(type, callback) };
  const location = { origin: "http://localhost:12345", pathname: "/device-preview", search: "?view=teacher&scenario=long-content", hash: "" };
  const context = { Element, document, location, performance: { now: () => 20 },
    window: { addEventListener: (type: string, callback: (event: SyntheticEvent) => void, options: { passive: boolean; capture?: boolean }) => { assert.equal(options.passive, true); const list = listeners.get(type) || []; list.push({ callback, capture: options.capture === true }); listeners.set(type, list); } },
    Image: class { onload?: () => void; onerror?: () => void; set src(value: string) { const url = new URL(value); assert.equal(url.origin, location.origin); assert.equal(url.pathname, NAVIGATION_EVENT_PATH); const parsed = parseNavigationDiagnostic(url.search); assert.ok(parsed); emitted.push(parsed); this.onerror?.(); } },
    MutationObserver: class { constructor(callback: () => void) { observer = callback; } observe() {} },
    setTimeout: (callback: () => void) => timers.push(callback), requestAnimationFrame: (callback: () => void) => frames.push(callback) };
  vm.runInNewContext(navigationDiagnosticsSource(12345, fixture), context);
  assert.equal(emitted[0].event, "boot");
  document.documentElement.dataset.devicePreviewHydrated = "true"; observer();
  const event = { target: shortcut, defaultPrevented: false, cancelable: true, isTrusted: true, button: 0, pointerType: "touch", clientX: 289, clientY: 399 };
  listeners.get("click")!.find(item => item.capture)!.callback(event);
  event.defaultPrevented = true;
  listeners.get("click")!.find(item => !item.capture)!.callback(event);
  location.hash = "#teacher-daily-report"; report.collapsed = "false"; note.hidden = false; observer();
  listeners.get("hashchange")![0].callback({});
  timers.shift()!(); frames.shift()!();
  const settled = emitted.find(item => item.phase === "after-dispatch");
  assert.ok(settled);
  assert.equal(settled.defaultPrevented, true);
  assert.equal(settled.hash, "report"); assert.equal(settled.collapsed, "false"); assert.equal(settled.noteVisible, true);
  assert.ok(emitted.every(Boolean), "Every browser record passes the strict receiver schema");
  assert.ok(emitted.some(item => item.event === "readiness"));
  assert.ok(emitted.some(item => item.event === "collapse"));
  assert.equal(listeners.get("click")!.length, 2);
  const count = emitted.length;
  for (const altered of [{ origin: "https://thebeesuite.io" }, { origin: "http://localhost:54321" }, { pathname: "/teacher-portal" }, { search: "?view=parent" }]) {
    vm.runInNewContext(navigationDiagnosticsSource(12345, fixture), { ...context, location: { ...location, ...altered } });
    assert.equal(emitted.length, count, "The observer is inert away from the exact loopback teacher fixture");
  }
});

test("forward allowlist and native assertions are not replaced by diagnostics", () => {
  for (const path of ["/api/messages", "/teacher-portal", "/billing"]) assert.equal(keyboardRequestAllowed("GET", path), false);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(keyboardRequestAllowed(method, fixture.split("?")[0]), false);
  const harness = readFileSync("scripts/verify-ios-keyboard.mjs", "utf8");
  assert.match(harness, /assert\.deepEqual\(blocked, \[\], "No unexpected API, write, or navigation attempts"\)/);
  assert.match(harness, /finally \{[\s\S]*keyboard-navigation\.json/);
  assert.throws(() => injectNavigationDiagnostics("<body>No head</body>"));
  assert.throws(() => navigationDiagnosticsSource(1, "/teacher-portal"));
});
