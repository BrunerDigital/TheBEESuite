import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOnboardingLocationRoster } from "../src/lib/onboarding-location-roster";

test("location roster parses spreadsheet rows with an explicit header", () => {
  const result = parseOnboardingLocationRoster([
    "School Name\tAddress\tCity\tState\tZIP\tPhone\tEmail\tLicensed Capacity",
    "Downtown\t100 Main St\tOrlando\tFL\t32801\t407-555-0100\tdirector@example.com\t120",
    "Lakeside\t200 Lake Ave\tOrlando\tFL\t32802\t407-555-0200\tlake@example.com\t80",
  ].join("\n"));

  assert.deepEqual(result.errors, []);
  assert.equal(result.locations.length, 2);
  assert.deepEqual(result.locations[0], {
    name: "Downtown",
    address: "100 Main St",
    city: "Orlando",
    state: "FL",
    postalCode: "32801",
    phone: "407-555-0100",
    email: "director@example.com",
    licensedCapacity: 120,
    dataSetupPath: null,
    dataSourceSystem: null,
  });
});

test("location roster supports headerless pipe rows and applies business defaults", () => {
  const result = parseOnboardingLocationRoster(
    "Downtown | 100 Main St | Orlando | | 32801 | | | 120",
    { state: "Florida", email: "owner@example.com", dataSetupPath: "start_clean" },
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.locations[0].state, "Florida");
  assert.equal(result.locations[0].email, "owner@example.com");
  assert.equal(result.locations[0].dataSetupPath, "start_clean");
});

test("location roster reports incomplete business records before workspace creation", () => {
  const result = parseOnboardingLocationRoster("School | Address | City | State | ZIP | Email\nDowntown | | Orlando | FL | | invalid");
  assert.ok(result.errors.some((error) => /street address/i.test(error)));
  assert.ok(result.errors.some((error) => /postal code/i.test(error)));
  assert.ok(result.errors.some((error) => /valid school email/i.test(error)));
});

test("location roster rejects capacities that cannot be stored safely", () => {
  const result = parseOnboardingLocationRoster(
    "School Name|Address|City|State|ZIP|Email|Licensed Capacity\nDowntown|100 Main St|Orlando|FL|32801|owner@example.com|10001",
  );

  assert.equal(result.locations[0].licensedCapacity, 0);
  assert.ok(result.errors.some((error) => /no greater than 10,000/i.test(error)));
});

test("location roster rejects every school beyond the 100-location intake limit", () => {
  const rows = Array.from({ length: 101 }, (_, index) => (
    `School ${index + 1}|${index + 1} Main St|Orlando|FL|32801||owner@example.com|100`
  ));
  const result = parseOnboardingLocationRoster(rows.join("\n"));

  assert.equal(result.locations.length, 100);
  assert.ok(result.errors.some((error) => /limited to 100 schools/i.test(error)));
});

test("location roster accepts exactly 100 schools plus a header row", () => {
  const rows = [
    "School Name|Address|City|State|ZIP|Email|Licensed Capacity",
    ...Array.from({ length: 100 }, (_, index) => (
      `School ${index + 1}|${index + 1} Main St|Orlando|FL|32801|owner@example.com|100`
    )),
  ];
  const result = parseOnboardingLocationRoster(rows.join("\n"));

  assert.equal(result.locations.length, 100);
  assert.deepEqual(result.errors, []);
});
