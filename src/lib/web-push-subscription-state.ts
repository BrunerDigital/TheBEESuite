export async function isCurrentPushSubscriptionActive(
  endpoint: string,
  subscriptions: ReadonlyArray<{ endpointHash: string; isActive: boolean }> | undefined,
) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  const endpointHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return subscriptions?.some((item) => item.endpointHash === endpointHash && item.isActive) ?? false;
}
