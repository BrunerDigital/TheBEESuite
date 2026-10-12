import { UserRole } from "@prisma/client";

export function isSchoolOwnerAccount(role: UserRole | string, customFields: unknown) {
  if (role !== UserRole.CENTER_DIRECTOR || !customFields || typeof customFields !== "object" || Array.isArray(customFields)) return false;
  return (customFields as Record<string, unknown>).accountType === "school_owner";
}

export function normalizeOwnerLoginInput(input: { name?: unknown; email?: unknown; centerIds?: unknown; password?: unknown }) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const centerIds = Array.isArray(input.centerIds) ? [...new Set(input.centerIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()))] : [];
  if (!name || name.length > 160) throw new Error("Enter the owner's name (up to 160 characters).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid owner email.");
  if (!centerIds.length || centerIds.length > 100) throw new Error("Select 1 to 100 schools for this owner.");
  if (password.length < 12 || password.length > 128) throw new Error("Use a temporary password with 12 to 128 characters.");
  return { name, email, password, centerIds };
}
