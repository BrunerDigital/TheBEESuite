import assert from "node:assert/strict";

// Reserved GET resources terminate in the isolated proxy; neither reaches Next.
export const NAVIGATION_SCRIPT_PATH = "/_next/bee-keyboard-navigation.js";
export const NAVIGATION_EVENT_PATH = "/_next/bee-keyboard-navigation-event";
export const MAX_NAVIGATION_EVENTS = 128;
export const MAX_NAVIGATION_EVENT_LENGTH = 2048;
export const MAX_DIAGNOSTIC_HTML_BYTES = 2 * 1024 * 1024;

const choices = {
  event: ["boot", "domready", "pointerdown", "pointerup", "touchstart", "touchend", "click", "hashchange", "popstate", "pagehide", "readiness", "collapse", "error", "unhandledrejection"],
  phase: ["observe", "capture", "bubble", "after-dispatch", "animation-frame"],
  hash: ["none", "report", "quick-log", "home", "other"],
  collapsed: ["true", "false", "missing"],
  target: ["shortcut", "report", "note", "other", "none"],
  active: ["shortcut", "report", "note", "other", "none"],
  pointerType: ["mouse", "touch", "pen", "none", "other"],
};
const booleans = ["ready", "pathMatches", "noteExists", "noteVisible", "defaultPrevented", "cancelable", "trusted"];
const fields = [...Object.keys(choices), ...booleans, "seq", "timeMs", "button", "x", "y"].sort();

/** Reject arbitrary strings, URLs, field values, excess fields and oversized input. */
export function parseNavigationDiagnostic(search) {
  if (typeof search !== "string" || search.length > MAX_NAVIGATION_EVENT_LENGTH * 3) return null;
  const params = new URLSearchParams(search);
  if ([...params.keys()].join(",") !== "e") return null;
  const raw = params.get("e");
  if (!raw || raw.length > MAX_NAVIGATION_EVENT_LENGTH) return null;
  let event;
  try { event = JSON.parse(raw); } catch { return null; }
  if (!event || typeof event !== "object" || Array.isArray(event)
    || Object.keys(event).sort().join(",") !== fields.join(",")) return null;
  if (Object.entries(choices).some(([key, values]) => !values.includes(event[key]))) return null;
  if (booleans.some(key => typeof event[key] !== "boolean")) return null;
  if (!Number.isInteger(event.seq) || event.seq < 1 || event.seq > MAX_NAVIGATION_EVENTS) return null;
  if (!Number.isInteger(event.timeMs) || event.timeMs < 0 || event.timeMs > 15 * 60 * 1000) return null;
  if (![-1, 0, 1, 2].includes(event.button)) return null;
  if ([event.x, event.y].some(value => !Number.isInteger(value) || value < -1 || value > 8192)) return null;
  return event;
}

export function injectNavigationDiagnostics(html) {
  assert.equal(typeof html, "string");
  const head = /<head(?:\s[^>]*)?>/i;
  assert.ok(head.test(html), "Synthetic HTML must have a head for navigation diagnostics");
  return html.replace(head, match => `${match}<script src="${NAVIGATION_SCRIPT_PATH}"></script>`);
}

export function navigationDiagnosticsSource(port, fixturePath) {
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
  assert.equal(fixturePath, "/device-preview?view=teacher&scenario=long-content");
  return `(${installNavigationDiagnosticsSource})(${JSON.stringify({
    origin: `http://localhost:${port}`, fixturePath, eventPath: NAVIGATION_EVENT_PATH, limit: MAX_NAVIGATION_EVENTS,
  })});\n`;
}

// Fixed browser source for the disposable fixture, never imported by application code.
// Keep it literal: tsx/esbuild can add module-local helpers to Function.toString().
// It observes only event metadata and fixed synthetic element identities. It does
// not dispatch events, change focus/hash/attributes, cancel events, or read values.
const installNavigationDiagnosticsSource = String.raw`function installNavigationDiagnostics(config) {
  if (location.origin !== config.origin || location.pathname + location.search !== config.fixturePath) return;
  const started = performance.now();
  const pending = new Set();
  let seq = 0;
  const identify = node => {
    if (!(node instanceof Element)) return "none";
    if (node.id === "teacher-note-for-parents") return "note";
    if (node.closest('a[href="#teacher-daily-report"]')) return "shortcut";
    if (node.closest("#teacher-daily-report")) return "report";
    return "other";
  };
  const hashName = () => ({ "": "none", "#teacher-daily-report": "report", "#teacher-quick-log": "quick-log", "#teacher-home-heading": "home" })[location.hash] || "other";
  const ready = () => document.documentElement.dataset.devicePreviewHydrated === "true";
  const collapsed = () => {
    const value = document.getElementById("teacher-daily-report")?.getAttribute("data-collapsed");
    return value === "true" || value === "false" ? value : "missing";
  };
  const coordinate = value => Number.isFinite(value) && value >= 0 && value <= 8192 ? Math.round(value) : -1;
  function record(event, phase = "observe", source) {
    if (seq >= config.limit) return;
    const note = document.getElementById("teacher-note-for-parents");
    const point = source?.changedTouches?.[0] || source;
    const data = {
      seq: ++seq, timeMs: Math.min(900000, Math.max(0, Math.round(performance.now() - started))), event, phase,
      ready: ready(), pathMatches: location.pathname + location.search === config.fixturePath,
      hash: hashName(), collapsed: collapsed(), noteExists: Boolean(note),
      noteVisible: Boolean(note && !note.closest("[hidden]") && note.getClientRects().length),
      defaultPrevented: source?.defaultPrevented === true, cancelable: source?.cancelable === true, trusted: source?.isTrusted === true,
      target: identify(source?.target), active: identify(document.activeElement),
      button: [0, 1, 2].includes(source?.button) ? source.button : -1,
      pointerType: !source?.pointerType ? "none" : ["mouse", "touch", "pen"].includes(source.pointerType) ? source.pointerType : "other",
      x: coordinate(point?.clientX), y: coordinate(point?.clientY),
    };
    // A non-rendered image emits a bounded local GET even after the preview's
    // fetch guard is installed. The exact endpoint is consumed by the proxy.
    const image = new Image();
    pending.add(image);
    image.onload = image.onerror = () => pending.delete(image);
    image.src = config.origin + config.eventPath + "?e=" + encodeURIComponent(JSON.stringify(data));
  }
  for (const type of ["pointerdown", "pointerup", "touchstart", "touchend", "click"]) {
    window.addEventListener(type, event => {
      record(type, "capture", event);
      if (type === "click") {
        // A timer runs after dispatch/default action; a microtask alone may run
        // between native event callbacks and miss later preventDefault calls.
        setTimeout(() => {
          record(type, "after-dispatch", event);
          requestAnimationFrame(() => record(type, "animation-frame", event));
        }, 0);
      }
    }, { capture: true, passive: true });
    window.addEventListener(type, event => record(type, "bubble", event), { passive: true });
  }
  for (const type of ["hashchange", "popstate", "pagehide", "error", "unhandledrejection"]) {
    window.addEventListener(type, event => record(type, "observe", event), { passive: true });
  }
  document.addEventListener("DOMContentLoaded", () => record("domready"), { once: true });
  let lastReady = ready(), lastCollapsed = collapsed();
  new MutationObserver(() => {
    const nextReady = ready(), nextCollapsed = collapsed();
    if (nextReady !== lastReady) { lastReady = nextReady; record("readiness"); }
    if (nextCollapsed !== lastCollapsed) { lastCollapsed = nextCollapsed; record("collapse"); }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-device-preview-hydrated", "data-collapsed"] });
  record("boot");
}`;
