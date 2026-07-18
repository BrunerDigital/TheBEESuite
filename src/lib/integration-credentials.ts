import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { IntegrationProvider } from "@/lib/integration-setup";

export type IntegrationCredentialField = {
  key: string;
  label: string;
  placeholder?: string;
};

export type IntegrationCredentialPresence = {
  key: string;
  configured: boolean;
  lastFour: string | null;
};

export type TenantIntegrationCredentialEntry = {
  tenantId: string;
  key: string;
  value: string;
};

const credentialFieldsByProvider: Partial<Record<IntegrationProvider, IntegrationCredentialField[]>> = {
  meta_social: [{ key: "META_SOCIAL_ACCESS_TOKEN", label: "Meta Page access token" }],
  linkedin_social: [{ key: "LINKEDIN_SOCIAL_ACCESS_TOKEN", label: "LinkedIn access token" }],
  google_business: [{ key: "GOOGLE_BUSINESS_ACCESS_TOKEN", label: "Google Business OAuth access token" }],
  tiktok_social: [{ key: "TIKTOK_SOCIAL_ACCESS_TOKEN", label: "TikTok user access token" }],
  pinterest_social: [{ key: "PINTEREST_SOCIAL_ACCESS_TOKEN", label: "Pinterest access token" }],
  x_social: [{ key: "X_SOCIAL_ACCESS_TOKEN", label: "X OAuth user access token" }],
  meta_ads: [
    { key: "META_ADS_ACCESS_TOKEN", label: "Meta access token" },
  ],
  google_ads: [
    { key: "GOOGLE_ADS_DEVELOPER_TOKEN", label: "Developer token" },
    { key: "GOOGLE_ADS_REFRESH_TOKEN", label: "OAuth refresh token" },
    { key: "GOOGLE_CLIENT_ID", label: "OAuth client ID" },
    { key: "GOOGLE_CLIENT_SECRET", label: "OAuth client secret" },
  ],
  tiktok_ads: [
    { key: "TIKTOK_ADS_ACCESS_TOKEN", label: "TikTok access token" },
    { key: "TIKTOK_ADS_APP_ID", label: "App ID" },
    { key: "TIKTOK_ADS_APP_SECRET", label: "App secret" },
  ],
  linkedin_ads: [
    { key: "LINKEDIN_ADS_ACCESS_TOKEN", label: "LinkedIn access token" },
    { key: "LINKEDIN_ADS_CLIENT_ID", label: "Client ID" },
    { key: "LINKEDIN_ADS_CLIENT_SECRET", label: "Client secret" },
  ],
  microsoft_ads: [
    { key: "MICROSOFT_ADS_DEVELOPER_TOKEN", label: "Developer token" },
    { key: "MICROSOFT_ADS_REFRESH_TOKEN", label: "OAuth refresh token" },
    { key: "MICROSOFT_ADS_CLIENT_ID", label: "Client ID" },
    { key: "MICROSOFT_ADS_CLIENT_SECRET", label: "Client secret" },
  ],
  sendgrid: [
    { key: "SENDGRID_API_KEY", label: "SendGrid API key", placeholder: "SG..." },
    { key: "SENDGRID_FROM_EMAIL", label: "From email", placeholder: "hello@example.com" },
  ],
  twilio: [
    { key: "TWILIO_ACCOUNT_SID", label: "Account SID", placeholder: "AC..." },
    { key: "TWILIO_AUTH_TOKEN", label: "Auth token" },
    { key: "TWILIO_FROM_NUMBER", label: "From number", placeholder: "+1..." },
    { key: "TWILIO_MESSAGING_SERVICE_SID", label: "Messaging service SID", placeholder: "MG..." },
  ],
  stripe: [
    { key: "STRIPE_SECRET_KEY", label: "Secret key", placeholder: "sk_live_..." },
    { key: "STRIPE_WEBHOOK_SECRET", label: "Webhook secret", placeholder: "whsec_..." },
  ],
  google_sheets: [
    { key: "GOOGLE_SHEETS_WEBHOOK_URL", label: "Apps Script webhook URL" },
    { key: "GOOGLE_SERVICE_ACCOUNT_EMAIL", label: "Service account email" },
    { key: "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", label: "Private key" },
    { key: "GOOGLE_SHEETS_SPREADSHEET_ID", label: "Inquiry spreadsheet ID" },
    { key: "GOOGLE_SHEETS_SPREADSHEET_URL", label: "Inquiry spreadsheet URL" },
  ],
  google_calendar: [
    { key: "GOOGLE_CALENDAR_ID", label: "Calendar ID", placeholder: "primary or calendar email" },
    { key: "GOOGLE_CALENDAR_ACCESS_TOKEN", label: "OAuth access token" },
    { key: "GOOGLE_CALENDAR_REFRESH_TOKEN", label: "OAuth refresh token" },
    { key: "GOOGLE_CLIENT_ID", label: "OAuth client ID" },
    { key: "GOOGLE_CLIENT_SECRET", label: "OAuth client secret" },
  ],
  openai: [
    { key: "OPENAI_API_KEY", label: "OpenAI API key", placeholder: "sk-..." },
  ],
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function encryptionSecret() {
  const secret = process.env.INTEGRATION_CREDENTIALS_SECRET || process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "dev-only-integration-credential-secret";
  throw new Error("INTEGRATION_CREDENTIALS_SECRET or AUTH_SECRET is required for tenant integration credentials.");
}

function encryptionKey() {
  return createHash("sha256").update(encryptionSecret()).digest();
}

export function encryptIntegrationCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptIntegrationCredential(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) return "";
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function integrationCredentialFields(provider: IntegrationProvider) {
  return credentialFieldsByProvider[provider] ?? [];
}

export function sanitizeCredentialInput(provider: IntegrationProvider, value: unknown) {
  const allowed = new Set(integrationCredentialFields(provider).map((field) => field.key));
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    const next = clean(raw);
    if (!allowed.has(key) || !next || next.includes("••••")) continue;
    result[key] = next;
  }
  return result;
}

export function credentialPresenceFromKeys(
  fields: IntegrationCredentialField[],
  credentials: Array<{ key: string; lastFour: string | null }>,
): IntegrationCredentialPresence[] {
  const byKey = new Map(credentials.map((credential) => [credential.key, credential.lastFour]));
  return fields.map((field) => ({
    key: field.key,
    configured: byKey.has(field.key),
    lastFour: byKey.get(field.key) ?? null,
  }));
}

export async function upsertTenantIntegrationCredentials({
  tenantId,
  provider,
  credentials,
  userId,
}: {
  tenantId: string;
  provider: IntegrationProvider;
  credentials: Record<string, string>;
  userId: string;
}) {
  const savedKeys: string[] = [];
  for (const [key, value] of Object.entries(credentials)) {
    const lastFour = value.slice(-4);
    await prisma.integrationCredential.upsert({
      where: { tenantId_provider_key: { tenantId, provider, key } },
      update: {
        encryptedValue: encryptIntegrationCredential(value),
        lastFour,
        updatedById: userId,
      },
      create: {
        tenantId,
        provider,
        key,
        encryptedValue: encryptIntegrationCredential(value),
        lastFour,
        createdById: userId,
        updatedById: userId,
      },
    });
    savedKeys.push(key);
  }
  return savedKeys;
}

export async function getTenantIntegrationCredentialMap(tenantId: string | null | undefined, provider: IntegrationProvider) {
  if (!tenantId) return {};
  const credentials = await prisma.integrationCredential.findMany({
    where: { tenantId, provider },
    select: { key: true, encryptedValue: true },
  });
  const result: Record<string, string> = {};
  for (const credential of credentials) {
    try {
      result[credential.key] = decryptIntegrationCredential(credential.encryptedValue);
    } catch {
      result[credential.key] = "";
    }
  }
  return result;
}

export async function getTenantIntegrationCredentialEntries(provider: IntegrationProvider, key?: string) {
  const credentials = await prisma.integrationCredential.findMany({
    where: { provider, ...(key ? { key } : {}) },
    select: { tenantId: true, key: true, encryptedValue: true },
  });
  const result: TenantIntegrationCredentialEntry[] = [];
  for (const credential of credentials) {
    try {
      const value = decryptIntegrationCredential(credential.encryptedValue);
      if (value) result.push({ tenantId: credential.tenantId, key: credential.key, value });
    } catch {
      // Ignore credentials that can no longer be decrypted with the active key.
    }
  }
  return result;
}

export function credentialEnvValue(credentials: Record<string, string>, envName: string) {
  return clean(credentials[envName]) || clean(process.env[envName]);
}
