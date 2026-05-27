import { createHmac, timingSafeEqual } from "node:crypto";

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

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY;
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

function stripeHeaders(contentType: "json" | "form", apiVersion = STRIPE_API_VERSION) {
  const apiKey = stripeSecretKey();
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
      basisPointsEnv("STRIPE_PAYMENT_OPS_FEE_BPS"),
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
      basisPointsEnv("STRIPE_ACH_PROCESSING_RECOVERY_BPS", 80),
      nonNegativeIntEnv("STRIPE_ACH_PROCESSING_RECOVERY_FIXED_CENTS"),
      nonNegativeIntEnv("STRIPE_ACH_PROCESSING_RECOVERY_MAX_CENTS", 500),
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
  const waivedTenantSlugs = listEnv("STRIPE_PAYMENT_OPS_FEE_WAIVED_TENANT_SLUGS", ["kid-city-usa"]);
  const waivedBrandSlugs = listEnv("STRIPE_PAYMENT_OPS_FEE_WAIVED_BRAND_SLUGS", ["kid-city-usa"]);
  const waivedNames = listEnv("STRIPE_PAYMENT_OPS_FEE_WAIVED_NAMES", ["kid city usa"]);
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
  const fields = asRecord(customFields);
  const accountId = fields.stripeConnectedAccountId || fields.stripeConnectAccountId;
  return typeof accountId === "string" && accountId.startsWith("acct_") ? accountId : null;
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
  const currentDue = asStringArray(requirements.currently_due);
  const eventuallyDue = asStringArray(requirements.eventually_due);
  const entries = Array.isArray(requirements.entries)
    ? requirements.entries
        .map((entry) => asRecord(entry).field)
        .filter((field): field is string => typeof field === "string")
    : [];
  const requirementFields = Array.from(new Set([...currentDue, ...eventuallyDue, ...entries]));
  const recipientTransferStatus = clean(stripeTransfers.status) || null;
  const merchantCapabilityStatus = clean(cardPayments.status) || null;

  return {
    id: clean(account.id),
    displayName: clean(account.display_name) || clean(account.displayName) || null,
    dashboard: clean(account.dashboard) || null,
    chargesEnabled: account.charges_enabled === true || merchantCapabilityStatus === "active",
    payoutsEnabled: account.payouts_enabled === true || recipientTransferStatus === "active",
    detailsSubmitted: requirementFields.length === 0,
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
  fromName = "The Bee Suite",
}: {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string | null;
  fromName?: string;
}): Promise<IntegrationSendResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;
  const recipients = uniqueEmails(to);

  if (!apiKey || !from || !recipients.length) {
    return { ok: false, configured: false, provider: "sendgrid", error: "SendGrid is not configured." };
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: recipients.map((email) => ({ email })) }],
      from: { email: from, name: fromName },
      reply_to: replyTo && isEmail(replyTo) ? { email: replyTo } : undefined,
      subject,
      content: [{ type: "text/plain", value: text }],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return { ok: false, configured: true, provider: "sendgrid", error: `SendGrid returned ${response.status}.` };
  }

  return { ok: true, configured: true, provider: "sendgrid" };
}

export async function sendSms({
  to,
  body,
}: {
  to: string;
  body: string;
}): Promise<IntegrationSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const normalizedTo = clean(to);

  if (!accountSid || !authToken || (!from && !messagingServiceSid) || !normalizedTo) {
    return { ok: false, configured: false, provider: "twilio", error: "Twilio is not configured." };
  }

  const form = new URLSearchParams({
    To: normalizedTo,
    Body: body,
  });

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
}): Promise<IntegrationSendResult> {
  const apiKey = stripeSecretKey();
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
    body.set("line_items[1][price_data][product_data][name]", "Payment processing recovery");
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

export async function createStripeConnectedAccount({
  businessName,
  email,
  phone,
  city,
  state,
  postalCode,
  address,
}: {
  businessName: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  address?: string | null;
}): Promise<IntegrationSendResult & { account?: StripeConnectedAccountSnapshot }> {
  const apiKey = stripeSecretKey();
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
    headers: stripeHeaders("json", STRIPE_ACCOUNTS_V2_API_VERSION),
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
}: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<IntegrationSendResult> {
  const apiKey = stripeSecretKey();
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Stripe is not configured." };
  }

  const response = await fetch("https://api.stripe.com/v2/core/account_links", {
    method: "POST",
    headers: stripeHeaders("json", STRIPE_ACCOUNTS_V2_API_VERSION),
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
): Promise<IntegrationSendResult & { account?: StripeConnectedAccountSnapshot }> {
  const apiKey = stripeSecretKey();
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
