import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCenterAliasMap,
  centerAliasKeys,
  centerKey,
  resolveImportCenter,
} from "../src/lib/import-center-mapping";

const longmont = {
  id: "center-longmont",
  name: "Kid City USA - Longmont",
  crmLocationId: "CO | Longmont",
  locationId: "Kid City USA - Longmont",
  city: "Longmont",
  state: "CO",
};

test("center aliases include branded, CRM, and city-only Longmont variants", () => {
  assert.equal(centerKey("Kid City USA - Longmont"), "kid city usa longmont");
  assert.ok(centerAliasKeys(longmont).includes("kid city usa longmont"));
  assert.ok(centerAliasKeys(longmont).includes("co longmont"));
  assert.ok(centerAliasKeys(longmont).includes("longmont"));
});

test("Procare branded school names resolve to Bee Suite center records", () => {
  const centerByAlias = buildCenterAliasMap([longmont]);

  assert.equal(resolveImportCenter(centerByAlias, "Kid City USA Longmont")?.id, "center-longmont");
  assert.equal(resolveImportCenter(centerByAlias, "Kid City USA - Longmont")?.id, "center-longmont");
  assert.equal(resolveImportCenter(centerByAlias, "CO | Longmont")?.id, "center-longmont");
});

test("ambiguous city-only aliases are not auto-mapped", () => {
  const centerByAlias = buildCenterAliasMap([
    longmont,
    {
      id: "center-longmont-alt",
      name: "Longmont",
      crmLocationId: "CO | Longmont 2",
      locationId: "Longmont",
      city: "Longmont",
      state: "CO",
    },
  ]);

  assert.equal(resolveImportCenter(centerByAlias, "Longmont"), null);
  assert.equal(resolveImportCenter(centerByAlias, "CO | Longmont")?.id, "center-longmont");
});
