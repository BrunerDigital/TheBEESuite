import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanSupabaseUrl } from "@/lib/supabase-auth";

export const CHILD_MEDIA_BUCKET = process.env.SUPABASE_CHILD_MEDIA_BUCKET || "child-media";
export const ASSET_HUB_BUCKET = process.env.SUPABASE_ASSET_HUB_BUCKET || "corporate-assets";
export const DOCUMENT_BUCKET = process.env.SUPABASE_DOCUMENT_BUCKET || ASSET_HUB_BUCKET;
export const MESSAGE_ATTACHMENT_BUCKET = process.env.SUPABASE_MESSAGE_ATTACHMENT_BUCKET || DOCUMENT_BUCKET;
export const PROFILE_PHOTO_BUCKET = process.env.SUPABASE_PROFILE_PHOTO_BUCKET || process.env.SUPABASE_CHILD_MEDIA_BUCKET || "child-media";
export const CHILD_MEDIA_SIGNED_URL_SECONDS = Number(process.env.SUPABASE_CHILD_MEDIA_SIGNED_URL_SECONDS || 60 * 60 * 2);
export const DOCUMENT_SIGNED_URL_SECONDS = Number(process.env.SUPABASE_DOCUMENT_SIGNED_URL_SECONDS || 60 * 60);
export const MESSAGE_ATTACHMENT_SIGNED_URL_SECONDS = Number(process.env.SUPABASE_MESSAGE_ATTACHMENT_SIGNED_URL_SECONDS || 60 * 60 * 2);
export const PROFILE_PHOTO_SIGNED_URL_SECONDS = Number(process.env.SUPABASE_PROFILE_PHOTO_SIGNED_URL_SECONDS || 60 * 60 * 12);
export const CHILD_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const MESSAGE_ATTACHMENT_MAX_BYTES = DOCUMENT_MAX_BYTES;
export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

type StorageClient = SupabaseClient;

function getSupabaseStorageKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
}

export function isSupabaseStorageConfigured() {
  return Boolean(cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && getSupabaseStorageKey());
}

export function getSupabaseStorageClient(): StorageClient {
  const url = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = getSupabaseStorageKey();
  if (!url || !key) throw new Error("Supabase Storage environment variables are not configured.");

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function requireAssetHubBucket() {
  const client = getSupabaseStorageClient();
  const { data, error } = await client.storage.getBucket(ASSET_HUB_BUCKET);
  if (error || !data || data.public) {
    throw new Error("The private Asset Hub storage bucket is not configured.");
  }
}

// Operator-only setup/import scripts may create the bucket explicitly. Runtime
// upload routes use requireAssetHubBucket so a request can never change provider
// configuration implicitly.
export async function ensureAssetHubBucket() {
  const client = getSupabaseStorageClient();
  const { data, error } = await client.storage.getBucket(ASSET_HUB_BUCKET);
  if (data?.public) throw new Error("The Asset Hub storage bucket must be private.");
  if (data) return;
  if (error && !/not found/i.test(error.message)) throw new Error(error.message);
  const { error: createError } = await client.storage.createBucket(ASSET_HUB_BUCKET, { public: false });
  if (createError && !/already exists/i.test(createError.message)) throw new Error(createError.message);
}

export async function createAssetHubUploadUrl(storageKey: string) {
  await requireAssetHubBucket();
  const client = getSupabaseStorageClient();
  const { data, error } = await client.storage.from(ASSET_HUB_BUCKET).createSignedUploadUrl(storageKey);
  if (error || !data?.token) throw new Error(error?.message || "Could not prepare the asset upload.");
  return { token: data.token, path: data.path };
}

export async function createAssetHubSignedUrl(storageKey: string, downloadName?: string, expiresIn = 60 * 60) {
  const client = getSupabaseStorageClient();
  const { data, error } = await client.storage.from(ASSET_HUB_BUCKET).createSignedUrl(
    storageKey,
    expiresIn,
    downloadName ? { download: downloadName } : undefined,
  );
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not create a secure asset link.");
  return data.signedUrl;
}

export async function getAssetHubObjectInfo(storageKey: string) {
  const { data, error } = await getSupabaseStorageClient().storage.from(ASSET_HUB_BUCKET).info(storageKey);
  if (error || !data) throw new Error(error?.message || "Could not verify the uploaded asset.");
  return {
    size: typeof data.size === "number" ? data.size : null,
    contentType: typeof data.contentType === "string"
      ? data.contentType
      : typeof data.metadata?.mimetype === "string"
        ? data.metadata.mimetype
        : null,
  };
}

export async function deleteAssetHubObject(storageKey: string) {
  const { error } = await getSupabaseStorageClient().storage.from(ASSET_HUB_BUCKET).remove([storageKey]);
  if (error) throw new Error(error.message);
}

function safePathPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unassigned";
}

function extensionFor(contentType: string, originalName?: string) {
  const fromName = originalName?.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "application/msword") return "doc";
  if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (contentType === "text/plain") return "txt";
  return "jpg";
}

function assertDocumentContentType(contentType: string) {
  const allowed = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/plain",
  ]);
  if (!allowed.has(contentType)) {
    throw new Error("Document must be a PDF, Word document, image, or text file.");
  }
}

const extensionsByContentType: Record<string, ReadonlySet<string>> = {
  "application/pdf": new Set(["pdf"]),
  "application/msword": new Set(["doc"]),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": new Set(["docx"]),
  "image/jpeg": new Set(["jpg", "jpeg"]),
  "image/png": new Set(["png"]),
  "image/webp": new Set(["webp"]),
  "text/plain": new Set(["txt"]),
};

function fileExtension(originalName?: string) {
  const normalized = originalName?.trim().toLowerCase() || "";
  const separator = normalized.lastIndexOf(".");
  if (separator <= 0 || separator === normalized.length - 1) return null;
  return normalized.slice(separator + 1);
}

function startsWithBytes(bytes: Buffer, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function hasExpectedSignature(bytes: Buffer, contentType: string) {
  if (!bytes.byteLength) return false;
  if (contentType === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (contentType === "application/msword") return startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]);
  }
  if (contentType === "image/jpeg") return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
  if (contentType === "image/png") return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === "image/webp") {
    return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (contentType === "text/plain") {
    if (bytes.includes(0)) return false;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, Math.min(bytes.byteLength, 64 * 1024)));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function validateStoredUpload(input: {
  bytes: Buffer;
  contentType: string;
  originalName?: string;
  allowedContentTypes: readonly string[];
  maxBytes: number;
  sizeError: string;
  typeError: string;
}) {
  if (!input.allowedContentTypes.includes(input.contentType)) throw new Error(input.typeError);
  if (input.bytes.byteLength > input.maxBytes) throw new Error(input.sizeError);

  const extension = fileExtension(input.originalName);
  const expectedExtensions = extensionsByContentType[input.contentType];
  if ((extension && !expectedExtensions?.has(extension)) || !hasExpectedSignature(input.bytes, input.contentType)) {
    throw new Error("The file contents do not match the selected file type.");
  }
}

export function contentTypeForDocumentFile(input: { type?: string | null; name?: string | null }) {
  if (input.type) return input.type;
  const ext = input.name?.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "doc") return "application/msword";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "txt") return "text/plain";
  return "application/octet-stream";
}

export function buildChildMediaPath({
  tenantId,
  centerId,
  classroomId,
  childId,
  originalName,
  contentType,
  appReviewDemo = false,
}: {
  tenantId: string;
  centerId?: string | null;
  classroomId?: string | null;
  childId: string;
  originalName?: string;
  contentType: string;
  appReviewDemo?: boolean;
}) {
  const ext = extensionFor(contentType, originalName);
  if (appReviewDemo) {
    return ["demo-media", safePathPart(childId), "app-review", `${randomUUID()}.${ext}`].join("/");
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return [
    safePathPart(tenantId),
    safePathPart(centerId || "center"),
    safePathPart(classroomId || "classroom"),
    safePathPart(childId),
    String(year),
    month,
    `${randomUUID()}.${ext}`,
  ].join("/");
}

export function buildProfilePhotoPath({
  tenantId,
  userId,
  originalName,
  contentType,
}: {
  tenantId: string;
  userId: string;
  originalName?: string;
  contentType: string;
}) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext = extensionFor(contentType, originalName);
  return [
    "profile-photos",
    safePathPart(tenantId),
    safePathPart(userId),
    String(year),
    month,
    `${randomUUID()}.${ext}`,
  ].join("/");
}

export async function uploadProfilePhotoBuffer({
  bytes,
  contentType,
  originalName,
  tenantId,
  userId,
}: {
  bytes: Buffer;
  contentType: string;
  originalName?: string;
  tenantId: string;
  userId: string;
}) {
  validateStoredUpload({
    bytes,
    contentType,
    originalName,
    allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: PROFILE_PHOTO_MAX_BYTES,
    sizeError: "Profile photo must be 5MB or smaller.",
    typeError: "Profile photo must be a JPG, PNG, or WebP image.",
  });

  const client = getSupabaseStorageClient();
  const storageKey = buildProfilePhotoPath({ tenantId, userId, originalName, contentType });
  const { error: uploadError } = await client.storage.from(PROFILE_PHOTO_BUCKET).upload(storageKey, bytes, {
    cacheControl: "3600",
    contentType,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const signedUrl = await createProfilePhotoSignedUrl(storageKey);
  return {
    bucket: PROFILE_PHOTO_BUCKET,
    storageKey,
    recordUrl: `supabase://${PROFILE_PHOTO_BUCKET}/${storageKey}`,
    signedUrl,
  };
}

export async function createProfilePhotoSignedUrl(storageKey: string, expiresIn = PROFILE_PHOTO_SIGNED_URL_SECONDS) {
  const client = getSupabaseStorageClient();
  const { data, error } = await client.storage.from(PROFILE_PHOTO_BUCKET).createSignedUrl(storageKey, expiresIn);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not create signed profile photo URL.");
  return data.signedUrl;
}

export async function uploadChildMediaBuffer({
  bytes,
  contentType,
  originalName,
  tenantId,
  centerId,
  classroomId,
  childId,
  appReviewDemo = false,
}: {
  bytes: Buffer;
  contentType: string;
  originalName?: string;
  tenantId: string;
  centerId?: string | null;
  classroomId?: string | null;
  childId: string;
  appReviewDemo?: boolean;
}) {
  validateStoredUpload({
    bytes,
    contentType,
    originalName,
    allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: CHILD_MEDIA_MAX_BYTES,
    sizeError: "Photo must be 8MB or smaller.",
    typeError: "Photo must be a JPG, PNG, or WebP image.",
  });

  const client = getSupabaseStorageClient();
  const storageKey = buildChildMediaPath({
    tenantId,
    centerId,
    classroomId,
    childId,
    originalName,
    contentType,
    appReviewDemo,
  });
  const { error: uploadError } = await client.storage.from(CHILD_MEDIA_BUCKET).upload(storageKey, bytes, {
    cacheControl: "3600",
    contentType,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const signedUrl = await createChildMediaSignedUrl(storageKey);
  return {
    bucket: CHILD_MEDIA_BUCKET,
    storageKey,
    recordUrl: `supabase://${CHILD_MEDIA_BUCKET}/${storageKey}`,
    signedUrl,
  };
}

export async function createChildMediaSignedUrl(storageKey: string, expiresIn = CHILD_MEDIA_SIGNED_URL_SECONDS) {
  const client = getSupabaseStorageClient();
  const { data, error } = await client.storage.from(CHILD_MEDIA_BUCKET).createSignedUrl(storageKey, expiresIn);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not create signed media URL.");
  return data.signedUrl;
}

export async function deleteChildMediaObject(storageKey: string) {
  const { error } = await getSupabaseStorageClient().storage.from(CHILD_MEDIA_BUCKET).remove([storageKey]);
  if (error) throw new Error(error.message);
}

export async function signChildMediaRecords<T extends { url: string; storageKey?: string | null }>(records: T[]) {
  return Promise.all(
    records.map(async (record) => {
      if (!record.storageKey || record.storageKey.startsWith("inline-demo-upload")) return record;
      try {
        return { ...record, url: await createChildMediaSignedUrl(record.storageKey) };
      } catch {
        return record;
      }
    }),
  );
}

export function buildDocumentPath({
  tenantId,
  centerId,
  familyId,
  childId,
  documentId,
  originalName,
  contentType,
  appReviewDemo = false,
}: {
  tenantId: string;
  centerId?: string | null;
  familyId: string;
  childId?: string | null;
  documentId: string;
  originalName?: string;
  contentType: string;
  appReviewDemo?: boolean;
}) {
  const ext = extensionFor(contentType, originalName);
  if (appReviewDemo) {
    return [
      "demo-docs",
      safePathPart(childId || familyId),
      "app-review",
      safePathPart(documentId),
      `${randomUUID()}.${ext}`,
    ].join("/");
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return [
    "documents",
    safePathPart(tenantId),
    safePathPart(centerId || "center"),
    safePathPart(familyId),
    safePathPart(childId || "family"),
    safePathPart(documentId),
    String(year),
    month,
    `${randomUUID()}.${ext}`,
  ].join("/");
}

export async function uploadDocumentBuffer({
  bytes,
  contentType,
  originalName,
  tenantId,
  centerId,
  familyId,
  childId,
  documentId,
  appReviewDemo = false,
}: {
  bytes: Buffer;
  contentType: string;
  originalName?: string;
  tenantId: string;
  centerId?: string | null;
  familyId: string;
  childId?: string | null;
  documentId: string;
  appReviewDemo?: boolean;
}) {
  assertDocumentContentType(contentType);
  validateStoredUpload({
    bytes,
    contentType,
    originalName,
    allowedContentTypes: Object.keys(extensionsByContentType),
    maxBytes: DOCUMENT_MAX_BYTES,
    sizeError: "Document must be 20MB or smaller.",
    typeError: "Document must be a PDF, Word document, image, or text file.",
  });

  const client = getSupabaseStorageClient();
  const storageKey = buildDocumentPath({
    tenantId,
    centerId,
    familyId,
    childId,
    documentId,
    originalName,
    contentType,
    appReviewDemo,
  });
  const { error: uploadError } = await client.storage.from(DOCUMENT_BUCKET).upload(storageKey, bytes, {
    cacheControl: "3600",
    contentType,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const signedUrl = await createDocumentSignedUrl(storageKey);
  return {
    bucket: DOCUMENT_BUCKET,
    storageKey,
    recordUrl: `supabase://${DOCUMENT_BUCKET}/${storageKey}`,
    signedUrl,
  };
}

export async function createDocumentSignedUrl(storageKey: string, expiresIn = DOCUMENT_SIGNED_URL_SECONDS) {
  const client = getSupabaseStorageClient();
  for (const bucket of [...new Set([DOCUMENT_BUCKET, CHILD_MEDIA_BUCKET])]) {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(storageKey, expiresIn);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  throw new Error("Could not create signed document URL.");
}

export function buildMessageAttachmentPath({
  tenantId,
  centerId,
  familyId,
  threadKey,
  uploadedById,
  originalName,
  contentType,
  appReviewDemo = false,
}: {
  tenantId: string;
  centerId?: string | null;
  familyId?: string | null;
  threadKey?: string | null;
  uploadedById: string;
  originalName?: string;
  contentType: string;
  appReviewDemo?: boolean;
}) {
  const ext = extensionFor(contentType, originalName);
  if (appReviewDemo) {
    return [
      "demo-messages",
      safePathPart(familyId || threadKey || "internal"),
      safePathPart(uploadedById),
      `${randomUUID()}.${ext}`,
    ].join("/");
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return [
    "message-attachments",
    safePathPart(tenantId),
    safePathPart(centerId || "center"),
    safePathPart(familyId || threadKey || "internal"),
    safePathPart(uploadedById),
    String(year),
    month,
    `${randomUUID()}.${ext}`,
  ].join("/");
}

export async function uploadMessageAttachmentBuffer({
  bytes,
  contentType,
  originalName,
  tenantId,
  centerId,
  familyId,
  threadKey,
  uploadedById,
  appReviewDemo = false,
}: {
  bytes: Buffer;
  contentType: string;
  originalName?: string;
  tenantId: string;
  centerId?: string | null;
  familyId?: string | null;
  threadKey?: string | null;
  uploadedById: string;
  appReviewDemo?: boolean;
}) {
  assertDocumentContentType(contentType);
  validateStoredUpload({
    bytes,
    contentType,
    originalName,
    allowedContentTypes: Object.keys(extensionsByContentType),
    maxBytes: MESSAGE_ATTACHMENT_MAX_BYTES,
    sizeError: "Attachment must be 20MB or smaller.",
    typeError: "Attachment must be a PDF, Word document, image, or text file.",
  });

  const client = getSupabaseStorageClient();
  const storageKey = buildMessageAttachmentPath({
    tenantId,
    centerId,
    familyId,
    threadKey,
    uploadedById,
    originalName,
    contentType,
    appReviewDemo,
  });
  const { error: uploadError } = await client.storage.from(MESSAGE_ATTACHMENT_BUCKET).upload(storageKey, bytes, {
    cacheControl: "3600",
    contentType,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const signedUrl = await createMessageAttachmentSignedUrl(storageKey);
  return {
    bucket: MESSAGE_ATTACHMENT_BUCKET,
    storageKey,
    recordUrl: `supabase://${MESSAGE_ATTACHMENT_BUCKET}/${storageKey}`,
    signedUrl,
  };
}

export async function createMessageAttachmentSignedUrl(
  storageKey: string,
  expiresIn = MESSAGE_ATTACHMENT_SIGNED_URL_SECONDS,
  storedBucket?: string,
) {
  const client = getSupabaseStorageClient();
  for (const bucket of [...new Set([storedBucket, MESSAGE_ATTACHMENT_BUCKET, CHILD_MEDIA_BUCKET].filter(Boolean) as string[])]) {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(storageKey, expiresIn);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  throw new Error("Could not create signed attachment URL.");
}

export async function signDocumentRecords<T extends { storageKey?: string | null }>(records: T[]) {
  return Promise.all(
    records.map(async (record) => {
      if (!record.storageKey || record.storageKey === "upload_pending") return { ...record, downloadUrl: null };
      try {
        return { ...record, downloadUrl: await createDocumentSignedUrl(record.storageKey) };
      } catch {
        return { ...record, downloadUrl: null };
      }
    }),
  );
}
