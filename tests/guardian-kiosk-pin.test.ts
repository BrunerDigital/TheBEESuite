import assert from "node:assert/strict";
import test from "node:test";
import { defaultGuardianPinFromPhone } from "../src/lib/guardian-kiosk-pin";

test("default guardian kiosk PIN uses the last four phone digits", () => {
  assert.equal(defaultGuardianPinFromPhone("(765) 555-1234"), "1234");
  assert.equal(defaultGuardianPinFromPhone("+1 317.867.5309"), "5309");
  assert.equal(defaultGuardianPinFromPhone("5550007"), "0007");
});

test("default guardian kiosk PIN is not created without four digits", () => {
  assert.equal(defaultGuardianPinFromPhone("123"), "");
  assert.equal(defaultGuardianPinFromPhone(""), "");
  assert.equal(defaultGuardianPinFromPhone(null), "");
});
