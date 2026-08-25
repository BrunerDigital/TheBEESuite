import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PROCARE_SOURCE_FILES,
  MAX_PROCARE_SOURCE_BYTES,
  MAX_PROCARE_MULTIPART_BYTES,
  procareMultipartSizeBytes,
  procareSourceFitsBrowserUpload,
  procareSourceSizeBytes,
  procareTextSizeBytes,
} from "@/lib/procare-upload-limits";

test("ProCare browser packages reserve metadata and multipart headroom below the hosting request limit", () => {
  assert.equal(MAX_PROCARE_SOURCE_BYTES, Math.floor(3.5 * 1024 * 1024));
  assert.equal(MAX_PROCARE_MULTIPART_BYTES, 4 * 1024 * 1024);
  assert.ok(MAX_PROCARE_SOURCE_BYTES < MAX_PROCARE_MULTIPART_BYTES);
  assert.ok(MAX_PROCARE_MULTIPART_BYTES < 4.5 * 1024 * 1024);
  assert.equal(MAX_PROCARE_SOURCE_FILES, 500);
});

test("ProCare source sizing blocks oversized packages before upload", () => {
  const exact = [{ size: 2 * 1024 * 1024 }, { size: Math.floor(1.5 * 1024 * 1024) }];
  assert.equal(procareSourceSizeBytes(exact), MAX_PROCARE_SOURCE_BYTES);
  assert.equal(procareSourceFitsBrowserUpload(exact), true);
  assert.equal(procareSourceFitsBrowserUpload([...exact, { size: 1 }]), false);
  assert.equal(procareSourceFitsBrowserUpload(Array.from({ length: 501 }, () => ({ size: 0 }))), false);
});

test("ProCare pasted-source sizing uses UTF-8 bytes", () => {
  assert.equal(procareTextSizeBytes("abc"), 3);
  assert.equal(procareTextSizeBytes("🐝"), 4);
});

test("ProCare commit sizing includes variable review metadata in the multipart body", async () => {
  const formData = new FormData();
  formData.set("csv", "a,b\n1,2");
  formData.set("reviewWarningRowNumbers", Array.from({ length: 20_000 }, (_, index) => index + 1).join(","));
  const bytes = await procareMultipartSizeBytes(formData);
  assert.ok(bytes > formData.get("reviewWarningRowNumbers")!.toString().length);
  assert.ok(bytes < MAX_PROCARE_MULTIPART_BYTES);
});
