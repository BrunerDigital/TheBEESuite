import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getTenantIntegrationCredentialEntries } from "@/lib/integration-credentials";

export type TwilioDeliveryStatus = "delivered" | "failed" | "pending";
export type TwilioSmsConsentAction = "opt_in" | "opt_out";

export const TWILIO_SMS_OPT_OUT_KEYWORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"] as const;
export const TWILIO_SMS_OPT_IN_KEYWORDS = ["start", "yes", "unstop"] as const;

const twilioSmsOptOutKeywords = new Set<string>(TWILIO_SMS_OPT_OUT_KEYWORDS);
const twilioSmsOptInKeywords = new Set<string>(TWILIO_SMS_OPT_IN_KEYWORDS);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedSmsCommand(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .trim();
}

export function normalizeSmsAddress(value: unknown) {
  return clean(value).replace(/^sms:/i, "").replace(/^whatsapp:/i, "");
}

export function phoneDigits(value: unknown) {
  return normalizeSmsAddress(value).replace(/\D/g, "");
}

export function phoneMatchKey(value: unknown) {
  const digits = phoneDigits(value);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function uniqueSmsRecipients(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const value of values) {
    const phone = normalizeSmsAddress(value);
    const key = phoneMatchKey(phone);
    if (!phone || !key || seen.has(key)) continue;
    seen.add(key);
    recipients.push(phone);
  }
  return recipients;
}

export function twilioWebhookUrl(request: NextRequest) {
  const base = clean(process.env.TWILIO_WEBHOOK_BASE_URL) || clean(process.env.NEXT_PUBLIC_APP_URL);
  const current = new URL(request.url);
  if (!base) return current.toString();

  const normalizedBase = base.replace(/\/+$/, "");
  return `${normalizedBase}${current.pathname}${current.search}`;
}

export function twilioStatusCallbackUrl(request: NextRequest) {
  const current = new URL(request.url);
  const base = clean(process.env.TWILIO_WEBHOOK_BASE_URL) || clean(process.env.NEXT_PUBLIC_APP_URL);
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/api/twilio/status${current.search}`;
}

export function validateTwilioSignature({
  authToken,
  signature,
  url,
  params,
}: {
  authToken: string | undefined | null;
  signature: string | undefined | null;
  url: string;
  params: Record<string, string>;
}) {
  if (!authToken || !signature) return false;
  const payload = Object.keys(params)
    .sort()
    .reduce((accumulator, key) => `${accumulator}${key}${params[key]}`, url);
  const expected = createHmac("sha1", authToken).update(payload).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function twilioSignatureTokenCandidates(input: {
  platformToken?: string | null;
  tenantTokens: ReadonlyArray<{ tenantId: string; value: string }>;
}) {
  const scopesByToken = new Map<string, Set<string | null>>();
  for (const credential of input.tenantTokens) {
    const token = clean(credential.value);
    if (!token) continue;
    const scopes = scopesByToken.get(token) ?? new Set<string | null>();
    scopes.add(credential.tenantId);
    scopesByToken.set(token, scopes);
  }
  const platformToken = clean(input.platformToken);
  if (platformToken) {
    const scopes = scopesByToken.get(platformToken) ?? new Set<string | null>();
    scopes.add(null);
    scopesByToken.set(platformToken, scopes);
  }

  return [...scopesByToken].map(([token, scopes]) => {
    const tenantScopes = [...scopes].filter((tenantId): tenantId is string => Boolean(tenantId));
    return {
      token,
      // A token reused across tenant records or at platform scope identifies
      // the Twilio account, not one BEE tenant. Keep it shared so downstream
      // guardian resolution must prove one unambiguous tenant itself.
      tenantId: scopes.has(null) || tenantScopes.length !== 1 ? null : tenantScopes[0],
    };
  });
}

export async function validateTwilioSignatureAgainstConfiguredTokens({
  signature,
  url,
  params,
}: {
  signature: string | undefined | null;
  url: string;
  params: Record<string, string>;
}) {
  const platformToken = clean(process.env.TWILIO_AUTH_TOKEN);
  const tenantTokens = await getTenantIntegrationCredentialEntries("twilio", "TWILIO_AUTH_TOKEN").catch(() => []);
  const tokens = twilioSignatureTokenCandidates({ platformToken, tenantTokens });

  for (const item of tokens) {
    if (validateTwilioSignature({ authToken: item.token, signature, url, params })) {
      return { configured: true, matched: true, tenantId: item.tenantId };
    }
  }

  return { configured: tokens.length > 0, matched: false, tenantId: null };
}

export function twilioDeliveryStatus(value: unknown): TwilioDeliveryStatus {
  const status = clean(value).toLowerCase();
  if (status === "delivered" || status === "read") return "delivered";
  if (status === "failed" || status === "undelivered") return "failed";
  return "pending";
}

export function twilioBlockedCurrentStatuses() {
  return ["delivered", "failed"];
}

export function twilioDeliveryTenantScope(tenantId: string | null) {
  return tenantId ? { tenantId } : {};
}

export function twilioStateTransition(currentStatus: string, nextStatus: TwilioDeliveryStatus) {
  return twilioBlockedCurrentStatuses().includes(currentStatus) ? null : nextStatus;
}

export function isTwilioWebhookReceiptUniqueConflict(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") return false;
  const meta = "meta" in error && error.meta && typeof error.meta === "object"
    ? error.meta as { target?: unknown }
    : undefined;
  const target = meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target || "")];
  return fields.some((field) => field.includes("providerMessageId"));
}

export function twilioSmsConsentAction(value: unknown): TwilioSmsConsentAction | null {
  const command = normalizedSmsCommand(value);
  if (twilioSmsOptOutKeywords.has(command)) return "opt_out";
  if (twilioSmsOptInKeywords.has(command)) return "opt_in";
  return null;
}

export function formDataToRecord(form: FormData) {
  const record: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    record[key] = typeof value === "string" ? value : value.name;
  }
  return record;
}

export async function parseTwilioWebhookParams(request: Request) {
  const form = await request.formData().catch(() => null);
  return form ? formDataToRecord(form) : null;
}

export function twimlResponse() {
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
