import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGuardianQrToken,
  hashGuardianPin,
  normalizeGuardianQrToken,
  parseGuardianQrToken,
  verifyGuardianQrToken,
} from "../src/lib/kiosk";

test("guardian QR token verifies only the current center and PIN state", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalPinSecret = mutableEnv.PIN_HASH_SECRET;
  try {
    mutableEnv.PIN_HASH_SECRET = "test-pin-secret";
    const pinSetAt = new Date("2026-06-04T12:00:00.000Z");
    const checkInPinHash = hashGuardianPin("guardian_1", "1234");
    const token = createGuardianQrToken({
      centerId: "center_1",
      guardianId: "guardian_1",
      checkInPinSetAt: pinSetAt,
      checkInPinHash,
    });

    assert.ok(token);
    assert.equal(normalizeGuardianQrToken(`https://example.test/check-in?qrToken=${encodeURIComponent(token)}`), token);
    assert.deepEqual(parseGuardianQrToken(token), {
      centerId: "center_1",
      guardianId: "guardian_1",
      pinSetAtMs: pinSetAt.getTime(),
      payloadPart: token.split(".")[1],
      signature: token.split(".")[2],
    });
    assert.equal(verifyGuardianQrToken({
      token,
      centerId: "center_1",
      guardianId: "guardian_1",
      checkInPinSetAt: pinSetAt,
      checkInPinHash,
    }), true);
    assert.equal(verifyGuardianQrToken({
      token,
      centerId: "center_2",
      guardianId: "guardian_1",
      checkInPinSetAt: pinSetAt,
      checkInPinHash,
    }), false);
    assert.equal(verifyGuardianQrToken({
      token,
      centerId: "center_1",
      guardianId: "guardian_1",
      checkInPinSetAt: new Date("2026-06-04T12:01:00.000Z"),
      checkInPinHash,
    }), false);
    assert.equal(verifyGuardianQrToken({
      token,
      centerId: "center_1",
      guardianId: "guardian_1",
      checkInPinSetAt: pinSetAt,
      checkInPinHash: hashGuardianPin("guardian_1", "4321"),
    }), false);
  } finally {
    if (originalPinSecret === undefined) delete mutableEnv.PIN_HASH_SECRET;
    else mutableEnv.PIN_HASH_SECRET = originalPinSecret;
  }
});
