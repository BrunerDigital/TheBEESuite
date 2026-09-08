import assert from "node:assert/strict";
import test from "node:test";
import {
  CHILD_MEDIA_BUCKET,
  DOCUMENT_BUCKET,
  validateStoredUpload,
} from "../src/lib/supabase-storage";

const imageTypes = ["image/jpeg", "image/png", "image/webp"] as const;

test("document storage defaults away from the image-only media bucket", () => {
  if (!process.env.SUPABASE_DOCUMENT_BUCKET && !process.env.SUPABASE_ASSET_HUB_BUCKET) {
    assert.equal(DOCUMENT_BUCKET, "corporate-assets");
    assert.notEqual(DOCUMENT_BUCKET, CHILD_MEDIA_BUCKET);
  }
});

test("stored upload validation binds image bytes, MIME type, and extension", () => {
  assert.doesNotThrow(() => validateStoredUpload({
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]),
    contentType: "image/jpeg",
    originalName: "classroom-photo.jpeg",
    allowedContentTypes: imageTypes,
    maxBytes: 100,
    sizeError: "too large",
    typeError: "wrong type",
  }));

  assert.throws(() => validateStoredUpload({
    bytes: Buffer.from("<svg><script>alert(1)</script></svg>"),
    contentType: "image/svg+xml",
    originalName: "photo.svg",
    allowedContentTypes: imageTypes,
    maxBytes: 100,
    sizeError: "too large",
    typeError: "wrong type",
  }), /wrong type/);

  assert.throws(() => validateStoredUpload({
    bytes: Buffer.from("not a png"),
    contentType: "image/png",
    originalName: "photo.png",
    allowedContentTypes: imageTypes,
    maxBytes: 100,
    sizeError: "too large",
    typeError: "wrong type",
  }), /contents do not match/);
});

test("stored upload validation rejects extension and MIME mismatches", () => {
  assert.throws(() => validateStoredUpload({
    bytes: Buffer.from("%PDF-1.7\n"),
    contentType: "application/pdf",
    originalName: "family-record.png",
    allowedContentTypes: ["application/pdf"],
    maxBytes: 100,
    sizeError: "too large",
    typeError: "wrong type",
  }), /contents do not match/);

  assert.doesNotThrow(() => validateStoredUpload({
    bytes: Buffer.from("%PDF-1.7\n"),
    contentType: "application/pdf",
    originalName: "family-record.pdf",
    allowedContentTypes: ["application/pdf"],
    maxBytes: 100,
    sizeError: "too large",
    typeError: "wrong type",
  }));
});

test("stored upload validation rejects binary payloads disguised as text and oversize content", () => {
  assert.throws(() => validateStoredUpload({
    bytes: Buffer.from([0x61, 0x00, 0x62]),
    contentType: "text/plain",
    originalName: "notes.txt",
    allowedContentTypes: ["text/plain"],
    maxBytes: 100,
    sizeError: "too large",
    typeError: "wrong type",
  }), /contents do not match/);

  assert.throws(() => validateStoredUpload({
    bytes: Buffer.from("plain text"),
    contentType: "text/plain",
    originalName: "notes.txt",
    allowedContentTypes: ["text/plain"],
    maxBytes: 2,
    sizeError: "too large",
    typeError: "wrong type",
  }), /too large/);
});
