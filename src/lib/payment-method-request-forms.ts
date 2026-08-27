import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { prisma } from "@/lib/prisma";

export const PAYMENT_METHOD_REQUEST_TOKEN_VERSION = 1;
export const PAYMENT_METHOD_REQUEST_TOKEN_TTL_DAYS = 14;
export const PAYMENT_METHOD_REQUEST_NOTIFICATION_TYPE = "payment_method_form";
export const PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE = "payment_method_request_email";
export type PaymentMethodRequestIntent = "payment_steps" | "instant_bank_verification" | "payment_method_reauthorization";

export type PaymentMethodRequestTokenPayload = {
  v: typeof PAYMENT_METHOD_REQUEST_TOKEN_VERSION;
  familyId: string;
  centerId: string;
  tenantId: string;
  email: string;
  iat: number;
  exp: number;
  nonce: string;
  intent?: PaymentMethodRequestIntent;
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
  intent?: PaymentMethodRequestIntent;
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
    ...(input.intent ? { intent: input.intent } : {}),
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
    const validIntent = payload.intent === undefined || ["payment_steps", "instant_bank_verification", "payment_method_reauthorization"].includes(payload.intent);
    if (
      payload.v !== PAYMENT_METHOD_REQUEST_TOKEN_VERSION ||
      !payload.familyId ||
      !payload.centerId ||
      !payload.tenantId ||
      !payload.email ||
      !isValidPaymentRequestEmail(payload.email) ||
      typeof payload.exp !== "number" ||
      !validIntent
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

export function buildPaymentMethodRequestShortFormUrl(appBaseUrl: string, code: string) {
  return `${appBaseUrl.replace(/\/+$/, "")}/payment-method-form/r/${encodeURIComponent(code)}`;
}

export function createPaymentMethodRequestShortCode() {
  return base64Url(randomBytes(18));
}

export async function storePaymentMethodRequestShortLink(input: {
  code?: string;
  token: string;
  tenantId: string;
  centerId: string;
  familyId: string;
  email: string;
  expiresAt: Date;
}) {
  const code = input.code || createPaymentMethodRequestShortCode();
  await prisma.$executeRaw`
    insert into "PaymentMethodRequestLink" ("code", "token", "tenantId", "centerId", "familyId", "email", "expiresAt")
    values (${code}, ${input.token}, ${input.tenantId}, ${input.centerId}, ${input.familyId}, ${normalizePaymentRequestEmail(input.email)}, ${input.expiresAt})
  `;
  return code;
}

export async function resolvePaymentMethodRequestShortLink(code: unknown, now = new Date()) {
  const normalized = clean(code);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(normalized)) return null;
  const rows = await prisma.$queryRaw<Array<{ token: string; expiresAt: Date }>>`
    select "token", "expiresAt"
    from "PaymentMethodRequestLink"
    where "code" = ${normalized}
    limit 1
  `;
  const link = rows[0];
  if (!link || new Date(link.expiresAt).getTime() < now.getTime()) return null;
  return link.token;
}

export function getPaymentMethodRequestAppBaseUrl(requestUrl?: string) {
  return getSecurePaymentAppBaseUrl(requestUrl);
}

export function buildPublicPaymentBrandAssetUrl(appBaseUrl: string, assetPath?: string | null) {
  const path = clean(assetPath);
  if (!path) return null;
  try {
    const url = new URL(path, `${appBaseUrl.replace(/\/+$/, "")}/`);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function buildPaymentMethodRequestFocusedFormUrl(appBaseUrl: string, token: string, intent: PaymentMethodRequestIntent) {
  const formUrl = buildPaymentMethodRequestFormUrl(appBaseUrl, token);
  if (intent !== "instant_bank_verification") return formUrl;
  return `${formUrl}?focus=instant-bank`;
}

export function extractFirstUrl(value: string) {
  return value.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null;
}

export function paymentMethodRequestBrandSender(centerLabel: string) {
  return `${clean(centerLabel) || "Your school"} via The BEE Suite`;
}

export function buildPaymentMethodRequestEmailSubject(input: {
  centerLabel: string;
  intent?: PaymentMethodRequestIntent;
}) {
  const sender = paymentMethodRequestBrandSender(input.centerLabel);
  if (input.intent === "instant_bank_verification") {
    return `${sender}: secure bank account verification requested`;
  }
  if (input.intent === "payment_method_reauthorization") {
    return `${sender}: securely update your tuition payment method`;
  }
  return `${sender}: tuition payment options`;
}

export function buildPaymentMethodRequestCheckoutBranding(input: {
  centerLabel: string;
  familyName: string;
  intent?: PaymentMethodRequestIntent;
}) {
  const sender = paymentMethodRequestBrandSender(input.centerLabel);
  const familyName = clean(input.familyName) || "your family";
  const instantBank = input.intent === "instant_bank_verification";
  const reauthorization = input.intent === "payment_method_reauthorization";
  return {
    submitMessage: reauthorization
      ? `Securely save a replacement payment method for future tuition payments. No payment will be charged today, and your existing autopay choice will not change.`
      : instantBank
      ? `Connect your bank account through this secure form for future tuition payments in The BEE Suite. This does not turn on autopay. The BEE Suite does not store your bank sign-in credentials or full account number.`
      : `${sender} uses this secure form for tuition payments. The BEE Suite does not store full card or bank details.`,
    afterSubmitMessage: `You will return to The BEE Suite after this secure step is complete.`,
    productDescription: `The BEE Suite tuition payment for ${familyName}.`,
    paymentDescription: `The BEE Suite tuition payment for ${familyName}.`,
    setupDescription: `Payment method setup for ${familyName}.`,
  };
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
      `${paymentMethodRequestBrandSender(centerLabel)} is asking you to verify a bank account for ${familyName}'s future tuition payments.`,
      "Connect securely through your bank using the BEE Suite link below. Stripe will try instant verification first. If your bank cannot complete it, Stripe may ask for manual account details and a small microdeposit verification; follow the secure instructions Stripe provides.",
      "Verifying a bank account does not turn on autopay. You can choose autopay separately in the Parent Portal or with your school.",
      "You can also pay an open tuition invoice from the same form using a bank account or a debit or credit card if a payment is due today.",
      "The BEE Suite and your school do not receive or store your bank sign-in credentials, full account number, or full card details. Stripe provides the secure payment form and may appear during setup.",
      "",
      `Verify your bank account in The BEE Suite: ${formUrl}`,
      "",
      "If you were not expecting this request, please contact the school before continuing.",
    ].join("\n");
  }
  if (intent === "payment_method_reauthorization") {
    return [
      `Hi ${recipientLabel || "there"},`, "",
      `${paymentMethodRequestBrandSender(centerLabel)} has updated its secure tuition payment account. Please use the BEE Suite link below to save a replacement payment method for ${familyName}.`,
      "No payment will be charged today, and your existing autopay choice will remain unchanged.",
      "The BEE Suite and your school do not store full card or bank details. Stripe provides the secure form.", "",
      `Update your payment method in The BEE Suite: ${formUrl}`, "",
      "If you were not expecting this request, please contact the school before continuing.",
    ].join("\n");
  }

  return [
    `Hi ${recipientLabel || "there"},`,
    "",
    `${paymentMethodRequestBrandSender(centerLabel)} is asking you to review tuition payment options for ${familyName}.`,
    "Open the BEE Suite link below to pay an open invoice using a debit or credit card or connect a bank account.",
    "Saving a payment method does not turn on autopay. You can choose autopay separately in the Parent Portal or with your school.",
    "The BEE Suite and your school do not store your full card or bank details. Stripe provides the secure payment form and may appear during setup or payment.",
    "",
    `Review tuition payment options in The BEE Suite: ${formUrl}`,
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
    return `Verify a bank account for ${input.familyName}'s future tuition payments. This does not turn on autopay: ${input.formUrl}`;
  }
  if (input.intent === "payment_method_reauthorization") {
    return `Securely update the payment method for ${input.familyName}. No payment will be charged and your autopay choice will not change: ${input.formUrl}`;
  }
  return `Review tuition payment options for ${input.familyName} in The BEE Suite: ${input.formUrl}`;
}
