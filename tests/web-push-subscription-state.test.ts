import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { isCurrentPushSubscriptionActive } from "@/lib/web-push-subscription-state";

test("another active device cannot conceal this device's rejected subscription", async () => {
  const endpoint = "https://push.example.invalid/synthetic-device";
  const endpointHash = createHash("sha256").update(endpoint).digest("hex");
  assert.equal(await isCurrentPushSubscriptionActive(endpoint, [{ endpointHash: "other", isActive: true }, { endpointHash, isActive: false }]), false);
  assert.equal(await isCurrentPushSubscriptionActive(endpoint, [{ endpointHash, isActive: true }]), true);
  assert.equal(await isCurrentPushSubscriptionActive(endpoint, []), false);
  assert.equal(await isCurrentPushSubscriptionActive(endpoint, undefined), false);
});
