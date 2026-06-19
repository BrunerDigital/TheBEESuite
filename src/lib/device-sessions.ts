export type DeviceAppMode = "admin" | "kiosk" | "parent" | "teacher" | "web";
export type DeviceType = "desktop" | "phone" | "tablet" | "unknown";

const appModes = new Set<DeviceAppMode>(["admin", "kiosk", "parent", "teacher", "web"]);

export function cleanDeviceLabel(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export function cleanUserAgent(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

export function appModeFromPath(path: unknown): DeviceAppMode {
  if (typeof path !== "string") return "web";
  if (path.startsWith("/check-in") || path.startsWith("/kiosk")) return "kiosk";
  if (path.startsWith("/parent-portal")) return "parent";
  if (path.startsWith("/teacher-portal") || path.startsWith("/classroom-dashboard")) return "teacher";
  if (path.startsWith("/dashboard") || path.startsWith("/team-permissions") || path.startsWith("/school-setup")) return "admin";
  return "web";
}

export function normalizeDeviceAppMode(value: unknown, pathFallback?: unknown): DeviceAppMode {
  const requested = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (appModes.has(requested as DeviceAppMode)) return requested as DeviceAppMode;
  return appModeFromPath(pathFallback);
}

export function inferDeviceType(userAgent: unknown): DeviceType {
  const ua = cleanUserAgent(userAgent).toLowerCase();
  if (!ua) return "unknown";
  if (/\b(ipad|tablet|kindle|silk|playbook)\b/.test(ua)) return "tablet";
  if (ua.includes("android") && !ua.includes("mobile")) return "tablet";
  if (/\b(iphone|ipod|mobile|android|windows phone)\b/.test(ua)) return "phone";
  return "desktop";
}

export function inferDevicePlatform(userAgent: unknown) {
  const ua = cleanUserAgent(userAgent).toLowerCase();
  if (!ua) return "Unknown device";
  if (ua.includes("silk") || ua.includes("kindle")) return "Amazon Fire";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("android")) return "Android";
  if (ua.includes("mac os")) return "Mac";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("cros")) return "ChromeOS";
  return "Browser";
}

export function deviceAppModeLabel(mode: string) {
  switch (mode) {
    case "admin":
      return "Admin app";
    case "kiosk":
      return "Kiosk";
    case "parent":
      return "Parent app";
    case "teacher":
      return "Teacher app";
    default:
      return "Web app";
  }
}

export function buildDeviceSessionLabel(input: {
  appMode: DeviceAppMode;
  deviceType: DeviceType;
  userAgent?: string | null;
}) {
  const platform = inferDevicePlatform(input.userAgent);
  const appLabel = deviceAppModeLabel(input.appMode);
  if (input.deviceType === "unknown" && platform === "Unknown device") return appLabel;
  return `${appLabel} on ${platform}`;
}

export function isRecentDeviceSession(lastSeenAt: Date, now = new Date()) {
  return now.getTime() - lastSeenAt.getTime() <= 15 * 60 * 1000;
}
