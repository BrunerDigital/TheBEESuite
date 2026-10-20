import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { canonicalSchoolLocationId, locationAliasesFromCustomFields } from "../src/lib/school-location-identifiers";
import { isLeesSummitInquiryIdentifier, leesSummitInquiryRestoration as binding } from "../src/lib/public-inquiry-restoration";

type Location = { crmLocationId: string; locationId: string; name: string; address?: string };
type Center = { id: string; status: string; crmLocationId: string; locationId: string; address?: string; customFields: object };

// Execute the actual script main with memory-only storage; never construct a real
// Prisma client, load environment files, connect to a database or run a live sync.
async function runSync(locations: Location[], centers: Center[] = [], customFile = false) {
  const effects = { lookups: 0, updates: [] as string[], creates: [] as string[], inputPath: "" };
  const prisma = { center: {
    findMany: async ({ where }: { where: { OR: Record<string, string>[] } }) => {
      effects.lookups++;
      return centers.filter((center) => where.OR.some((clause) => Object.entries(clause).some(([field, value]) => center[field as keyof Center] === value)));
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Center> }) => {
      effects.updates.push(where.id);
      Object.assign(centers.find((center) => center.id === where.id)!, data);
    },
    create: async ({ data }: { data: { crmLocationId: string } }) => { effects.creates.push(data.crmLocationId); },
  } };
  const original = readFileSync("scripts/sync-kidcity-open-schools.ts", "utf8");
  const declarations = original.slice(0, original.lastIndexOf("\nmain()"))
    .replace(/^import[\s\S]*?;\r?\n/gm, "");
  const dependencies = {
    PrismaClient: class { constructor() { return prisma; } },
    readFileSync: (file: string) => { effects.inputPath = file; return JSON.stringify({ locations }); },
    join, canonicalSchoolLocationId, locationAliasesFromCustomFields,
    isLeesSummitInquiryIdentifier, leesSummitInquiryRestoration: binding,
    process: { env: { KIDCITY_ORGANIZATION_ID: "synthetic_org", ...(customFile ? { KIDCITY_OPEN_SCHOOLS_FILE: "/synthetic/custom.json" } : {}) }, cwd: () => "/synthetic" },
    console: { log: () => undefined },
  };
  const main = Function(...Object.keys(dependencies), stripTypeScriptTypes(declarations, { mode: "transform" }) + "\nreturn main;")(...Object.values(dependencies));
  await main();
  return effects;
}

const closedLee = (): Center => ({ id: binding.centerId, status: "closed", crmLocationId: binding.publicLocationId,
  locationId: binding.publicLocationId, address: "850 NE Swann Rd", customFields: {} });

test("default public fallback cannot reopen or recreate inquiry-only Lee during open-school sync", async () => {
  const locations: Location[] = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")).locations;
  assert.ok(locations.some((location) => location.crmLocationId === binding.publicLocationId));
  const lee = closedLee();
  const effects = await runSync(locations, [lee]);
  assert.equal(effects.inputPath, "/synthetic/public/kidcity-locations.json");
  assert.equal(lee.status, "closed");
  assert.deepEqual(effects.updates, []);
  assert.equal(effects.creates.includes(binding.publicLocationId), false);
  assert.equal(effects.lookups, locations.length - 1);
  assert.equal(effects.creates.length, locations.length - 1, "Other schools retain existing synchronization behavior");
});

test("each recognized identifier holds Lee before lookups, including custom input files", async () => {
  const other = "Kid City USA - MO | Synthetic Other";
  for (const location of [
    { crmLocationId: binding.publicLocationId, locationId: other, name: "Synthetic" },
    { crmLocationId: other, locationId: "MO | Lees Summit", name: "Synthetic" },
    { crmLocationId: other, locationId: other, name: binding.name },
  ]) {
    const effects = await runSync([location], [], true);
    assert.equal(effects.inputPath, "/synthetic/custom.json");
    assert.equal(effects.lookups, 0);
    assert.deepEqual(effects.creates, []);
    assert.deepEqual(effects.updates, []);
  }
});

test("persisted Lee identity stays closed when legacy source matches it only through address", async () => {
  const lee = closedLee();
  const effects = await runSync([{ crmLocationId: "Kid City USA - MO | Synthetic Legacy",
    locationId: "Kid City USA - MO | Synthetic Legacy", name: "Synthetic legacy name", address: lee.address }], [lee]);
  assert.equal(effects.lookups, 1);
  assert.equal(lee.status, "closed");
  assert.deepEqual(effects.updates, []);
  assert.deepEqual(effects.creates, []);
});

test("unrelated school sync continues updating its matched record", async () => {
  const id = "Kid City USA - FL | Vero Beach";
  const other: Center = { id: "synthetic_other", status: "active", crmLocationId: id, locationId: id, customFields: {} };
  const effects = await runSync([{ crmLocationId: id, locationId: id, name: "Kid City USA - Vero Beach" }], [other]);
  assert.deepEqual(effects.updates, ["synthetic_other"]);
  assert.deepEqual(effects.creates, []);
  assert.equal(other.status, "active");
});
