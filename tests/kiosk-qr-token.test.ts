import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGuardianQrToken,
  hashGuardianPin,
  normalizeGuardianQrToken,
  parseGuardianQrToken,
  verifyGuardianQrToken,
} from "../src/lib/kiosk";
import {
  buildGuardianKioskCredential,
  kioskPathForCenter,
  summarizeGuardianKioskCredentials,
} from "../src/lib/kiosk-credentials";

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

test("guardian kiosk credential summary hides hashes and reports QR readiness", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalPinSecret = mutableEnv.PIN_HASH_SECRET;
  try {
    mutableEnv.PIN_HASH_SECRET = "test-pin-secret";
    const pinSetAt = new Date("2026-06-08T14:00:00.000Z");
    const readyCredential = buildGuardianKioskCredential({
      id: "guardian_ready",
      fullName: "Ready Guardian",
      checkInPinSetAt: pinSetAt,
      checkInPinHash: hashGuardianPin("guardian_ready", "1234"),
      family: {
        id: "family_1",
        name: "Ready Family",
        centerId: "center_1",
        centerName: "Kid City Test",
      },
    });
    const missingCredential = buildGuardianKioskCredential({
      id: "guardian_missing",
      fullName: "Missing Guardian",
      family: {
        id: "family_2",
        name: "Missing Family",
        centerId: "center_1",
      },
    });

    assert.equal(readyCredential.hasPin, true);
    assert.equal(Boolean(readyCredential.qrToken), true);
    assert.equal(readyCredential.pinSetAt, pinSetAt.toISOString());
    assert.equal(readyCredential.kioskPath, "/check-in/center_1");
    assert.equal(Object.hasOwn(readyCredential, "checkInPinHash"), false);
    assert.deepEqual(missingCredential, {
      guardianId: "guardian_missing",
      guardianName: "Missing Guardian",
      familyId: "family_2",
      familyName: "Missing Family",
      centerId: "center_1",
      centerName: null,
      hasPin: false,
      pinSetAt: null,
      qrToken: null,
      kioskPath: "/check-in/center_1",
    });
    assert.deepEqual(summarizeGuardianKioskCredentials([readyCredential, missingCredential]), {
      total: 2,
      pinReady: 1,
      qrReady: 1,
      missingPin: 1,
    });
    assert.equal(kioskPathForCenter(null), "/check-in");
  } finally {
    if (originalPinSecret === undefined) delete mutableEnv.PIN_HASH_SECRET;
    else mutableEnv.PIN_HASH_SECRET = originalPinSecret;
  }
});
