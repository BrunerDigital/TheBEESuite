export const QA_RECOMMENDED_THRESHOLDS = {
  http: {
    publicPage: { p95Ms: 1_000, p99Ms: 2_000, errorRatePercent: 1 },
    healthApi: { p95Ms: 300, p99Ms: 750, errorRatePercent: 0.1 },
    publicApi: { p95Ms: 500, p99Ms: 1_000, errorRatePercent: 0.5 },
  },
  browser: {
    routeReadyMs: 3_000,
    horizontalOverflowPx: 0,
    clippedInteractiveElements: 0,
    relevantConsoleErrors: 0,
  },
  recovery: {
    offlineQueueLimit: 50,
    visibleFailureFeedbackMs: 1_000,
    duplicateCommittedWrites: 0,
    lostQueuedActions: 0,
  },
} as const;

export const QA_TARGET_VIEWPORTS = [
  { id: "desktop-1440", width: 1440, height: 1000, purpose: "Director, billing, and corporate desktop" },
  { id: "laptop-1280", width: 1280, height: 800, purpose: "Common school-office laptop" },
  { id: "tablet-landscape-1024", width: 1024, height: 768, purpose: "Classroom and kiosk tablet landscape" },
  { id: "tablet-portrait-768", width: 768, height: 1024, purpose: "Classroom and kiosk tablet portrait" },
  { id: "phone-430", width: 430, height: 932, purpose: "Large iPhone parent workflow" },
  { id: "phone-390", width: 390, height: 844, purpose: "Baseline iPhone/Android parent workflow" },
  { id: "phone-360", width: 360, height: 800, purpose: "Small supported Android fallback" },
] as const;

export const QA_SYNTHETIC_SCENARIOS = [
  { id: "public-home", path: "/", threshold: "publicPage" },
  { id: "public-login", path: "/login", threshold: "publicPage" },
  { id: "health", path: "/api/health", threshold: "healthApi" },
  { id: "public-locations", path: "/api/public/kidcity-locations", threshold: "publicApi" },
] as const;

export function assertNonProductionBaseUrl(value: string) {
  const url = new URL(value);
  const allowed = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!allowed.has(url.hostname) && !url.hostname.endsWith(".test") && !url.hostname.includes("staging") && !url.hostname.includes("preview")) {
    throw new Error(`QA load and responsive tests refuse production-like host: ${url.hostname}`);
  }
  return url.toString().replace(/\/$/, "");
}

export function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

