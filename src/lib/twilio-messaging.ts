import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export type TwilioDeliveryStatus = "delivered" | "failed" | "pending";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

export function twilioDeliveryStatus(value: unknown): TwilioDeliveryStatus {
  const status = clean(value).toLowerCase();
  if (status === "delivered" || status === "read") return "delivered";
  if (status === "failed" || status === "undelivered") return "failed";
  return "pending";
}

export function formDataToRecord(form: FormData) {
  const record: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    record[key] = typeof value === "string" ? value : value.name;
  }
  return record;
}

export function twimlResponse() {
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
