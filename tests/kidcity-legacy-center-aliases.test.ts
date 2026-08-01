import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KIDCITY_LEGACY_CENTER_ALIASES,
  normalizeKidCityCenterIdentifier,
  resolveKidCityLegacyLeadCenterId,
} from "../src/lib/kidcity-legacy-center-aliases";

test("legacy Kid City aliases are unique, explicit, and never self-referential", () => {
  const sources = KIDCITY_LEGACY_CENTER_ALIASES.map((alias) =>
    normalizeKidCityCenterIdentifier(alias.sourceCrmLocationId),
  );

  assert.equal(new Set(sources).size, sources.length);
  for (const alias of KIDCITY_LEGACY_CENTER_ALIASES) {
    assert.notEqual(alias.sourceCrmLocationId, alias.targetCrmLocationId);
    assert.ok(alias.evidence.length > 20);
  }
});

test("legacy lead locations resolve to a proven canonical school", () => {
  const centers = new Map([
    ["FL | Altamonte - Douglas", "center-douglas"],
    ["Kid City USA - Altamonte - Douglas", "center-douglas"],
    ["FL | Macclenny", "center-macclenny"],
  ]);

  assert.equal(
    resolveKidCityLegacyLeadCenterId(centers, "FL | Altamonte Springs 1 - Douglas Ave"),
    "center-douglas",
  );
  assert.equal(
    resolveKidCityLegacyLeadCenterId(centers, " fl   |   macclenny "),
    "center-macclenny",
  );
});

test("ambiguous or obsolete legacy queues are not guessed", () => {
  const centers = new Map([
    ["FL | Jacksonville - Beach", "center-beach"],
    ["FL | Jacksonville - Oakleaf", "center-oakleaf"],
    ["IN | Jasper - Baden Strasse", "center-baden"],
    ["IN | Jasper - Truman", "center-truman"],
  ]);

  assert.equal(resolveKidCityLegacyLeadCenterId(centers, "FL | Jacksonville"), undefined);
  assert.equal(resolveKidCityLegacyLeadCenterId(centers, "IN | Jasper"), undefined);
  assert.equal(resolveKidCityLegacyLeadCenterId(centers, "NV | Las Vegas 1 - Page"), undefined);
});

test("normalized matches fail closed when the same alias points to multiple centers", () => {
  const centers = new Map([
    ["FL | Macclenny", "center-a"],
    [" fl | macclenny ", "center-b"],
  ]);

  assert.equal(resolveKidCityLegacyLeadCenterId(centers, "FL | MACCLENNY"), undefined);
});
