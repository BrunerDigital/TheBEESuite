export const DEFAULT_PROFILE_PHOTO_URL = "/brand/the-bee-suite/mr-bee-profile-silhouette.svg";
export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const allowedProfilePhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type ProfilePhotoFields = {
  url?: string | null;
  bucket?: string | null;
  storageKey?: string | null;
  contentType?: string | null;
  uploadedAt?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function displaySafeUrl(value: unknown) {
  const url = cleanString(value);
  if (!url) return null;
  if (url.startsWith("/") || url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:image/")) {
    return url;
  }
  return null;
}

export function contentTypeForProfilePhotoFile(input: { type?: string | null; name?: string | null }) {
  if (input.type && allowedProfilePhotoTypes.has(input.type)) return input.type;
  const ext = input.name?.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return input.type || "application/octet-stream";
}

export function validateProfilePhotoFile(input: { size: number; contentType: string }) {
  if (!allowedProfilePhotoTypes.has(input.contentType)) {
    return { ok: false as const, error: "Profile photo must be a JPG, PNG, or WebP image." };
  }
  if (input.size > PROFILE_PHOTO_MAX_BYTES) {
    return { ok: false as const, error: "Profile photo must be 5MB or smaller." };
  }
  return { ok: true as const };
}

export function readProfilePhotoFields(customFields: unknown): ProfilePhotoFields {
  if (!isRecord(customFields)) return {};
  const nested = isRecord(customFields.profilePhoto) ? customFields.profilePhoto : {};
  return {
    url: displaySafeUrl(nested.url) ?? displaySafeUrl(customFields.profilePhotoUrl),
    bucket: cleanString(nested.bucket) ?? cleanString(customFields.profilePhotoBucket),
    storageKey: cleanString(nested.storageKey) ?? cleanString(customFields.profilePhotoStorageKey),
    contentType: cleanString(nested.contentType),
    uploadedAt: cleanString(nested.uploadedAt),
  };
}

export function readProfilePhotoUrl(customFields: unknown) {
  return readProfilePhotoFields(customFields).url ?? null;
}

export function readProfilePhotoStorageKey(customFields: unknown) {
  return readProfilePhotoFields(customFields).storageKey ?? null;
}

export function mergeProfilePhotoCustomFields(customFields: unknown, profilePhoto: Required<ProfilePhotoFields>) {
  const base = isRecord(customFields) ? { ...customFields } : {};
  return {
    ...base,
    profilePhoto,
    profilePhotoUrl: profilePhoto.url,
    profilePhotoBucket: profilePhoto.bucket,
    profilePhotoStorageKey: profilePhoto.storageKey,
  };
}
