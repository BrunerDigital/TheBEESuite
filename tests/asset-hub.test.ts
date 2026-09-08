import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ASSET_HUB_MAX_BYTES, assetKind, buildAssetStorageKey, canManageAssetHub, canReadAssetHub, normalizeAssetCategory, readAssetMetadata, safeAssetFileName, validateAssetHubUpload } from "../src/lib/asset-hub";

test("asset hub restricts management while allowing directors to read", () => {
  assert.equal(canManageAssetHub("BRAND_ADMIN"), true);
  assert.equal(canManageAssetHub("CENTER_DIRECTOR"), false);
  assert.equal(canManageAssetHub("ASSISTANT_DIRECTOR"), false);
  assert.equal(canReadAssetHub("CENTER_DIRECTOR"), true);
  assert.equal(canReadAssetHub("ASSISTANT_DIRECTOR"), true);
  assert.equal(canReadAssetHub("TEACHER"), false);
});

test("asset paths remain tenant scoped and strip traversal", () => {
  assert.equal(safeAssetFileName("../../Summer Flyer?.pdf"), "Summer-Flyer.pdf");
  const path = buildAssetStorageKey("Kid City USA", "../social.png", new Date("2026-07-16T12:00:00Z"));
  assert.match(path, /^kid-city-usa\/2026\/07\/[0-9a-f-]+-social\.png$/);
});

test("asset upload validation enforces actual size and an extension-bound MIME allowlist", () => {
  assert.deepEqual(validateAssetHubUpload({ name: "guide.pdf", contentType: "application/pdf", size: 512 }), {
    ok: true,
    name: "guide.pdf",
    contentType: "application/pdf",
    size: 512,
  });
  assert.equal(validateAssetHubUpload({ name: "payload.html", contentType: "text/html", size: 512 }).ok, false);
  assert.equal(validateAssetHubUpload({ name: "logo.svg", contentType: "image/svg+xml", size: 512 }).ok, false);
  assert.equal(validateAssetHubUpload({ name: "photo.png", contentType: "image/jpeg", size: 512 }).ok, false);
  assert.equal(validateAssetHubUpload({ name: "video.mp4", contentType: "video/mp4", size: ASSET_HUB_MAX_BYTES + 1 }).ok, false);
});

test("signed uploads are rate limited and finalized from verified storage metadata", () => {
  const prepareRoute = readFileSync("src/app/api/asset-hub/upload-url/route.ts", "utf8");
  const finalizeRoute = readFileSync("src/app/api/asset-hub/finalize/route.ts", "utf8");
  assert.match(prepareRoute, /checkPersistentRateLimit/);
  assert.match(prepareRoute, /hasTrustedMutationOrigin\(request\)/);
  assert.match(finalizeRoute, /hasTrustedMutationOrigin\(request\)/);
  assert.match(prepareRoute, /asset-hub-upload:tenant:/);
  assert.match(prepareRoute, /uploadStatus"\], equals: "pending"/);
  assert.match(finalizeRoute, /getAssetHubObjectInfo/);
  assert.match(finalizeRoute, /actual\.size !== metadata\.size/);
  assert.match(finalizeRoute, /actual\.contentType !== metadata\.contentType/);
  assert.match(finalizeRoute, /deleteAssetHubObject/);
});

test("asset metadata and common file kinds normalize safely", () => {
  assert.equal(normalizeAssetCategory("photos"), "photos");
  assert.equal(normalizeAssetCategory("unknown"), "other");
  assert.equal(assetKind("video/mp4", "launch.mp4"), "video");
  assert.equal(assetKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "budget.xlsx"), "spreadsheet");
  assert.equal(readAssetMetadata({ originalName: "Guide.pdf", tags: ["training", 2] }).tags.join(","), "training");
});
