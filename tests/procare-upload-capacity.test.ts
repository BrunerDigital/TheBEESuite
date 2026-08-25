import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PROCARE_SOURCE_FILES,
  MAX_PROCARE_UPLOAD_BYTES,
  procareSourceFitsBrowserUpload,
  procareSourceSizeBytes,
} from "@/lib/procare-upload-limits";

test("ProCare browser packages retain multipart headroom below the hosting request limit", () => {
  assert.equal(MAX_PROCARE_UPLOAD_BYTES, 4 * 1024 * 1024);
  assert.ok(MAX_PROCARE_UPLOAD_BYTES < 4.5 * 1024 * 1024);
  assert.equal(MAX_PROCARE_SOURCE_FILES, 500);
});

test("ProCare source sizing blocks oversized packages before upload", () => {
  const exact = [{ size: 2 * 1024 * 1024 }, { size: 2 * 1024 * 1024 }];
  assert.equal(procareSourceSizeBytes(exact), MAX_PROCARE_UPLOAD_BYTES);
  assert.equal(procareSourceFitsBrowserUpload(exact), true);
  assert.equal(procareSourceFitsBrowserUpload([...exact, { size: 1 }]), false);
  assert.equal(procareSourceFitsBrowserUpload(Array.from({ length: 501 }, () => ({ size: 0 }))), false);
});
