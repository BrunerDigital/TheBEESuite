import assert from "node:assert/strict";
import test from "node:test";
import {
  guardianCommunicationOptions,
  guardianCommunicationPreferenceOrDefault,
  parseGuardianCommunicationPreference,
} from "../src/lib/guardian-communication";

test("guardian communication choices expose only supported delivery preferences", () => {
  assert.deepEqual(guardianCommunicationOptions.map((option) => option.value), ["email", "phone", "sms"]);
  assert.equal(parseGuardianCommunicationPreference(" Email "), "email");
  assert.equal(parseGuardianCommunicationPreference("Phone call"), "phone");
  assert.equal(parseGuardianCommunicationPreference("text message"), "sms");
  assert.equal(parseGuardianCommunicationPreference("portal"), null);
});

test("legacy display values normalize without rewriting stored data until an explicit save", () => {
  assert.equal(guardianCommunicationPreferenceOrDefault("Email + portal notification"), "email");
  assert.equal(guardianCommunicationPreferenceOrDefault("unexpected legacy value", "phone"), "phone");
});
