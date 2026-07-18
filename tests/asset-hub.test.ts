import assert from "node:assert/strict";
import test from "node:test";
import { assetKind, buildAssetStorageKey, canManageAssetHub, canReadAssetHub, normalizeAssetCategory, readAssetMetadata, safeAssetFileName } from "../src/lib/asset-hub";

test("asset hub restricts management while allowing directors to read", () => {
  assert.equal(canManageAssetHub("BRAND_ADMIN"), true);
  assert.equal(canManageAssetHub("CENTER_DIRECTOR"), false);
  assert.equal(canReadAssetHub("CENTER_DIRECTOR"), true);
  assert.equal(canReadAssetHub("TEACHER"), false);
});

test("asset paths remain tenant scoped and strip traversal", () => {
  assert.equal(safeAssetFileName("../../Summer Flyer?.pdf"), "..-..-Summer-Flyer.pdf");
  const path = buildAssetStorageKey("Kid City USA", "../social.png", new Date("2026-07-16T12:00:00Z"));
  assert.match(path, /^kid-city-usa\/2026\/07\/[0-9a-f-]+-..-social\.png$/);
});

test("asset metadata and common file kinds normalize safely", () => {
  assert.equal(normalizeAssetCategory("photos"), "photos");
  assert.equal(normalizeAssetCategory("unknown"), "other");
  assert.equal(assetKind("video/mp4", "launch.mp4"), "video");
  assert.equal(assetKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "budget.xlsx"), "spreadsheet");
  assert.equal(readAssetMetadata({ originalName: "Guide.pdf", tags: ["training", 2] }).tags.join(","), "training");
});
