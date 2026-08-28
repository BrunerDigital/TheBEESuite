const CLIENT_LOAD_RECOVERY_KEY = "bee-suite-client-load-recovery-at";
const CLIENT_LOAD_RECOVERY_WINDOW_MS = 60_000;

export function isRecoverableClientLoadFailure(error: Error) {
  const assetLoadFailure = error.name === "ChunkLoadError"
    || /failed to load chunk|loading chunk .* failed/i.test(error.message);
  const parentNetworkFailure = window.location.pathname.startsWith("/parent-portal")
    && /load failed|network error|failed to fetch/i.test(error.message);
  return assetLoadFailure || parentNetworkFailure;
}

export async function recoverClientAssetsAndReload() {
  try {
    const lastRecoveryAt = Number(window.sessionStorage.getItem(CLIENT_LOAD_RECOVERY_KEY) || "0");
    if (Date.now() - lastRecoveryAt < CLIENT_LOAD_RECOVERY_WINDOW_MS) return false;
    window.sessionStorage.setItem(CLIENT_LOAD_RECOVERY_KEY, String(Date.now()));
  } catch {
    return false;
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
      await Promise.all(registrations.map((registration) => registration.update().catch(() => undefined)));
    }
    if ("caches" in window) {
      const keys = await window.caches.keys().catch(() => []);
      await Promise.all(keys
        .filter((key) => key.startsWith("bee-suite-"))
        .map((key) => window.caches.delete(key).catch(() => false)));
    }
  } finally {
    window.location.reload();
  }
  return true;
}
