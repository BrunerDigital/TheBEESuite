import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { beeWebWorkspaceAliases } from "../src/lib/app-catalog";

const expectedLabels = {
  enrollment: ["The Honey Pot", "Enrollment"],
  growth: ["Hive Growth", "Campaigns & Automations"],
  operations: ["Hive Day", "School Operations"],
  billing: ["Honey Ledger", "Billing & Payments"],
  records: ["Honeycomb Records", "Records & Compliance"],
  insights: ["Hive Insights", "Insights & Reputation"],
  staff: ["Hive Team", "Staff & Access"],
} as const;

test("BEE web workspace aliases retain exact functional labels", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(beeWebWorkspaceAliases).map(([key, definition]) => [
        key,
        [definition.brandLabel, definition.functionalLabel],
      ]),
    ),
    expectedLabels,
  );

  const definitions = Object.values(beeWebWorkspaceAliases);
  assert.equal(
    new Set(definitions.map((definition) => definition.brandLabel)).size,
    definitions.length,
  );
  assert.ok(definitions.every((definition) => definition.brandLabel.trim().length > 0));
  assert.ok(definitions.every((definition) => definition.functionalLabel.trim().length > 0));
  assert.ok(definitions.every((definition) => definition.kind === "embedded-web-workspace"));
});

test("the alias catalog cannot define routing, access, native, PWA, or store behavior", () => {
  const forbiddenFields = [
    "href",
    "route",
    "moduleSlugs",
    "suiteName",
    "availability",
    "audience",
    "deviceLabel",
    "bundleId",
    "manifestPath",
    "appStoreName",
  ];

  for (const definition of Object.values(beeWebWorkspaceAliases)) {
    for (const field of forbiddenFields) {
      assert.equal(Object.hasOwn(definition, field), false, `${field} must stay outside the alias catalog`);
    }
  }
});

test("shared workspace navigation keeps functional labels primary and aliases secondary", () => {
  const source = readFileSync(
    new URL("../src/components/consolidated-workspace-nav.tsx", import.meta.url),
    "utf8",
  );

  for (const key of Object.keys(expectedLabels)) {
    assert.match(source, new RegExp(`brandAlias: beeWebWorkspaceAliases\\.${key}\\.brandLabel`));
    assert.match(source, new RegExp(`title: beeWebWorkspaceAliases\\.${key}\\.functionalLabel`));
  }

  assert.equal((source.match(/brandAlias: null/g) ?? []).length, 2);
  assert.match(source, /<span>\{config\.title\}<\/span>[\s\S]*\{config\.brandAlias \? \(/);
  assert.match(source, /aria-hidden="true"[\s\S]*\{config\.brandAlias\}/);
  assert.match(source, /aria-label=\{`\$\{config\.title\} views`\}/);
});
