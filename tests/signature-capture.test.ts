import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInternalSignatureCertificate,
  INTERNAL_SIGNATURE_PENDING_KEY,
  isInternalSignatureRequest,
  LEGACY_SIGNATURE_PROVIDER_PENDING_KEY,
  normalizeSignatureName,
  signatureEvidenceHash,
  validateSignatureCapture,
} from "../src/lib/signature-capture";

test("internal signature requests recognize new and legacy pending markers", () => {
  assert.equal(isInternalSignatureRequest({ storageKey: INTERNAL_SIGNATURE_PENDING_KEY }), true);
  assert.equal(isInternalSignatureRequest({ storageKey: LEGACY_SIGNATURE_PROVIDER_PENDING_KEY }), true);
  assert.equal(isInternalSignatureRequest({ storageKey: "documents/tenant/family/file.pdf" }), false);
});

test("signature capture requires typed name and consent only for signable documents", () => {
  assert.deepEqual(validateSignatureCapture({ required: false, signerName: "" }), { ok: true, signerName: "" });
  assert.deepEqual(validateSignatureCapture({ required: true, signerName: "", consentAccepted: true }), {
    ok: false,
    status: 400,
    error: "Typed signature is required for this document.",
  });
  assert.deepEqual(validateSignatureCapture({ required: true, signerName: "  Jane   Parent  ", consentAccepted: false }), {
    ok: false,
    status: 400,
    error: "Signature consent must be accepted before submitting.",
  });
  assert.deepEqual(validateSignatureCapture({ required: true, signerName: "  Jane   Parent  ", consentAccepted: true }), {
    ok: true,
    signerName: "Jane Parent",
  });
});

test("signature certificate records signer and document evidence", () => {
  const evidenceHash = signatureEvidenceHash(["doc_1", "user_1", "Jane Parent", "2026-06-04"]);
  const certificate = buildInternalSignatureCertificate({
    documentId: "doc_1",
    documentName: "Photo Release",
    documentType: "policy_acknowledgment",
    familyName: "Parent Family",
    childName: "Avery Parent",
    signerName: normalizeSignatureName("Jane Parent"),
    signerEmail: "jane@example.com",
    signerUserId: "user_1",
    signedAt: new Date("2026-06-04T16:00:00.000Z"),
    evidenceHash,
  }).toString("utf8");

  assert.match(certificate, /The BEE Suite Internal E-Signature Certificate/);
  assert.match(certificate, /Document ID: doc_1/);
  assert.match(certificate, /Signer name: Jane Parent/);
  assert.match(certificate, new RegExp(`Evidence hash: ${evidenceHash}`));
});
