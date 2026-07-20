import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { requiresPasswordResetGate } from "@/lib/auth";
import {
  PARENT_SETUP_LINK_TTL_MS,
  parentSetupTokenFingerprint,
  parentSetupTokenUsable,
} from "@/lib/parent-portal-setup-links";

const now = new Date("2026-07-20T20:00:00.000Z");

test("parent setup tokens use a stable non-plaintext fingerprint", () => {
  const token = "supabase-hashed-token-value";
  const fingerprint = parentSetupTokenFingerprint(token);
  assert.equal(fingerprint.length, 64);
  assert.notEqual(fingerprint, token);
  assert.equal(parentSetupTokenFingerprint(token), fingerprint);
  assert.notEqual(parentSetupTokenFingerprint(`${token}-other`), fingerprint);
});

test("parent setup link lifetime defaults to one hour", () => {
  assert.equal(PARENT_SETUP_LINK_TTL_MS, 60 * 60 * 1000);
});

test("only unclaimed issued parent setup tokens before expiry are usable", () => {
  assert.deepEqual(parentSetupTokenUsable({ status: "issued", expiresAt: new Date(now.getTime() + 1) }, now), { ok: true });
  assert.deepEqual(parentSetupTokenUsable({ status: "issued", expiresAt: now }, now), { ok: false, reason: "expired" });
  assert.deepEqual(parentSetupTokenUsable({ status: "used", expiresAt: new Date(now.getTime() + 60_000), usedAt: now }, now), { ok: false, reason: "used" });
  assert.deepEqual(parentSetupTokenUsable({ status: "revoked", expiresAt: new Date(now.getTime() + 60_000), revokedAt: now }, now), { ok: false, reason: "revoked" });
  assert.deepEqual(parentSetupTokenUsable({ status: "claimed", expiresAt: new Date(now.getTime() + 60_000), claimedAt: now }, now), { ok: false, reason: "claimed" });
});

test("parents marked for credential transition cannot enter the portal before reset", () => {
  assert.equal(requiresPasswordResetGate({ mustResetPassword: true, role: UserRole.PARENT_GUARDIAN }), true);
  assert.equal(requiresPasswordResetGate({ mustResetPassword: false, role: UserRole.PARENT_GUARDIAN }), false);
});
