import { createHmac, timingSafeEqual } from "node:crypto";
import { credentialEnvValue, getTenantIntegrationCredentialMap } from "@/lib/integration-credentials";
import {
  PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION,
  PAYMENT_PROCESSING_RECOVERY_LABEL,
} from "@/lib/payment-disclosures";
import { readStripeConnectAccountId } from "@/lib/stripe-connect-readiness";

export type IntegrationSendResult = {
  ok: boolean;
  configured: boolean;
  provider: string;
  id?: string;
  url?: string;
  error?: string;
};

const STRIPE_API_VERSION = "2026-04-22.dahlia";
const STRIPE_ACCOUNTS_V2_API_VERSION = process.env.STRIPE_ACCOUNTS_V2_API_VERSION || "2026-04-22.dahlia";

export type StripePaymentMethodCategory = "default" | "ach" | "card" | "link_bank";

export type StripeCheckoutFeePolicy = {
  paymentMethodCategory?: StripePaymentMethodCategory;
  waiveBeeSuitePaymentOperationsFee?: boolean;
};

export type StripeSetupIntentSnapshot = {
  id: string;
  customerId?: string | null;
  paymentMethodId?: string | null;
  status?: string | null;
  raw?: unknown;
};

export type StripeConnectedAccountSnapshot = {
  id: string;
  displayName?: string | null;
  dashboard?: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  merchantCapabilityStatus?: string | null;
  recipientTransferStatus?: string | null;
  requirementFields: string[];
  raw?: unknown;
};

type TenantCredentialRuntimeInput = {
  tenantId?: string | null;
  credentials?: Record<string, string>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function resolveTenantCredentials(
  provider: "stripe" | "sendgrid" | "twilio",
  input: TenantCredentialRuntimeInput = {},
) {
  if (input.credentials) return input.credentials;
  return getTenantIntegrationCredentialMap(input.tenantId, provider);
}

export async function getStripeSecretKey(input: TenantCredentialRuntimeInput = {}) {
  const credentials = await resolveTenantCredentials("stripe", input);
  return credentialEnvValue(credentials, "STRIPE_SECRET_KEY");
}

export async function getStripeWebhookSecret(input: TenantCredentialRuntimeInput = {}) {
  const credentials = await resolveTenantCredentials("stripe", input);
  return credentialEnvValue(credentials, "STRIPE_WEBHOOK_SECRET");
}

function nonNegativeIntEnv(name: string, fallback = 0) {
  const parsed = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function basisPointsEnv(name: string, fallback = 0) {
  return Math.min(nonNegativeIntEnv(name, fallback), 10_000);
}

function boolEnv(name: string, fallback = false) {
  const value = process.env[name];
  if (!value) return fallback;
  return value === "true" || value === "1";
}

function listEnv(name: string, fallback: string[] = []) {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeKey(value?: string | null) {
  return clean(value).toLowerCase();
}

function feeFromParts(amountCents: number, bps: number, fixedCents: number, maxCents = 0) {
  const percentageFee = Math.round(Math.max(0, amountCents) * (Math.min(Math.max(0, bps), 10_000) / 10_000));
  const fee = Math.max(0, percentageFee + Math.max(0, fixedCents));
  return maxCents > 0 ? Math.min(fee, maxCents) : fee;
}

function grossedUpFee(amountCents: number, bps: number, fixedCents: number, maxCents = 0) {
  const safeAmountCents = Math.max(0, amountCents);
  const rate = Math.min(Math.max(0, bps), 9_900) / 10_000;
  const fee = Math.ceil((safeAmountCents + Math.max(0, fixedCents)) / (1 - rate) - safeAmountCents);
  return maxCents > 0 ? Math.min(Math.max(0, fee), maxCents) : Math.max(0, fee);
}

function stripeHeaders(apiKey: string, contentType: "json" | "form", apiVersion = STRIPE_API_VERSION) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Stripe-Version": apiVersion,
    "Content-Type": contentType === "json" ? "application/json" : "application/x-www-form-urlencoded",
  };
}

export function getStripeApplicationFeeBps() {
  return basisPointsEnv("STRIPE_APPLICATION_FEE_BPS");
}

export function getStripeApplicationFeeAmount(amountCents: number) {
  const percentageFee = Math.round(amountCents * (getStripeApplicationFeeBps() / 10_000));
  const fixedFee = nonNegativeIntEnv("STRIPE_APPLICATION_FEE_FIXED_CENTS");
  const fee = percentageFee + fixedFee;
  return Math.max(0, Math.min(fee, amountCents));
}

export function getStripePaymentOperationsFeeAmount(amountCents: number, waived = false) {
  if (waived) return 0;
  return Math.min(
    feeFromParts(
      amountCents,
      basisPointsEnv("STRIPE_PAYMENT_OPS_FEE_BPS", 150),
      nonNegativeIntEnv("STRIPE_PAYMENT_OPS_FEE_FIXED_CENTS"),
      nonNegativeIntEnv("STRIPE_PAYMENT_OPS_FEE_MAX_CENTS"),
    ),
    Math.max(0, amountCents),
  );
}

export function getStripeParentSurchargeBps() {
  return basisPointsEnv("STRIPE_PARENT_SURCHARGE_BPS");
}

export function getStripeParentSurchargeAmount(amountCents: number) {
  const percentageFee = Math.round(amountCents * (getStripeParentSurchargeBps() / 10_000));
  const fixedFee = nonNegativeIntEnv("STRIPE_PARENT_SURCHARGE_FIXED_CENTS");
  const maxFee = nonNegativeIntEnv("STRIPE_PARENT_SURCHARGE_MAX_CENTS");
  const fee = percentageFee + fixedFee;
  return Math.max(0, maxFee > 0 ? Math.min(fee, maxFee) : fee);
}

export function getStripePaymentMethodConfigurationId(paymentMethodCategory: StripePaymentMethodCategory) {
  if (paymentMethodCategory === "ach") return clean(process.env.STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID);
  if (paymentMethodCategory === "card") return clean(process.env.STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID);
  if (paymentMethodCategory === "link_bank") return clean(process.env.STRIPE_LINK_BANK_PAYMENT_METHOD_CONFIGURATION_ID);
  return "";
}

export function getStripeProcessingRecoveryAmount(amountCents: number, paymentMethodCategory: StripePaymentMethodCategory) {
  if (paymentMethodCategory === "ach") {
    return feeFromParts(
      amountCents,
      basisPointsEnv("STRIPE_ACH_PROCESSING_RECOVERY_BPS"),
      nonNegativeIntEnv("STRIPE_ACH_PROCESSING_RECOVERY_FIXED_CENTS"),
      nonNegativeIntEnv("STRIPE_ACH_PROCESSING_RECOVERY_MAX_CENTS"),
    );
  }

  if (paymentMethodCategory === "card") {
    const bps = basisPointsEnv("STRIPE_CARD_PROCESSING_RECOVERY_BPS", 290);
    const fixedCents = nonNegativeIntEnv("STRIPE_CARD_PROCESSING_RECOVERY_FIXED_CENTS", 30);
    const maxCents = nonNegativeIntEnv("STRIPE_CARD_PROCESSING_RECOVERY_MAX_CENTS");
    if (boolEnv("STRIPE_CARD_PROCESSING_RECOVERY_GROSS_UP", true)) {
      return grossedUpFee(amountCents, bps, fixedCents, maxCents);
    }
    return feeFromParts(amountCents, bps, fixedCents, maxCents);
  }

  if (paymentMethodCategory === "link_bank") {
    return grossedUpFee(
      amountCents,
      basisPointsEnv("STRIPE_LINK_BANK_PROCESSING_RECOVERY_BPS", 260),
      nonNegativeIntEnv("STRIPE_LINK_BANK_PROCESSING_RECOVERY_FIXED_CENTS", 30),
      nonNegativeIntEnv("STRIPE_LINK_BANK_PROCESSING_RECOVERY_MAX_CENTS"),
    );
  }

  return getStripeParentSurchargeAmount(amountCents);
}

export function shouldWaiveStripePaymentOperationsFee({
  tenantSlug,
  tenantName,
  brandSlug,
  brandName,
}: {
  tenantSlug?: string | null;
  tenantName?: string | null;
  brandSlug?: string | null;
  brandName?: string | null;
}) {
  const waivedTenantSlugs = listEnv("STRIPE_PAYMENT_OPS_FEE_WAIVED_TENANT_SLUGS");
  const waivedBrandSlugs = listEnv("STRIPE_PAYMENT_OPS_FEE_WAIVED_BRAND_SLUGS");
  const waivedNames = listEnv("STRIPE_PAYMENT_OPS_FEE_WAIVED_NAMES");
  const tenantSlugKey = normalizeKey(tenantSlug);
  const brandSlugKey = normalizeKey(brandSlug);
  const tenantNameKey = normalizeKey(tenantName);
  const brandNameKey = normalizeKey(brandName);

  return Boolean(
    (tenantSlugKey && waivedTenantSlugs.includes(tenantSlugKey)) ||
    (brandSlugKey && waivedBrandSlugs.includes(brandSlugKey)) ||
    (tenantNameKey && waivedNames.includes(tenantNameKey)) ||
    (brandNameKey && waivedNames.includes(brandNameKey))
  );
}

export function getStripeCheckoutAmounts(invoiceAmountCents: number, policy: StripeCheckoutFeePolicy = {}) {
  const safeInvoiceAmountCents = Math.max(0, invoiceAmountCents);
  const paymentMethodCategory = policy.paymentMethodCategory || "default";
  const parentProcessingRecoveryAmountCents = getStripeProcessingRecoveryAmount(
    safeInvoiceAmountCents,
    paymentMethodCategory,
  );
  const beeSuitePaymentOperationsFeeAmountCents = getStripePaymentOperationsFeeAmount(
    safeInvoiceAmountCents,
    policy.waiveBeeSuitePaymentOperationsFee,
  );
  const checkoutTotalCents = safeInvoiceAmountCents + parentProcessingRecoveryAmountCents;
  const applicationFeeAmountCents = Math.min(
    getStripeApplicationFeeAmount(safeInvoiceAmountCents) +
      parentProcessingRecoveryAmountCents +
      beeSuitePaymentOperationsFeeAmountCents,
    checkoutTotalCents,
  );

  return {
    invoiceAmountCents: safeInvoiceAmountCents,
    paymentMethodCategory,
    parentSurchargeAmountCents: parentProcessingRecoveryAmountCents,
    parentProcessingRecoveryAmountCents,
    beeSuitePaymentOperationsFeeAmountCents,
    checkoutTotalCents,
    applicationFeeAmountCents,
  };
}

export function readStripeConnectedAccountId(customFields: unknown) {
  return readStripeConnectAccountId(customFields);
}

function normalizeStripeAccount(json: unknown): StripeConnectedAccountSnapshot {
  const account = asRecord(json);
  const configuration = asRecord(account.configuration);
  const merchant = asRecord(configuration.merchant);
  const merchantCapabilities = asRecord(merchant.capabilities);
  const cardPayments = asRecord(merchantCapabilities.card_payments);
  const recipient = asRecord(configuration.recipient);
  const recipientCapabilities = asRecord(recipient.capabilities);
  const stripeBalance = asRecord(recipientCapabilities.stripe_balance);
  const stripeTransfers = asRecord(stripeBalance.stripe_transfers);
  const requirements = asRecord(account.requirements);
  const futureRequirements = asRecord(account.future_requirements || account.futureRequirements);
  const currentDue = asStringArray(requirements.currently_due);
  const eventuallyDue = asStringArray(requirements.eventually_due);
  const futureCurrentDue = asStringArray(futureRequirements.currently_due);
  const futureEventuallyDue = asStringArray(futureRequirements.eventually_due);
  const entries = Array.isArray(requirements.entries)
    ? requirements.entries
        .map((entry) => asRecord(entry).field)
        .filter((field): field is string => typeof field === "string")
    : [];
  const futureEntries = Array.isArray(futureRequirements.entries)
    ? futureRequirements.entries
        .map((entry) => asRecord(entry).field)
        .filter((field): field is string => typeof field === "string")
    : [];
  const requirementFields = Array.from(new Set([
    ...currentDue,
    ...eventuallyDue,
    ...futureCurrentDue,
    ...futureEventuallyDue,
    ...entries,
    ...futureEntries,
  ]));
  const recipientTransferStatus = clean(stripeTransfers.status) || null;
  const merchantCapabilityStatus = clean(cardPayments.status) || null;

  return {
    id: clean(account.id),
    displayName: clean(account.display_name) || clean(account.displayName) || null,
    dashboard: clean(account.dashboard) || null,
    chargesEnabled: account.charges_enabled === true || merchantCapabilityStatus === "active",
    payoutsEnabled: account.payouts_enabled === true || recipientTransferStatus === "active",
    detailsSubmitted: account.details_submitted === true || account.detailsSubmitted === true || requirementFields.length === 0,
    merchantCapabilityStatus,
    recipientTransferStatus,
    requirementFields,
    raw: json,
  };
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function uniqueEmails(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(isEmail)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function sendEmail({
  to,
  subject,
  text,
  replyTo,
  fromName = "The BEE Suite",
  categories,
  customArgs,
  tenantId,
}: {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string | null;
  fromName?: string;
  categories?: string[];
  customArgs?: Record<string, string | number | boolean | null | undefined>;
  tenantId?: string | null;
}): Promise<IntegrationSendResult> {
  const tenantCredentials = await getTenantIntegrationCredentialMap(tenantId, "sendgrid");
  const apiKey = credentialEnvValue(tenantCredentials, "SENDGRID_API_KEY");
  const from = credentialEnvValue(tenantCredentials, "SENDGRID_FROM_EMAIL");
  const recipients = uniqueEmails(to);

  if (!apiKey || !from || !recipients.length) {
    return { ok: false, configured: false, provider: "sendgrid", error: "SendGrid is not configured." };
  }

  let response: Response;
  try {
    response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: recipients.map((email) => ({
          to: [{ email }],
          custom_args: customArgs
            ? Object.fromEntries(
                Object.entries(customArgs)
                  .filter(([, value]) => value !== null && value !== undefined)
                  .map(([key, value]) => [key, String(value)]),
              )
            : undefined,
        })),
        from: { email: from, name: fromName },
        reply_to: replyTo && isEmail(replyTo) ? { email: replyTo } : undefined,
        subject,
        categories: categories?.slice(0, 10),
        content: [{ type: "text/plain", value: text }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return {
      ok: false,
      configured: true,
      provider: "sendgrid",
      error: error instanceof Error ? error.message : "SendGrid request failed.",
    };
  }

  if (!response.ok) {
    return { ok: false, configured: true, provider: "sendgrid", error: `SendGrid returned ${response.status}.` };
  }

  return { ok: true, configured: true, provider: "sendgrid", id: response.headers.get("x-message-id") ?? undefined };
}

export async function sendSms({
  to,
  body,
  statusCallbackUrl,
  tenantId,
}: {
  to: string;
  body: string;
  statusCallbackUrl?: string | null;
  tenantId?: string | null;
}): Promise<IntegrationSendResult> {
  const tenantCredentials = await getTenantIntegrationCredentialMap(tenantId, "twilio");
  const accountSid = credentialEnvValue(tenantCredentials, "TWILIO_ACCOUNT_SID");
  const authToken = credentialEnvValue(tenantCredentials, "TWILIO_AUTH_TOKEN");
  const from = credentialEnvValue(tenantCredentials, "TWILIO_FROM_NUMBER");
  const messagingServiceSid = credentialEnvValue(tenantCredentials, "TWILIO_MESSAGING_SERVICE_SID");
  const normalizedTo = clean(to);

  if (!accountSid || !authToken || (!from && !messagingServiceSid) || !normalizedTo) {
    return { ok: false, configured: false, provider: "twilio", error: "Twilio is not configured." };
  }

  const form = new URLSearchParams({
    To: normalizedTo,
    Body: body,
  });
  if (statusCallbackUrl) {
    form.set("StatusCallback", statusCallbackUrl);
  }

  if (messagingServiceSid) {
    form.set("MessagingServiceSid", messagingServiceSid);
  } else if (from) {
    form.set("From", from);
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });

  const json = await response.json().catch(() => null) as { sid?: string; message?: string } | null;

  if (!response.ok) {
    return {
      ok: false,
      configured: true,
      provider: "twilio",
      error: json?.message || `Twilio returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "twilio", id: json?.sid };
}

export async function createStripeCheckoutSession({
  amountCents,
  invoiceAmountCents = amountCents,
  parentSurchargeAmountCents = 0,
  invoiceNumber,
  centerName,
  customerEmail,
  successUrl,
  cancelUrl,
  metadata,
  connectedAccountId,
  applicationFeeAmountCents = 0,
  paymentMethodConfigurationId,
  onBehalfOfConnectedAccount = false,
  idempotencyKey,
  tenantId,
  credentials,
}: {
  amountCents: number;
  invoiceAmountCents?: number;
  parentSurchargeAmountCents?: number;
  invoiceNumber: string;
  centerName?: string | null;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  connectedAccountId?: string | null;
  applicationFeeAmountCents?: number;
  paymentMethodConfigurationId?: string | null;
  onBehalfOfConnectedAccount?: boolean;
  idempotencyKey?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Stripe is not configured." };
  }

  const body = new URLSearchParams({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(invoiceAmountCents),
    "line_items[0][price_data][product_data][name]": `${centerName ? `${centerName} ` : ""}invoice ${invoiceNumber}`,
    client_reference_id: metadata.invoiceId || invoiceNumber,
  });

  if (parentSurchargeAmountCents > 0) {
    body.set("line_items[1][quantity]", "1");
    body.set("line_items[1][price_data][currency]", "usd");
    body.set("line_items[1][price_data][unit_amount]", String(parentSurchargeAmountCents));
    body.set("line_items[1][price_data][product_data][name]", PAYMENT_PROCESSING_RECOVERY_LABEL);
    body.set("line_items[1][price_data][product_data][description]", PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION);
  }

  if (customerEmail && isEmail(customerEmail)) {
    body.set("customer_email", customerEmail);
  }

  if (paymentMethodConfigurationId) {
    body.set("payment_method_configuration", paymentMethodConfigurationId);
  }

  if (connectedAccountId) {
    body.set("payment_intent_data[transfer_data][destination]", connectedAccountId);
    if (onBehalfOfConnectedAccount) {
      body.set("payment_intent_data[on_behalf_of]", connectedAccountId);
    }
    if (applicationFeeAmountCents > 0) {
      body.set("payment_intent_data[application_fee_amount]", String(Math.min(applicationFeeAmountCents, amountCents)));
    }
  }

  Object.entries(metadata).forEach(([key, value]) => {
    body.set(`metadata[${key}]`, value);
    body.set(`payment_intent_data[metadata][${key}]`, value);
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Stripe-Version": STRIPE_API_VERSION,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  const json = await response.json().catch(() => null) as { id?: string; url?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.url) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Stripe returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: json.id, url: json.url };
}

export async function createStripeCustomer({
  email,
  name,
  metadata,
  tenantId,
  credentials,
}: {
  email?: string | null;
  name?: string | null;
  metadata?: Record<string, string>;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Stripe is not configured." };
  }

  const body = new URLSearchParams();
  if (email && isEmail(email)) body.set("email", email);
  if (name) body.set("name", name);
  Object.entries(metadata ?? {}).forEach(([key, value]) => {
    body.set(`metadata[${key}]`, value);
  });

  const response = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: stripeHeaders(apiKey, "form"),
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Stripe returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: json.id };
}

export async function createStripeInvoice({
  customerId,
  amountCents,
  description,
  invoiceNumber,
  daysUntilDue = 15,
  metadata,
  sendInvoice = false,
  tenantId,
  credentials,
}: {
  customerId: string;
  amountCents: number;
  description: string;
  invoiceNumber: string;
  daysUntilDue?: number;
  metadata: Record<string, string>;
  sendInvoice?: boolean;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { hostedInvoiceUrl?: string | null; invoicePdf?: string | null }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Stripe is not configured." };
  }
  if (!customerId.startsWith("cus_")) {
    return { ok: false, configured: true, provider: "stripe", error: "A Stripe customer ID is required for corporate invoices." };
  }
  if (amountCents <= 0) {
    return { ok: false, configured: true, provider: "stripe", error: "Invoice amount must be greater than zero." };
  }

  const itemBody = new URLSearchParams({
    customer: customerId,
    amount: String(amountCents),
    currency: "usd",
    description,
  });
  Object.entries(metadata).forEach(([key, value]) => {
    itemBody.set(`metadata[${key}]`, value);
  });

  const itemResponse = await fetch("https://api.stripe.com/v1/invoiceitems", {
    method: "POST",
    headers: {
      ...stripeHeaders(apiKey, "form"),
      "Idempotency-Key": `${invoiceNumber}:item`,
    },
    body: itemBody,
    signal: AbortSignal.timeout(10_000),
  });
  const itemJson = await itemResponse.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!itemResponse.ok || !itemJson?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: itemJson?.error?.message || `Stripe returned ${itemResponse.status}.`,
    };
  }

  const invoiceBody = new URLSearchParams({
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: String(Math.max(1, Math.floor(daysUntilDue))),
    auto_advance: "false",
    description,
    number: invoiceNumber,
  });
  Object.entries(metadata).forEach(([key, value]) => {
    invoiceBody.set(`metadata[${key}]`, value);
  });

  const invoiceResponse = await fetch("https://api.stripe.com/v1/invoices", {
    method: "POST",
    headers: {
      ...stripeHeaders(apiKey, "form"),
      "Idempotency-Key": `${invoiceNumber}:invoice`,
    },
    body: invoiceBody,
    signal: AbortSignal.timeout(10_000),
  });
  const invoiceJson = await invoiceResponse.json().catch(() => null) as {
    id?: string;
    hosted_invoice_url?: string | null;
    invoice_pdf?: string | null;
    error?: { message?: string };
  } | null;
  if (!invoiceResponse.ok || !invoiceJson?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: invoiceJson?.error?.message || `Stripe returned ${invoiceResponse.status}.`,
    };
  }

  const finalizeResponse = await fetch(`https://api.stripe.com/v1/invoices/${invoiceJson.id}/finalize`, {
    method: "POST",
    headers: {
      ...stripeHeaders(apiKey, "form"),
      "Idempotency-Key": `${invoiceNumber}:finalize`,
    },
    body: new URLSearchParams({}),
    signal: AbortSignal.timeout(10_000),
  });
  const finalizedJson = await finalizeResponse.json().catch(() => null) as {
    id?: string;
    hosted_invoice_url?: string | null;
    invoice_pdf?: string | null;
    error?: { message?: string };
  } | null;
  if (!finalizeResponse.ok || !finalizedJson?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: finalizedJson?.error?.message || `Stripe returned ${finalizeResponse.status}.`,
    };
  }

  if (sendInvoice) {
    const sendResponse = await fetch(`https://api.stripe.com/v1/invoices/${finalizedJson.id}/send`, {
      method: "POST",
      headers: {
        ...stripeHeaders(apiKey, "form"),
        "Idempotency-Key": `${invoiceNumber}:send`,
      },
      body: new URLSearchParams({}),
      signal: AbortSignal.timeout(10_000),
    });
    const sentJson = await sendResponse.json().catch(() => null) as {
      id?: string;
      hosted_invoice_url?: string | null;
      invoice_pdf?: string | null;
      error?: { message?: string };
    } | null;
    if (!sendResponse.ok || !sentJson?.id) {
      return {
        ok: false,
        configured: true,
        provider: "stripe",
        error: sentJson?.error?.message || `Stripe returned ${sendResponse.status}.`,
      };
    }
    return {
      ok: true,
      configured: true,
      provider: "stripe",
      id: sentJson.id,
      url: sentJson.hosted_invoice_url || undefined,
      hostedInvoiceUrl: sentJson.hosted_invoice_url || null,
      invoicePdf: sentJson.invoice_pdf || null,
    };
  }

  return {
    ok: true,
    configured: true,
    provider: "stripe",
    id: finalizedJson.id,
    url: finalizedJson.hosted_invoice_url || undefined,
    hostedInvoiceUrl: finalizedJson.hosted_invoice_url || null,
    invoicePdf: finalizedJson.invoice_pdf || null,
  };
}

export async function createStripeSetupCheckoutSession({
  customerId,
  customerEmail,
  successUrl,
  cancelUrl,
  metadata,
  tenantId,
  credentials,
}: {
  customerId?: string | null;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Stripe is not configured." };
  }

  const body = new URLSearchParams({
    mode: "setup",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: metadata.billingAccountId || metadata.familyId || "payment-method-setup",
  });
  if (customerId) {
    body.set("customer", customerId);
  } else if (customerEmail && isEmail(customerEmail)) {
    body.set("customer_email", customerEmail);
  }
  Object.entries(metadata).forEach(([key, value]) => {
    body.set(`metadata[${key}]`, value);
    body.set(`setup_intent_data[metadata][${key}]`, value);
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: stripeHeaders(apiKey, "form"),
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; url?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.url) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Stripe returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: json.id, url: json.url };
}

export async function createStripeBillingPortalSession({
  customerId,
  returnUrl,
  tenantId,
  credentials,
}: {
  customerId: string;
  returnUrl: string;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Stripe is not configured." };
  }

  const body = new URLSearchParams({
    customer: customerId,
    return_url: returnUrl,
  });
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: stripeHeaders(apiKey, "form"),
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; url?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.url) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Stripe returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: json.id, url: json.url };
}

export async function retrieveStripeSetupIntent(setupIntentId: string, input: TenantCredentialRuntimeInput = {}): Promise<{
  ok: boolean;
  configured: boolean;
  provider: "stripe";
  setupIntent?: StripeSetupIntentSnapshot;
  error?: string;
}> {
  const apiKey = await getStripeSecretKey(input);
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Stripe is not configured." };
  }

  const response = await fetch(`https://api.stripe.com/v1/setup_intents/${encodeURIComponent(setupIntentId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Stripe-Version": STRIPE_API_VERSION,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as {
    id?: string;
    customer?: string | null;
    payment_method?: string | null;
    status?: string | null;
    error?: { message?: string };
  } | null;

  if (!response.ok || !json?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Stripe returned ${response.status}.`,
    };
  }

  return {
    ok: true,
    configured: true,
    provider: "stripe",
    setupIntent: {
      id: json.id,
      customerId: clean(json.customer) || null,
      paymentMethodId: clean(json.payment_method) || null,
      status: clean(json.status) || null,
      raw: json,
    },
  };
}

export async function createStripeConnectedAccount({
  businessName,
  email,
  phone,
  city,
  state,
  postalCode,
  address,
  tenantId,
  credentials,
}: {
  businessName: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  address?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { account?: StripeConnectedAccountSnapshot }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Stripe is not configured." };
  }

  const payload = {
    contact_email: email && isEmail(email) ? email : undefined,
    contact_phone: clean(phone) || undefined,
    display_name: businessName,
    dashboard: "express",
    identity: {
      business_details: {
        registered_name: businessName,
      },
      country: "us",
      entity_type: "company",
    },
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { requested: true },
        },
        support: {
          address: address || city || state || postalCode ? {
            country: "US",
            line1: clean(address) || undefined,
            city: clean(city) || undefined,
            state: clean(state) || undefined,
            postal_code: clean(postalCode) || undefined,
          } : undefined,
          email: email && isEmail(email) ? email : undefined,
          phone: clean(phone) || undefined,
        },
      },
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { requested: true },
          },
        },
      },
    },
    defaults: {
      currency: "usd",
      locales: ["en-US"],
      profile: {
        doing_business_as: businessName,
        product_description: "Childcare tuition, registration fees, deposits, and school account payouts.",
      },
      responsibilities: {
        fees_collector: "application",
        losses_collector: "application",
        requirements_collector: "stripe",
      },
    },
    include: ["configuration.merchant", "configuration.recipient", "defaults", "identity", "requirements"],
  };

  const response = await fetch("https://api.stripe.com/v2/core/accounts", {
    method: "POST",
    headers: stripeHeaders(apiKey, "json", STRIPE_ACCOUNTS_V2_API_VERSION),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Stripe returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: json.id, account: normalizeStripeAccount(json) };
}

export async function createStripeAccountLink({
  accountId,
  refreshUrl,
  returnUrl,
  tenantId,
  credentials,
}: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Stripe is not configured." };
  }

  const response = await fetch("https://api.stripe.com/v2/core/account_links", {
    method: "POST",
    headers: stripeHeaders(apiKey, "json", STRIPE_ACCOUNTS_V2_API_VERSION),
    body: JSON.stringify({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant", "recipient"],
          collection_options: {
            fields: "eventually_due",
            future_requirements: "include",
          },
          refresh_url: refreshUrl,
          return_url: returnUrl,
        },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { url?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.url) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Stripe returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: accountId, url: json.url };
}

export async function retrieveStripeConnectedAccount(
  accountId: string,
  input: TenantCredentialRuntimeInput = {},
): Promise<IntegrationSendResult & { account?: StripeConnectedAccountSnapshot }> {
  const apiKey = await getStripeSecretKey(input);
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Stripe is not configured." };
  }

  const params = new URLSearchParams();
  ["configuration.merchant", "configuration.recipient", "defaults", "identity", "requirements"].forEach((include) => {
    params.append("include[]", include);
  });

  const response = await fetch(`https://api.stripe.com/v2/core/accounts/${accountId}?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Stripe-Version": STRIPE_ACCOUNTS_V2_API_VERSION,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Stripe returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: json.id, account: normalizeStripeAccount(json) };
}

export function verifyStripeSignature({
  payload,
  signature,
  secret,
  toleranceSeconds = 300,
}: {
  payload: string;
  signature: string | null;
  secret: string;
  toleranceSeconds?: number;
}) {
  if (!signature) return false;

  const parts = signature.split(",").reduce<{ timestamp?: string; signatures: string[] }>((acc, part) => {
    const [key, ...rest] = part.split("=");
    const value = rest.join("=");
    if (key === "t") acc.timestamp = value;
    if (key === "v1" && value) acc.signatures.push(value);
    return acc;
  }, { signatures: [] });
  const timestamp = Number(parts.timestamp);
  if (!timestamp || !parts.signatures.length) return false;

  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  return parts.signatures.some((signed) => {
    const actualBuffer = Buffer.from(signed);
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  });
}
