import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const PAYMENT_METHOD_REQUEST_TOKEN_VERSION = 1;
export const PAYMENT_METHOD_REQUEST_TOKEN_TTL_DAYS = 14;
export const PAYMENT_METHOD_REQUEST_NOTIFICATION_TYPE = "payment_method_form";
export const PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE = "payment_method_request_email";
export type PaymentMethodRequestIntent = "payment_steps" | "instant_bank_verification";

export type PaymentMethodRequestTokenPayload = {
  v: typeof PAYMENT_METHOD_REQUEST_TOKEN_VERSION;
  familyId: string;
  centerId: string;
  tenantId: string;
  email: string;
  iat: number;
  exp: number;
  nonce: string;
};

export type PaymentMethodRequestRecipient = {
  email: string;
  label: string;
  guardianIds: string[];
  userIds: string[];
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(input: string) {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function tokenSecret() {
  const secret = process.env.PAYMENT_METHOD_REQUEST_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "dev-only-payment-method-request-secret";
  throw new Error("PAYMENT_METHOD_REQUEST_TOKEN_SECRET or AUTH_SECRET is required in production.");
}

function sign(data: string) {
  return base64Url(createHmac("sha256", tokenSecret()).update(data).digest());
}

function signatureMatches(data: string, signature: string) {
  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isValidPaymentRequestEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizePaymentRequestEmail(value: unknown) {
  return clean(value).toLowerCase();
}

export function uniquePaymentRequestEmails(values: unknown[]) {
  const seen = new Set<string>();
  return values
    .map(normalizePaymentRequestEmail)
    .filter(isValidPaymentRequestEmail)
    .filter((email) => {
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
}

export function paymentMethodRequestRecipientOptions(input: {
  billingEmail?: string | null;
  guardians: Array<{ id?: string | null; fullName?: string | null; email?: string | null; userId?: string | null }>;
}) {
  const recipients = new Map<string, PaymentMethodRequestRecipient>();
  const add = ({
    email,
    label,
    guardianId,
    userId,
  }: {
    email: unknown;
    label: string;
    guardianId?: string | null;
    userId?: string | null;
  }) => {
    const normalized = normalizePaymentRequestEmail(email);
    if (!isValidPaymentRequestEmail(normalized)) return;
    const current = recipients.get(normalized);
    if (current) {
      if (guardianId && !current.guardianIds.includes(guardianId)) current.guardianIds.push(guardianId);
      if (userId && !current.userIds.includes(userId)) current.userIds.push(userId);
      return;
    }
    recipients.set(normalized, {
      email: normalized,
      label,
      guardianIds: guardianId ? [guardianId] : [],
      userIds: userId ? [userId] : [],
    });
  };

  add({ email: input.billingEmail, label: "Billing email" });
  for (const guardian of input.guardians) {
    const label = guardian.fullName ? guardian.fullName : "Guardian";
    add({ email: guardian.email, label, guardianId: guardian.id, userId: guardian.userId });
  }

  return Array.from(recipients.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function createPaymentMethodRequestToken(input: {
  familyId: string;
  centerId: string;
  tenantId: string;
  email: string;
  now?: Date;
  ttlDays?: number;
}) {
  const now = input.now ?? new Date();
  const ttlDays = input.ttlDays ?? PAYMENT_METHOD_REQUEST_TOKEN_TTL_DAYS;
  const payload: PaymentMethodRequestTokenPayload = {
    v: PAYMENT_METHOD_REQUEST_TOKEN_VERSION,
    familyId: input.familyId,
    centerId: input.centerId,
    tenantId: input.tenantId,
    email: normalizePaymentRequestEmail(input.email),
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(now.getTime() / 1000) + ttlDays * 24 * 60 * 60,
    nonce: randomUUID(),
  };
  const data = base64Url(JSON.stringify(payload));
  return `${data}.${sign(data)}`;
}

export function validatePaymentMethodRequestToken(token: unknown, now = new Date()) {
  const value = clean(token);
  const [data, signature] = value.split(".");
  if (!data || !signature || !signatureMatches(data, signature)) {
    return { ok: false as const, error: "This payment setup link is invalid." };
  }

  try {
    const payload = JSON.parse(fromBase64Url(data)) as Partial<PaymentMethodRequestTokenPayload>;
    if (
      payload.v !== PAYMENT_METHOD_REQUEST_TOKEN_VERSION ||
      !payload.familyId ||
      !payload.centerId ||
      !payload.tenantId ||
      !payload.email ||
      !isValidPaymentRequestEmail(payload.email) ||
      typeof payload.exp !== "number"
    ) {
      return { ok: false as const, error: "This payment setup link is invalid." };
    }
    if (payload.exp < Math.floor(now.getTime() / 1000)) {
      return { ok: false as const, error: "This payment setup link has expired. Please ask the school to send a new one." };
    }
    return { ok: true as const, payload: payload as PaymentMethodRequestTokenPayload };
  } catch {
    return { ok: false as const, error: "This payment setup link is invalid." };
  }
}

export function buildPaymentMethodRequestFormUrl(appBaseUrl: string, token: string) {
  return `${appBaseUrl.replace(/\/+$/, "")}/payment-method-form/${encodeURIComponent(token)}`;
}

export function buildPaymentMethodRequestFocusedFormUrl(appBaseUrl: string, token: string, intent: PaymentMethodRequestIntent) {
  const formUrl = buildPaymentMethodRequestFormUrl(appBaseUrl, token);
  if (intent !== "instant_bank_verification") return formUrl;
  return `${formUrl}?focus=instant-bank`;
}

export function extractFirstUrl(value: string) {
  return value.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null;
}

export function buildPaymentMethodRequestEmailText({
  recipientLabel,
  familyName,
  centerLabel,
  formUrl,
  intent = "payment_steps",
}: {
  recipientLabel: string;
  familyName: string;
  centerLabel: string;
  formUrl: string;
  intent?: PaymentMethodRequestIntent;
}) {
  if (intent === "instant_bank_verification") {
    return [
      `Hi ${recipientLabel || "there"},`,
      "",
      `${centerLabel} is asking you to instantly verify a bank account for ${familyName}'s tuition payments in The BEE Suite.`,
      "Use the secure link below to log in through the bank verification handoff. This verifies the account now instead of waiting for microdeposits.",
      "You can also pay an open tuition invoice from the same form with Instant Bank Login or a debit/credit card if a payment is due today.",
      "The BEE Suite does not receive or store your bank login, full account number, or full card details. Payment information is handled by the secure payment processor.",
      "",
      `Verify your bank instantly: ${formUrl}`,
      "",
      "If you were not expecting this request, please contact the school before continuing.",
    ].join("\n");
  }

  return [
    `Hi ${recipientLabel || "there"},`,
    "",
    `${centerLabel} is asking you to complete tuition payment steps for ${familyName} in The BEE Suite.`,
    "This secure form lets you pay an open invoice, verify a bank account instantly with your bank login, or use a debit/credit card.",
    "If you want autopay, you can also save a verified bank account or card from the same form.",
    "The BEE Suite does not store your full card or bank details. Payment information is saved through the secure payment processor.",
    "",
    `Open your secure tuition payment form: ${formUrl}`,
    "",
    "If you were not expecting this request, please contact the school before continuing.",
  ].join("\n");
}

export function buildPaymentMethodRequestNotificationBody(input: {
  familyName: string;
  formUrl: string;
  intent?: PaymentMethodRequestIntent;
}) {
  if (input.intent === "instant_bank_verification") {
    return `Please verify a bank account instantly for ${input.familyName}. Open your secure The BEE Suite bank verification form: ${input.formUrl}`;
  }
  return `Please complete tuition payment steps for ${input.familyName}. Open your secure The BEE Suite payment form: ${input.formUrl}`;
}
