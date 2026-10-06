import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { MAX_PROCARE_SOURCE_FILES, MAX_PROCARE_STAGED_BYTES, MAX_PROCARE_STAGED_FILE_BYTES } from "@/lib/procare-upload-limits";

export type StagedSourceScope = { userId: string; tenantId: string; centerId: string };
export type StagedSourceFile = { name: string; size: number; sha256: string; path: string };
export type StagedSourceManifest = StagedSourceScope & { version: 1; expiresAt: number; files: StagedSourceFile[] };
const allowedExtensions = /\.(csv|tsv|txt|xls|xlsx|zip|html?|xml)$/i;

export function validateStagedSourceFiles(value: unknown): Array<Omit<StagedSourceFile, "path">> {
  if (!Array.isArray(value) || !value.length || value.length > MAX_PROCARE_SOURCE_FILES) throw new Error("Choose between 1 and 500 report files.");
  const files = value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("A selected report is invalid.");
    const file = entry as Record<string, unknown>;
    if (typeof file.name !== "string" || !file.name.trim() || file.name.length > 240 || /[\x00-\x1f]/.test(file.name) || !allowedExtensions.test(file.name)) throw new Error("Choose unchanged CSV, spreadsheet, HTML, XML, text, or ZIP reports.");
    if (!Number.isSafeInteger(file.size) || Number(file.size) <= 0 || Number(file.size) > MAX_PROCARE_STAGED_FILE_BYTES) throw new Error("Each report must be nonempty and no larger than 20 MB.");
    if (typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("The report integrity check is missing. Select the files again.");
    return { name: file.name, size: Number(file.size), sha256: file.sha256 };
  });
  if (files.reduce((total, file) => total + file.size, 0) > MAX_PROCARE_STAGED_BYTES) throw new Error("Choose no more than 50 MB of reports per school package.");
  return files;
}

function pathPrefix(scope: StagedSourceScope) {
  // Encode identity parts independently; a slash in an identifier cannot widen the scope.
  return `school-imports/${encodeURIComponent(scope.tenantId)}/${encodeURIComponent(scope.centerId)}/${encodeURIComponent(scope.userId)}/`;
}

export function makeStagedSourceManifest(scope: StagedSourceScope, files: unknown, now = Date.now()): StagedSourceManifest {
  return { ...scope, version: 1, expiresAt: now + 24 * 60 * 60 * 1000,
    files: validateStagedSourceFiles(files).map((file) => ({ ...file, path: pathPrefix(scope) + randomUUID() })) };
}

function secretKey(secret: string) {
  if (!secret) throw new Error("Secure report staging is unavailable. Request setup help.");
  return secret;
}

export function signStagedSourceManifest(manifest: StagedSourceManifest, secret: string) {
  const payload = Buffer.from(JSON.stringify(manifest)).toString("base64url");
  const signature = createHmac("sha256", secretKey(secret)).update("school-import-source:v1:" + payload).digest("base64url");
  return payload + "." + signature;
}

export function verifyStagedSourceManifest(receipt: string, scope: StagedSourceScope, secret: string, now = Date.now()): StagedSourceManifest {
  if (receipt.length > 300_000) throw new Error("The saved report selection is invalid.");
  const [payload, signature, extra] = receipt.split(".");
  const expected = createHmac("sha256", secretKey(secret)).update("school-import-source:v1:" + payload).digest();
  const actual = Buffer.from(signature || "", "base64url");
  if (!payload || extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("The saved reports could not be verified. Select the files again.");
  const manifest = JSON.parse(Buffer.from(payload, "base64url").toString()) as StagedSourceManifest;
  if (manifest.version !== 1 || manifest.userId !== scope.userId || manifest.tenantId !== scope.tenantId || manifest.centerId !== scope.centerId) throw new Error("These reports belong to a different user or school.");
  if (!Number.isSafeInteger(manifest.expiresAt) || manifest.expiresAt <= now || manifest.expiresAt > now + 24 * 60 * 60 * 1000) throw new Error("The report upload has expired. Select the same files again to continue safely.");
  validateStagedSourceFiles(manifest.files);
  const prefix = pathPrefix(scope);
  if (manifest.files.some((file) => typeof file.path !== "string" || !file.path.startsWith(prefix) || !/^[a-f0-9-]{36}$/.test(file.path.slice(prefix.length)))) throw new Error("The report storage scope is invalid.");
  if (new Set(manifest.files.map((file) => file.path)).size !== manifest.files.length) throw new Error("The report selection contains duplicate storage references.");
  return manifest;
}
