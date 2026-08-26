export const DEFAULT_PROFILE_PHOTO_URL = "/brand/the-bee-suite/mr-bee-profile.png";
export const KID_CITY_PROFILE_PHOTO_URL = "/brand/kid-city-usa/kid-city-usa-profile.jpg";
export const MISS_HONEYS_PROFILE_PHOTO_URL = "/brand/miss-honeys-learning-center/logo-transparent.png";
export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const MANAGEMENT_PROFILE_PHOTO_ROLES = [
  "PLATFORM_OWNER",
  "BRAND_ADMIN",
  "REGIONAL_MANAGER",
  "CENTER_DIRECTOR",
  "ASSISTANT_DIRECTOR",
  "BILLING_ADMIN",
] as const;

export function usesManagementProfilePhoto(role: string) {
  return (MANAGEMENT_PROFILE_PHOTO_ROLES as readonly string[]).includes(role);
}

const KID_CITY_FAMILY_AND_TEACHER_ROLES = new Set(["TEACHER", "PARENT_GUARDIAN", "AUTHORIZED_PICKUP"]);

export function defaultProfilePhotoUrlForRole(
  role: string,
  brandKind: "bee-suite" | "kid-city-usa" | "miss-honeys-learning-center" = "kid-city-usa",
) {
  if (brandKind === "miss-honeys-learning-center") return MISS_HONEYS_PROFILE_PHOTO_URL;
  if (brandKind === "kid-city-usa" && KID_CITY_FAMILY_AND_TEACHER_ROLES.has(role)) {
    return KID_CITY_PROFILE_PHOTO_URL;
  }
  return DEFAULT_PROFILE_PHOTO_URL;
}

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

export function matchesProfilePhotoSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
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

export function removeProfilePhotoCustomFields(customFields: unknown) {
  const base = isRecord(customFields) ? { ...customFields } : {};
  delete base.profilePhoto;
  delete base.profilePhotoUrl;
  delete base.profilePhotoBucket;
  delete base.profilePhotoStorageKey;
  return base;
}
