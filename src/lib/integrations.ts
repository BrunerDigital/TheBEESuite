import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { credentialEnvValue, getTenantIntegrationCredentialMap } from "@/lib/integration-credentials";
import {
  PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION,
  PAYMENT_PROCESSING_RECOVERY_LABEL,
} from "@/lib/payment-disclosures";
import {
  invalidPaymentRedirectUrl,
  isSecurePaymentUrl,
} from "@/lib/payment-redirect-security";
import { readStripeConnectAccountId } from "@/lib/stripe-connect-readiness";
import {
  calculateStripeSchoolProcessingFeeAmount,
  type StripeSchoolProcessingFeeCategory,
} from "@/lib/stripe-school-processing-fees";

export type IntegrationSendResult = {
  ok: boolean;
  configured: boolean;
  provider: string;
  id?: string;
  url?: string;
  createdAt?: number | null;
  expiresAt?: number | null;
  status?: string | null;
  paymentStatus?: string | null;
  error?: string;
  providerStatus?: number;
  acceptanceUnknown?: boolean;
};

export type EmailAttachment = {
  filename: string;
  content: string;
  type?: string;
  disposition?: "attachment" | "inline";
};

const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || "2026-07-29.dahlia";
const STRIPE_ACCOUNTS_V2_API_VERSION = process.env.STRIPE_ACCOUNTS_V2_API_VERSION || STRIPE_API_VERSION;
const STRIPE_CONNECTED_ACCOUNT_INCLUDES = ["configuration.merchant", "configuration.recipient", "configuration.customer", "defaults", "requirements"];
const STRIPE_ACCOUNT_LINK_CONFIGURATION_KEYS = ["customer", "merchant", "recipient"] as const;
type StripeAccountLinkConfiguration = (typeof STRIPE_ACCOUNT_LINK_CONFIGURATION_KEYS)[number];
export const STRIPE_CHILD_CARE_MCC = "8351";
export const STRIPE_KID_CITY_STATEMENT_DESCRIPTOR = "KID CITY USA";

export type StripePaymentMethodCategory = StripeSchoolProcessingFeeCategory;
export type StripeBankAccountVerificationMethod = "automatic" | "instant";

export type StripeCheckoutFeePolicy = {
  paymentMethodCategory?: StripePaymentMethodCategory;
  waiveBeeSuitePaymentOperationsFee?: boolean;
  schoolPaysStripeFeesDirectly?: boolean;
};

export type StripeCheckoutBranding = {
  displayName?: string | null;
  logoUrl?: string | null;
  iconUrl?: string | null;
  submitMessage?: string | null;
  afterSubmitMessage?: string | null;
  productDescription?: string | null;
  paymentDescription?: string | null;
  setupDescription?: string | null;
};

const BEE_SUITE_CHECKOUT_DISPLAY_NAME = "The BEE Suite";
const BEE_SUITE_CHECKOUT_LOGO_URL = "https://thebeesuite.io/brand/the-bee-suite/app-icon-dark.png";
const BEE_SUITE_CHECKOUT_ICON_URL = "https://thebeesuite.io/brand/the-bee-suite/favicon-dark.png";
const BEE_SUITE_CHECKOUT_BACKGROUND_COLOR = "#111827";
const BEE_SUITE_CHECKOUT_BUTTON_COLOR = "#f4c430";
const BEE_SUITE_CHECKOUT_SUBMIT_MESSAGE = "This secure payment step is connected to The BEE Suite. The BEE Suite does not store full card or bank details.";
const BEE_SUITE_CHECKOUT_AFTER_SUBMIT_MESSAGE = "You will return to The BEE Suite after this secure step is complete.";

export type StripeSetupIntentSnapshot = {
  id: string;
  customerId?: string | null;
  paymentMethodId?: string | null;
  status?: string | null;
  raw?: unknown;
};

export type StripePaymentMethodSnapshot = {
  id: string;
  type: string | null;
  customerId: string | null;
  last4: string | null;
  brand: string | null;
  bankName: string | null;
  raw?: unknown;
};

export type StripePaymentIntentSnapshot = {
  id: string;
  amountCents?: number | null;
  status?: string | null;
  raw?: unknown;
};

export type StripeTerminalReaderSnapshot = {
  id: string;
  label: string | null;
  deviceType: string | null;
  status: string | null;
  locationId: string | null;
  actionStatus: string | null;
  actionFailureCode: string | null;
  actionFailureMessage: string | null;
  paymentIntentId: string | null;
  raw?: unknown;
};

export type StripeTerminalLocationSnapshot = {
  id: string;
  displayName: string | null;
  raw?: unknown;
};

export type StripeCheckoutSessionSnapshot = {
  id: string;
  url?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  paymentIntentId?: string | null;
  paymentIntentStatus?: string | null;
  amountTotalCents?: number | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  raw?: unknown;
};

export type StripeConnectedAccountSnapshot = {
  id: string;
  livemode: boolean;
  displayName?: string | null;
  dashboard?: string | null;
  configurations: StripeAccountLinkConfiguration[];
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  merchantCapabilityStatus?: string | null;
  recipientTransferStatus?: string | null;
  feesCollector?: "application" | "stripe" | null;
  lossesCollector?: "application" | "stripe" | null;
  requirementFields: string[];
  currentlyDueRequirementFields: string[];
  pendingVerificationFields: string[];
  raw?: unknown;
};

export type StripePayoutBankSnapshot = {
  id: string;
  bankName: string | null;
  last4: string | null;
  status: string | null;
  currency: string | null;
  country: string | null;
  defaultForCurrency: boolean;
};

export type StripeBalanceTransactionSnapshot = {
  id: string;
  type: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  sourceId: string | null;
  createdAt: string | null;
  availableOn: string | null;
};

export type StripePayoutSnapshot = {
  id: string;
  amountCents: number;
  status: string;
  createdAt: string | null;
  arrivalDate: string | null;
  failureCode: string | null;
};

type TenantCredentialRuntimeInput = {
  tenantId?: string | null;
  credentials?: Record<string, string>;
  connectedAccountId?: string | null;
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
  return (
    clean(credentialEnvValue(credentials, "STRIPE_WEBHOOK_SECRET")) ||
    clean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET) ||
    clean(process.env.STRIPE_PLATFORM_WEBHOOK_SECRET) ||
    clean(process.env.STRIPE_WEBHOOK_SECRET)
  );
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

function stripeHeaders(apiKey: string, contentType: "json" | "form", apiVersion = STRIPE_API_VERSION) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Stripe-Version": apiVersion,
    "Content-Type": contentType === "json" ? "application/json" : "application/x-www-form-urlencoded",
  };
}

function connectedStripeHeaders(
  apiKey: string,
  contentType: "json" | "form",
  connectedAccountId?: string | null,
  apiVersion = STRIPE_API_VERSION,
) {
  const headers = stripeHeaders(apiKey, contentType, apiVersion);
  const accountId = clean(connectedAccountId);
  return accountId.startsWith("acct_") ? { ...headers, "Stripe-Account": accountId } : headers;
}

export function getStripeApplicationFeeBps() {
  return basisPointsEnv("STRIPE_APPLICATION_FEE_BPS");
}

export function getStripeApplicationFeeAmount(amountCents: number) {
  // Legacy application-fee overrides are ignored. The complete BEE Suite fee
  // is the platform-wide 1% payment-operations fee calculated below.
  void amountCents;
  return 0;
}

export function getStripePaymentOperationsFeeAmount(amountCents: number, waived = false) {
  // Platform-wide policy: every location funds the 1% BEE Suite portion
  // from school proceeds. Legacy waiver and fee override settings are ignored.
  void waived;
  return Math.max(0, Math.round(Math.max(0, amountCents) * 0.01));
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

export function isStripeParentProcessingRecoveryApproved() {
  return boolEnv("STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED");
}

export function getStripeCardProcessingRecoveryBps() {
  return isStripeParentProcessingRecoveryApproved() ? basisPointsEnv("STRIPE_CARD_PROCESSING_RECOVERY_BPS", 290) : 0;
}

export function getStripeCardProcessingRecoveryFixedCents() {
  return isStripeParentProcessingRecoveryApproved() ? nonNegativeIntEnv("STRIPE_CARD_PROCESSING_RECOVERY_FIXED_CENTS", 30) : 0;
}

export function getStripePaymentMethodConfigurationId(paymentMethodCategory: StripePaymentMethodCategory) {
  if (paymentMethodCategory === "ach") return clean(process.env.STRIPE_ACH_PAYMENT_METHOD_CONFIGURATION_ID);
  if (paymentMethodCategory === "card") return clean(process.env.STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION_ID);
  return "";
}

export function requiresStripePaymentMethodConfiguration(paymentMethodCategory: StripePaymentMethodCategory) {
  return paymentMethodCategory === "ach" || paymentMethodCategory === "card";
}

function stripeCheckoutPaymentMethodTypes(paymentMethodCategory: StripePaymentMethodCategory) {
  if (paymentMethodCategory === "link_bank") return ["link"];
  if (paymentMethodCategory === "ach") return ["us_bank_account"];
  if (paymentMethodCategory === "card") return ["card"];
  return [];
}

function stripeSetupPaymentMethodTypes(paymentMethodCategory: StripePaymentMethodCategory) {
  if (paymentMethodCategory === "ach" || paymentMethodCategory === "link_bank") return ["us_bank_account"];
  if (paymentMethodCategory === "card") return ["card"];
  return [];
}

function checkoutSessionIdempotencyKey(baseKey: string | null | undefined, paymentMethodMode: string) {
  const key = clean(baseKey);
  if (!key) return null;
  return `${key}:${paymentMethodMode}`;
}

function stripeCheckoutText(value: unknown, maxLength: number) {
  const text = clean(value).replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...` : text;
}

function stripeCheckoutHttpsUrl(value: unknown) {
  const rawUrl = clean(value);
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function addStripeCheckoutBrandingParams(body: URLSearchParams, branding?: StripeCheckoutBranding | null) {
  const displayName = stripeCheckoutText(branding?.displayName, 80) || BEE_SUITE_CHECKOUT_DISPLAY_NAME;
  body.set("branding_settings[display_name]", displayName);
  body.set("branding_settings[background_color]", BEE_SUITE_CHECKOUT_BACKGROUND_COLOR);
  body.set("branding_settings[button_color]", BEE_SUITE_CHECKOUT_BUTTON_COLOR);
  body.set("branding_settings[border_style]", "rounded");
  body.set("branding_settings[font_family]", "source_sans_pro");

  const logoUrl = stripeCheckoutHttpsUrl(branding?.logoUrl) || BEE_SUITE_CHECKOUT_LOGO_URL;
  const iconUrl = stripeCheckoutHttpsUrl(branding?.iconUrl) || BEE_SUITE_CHECKOUT_ICON_URL;
  if (logoUrl) {
    body.set("branding_settings[logo][type]", "url");
    body.set("branding_settings[logo][url]", logoUrl);
  }
  if (iconUrl) {
    body.set("branding_settings[icon][type]", "url");
    body.set("branding_settings[icon][url]", iconUrl);
  }

  const submitMessage = stripeCheckoutText(branding?.submitMessage, 255) || BEE_SUITE_CHECKOUT_SUBMIT_MESSAGE;
  if (submitMessage) body.set("custom_text[submit][message]", submitMessage);

  const afterSubmitMessage = stripeCheckoutText(branding?.afterSubmitMessage, 255) || BEE_SUITE_CHECKOUT_AFTER_SUBMIT_MESSAGE;
  if (afterSubmitMessage) body.set("custom_text[after_submit][message]", afterSubmitMessage);
}

function addIndexedParams(body: URLSearchParams, key: string, values: string[]) {
  values.forEach((value, index) => {
    body.set(`${key}[${index}]`, value);
  });
}

function isMissingPaymentMethodConfigurationError(json: unknown) {
  const error = asRecord(asRecord(json).error);
  const message = clean(error.message);
  const param = clean(error.param);
  return param === "payment_method_configuration" || message.includes("No such payment_method_configuration");
}

function isInvalidPaymentMethodTypeError(json: unknown) {
  const error = asRecord(asRecord(json).error);
  const message = clean(error.message).toLowerCase();
  const param = clean(error.param);
  return param.startsWith("payment_method_types") ||
    (message.includes("payment method type provided") && message.includes("invalid")) ||
    message.includes("no valid payment method types") ||
    (message.includes("must activate") && message.includes("payment method")) ||
    (message.includes("payment method") && message.includes("compatible"));
}

export function getStripeProcessingRecoveryAmount(amountCents: number, paymentMethodCategory: StripePaymentMethodCategory) {
  // Approved platform-wide policy: schools absorb every Stripe processor fee.
  // Parent charges must equal the eligible parent-responsible principal.
  void amountCents;
  void paymentMethodCategory;
  return 0;
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
  void tenantSlug;
  void tenantName;
  void brandSlug;
  void brandName;
  return false;
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
  const schoolProcessingFeeAmountCents = policy.schoolPaysStripeFeesDirectly
    ? 0
    : calculateStripeSchoolProcessingFeeAmount(safeInvoiceAmountCents, paymentMethodCategory);
  const checkoutTotalCents = safeInvoiceAmountCents + parentProcessingRecoveryAmountCents;
  const applicationFeeAmountCents = Math.min(
    getStripeApplicationFeeAmount(safeInvoiceAmountCents) +
      parentProcessingRecoveryAmountCents +
      schoolProcessingFeeAmountCents +
      beeSuitePaymentOperationsFeeAmountCents,
    checkoutTotalCents,
  );

  return {
    invoiceAmountCents: safeInvoiceAmountCents,
    paymentMethodCategory,
    parentSurchargeAmountCents: parentProcessingRecoveryAmountCents,
    parentProcessingRecoveryAmountCents,
    schoolProcessingFeeAmountCents,
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
  const defaults = asRecord(account.defaults);
  const responsibilities = asRecord(defaults.responsibilities);
  const controller = asRecord(account.controller);
  const legacyStripeDashboard = asRecord(controller.stripe_dashboard);
  const controllerFees = asRecord(controller.fees);
  const controllerLosses = asRecord(controller.losses);
  const configuration = asRecord(account.configuration);
  const configurations = STRIPE_ACCOUNT_LINK_CONFIGURATION_KEYS.filter((key) => {
    const value = configuration[key];
    return value !== null && typeof value === "object" && !Array.isArray(value);
  });
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
  const entryRecords = Array.isArray(requirements.entries) ? requirements.entries.map(asRecord) : [];
  const entries = entryRecords
    .map((entry) => clean(entry.field) || clean(entry.description))
    .filter((field): field is string => typeof field === "string");
  const currentlyDueEntries = entryRecords
    .filter((entry) => {
      const status = clean(asRecord(entry.minimum_deadline).status);
      return clean(entry.awaiting_action_from) === "user" && (status === "currently_due" || status === "past_due");
    })
    .map((entry) => clean(entry.field) || clean(entry.description))
    .filter((field): field is string => typeof field === "string");
  const pendingVerificationEntries = entryRecords
    .filter((entry) => clean(entry.awaiting_action_from) === "stripe")
    .map((entry) => clean(entry.field) || clean(entry.description))
    .filter((field): field is string => typeof field === "string");
  const pendingVerification = asStringArray(requirements.pending_verification);
  const futureEntries = Array.isArray(futureRequirements.entries)
    ? futureRequirements.entries
        .map((entry) => clean(asRecord(entry).field) || clean(asRecord(entry).description))
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
  const currentlyDueRequirementFields = Array.from(new Set([...currentDue, ...currentlyDueEntries]));
  const pendingVerificationFields = Array.from(new Set([...pendingVerification, ...pendingVerificationEntries]));
  const recipientTransferStatus = clean(stripeTransfers.status) || null;
  const merchantCapabilityStatus = clean(cardPayments.status) || null;
  const feesPayer = clean(controllerFees.payer);
  const lossesPayer = clean(controllerLosses.payments);
  const feesCollector = clean(responsibilities.fees_collector) === "stripe" || feesPayer === "account"
    ? "stripe"
    : clean(responsibilities.fees_collector) === "application" || feesPayer === "application"
      ? "application"
      : null;
  const lossesCollector = clean(responsibilities.losses_collector) === "stripe" || lossesPayer === "stripe"
    ? "stripe"
    : clean(responsibilities.losses_collector) === "application" || lossesPayer === "application"
      ? "application"
      : null;

  return {
    id: clean(account.id),
    livemode: account.livemode === true,
    displayName: clean(account.display_name) || clean(account.displayName) || null,
    dashboard: clean(account.dashboard) || clean(legacyStripeDashboard.type) || null,
    configurations,
    chargesEnabled: account.charges_enabled === true || merchantCapabilityStatus === "active",
    payoutsEnabled: account.payouts_enabled === true || recipientTransferStatus === "active",
    detailsSubmitted: account.details_submitted === true || account.detailsSubmitted === true || requirementFields.length === 0,
    merchantCapabilityStatus,
    recipientTransferStatus,
    feesCollector,
    lossesCollector,
    requirementFields,
    currentlyDueRequirementFields,
    pendingVerificationFields,
    raw: json,
  };
}

export function stripeConnectedAccountPaysFeesDirectly(account: StripeConnectedAccountSnapshot | null | undefined) {
  return account?.feesCollector === "stripe";
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

const transactionalTrackingSettings = {
  click_tracking: { enable: false, enable_text: false },
  open_tracking: { enable: false },
  subscription_tracking: { enable: false },
};

export async function sendEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  fromName = "The BEE Suite",
  categories,
  customArgs,
  disableClickTracking = false,
  tenantId,
  credentials,
  attachments,
}: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | null;
  fromName?: string;
  categories?: string[];
  customArgs?: Record<string, string | number | boolean | null | undefined>;
  disableClickTracking?: boolean;
  tenantId?: string | null;
  credentials?: Record<string, string>;
  attachments?: EmailAttachment[];
}): Promise<IntegrationSendResult> {
  const tenantCredentials = credentials ?? await getTenantIntegrationCredentialMap(tenantId, "sendgrid");
  const tenantApiKey = clean(tenantCredentials.SENDGRID_API_KEY);
  const tenantFrom = clean(tenantCredentials.SENDGRID_FROM_EMAIL);
  const platformApiKey = clean(process.env.SENDGRID_API_KEY);
  const platformFrom = clean(process.env.SENDGRID_FROM_EMAIL);
  const forcePlatformCredentials = process.env.SENDGRID_FORCE_PLATFORM_CREDENTIALS === "true";
  const apiKey = forcePlatformCredentials ? platformApiKey : tenantApiKey || platformApiKey;
  const from = forcePlatformCredentials ? platformFrom : tenantFrom || platformFrom;
  const recipients = uniqueEmails(to);

  if (!apiKey || !from || !recipients.length) {
    return { ok: false, configured: false, provider: "sendgrid", error: "SendGrid is not configured." };
  }

  function body(fromValue: string) {
    return JSON.stringify({
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
      from: { email: fromValue, name: fromName },
      reply_to: replyTo && isEmail(replyTo) ? { email: replyTo } : undefined,
      subject,
      categories: categories?.slice(0, 10),
      tracking_settings: disableClickTracking
        ? transactionalTrackingSettings
        : undefined,
      content: [
        { type: "text/plain", value: text },
        ...(html ? [{ type: "text/html", value: html }] : []),
      ],
      attachments: attachments?.length
        ? attachments.map((attachment) => ({
            content: attachment.content,
            filename: attachment.filename,
            type: attachment.type || "application/octet-stream",
            disposition: attachment.disposition || "attachment",
          }))
        : undefined,
    });
  }

  async function sendWith(apiKeyValue: string, fromValue: string) {
    return fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKeyValue}`,
        "Content-Type": "application/json",
      },
      body: body(fromValue),
      signal: AbortSignal.timeout(10_000),
    });
  }

  let response: Response;
  try {
    response = await sendWith(apiKey, from);
    const canRetryWithPlatformCredentials =
      !forcePlatformCredentials
      && (response.status === 401 || response.status === 403)
      && process.env.SENDGRID_ALLOW_PLATFORM_FALLBACK === "true"
      && Boolean(tenantApiKey)
      && Boolean(platformApiKey)
      && tenantApiKey !== platformApiKey
      && Boolean(platformFrom);
    if (canRetryWithPlatformCredentials) {
      response = await sendWith(platformApiKey, platformFrom);
    }
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
  customerId,
  customerEmail,
  successUrl,
  cancelUrl,
  metadata,
  connectedAccountId,
  applicationFeeAmountCents = 0,
  paymentMethodConfigurationId,
  paymentMethodCategory = "default",
  bankAccountVerificationMethod,
  idempotencyKey,
  checkoutBranding,
  tenantId,
  credentials,
}: {
  amountCents: number;
  invoiceAmountCents?: number;
  parentSurchargeAmountCents?: number;
  invoiceNumber: string;
  centerName?: string | null;
  customerId?: string | null;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  connectedAccountId?: string | null;
  applicationFeeAmountCents?: number;
  paymentMethodConfigurationId?: string | null;
  paymentMethodCategory?: StripePaymentMethodCategory;
  bankAccountVerificationMethod?: StripeBankAccountVerificationMethod | null;
  onBehalfOfConnectedAccount?: boolean;
  idempotencyKey?: string | null;
  checkoutBranding?: StripeCheckoutBranding | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  if (invalidPaymentRedirectUrl(successUrl, cancelUrl)) {
    return { ok: false, configured: true, provider: "stripe", error: "Payment return links must use secure HTTPS URLs." };
  }

  const fallbackPaymentMethodTypes = stripeCheckoutPaymentMethodTypes(paymentMethodCategory);
  type CheckoutPaymentMethodMode = "configuration" | "payment_method_types" | "dynamic";

  function buildBody(paymentMethodMode: CheckoutPaymentMethodMode) {
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
    const productDescription = stripeCheckoutText(checkoutBranding?.productDescription, 255);
    if (productDescription) {
      body.set("line_items[0][price_data][product_data][description]", productDescription);
    }

    if (parentSurchargeAmountCents > 0) {
      body.set("line_items[1][quantity]", "1");
      body.set("line_items[1][price_data][currency]", "usd");
      body.set("line_items[1][price_data][unit_amount]", String(parentSurchargeAmountCents));
      body.set("line_items[1][price_data][product_data][name]", PAYMENT_PROCESSING_RECOVERY_LABEL);
      body.set("line_items[1][price_data][product_data][description]", PAYMENT_PROCESSING_RECOVERY_CHECKOUT_DESCRIPTION);
    }

    if (customerId && clean(customerId).startsWith("cus_")) {
      body.set("customer", clean(customerId));
    } else if (customerEmail && isEmail(customerEmail)) {
      body.set("customer_email", customerEmail);
    }

    if (paymentMethodMode === "configuration" && paymentMethodConfigurationId) {
      body.set("payment_method_configuration", paymentMethodConfigurationId);
    } else if (paymentMethodMode === "payment_method_types" && fallbackPaymentMethodTypes.length) {
      addIndexedParams(body, "payment_method_types", fallbackPaymentMethodTypes);
    }

    if (bankAccountVerificationMethod === "instant" && paymentMethodCategory !== "link_bank") {
      body.set("payment_method_options[us_bank_account][verification_method]", "instant");
      body.set("payment_method_options[us_bank_account][financial_connections][permissions][0]", "payment_method");
    }

    if (connectedAccountId && applicationFeeAmountCents > 0) {
      body.set("payment_intent_data[application_fee_amount]", String(Math.min(applicationFeeAmountCents, amountCents)));
    }
    const paymentDescription = stripeCheckoutText(checkoutBranding?.paymentDescription, 255);
    if (paymentDescription) {
      body.set("payment_intent_data[description]", paymentDescription);
    }

    Object.entries(metadata).forEach(([key, value]) => {
      body.set(`metadata[${key}]`, value);
      body.set(`payment_intent_data[metadata][${key}]`, value);
    });
    addStripeCheckoutBrandingParams(body, checkoutBranding);

    return body;
  }

  async function createSession(body: URLSearchParams, paymentMethodMode: CheckoutPaymentMethodMode) {
    const scopedIdempotencyKey = checkoutSessionIdempotencyKey(idempotencyKey, paymentMethodMode);
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        ...connectedStripeHeaders(apiKey, "form", connectedAccountId),
        ...(scopedIdempotencyKey ? { "Idempotency-Key": scopedIdempotencyKey } : {}),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = await response.json().catch(() => null) as {
      id?: string;
      url?: string;
      created?: number | null;
      expires_at?: number | null;
      status?: string | null;
      payment_status?: string | null;
      error?: { message?: string; param?: string };
    } | null;
    return { response, json };
  }

  const paymentMethodModes: CheckoutPaymentMethodMode[] = [
    ...(paymentMethodConfigurationId && paymentMethodCategory !== "link_bank" ? ["configuration" as const] : []),
    ...(fallbackPaymentMethodTypes.length ? ["payment_method_types" as const] : []),
    "dynamic",
  ];
  let response: Response | null = null;
  let json: {
    id?: string;
    url?: string;
    created?: number | null;
    expires_at?: number | null;
    status?: string | null;
    payment_status?: string | null;
    error?: { message?: string; param?: string };
  } | null = null;

  for (const paymentMethodMode of paymentMethodModes) {
    ({ response, json } = await createSession(buildBody(paymentMethodMode), paymentMethodMode));
    if (response.ok && json?.url) break;
    if (paymentMethodMode === "configuration" && (isMissingPaymentMethodConfigurationError(json) || isInvalidPaymentMethodTypeError(json))) continue;
    if (paymentMethodMode === "payment_method_types" && isInvalidPaymentMethodTypeError(json)) continue;
    break;
  }

  if (!response || !response.ok || !json?.url) {
    const status = response?.status ?? 500;
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${status}.`,
    };
  }
  if (!isSecurePaymentUrl(json.url)) {
    return { ok: false, configured: true, provider: "stripe", error: "Payment processor returned an insecure checkout URL." };
  }

  return {
    ok: true,
    configured: true,
    provider: "stripe",
    id: json.id,
    url: json.url,
    createdAt: json.created ?? null,
    expiresAt: json.expires_at ?? null,
    status: json.status ?? null,
    paymentStatus: json.payment_status ?? null,
  };
}

function unixTimeToIso(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function stripePaymentIntentId(value: unknown) {
  if (typeof value === "string") return clean(value) || null;
  const record = asRecord(value);
  return clean(record.id) || null;
}

function stripePaymentIntentStatus(value: unknown) {
  return typeof value === "object" && value ? clean(asRecord(value).status) || null : null;
}

function stripeCheckoutSessionSnapshot(json: Record<string, unknown>): StripeCheckoutSessionSnapshot {
  return {
    id: clean(json.id),
    url: clean(json.url) || null,
    status: clean(json.status) || null,
    paymentStatus: clean(json.payment_status) || null,
    paymentIntentId: stripePaymentIntentId(json.payment_intent),
    paymentIntentStatus: stripePaymentIntentStatus(json.payment_intent),
    amountTotalCents: typeof json.amount_total === "number" ? json.amount_total : null,
    createdAt: unixTimeToIso(json.created),
    expiresAt: unixTimeToIso(json.expires_at),
    raw: json,
  };
}

export async function retrieveStripeCheckoutSession({
  sessionId,
  connectedAccountId,
  tenantId,
  credentials,
}: {
  sessionId: string;
  connectedAccountId?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<{
  ok: boolean;
  configured: boolean;
  provider: "stripe";
  session?: StripeCheckoutSessionSnapshot;
  error?: string;
}> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  const cleanSessionId = clean(sessionId);
  if (!cleanSessionId.startsWith("cs_")) {
    return { ok: false, configured: true, provider: "stripe", error: "Checkout session id is invalid." };
  }
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(cleanSessionId)}?expand[]=payment_intent`, {
    method: "GET",
    headers: connectedStripeHeaders(apiKey, "form", connectedAccountId),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !json) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: clean(asRecord(json?.error).message) || `Payment processor returned ${response.status}.`,
    };
  }
  return { ok: true, configured: true, provider: "stripe", session: stripeCheckoutSessionSnapshot(json) };
}

export async function expireStripeCheckoutSession({
  sessionId,
  connectedAccountId,
  tenantId,
  credentials,
}: {
  sessionId: string;
  connectedAccountId?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<{
  ok: boolean;
  configured: boolean;
  provider: "stripe";
  session?: StripeCheckoutSessionSnapshot;
  error?: string;
}> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  const cleanSessionId = clean(sessionId);
  if (!cleanSessionId.startsWith("cs_")) {
    return { ok: false, configured: true, provider: "stripe", error: "Checkout session id is invalid." };
  }
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(cleanSessionId)}/expire`, {
    method: "POST",
    headers: connectedStripeHeaders(apiKey, "form", connectedAccountId),
    body: new URLSearchParams(),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !json) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: clean(asRecord(json?.error).message) || `Payment processor returned ${response.status}.`,
    };
  }
  return { ok: true, configured: true, provider: "stripe", session: stripeCheckoutSessionSnapshot(json) };
}

export async function createStripeOffSessionPaymentIntent({
  amountCents,
  invoiceAmountCents = amountCents,
  parentSurchargeAmountCents = 0,
  invoiceNumber,
  centerName,
  customerId,
  paymentMethodId,
  paymentMethodType,
  customerEmail,
  metadata,
  connectedAccountId,
  applicationFeeAmountCents = 0,
  idempotencyKey,
  descriptionLabel,
  tenantId,
  credentials,
}: {
  amountCents: number;
  invoiceAmountCents?: number;
  parentSurchargeAmountCents?: number;
  invoiceNumber: string;
  centerName?: string | null;
  customerId: string;
  paymentMethodId: string;
  paymentMethodType?: string | null;
  customerEmail?: string | null;
  metadata: Record<string, string>;
  connectedAccountId?: string | null;
  applicationFeeAmountCents?: number;
  onBehalfOfConnectedAccount?: boolean;
  idempotencyKey?: string | null;
  descriptionLabel?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { paymentIntent?: StripePaymentIntentSnapshot }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  if (amountCents <= 0 || invoiceAmountCents <= 0) {
    return { ok: false, configured: true, provider: "stripe", error: "Payment amount must be greater than zero." };
  }
  if (!clean(customerId).startsWith("cus_")) {
    return { ok: false, configured: true, provider: "stripe", error: "A payment customer record is required for saved-method payment." };
  }
  if (!clean(paymentMethodId)) {
    return { ok: false, configured: true, provider: "stripe", error: "A saved payment method is required." };
  }

  const description = `${centerName ? `${centerName} ` : ""}invoice ${invoiceNumber} ${clean(descriptionLabel) || "saved-method payment"}`;
  const body = new URLSearchParams({
    amount: String(amountCents),
    currency: "usd",
    customer: customerId,
    payment_method: paymentMethodId,
    confirm: "true",
    off_session: "true",
    description,
  });

  const savedPaymentMethodType = clean(paymentMethodType);
  if (savedPaymentMethodType === "card" || savedPaymentMethodType === "us_bank_account") {
    body.set("payment_method_types[0]", savedPaymentMethodType);
  }

  if (customerEmail && isEmail(customerEmail)) {
    body.set("receipt_email", customerEmail);
  }

  if (connectedAccountId) {
    if (applicationFeeAmountCents > 0) {
      body.set("application_fee_amount", String(Math.min(applicationFeeAmountCents, amountCents)));
    }
  }

  Object.entries({
    ...metadata,
    invoiceAmountCents: String(invoiceAmountCents),
    parentSurchargeAmountCents: String(parentSurchargeAmountCents),
  }).forEach(([key, value]) => {
    body.set(`metadata[${key}]`, value);
  });

  const response = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      ...connectedStripeHeaders(apiKey, "form", connectedAccountId),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  const json = await response.json().catch(() => null) as {
    id?: string;
    amount?: number;
    status?: string | null;
    error?: {
      message?: string;
      payment_intent?: { id?: string; amount?: number; status?: string | null };
    };
  } | null;
  const paymentIntent = json?.id
    ? { id: json.id, amountCents: json.amount ?? null, status: clean(json.status) || null, raw: json }
    : json?.error?.payment_intent?.id
      ? {
          id: json.error.payment_intent.id,
          amountCents: json.error.payment_intent.amount ?? null,
          status: clean(json.error.payment_intent.status) || null,
          raw: json.error.payment_intent,
        }
      : undefined;

  if (!response.ok || !paymentIntent?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      id: paymentIntent?.id,
      paymentIntent,
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: paymentIntent.id, paymentIntent };
}

function stripeTerminalReaderSnapshot(value: unknown): StripeTerminalReaderSnapshot | null {
  const reader = asRecord(value);
  const id = clean(reader.id);
  if (!id.startsWith("tmr_")) return null;
  const location = asRecord(reader.location);
  const action = asRecord(reader.action);
  const failure = asRecord(action.failure_message);
  return {
    id,
    label: clean(reader.label) || null,
    deviceType: clean(reader.device_type) || null,
    status: clean(reader.status) || null,
    locationId: clean(location.id || reader.location) || null,
    actionStatus: clean(action.status) || null,
    actionFailureCode: clean(action.failure_code) || null,
    actionFailureMessage: clean(action.failure_message) || clean(failure.message) || null,
    paymentIntentId: clean(action.payment_intent) || null,
    raw: value,
  };
}

export async function listStripeTerminalReaders({
  locationId,
  connectedAccountId,
  tenantId,
  credentials,
}: {
  locationId?: string | null;
  connectedAccountId?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { readers?: StripeTerminalReaderSnapshot[] }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  const query = new URLSearchParams({ limit: "100" });
  const cleanLocationId = clean(locationId);
  if (cleanLocationId.startsWith("tml_")) query.set("location", cleanLocationId);
  const response = await fetch(`https://api.stripe.com/v1/terminal/readers?${query}`, {
    headers: connectedStripeHeaders(apiKey, "form", connectedAccountId),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { data?: unknown[]; error?: { message?: string } } | null;
  if (!response.ok) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
    };
  }
  return {
    ok: true,
    configured: true,
    provider: "stripe",
    readers: (json?.data ?? []).map(stripeTerminalReaderSnapshot).filter((reader): reader is StripeTerminalReaderSnapshot => Boolean(reader)),
  };
}

export async function createStripeTerminalLocation({
  displayName,
  address,
  connectedAccountId,
  tenantId,
  credentials,
  idempotencyKey,
}: {
  displayName: string;
  address: { line1: string; city: string; state: string; postalCode: string; country?: string };
  connectedAccountId?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
  idempotencyKey?: string | null;
}): Promise<IntegrationSendResult & { location?: StripeTerminalLocationSnapshot }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  const body = new URLSearchParams({
    display_name: clean(displayName),
    "address[line1]": clean(address.line1),
    "address[city]": clean(address.city),
    "address[state]": clean(address.state),
    "address[postal_code]": clean(address.postalCode),
    "address[country]": clean(address.country) || "US",
  });
  const response = await fetch("https://api.stripe.com/v1/terminal/locations", {
    method: "POST",
    headers: {
      ...connectedStripeHeaders(apiKey, "form", connectedAccountId),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; display_name?: string; error?: { message?: string } } | null;
  if (!response.ok || !clean(json?.id).startsWith("tml_")) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
    };
  }
  return {
    ok: true,
    configured: true,
    provider: "stripe",
    id: json!.id,
    location: { id: json!.id!, displayName: clean(json?.display_name) || null, raw: json },
  };
}

export async function registerStripeTerminalReader({
  registrationCode,
  label,
  locationId,
  connectedAccountId,
  tenantId,
  credentials,
  idempotencyKey,
}: {
  registrationCode: string;
  label: string;
  locationId: string;
  connectedAccountId?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
  idempotencyKey?: string | null;
}): Promise<IntegrationSendResult & { reader?: StripeTerminalReaderSnapshot }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  const body = new URLSearchParams({
    registration_code: clean(registrationCode),
    label: clean(label),
    location: clean(locationId),
  });
  const response = await fetch("https://api.stripe.com/v1/terminal/readers", {
    method: "POST",
    headers: {
      ...connectedStripeHeaders(apiKey, "form", connectedAccountId),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  const reader = stripeTerminalReaderSnapshot(json);
  if (!response.ok || !reader) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: clean(asRecord(json?.error).message) || `Payment processor returned ${response.status}.`,
    };
  }
  return { ok: true, configured: true, provider: "stripe", id: reader.id, reader };
}

export async function retrieveStripeTerminalReader({
  readerId,
  connectedAccountId,
  tenantId,
  credentials,
}: {
  readerId: string;
  connectedAccountId?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { reader?: StripeTerminalReaderSnapshot }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  const response = await fetch(`https://api.stripe.com/v1/terminal/readers/${encodeURIComponent(clean(readerId))}`, {
    headers: connectedStripeHeaders(apiKey, "form", connectedAccountId),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  const reader = stripeTerminalReaderSnapshot(json);
  if (!response.ok || !reader) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: clean(asRecord(json?.error).message) || `Payment processor returned ${response.status}.`,
    };
  }
  return { ok: true, configured: true, provider: "stripe", id: reader.id, reader };
}

export async function createStripeTerminalPaymentIntent({
  amountCents,
  invoiceAmountCents = amountCents,
  invoiceNumber,
  centerName,
  customerEmail,
  metadata,
  connectedAccountId,
  applicationFeeAmountCents = 0,
  idempotencyKey,
  tenantId,
  credentials,
}: {
  amountCents: number;
  invoiceAmountCents?: number;
  invoiceNumber: string;
  centerName?: string | null;
  customerEmail?: string | null;
  metadata: Record<string, string>;
  connectedAccountId?: string | null;
  applicationFeeAmountCents?: number;
  idempotencyKey?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { paymentIntent?: StripePaymentIntentSnapshot }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  if (amountCents <= 0 || invoiceAmountCents <= 0) {
    return { ok: false, configured: true, provider: "stripe", error: "Payment amount must be greater than zero." };
  }
  const body = new URLSearchParams({
    amount: String(amountCents),
    currency: "usd",
    "payment_method_types[0]": "card_present",
    capture_method: "automatic",
    description: `${centerName ? `${centerName} ` : ""}${invoiceNumber} in-person payment`,
  });
  if (customerEmail && isEmail(customerEmail)) body.set("receipt_email", customerEmail);
  if (connectedAccountId && applicationFeeAmountCents > 0) {
    body.set("application_fee_amount", String(Math.min(applicationFeeAmountCents, amountCents)));
  }
  Object.entries({ ...metadata, invoiceAmountCents: String(invoiceAmountCents) }).forEach(([key, value]) => {
    body.set(`metadata[${key}]`, value);
  });
  const response = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      ...connectedStripeHeaders(apiKey, "form", connectedAccountId),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; amount?: number; status?: string; error?: { message?: string } } | null;
  const paymentIntent = clean(json?.id).startsWith("pi_")
    ? { id: json!.id!, amountCents: json?.amount ?? null, status: clean(json?.status) || null, raw: json }
    : undefined;
  if (!response.ok || !paymentIntent) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
    };
  }
  return { ok: true, configured: true, provider: "stripe", id: paymentIntent.id, paymentIntent };
}

export async function processStripeTerminalPaymentIntent({
  readerId,
  paymentIntentId,
  connectedAccountId,
  tenantId,
  credentials,
  idempotencyKey,
}: {
  readerId: string;
  paymentIntentId: string;
  connectedAccountId?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
  idempotencyKey?: string | null;
}): Promise<IntegrationSendResult & { reader?: StripeTerminalReaderSnapshot }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  const body = new URLSearchParams({
    payment_intent: clean(paymentIntentId),
    "process_config[enable_customer_cancellation]": "true",
    "process_config[skip_tipping]": "true",
  });
  const response = await fetch(
    `https://api.stripe.com/v1/terminal/readers/${encodeURIComponent(clean(readerId))}/process_payment_intent`,
    {
      method: "POST",
      headers: {
        ...connectedStripeHeaders(apiKey, "form", connectedAccountId),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    },
  );
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  const reader = stripeTerminalReaderSnapshot(json);
  if (!response.ok || !reader) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: clean(asRecord(json?.error).message) || `Payment processor returned ${response.status}.`,
    };
  }
  return { ok: true, configured: true, provider: "stripe", id: reader.id, reader };
}

export async function retrieveStripePaymentIntent({
  paymentIntentId,
  connectedAccountId,
  tenantId,
  credentials,
}: {
  paymentIntentId: string;
  connectedAccountId?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { paymentIntent?: StripePaymentIntentSnapshot }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  const response = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(clean(paymentIntentId))}`, {
    headers: connectedStripeHeaders(apiKey, "form", connectedAccountId),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; amount?: number; status?: string; error?: { message?: string } } | null;
  const paymentIntent = clean(json?.id).startsWith("pi_")
    ? { id: json!.id!, amountCents: json?.amount ?? null, status: clean(json?.status) || null, raw: json }
    : undefined;
  if (!response.ok || !paymentIntent) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
    };
  }
  return { ok: true, configured: true, provider: "stripe", id: paymentIntent.id, paymentIntent };
}

export async function createStripeCustomer({
  email,
  name,
  metadata,
  connectedAccountId,
  tenantId,
  credentials,
}: {
  email?: string | null;
  name?: string | null;
  metadata?: Record<string, string>;
  connectedAccountId?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }

  const body = new URLSearchParams();
  if (email && isEmail(email)) body.set("email", email);
  if (name) body.set("name", name);
  Object.entries(metadata ?? {}).forEach(([key, value]) => {
    body.set(`metadata[${key}]`, value);
  });

  const response = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: connectedStripeHeaders(apiKey, "form", connectedAccountId),
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: json.id };
}

export async function createStripeRefund({
  paymentIntentId,
  amountCents,
  reason,
  metadata,
  connectedAccountId,
  idempotencyKey,
  tenantId,
  credentials,
}: {
  paymentIntentId: string;
  amountCents: number;
  reason: string;
  metadata?: Record<string, string>;
  connectedAccountId?: string | null;
  idempotencyKey: string;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { refund?: { id: string; amountCents: number; status: string | null } }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  if (!clean(paymentIntentId).startsWith("pi_")) {
    return { ok: false, configured: true, provider: "stripe", error: "The original Stripe payment could not be identified." };
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, configured: true, provider: "stripe", error: "Refund amount must be greater than zero." };
  }

  const body = new URLSearchParams({
    payment_intent: paymentIntentId,
    amount: String(amountCents),
    reason: "requested_by_customer",
  });
  if (clean(connectedAccountId).startsWith("acct_")) body.set("refund_application_fee", "true");
  body.set("metadata[beeSuiteReason]", clean(reason).slice(0, 500));
  Object.entries(metadata ?? {}).forEach(([key, value]) => body.set(`metadata[${key}]`, value));

  const response = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      ...connectedStripeHeaders(apiKey, "form", connectedAccountId),
      "Idempotency-Key": idempotencyKey,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as {
    id?: string;
    amount?: number;
    status?: string | null;
    error?: { message?: string };
  } | null;
  if (!response.ok || !json?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: clean(json?.error?.message) || "Stripe could not issue the refund.",
    };
  }
  return {
    ok: true,
    configured: true,
    provider: "stripe",
    id: json.id,
    refund: { id: json.id, amountCents: json.amount ?? amountCents, status: clean(json.status) || null },
  };
}

export async function setStripeCustomerDefaultPaymentMethod({
  customerId,
  paymentMethodId,
  tenantId,
  credentials,
}: {
  customerId: string;
  paymentMethodId: string;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  if (!clean(customerId).startsWith("cus_") || !clean(paymentMethodId).startsWith("pm_")) {
    return { ok: false, configured: true, provider: "stripe", error: "A valid customer and payment method are required." };
  }
  const response = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}`, {
    method: "POST",
    headers: connectedStripeHeaders(apiKey, "form"),
    body: new URLSearchParams({ "invoice_settings[default_payment_method]": paymentMethodId }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok || !json?.id) {
    return { ok: false, configured: true, provider: "stripe", error: json?.error?.message || `Payment processor returned ${response.status}.` };
  }
  return { ok: true, configured: true, provider: "stripe", id: json.id };
}

export type StripeSoftwareSubscriptionSnapshot = {
  id: string;
  status: string;
  customerId: string;
  priceId: string | null;
  itemId: string | null;
  quantity: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  latestInvoiceId: string | null;
};

function stripeReconciliationTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

export async function ensureStripeSoftwareRecurringPrice({ tenantId, unitAmountCents }: { tenantId?: string | null; unitAmountCents: number }) {
  const apiKey = await getStripeSecretKey({ tenantId });
  if (!apiKey) return { ok: false as const, configured: false, error: "Payment processor is not configured." };
  const lookupKey = `bee_suite_school_monthly_${unitAmountCents}`;
  const lookupResponse = await fetch(`https://api.stripe.com/v1/prices?active=true&lookup_keys[]=${encodeURIComponent(lookupKey)}&limit=1`, {
    headers: stripeHeaders(apiKey, "form"), signal: AbortSignal.timeout(10_000),
  });
  const lookup = await lookupResponse.json().catch(() => null) as { data?: Array<{ id?: string }>; error?: { message?: string } } | null;
  if (lookupResponse.ok && lookup?.data?.[0]?.id) return { ok: true as const, configured: true, priceId: lookup.data[0].id };
  const productBody = new URLSearchParams({ name: "The BEE Suite school software access", "metadata[billingScope]": "school_software_fee" });
  const productResponse = await fetch("https://api.stripe.com/v1/products", { method: "POST", headers: stripeHeaders(apiKey, "form"), body: productBody, signal: AbortSignal.timeout(10_000) });
  const product = await productResponse.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!productResponse.ok || !product?.id) return { ok: false as const, configured: true, error: product?.error?.message || "Software billing product could not be created." };
  const priceBody = new URLSearchParams({ currency: "usd", unit_amount: String(unitAmountCents), product: product.id, lookup_key: lookupKey, "recurring[interval]": "month", "metadata[billingScope]": "school_software_fee" });
  const priceResponse = await fetch("https://api.stripe.com/v1/prices", { method: "POST", headers: stripeHeaders(apiKey, "form"), body: priceBody, signal: AbortSignal.timeout(10_000) });
  const price = await priceResponse.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!priceResponse.ok || !price?.id) return { ok: false as const, configured: true, error: price?.error?.message || "Monthly software price could not be created." };
  return { ok: true as const, configured: true, priceId: price.id };
}

function softwareSubscriptionSnapshot(json: Record<string, unknown>): StripeSoftwareSubscriptionSnapshot {
  const items = asRecord(json.items);
  const first = Array.isArray(items.data) ? asRecord(items.data[0]) : {};
  const price = asRecord(first.price);
  return {
    id: clean(json.id), status: clean(json.status) || "unknown", customerId: clean(json.customer_account) || clean(json.customer),
    priceId: clean(price.id) || null, itemId: clean(first.id) || null,
    quantity: typeof first.quantity === "number" ? first.quantity : 0,
    currentPeriodStart: stripeTimestamp(first.current_period_start ?? json.current_period_start),
    currentPeriodEnd: stripeTimestamp(first.current_period_end ?? json.current_period_end),
    cancelAtPeriodEnd: json.cancel_at_period_end === true,
    latestInvoiceId: clean(json.latest_invoice) || clean(asRecord(json.latest_invoice).id) || null,
  };
}

export async function ensureStripeConnectedAccountCustomerConfiguration({
  accountId,
  tenantId,
}: {
  accountId: string;
  tenantId?: string | null;
}) {
  const apiKey = await getStripeSecretKey({ tenantId });
  if (!apiKey) return { ok: false as const, configured: false, error: "Payment processor is not configured." };
  if (!clean(accountId).startsWith("acct_")) return { ok: false as const, configured: true, error: "A connected school account is required." };
  const response = await fetch(`https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}`, {
    method: "POST",
    headers: stripeHeaders(apiKey, "json", STRIPE_ACCOUNTS_V2_API_VERSION),
    body: JSON.stringify({
      configuration: { customer: { capabilities: { automatic_indirect_tax: { requested: true } } } },
      include: ["configuration.customer", "defaults"],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok || !json?.id) return { ok: false as const, configured: true, error: json?.error?.message || `Payment processor returned ${response.status}.` };
  return { ok: true as const, configured: true, accountId: json.id };
}

export async function createStripeBalancePaymentMethod({
  accountId,
  tenantId,
  centerId,
}: {
  accountId: string;
  tenantId?: string | null;
  centerId: string;
}) {
  const apiKey = await getStripeSecretKey({ tenantId });
  if (!apiKey) return { ok: false as const, configured: false, error: "Payment processor is not configured." };
  const body = new URLSearchParams({
    customer_account: accountId,
    "payment_method_types[0]": "stripe_balance",
    confirm: "true",
    usage: "off_session",
    "payment_method_data[type]": "stripe_balance",
    "metadata[centerId]": centerId,
    "metadata[paymentScope]": "school_software_fee",
  });
  const response = await fetch("https://api.stripe.com/v1/setup_intents", {
    method: "POST",
    headers: { ...stripeHeaders(apiKey, "form"), "Idempotency-Key": `school-software-balance-method:${centerId}` },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  const paymentMethodId = clean(json?.payment_method) || clean(asRecord(json?.payment_method).id);
  if (!response.ok || !paymentMethodId.startsWith("pm_")) return { ok: false as const, configured: true, error: clean(asRecord(json?.error).message) || `Payment processor returned ${response.status}.` };
  return { ok: true as const, configured: true, setupIntentId: clean(json?.id), paymentMethodId };
}

export async function createStripeBalanceSoftwareSubscription({
  accountId,
  paymentMethodId,
  priceId,
  tenantId,
  centerId,
}: {
  accountId: string;
  paymentMethodId: string;
  priceId: string;
  tenantId?: string | null;
  centerId: string;
}) {
  const apiKey = await getStripeSecretKey({ tenantId });
  if (!apiKey) return { ok: false as const, configured: false, error: "Payment processor is not configured." };
  const body = new URLSearchParams({
    customer_account: accountId,
    default_payment_method: paymentMethodId,
    "items[0][price]": priceId,
    "items[0][quantity]": "1",
    payment_behavior: "default_incomplete",
    "payment_settings[payment_method_types][0]": "stripe_balance",
    "metadata[tenantId]": tenantId || "",
    "metadata[centerId]": centerId,
    "metadata[paymentScope]": "school_software_fee",
    expand: "latest_invoice",
  });
  const response = await fetch("https://api.stripe.com/v1/subscriptions", {
    method: "POST",
    headers: { ...stripeHeaders(apiKey, "form"), "Idempotency-Key": `school-software-balance-subscription:${centerId}:${priceId}` },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !json?.id) return { ok: false as const, configured: true, error: clean(asRecord(json?.error).message) || `Payment processor returned ${response.status}.` };
  return { ok: true as const, configured: true, subscription: softwareSubscriptionSnapshot(json) };
}

export async function createStripeSoftwareSubscription({ customerId, priceId, quantity, tenantId, centerId }: { customerId: string; priceId: string; quantity: number; tenantId?: string | null; centerId: string }) {
  const apiKey = await getStripeSecretKey({ tenantId });
  if (!apiKey) return { ok: false as const, configured: false, error: "Payment processor is not configured." };
  const body = new URLSearchParams({ customer: customerId, "items[0][price]": priceId, "items[0][quantity]": String(Math.max(1, quantity)), payment_behavior: "default_incomplete", "payment_settings[save_default_payment_method]": "on_subscription", "metadata[tenantId]": tenantId || "", "metadata[centerId]": centerId, "metadata[paymentScope]": "school_software_fee", expand: "latest_invoice" });
  const response = await fetch("https://api.stripe.com/v1/subscriptions", { method: "POST", headers: { ...stripeHeaders(apiKey, "form"), "Idempotency-Key": `school-software:${centerId}:${priceId}` }, body, signal: AbortSignal.timeout(10_000) });
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !json?.id) return { ok: false as const, configured: true, error: clean(asRecord(json?.error).message) || `Payment processor returned ${response.status}.` };
  return { ok: true as const, configured: true, subscription: softwareSubscriptionSnapshot(json) };
}

export async function updateStripeSoftwareSubscription({ subscriptionId, itemId, priceId, quantity, cancelAtPeriodEnd, tenantId }: { subscriptionId: string; itemId?: string | null; priceId?: string | null; quantity?: number; cancelAtPeriodEnd?: boolean; tenantId?: string | null }) {
  const apiKey = await getStripeSecretKey({ tenantId });
  if (!apiKey) return { ok: false as const, configured: false, error: "Payment processor is not configured." };
  const body = new URLSearchParams({ proration_behavior: "create_prorations", expand: "latest_invoice" });
  if (itemId && (quantity !== undefined || priceId)) {
    body.set("items[0][id]", itemId);
    if (priceId) body.set("items[0][price]", priceId);
    if (quantity !== undefined) body.set("items[0][quantity]", String(Math.max(1, quantity)));
  }
  if (cancelAtPeriodEnd !== undefined) body.set("cancel_at_period_end", String(cancelAtPeriodEnd));
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "POST", headers: stripeHeaders(apiKey, "form"), body, signal: AbortSignal.timeout(10_000) });
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !json?.id) return { ok: false as const, configured: true, error: clean(asRecord(json?.error).message) || `Payment processor returned ${response.status}.` };
  return { ok: true as const, configured: true, subscription: softwareSubscriptionSnapshot(json) };
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
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  if (!customerId.startsWith("cus_")) {
    return { ok: false, configured: true, provider: "stripe", error: "A payment customer ID is required for corporate invoices." };
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
      error: itemJson?.error?.message || `Payment processor returned ${itemResponse.status}.`,
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
      error: invoiceJson?.error?.message || `Payment processor returned ${invoiceResponse.status}.`,
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
      error: finalizedJson?.error?.message || `Payment processor returned ${finalizeResponse.status}.`,
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
        error: sentJson?.error?.message || `Payment processor returned ${sendResponse.status}.`,
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
  paymentMethodCategory = "default",
  bankAccountVerificationMethod,
  successUrl,
  cancelUrl,
  metadata,
  connectedAccountId,
  checkoutBranding,
  tenantId,
  credentials,
}: {
  customerId?: string | null;
  customerEmail?: string | null;
  paymentMethodCategory?: StripePaymentMethodCategory;
  bankAccountVerificationMethod?: StripeBankAccountVerificationMethod | null;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  connectedAccountId?: string | null;
  checkoutBranding?: StripeCheckoutBranding | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  if (invalidPaymentRedirectUrl(successUrl, cancelUrl)) {
    return { ok: false, configured: true, provider: "stripe", error: "Payment return links must use secure HTTPS URLs." };
  }

  const paymentMethodConfigurationId = getStripePaymentMethodConfigurationId(paymentMethodCategory);
  const fallbackPaymentMethodTypes = stripeSetupPaymentMethodTypes(paymentMethodCategory);

  type SetupPaymentMethodMode = "configuration" | "payment_method_types" | "dynamic";

  function buildBody(paymentMethodMode: SetupPaymentMethodMode) {
    const body = new URLSearchParams({
      mode: "setup",
      currency: "usd",
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: metadata.billingAccountId || metadata.familyId || "payment-method-setup",
    });
    if (customerId) {
      body.set("customer", customerId);
    } else if (customerEmail && isEmail(customerEmail)) {
      body.set("customer_email", customerEmail);
    }
    if (paymentMethodMode === "configuration" && paymentMethodConfigurationId) {
      body.set("payment_method_configuration", paymentMethodConfigurationId);
    } else if (paymentMethodMode === "payment_method_types" && fallbackPaymentMethodTypes.length) {
      addIndexedParams(body, "payment_method_types", fallbackPaymentMethodTypes);
    }
    if (bankAccountVerificationMethod === "instant") {
      body.set("payment_method_options[us_bank_account][verification_method]", "instant");
      body.set("payment_method_options[us_bank_account][financial_connections][permissions][0]", "payment_method");
    }
    const setupDescription = stripeCheckoutText(checkoutBranding?.setupDescription, 255);
    if (setupDescription) {
      body.set("setup_intent_data[description]", setupDescription);
    }
    Object.entries(metadata).forEach(([key, value]) => {
      body.set(`metadata[${key}]`, value);
      body.set(`setup_intent_data[metadata][${key}]`, value);
    });
    addStripeCheckoutBrandingParams(body, checkoutBranding);
    return body;
  }

  async function createSession(body: URLSearchParams) {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: connectedStripeHeaders(apiKey, "form", connectedAccountId),
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = await response.json().catch(() => null) as {
      id?: string;
      url?: string;
      created?: number | null;
      expires_at?: number | null;
      status?: string | null;
      payment_status?: string | null;
      error?: { message?: string; param?: string };
    } | null;
    return { response, json };
  }

  const paymentMethodModes: SetupPaymentMethodMode[] = [
    ...(paymentMethodConfigurationId ? ["configuration" as const] : []),
    ...(fallbackPaymentMethodTypes.length ? ["payment_method_types" as const] : []),
    "dynamic",
  ];
  let response: Response | null = null;
  let json: {
    id?: string;
    url?: string;
    created?: number | null;
    expires_at?: number | null;
    status?: string | null;
    payment_status?: string | null;
    error?: { message?: string; param?: string };
  } | null = null;

  for (const paymentMethodMode of paymentMethodModes) {
    ({ response, json } = await createSession(buildBody(paymentMethodMode)));
    if (response.ok && json?.url) break;
    if (paymentMethodMode === "configuration" && (isMissingPaymentMethodConfigurationError(json) || isInvalidPaymentMethodTypeError(json))) continue;
    if (paymentMethodMode === "payment_method_types" && isInvalidPaymentMethodTypeError(json)) continue;
    break;
  }

  if (!response || !response.ok || !json?.url) {
    const status = response?.status ?? 500;
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${status}.`,
    };
  }
  if (!isSecurePaymentUrl(json.url)) {
    return { ok: false, configured: true, provider: "stripe", error: "Payment processor returned an insecure checkout URL." };
  }

  return {
    ok: true,
    configured: true,
    provider: "stripe",
    id: json.id,
    url: json.url,
    createdAt: json.created ?? null,
    expiresAt: json.expires_at ?? null,
    status: json.status ?? null,
    paymentStatus: json.payment_status ?? null,
  };
}

export async function retrieveStripePaymentMethod(paymentMethodId: string, input: TenantCredentialRuntimeInput = {}): Promise<{
  ok: boolean;
  configured: boolean;
  provider: "stripe";
  paymentMethod?: StripePaymentMethodSnapshot;
  error?: string;
}> {
  const apiKey = await getStripeSecretKey(input);
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  if (!clean(paymentMethodId).startsWith("pm_")) {
    return { ok: false, configured: true, provider: "stripe", error: "A valid payment method is required." };
  }

  const response = await fetch(`https://api.stripe.com/v1/payment_methods/${encodeURIComponent(paymentMethodId)}`, {
    method: "GET",
    headers: connectedStripeHeaders(apiKey, "form", input.connectedAccountId),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as {
    id?: string;
    type?: string | null;
    customer?: string | null;
    card?: { brand?: string | null; last4?: string | null } | null;
    us_bank_account?: { bank_name?: string | null; last4?: string | null } | null;
    error?: { message?: string };
  } | null;

  if (!response.ok || !json?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
    };
  }

  return {
    ok: true,
    configured: true,
    provider: "stripe",
    paymentMethod: {
      id: json.id,
      type: clean(json.type) || null,
      customerId: clean(json.customer) || null,
      last4: clean(json.card?.last4) || clean(json.us_bank_account?.last4) || null,
      brand: clean(json.card?.brand) || null,
      bankName: clean(json.us_bank_account?.bank_name) || null,
      raw: json,
    },
  };
}

export async function createStripeBillingPortalSession({
  customerId,
  returnUrl,
  connectedAccountId,
  tenantId,
  credentials,
}: {
  customerId: string;
  returnUrl: string;
  connectedAccountId?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  if (invalidPaymentRedirectUrl(returnUrl)) {
    return { ok: false, configured: true, provider: "stripe", error: "Payment return links must use secure HTTPS URLs." };
  }

  const body = new URLSearchParams({
    customer: customerId,
    return_url: returnUrl,
  });
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: connectedStripeHeaders(apiKey, "form", connectedAccountId),
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; url?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.url) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
    };
  }
  if (!isSecurePaymentUrl(json.url)) {
    return { ok: false, configured: true, provider: "stripe", error: "Payment processor returned an insecure portal URL." };
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
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }

  const response = await fetch(`https://api.stripe.com/v1/setup_intents/${encodeURIComponent(setupIntentId)}`, {
    method: "GET",
    headers: connectedStripeHeaders(apiKey, "form", input.connectedAccountId),
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
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
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
  displayName,
  email,
  phone,
  supportEmail,
  supportPhone,
  city,
  state,
  postalCode,
  address,
  addressLine2,
  businessUrl,
  productDescription,
  idempotencyKey,
  metadata,
  tenantId,
  credentials,
}: {
  businessName: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  address?: string | null;
  addressLine2?: string | null;
  businessUrl?: string | null;
  productDescription?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, string | null | undefined>;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { account?: StripeConnectedAccountSnapshot }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }

  const registeredName = clean(businessName);
  const accountDisplayName = clean(displayName) || registeredName;
  const contactEmail = email && isEmail(email) ? email : undefined;
  const publicSupportEmail = supportEmail && isEmail(supportEmail) ? supportEmail : contactEmail;
  const contactPhone = clean(phone) || undefined;
  const publicSupportPhone = clean(supportPhone) || contactPhone;
  const businessAddress = address || city || state || postalCode || addressLine2 ? {
    country: "US",
    line1: clean(address) || undefined,
    line2: clean(addressLine2) || undefined,
    city: clean(city) || undefined,
    state: clean(state) || undefined,
    postal_code: clean(postalCode) || undefined,
  } : undefined;
  const accountMetadata = metadata
    ? Object.fromEntries(
        Object.entries(metadata)
          .map(([key, value]) => [clean(key).slice(0, 40), clean(value).slice(0, 500)] as const)
          .filter(([key, value]) => key && value),
      )
    : undefined;

  const payload = {
    contact_email: contactEmail,
    contact_phone: contactPhone,
    display_name: accountDisplayName,
    dashboard: "full",
    metadata: accountMetadata,
    identity: {
      business_details: {
        registered_name: registeredName,
        address: businessAddress,
        phone: contactPhone,
      },
      country: "us",
      entity_type: "company",
    },
    configuration: {
      merchant: {
        mcc: STRIPE_CHILD_CARE_MCC,
        statement_descriptor: {
          descriptor: STRIPE_KID_CITY_STATEMENT_DESCRIPTOR,
          prefix: "KIDCITY",
        },
        capabilities: {
          card_payments: { requested: true },
        },
        support: {
          address: businessAddress,
          email: publicSupportEmail,
          phone: publicSupportPhone,
          url: clean(businessUrl) || undefined,
        },
      },
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { requested: true },
          },
        },
      },
      customer: {
        capabilities: {
          automatic_indirect_tax: { requested: true },
        },
      },
    },
    defaults: {
      currency: "usd",
      locales: ["en-US"],
      profile: {
        business_url: clean(businessUrl) || undefined,
        doing_business_as: accountDisplayName,
        product_description: clean(productDescription) || "Childcare tuition, registration fees, deposits, and school account payouts.",
      },
      responsibilities: {
        fees_collector: "stripe",
        losses_collector: "stripe",
      },
    },
    include: ["configuration.merchant", "configuration.recipient", "configuration.customer", "defaults", "requirements"],
  };

  const response = await fetch("https://api.stripe.com/v2/core/accounts", {
    method: "POST",
    headers: {
      ...stripeHeaders(apiKey, "json", STRIPE_ACCOUNTS_V2_API_VERSION),
      ...(clean(idempotencyKey) ? { "Idempotency-Key": clean(idempotencyKey) } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: json.id, account: normalizeStripeAccount(json) };
}

export async function completeStripeConnectedAccountBusinessProfile({
  accountId,
  businessPhone,
  ein,
  tenantId,
  credentials,
  idempotencyKey,
}: {
  accountId: string;
  businessPhone?: string | null;
  ein?: string | null;
  tenantId?: string | null;
  credentials?: Record<string, string>;
  idempotencyKey?: string | null;
}): Promise<IntegrationSendResult & { account?: StripeConnectedAccountSnapshot }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }

  const connectedAccountId = clean(accountId);
  if (!connectedAccountId.startsWith("acct_")) {
    return { ok: false, configured: true, provider: "stripe", error: "Connected payout account id is invalid." };
  }

  const contactPhone = clean(businessPhone) || undefined;
  const federalEin = clean(ein).replace(/\D/g, "");
  if (federalEin && federalEin.length !== 9) {
    return { ok: false, configured: true, provider: "stripe", error: "School EIN must contain exactly 9 digits." };
  }
  const businessDetails = {
    ...(contactPhone ? { phone: contactPhone } : {}),
    ...(federalEin ? { id_numbers: [{ type: "us_ein", value: federalEin }] } : {}),
  };
  const payload = {
    configuration: {
      merchant: {
        mcc: STRIPE_CHILD_CARE_MCC,
        statement_descriptor: {
          descriptor: STRIPE_KID_CITY_STATEMENT_DESCRIPTOR,
          prefix: "KIDCITY",
        },
      },
    },
    ...(contactPhone || federalEin
      ? {
          ...(contactPhone ? { contact_phone: contactPhone } : {}),
          identity: { business_details: businessDetails },
        }
      : {}),
    include: STRIPE_CONNECTED_ACCOUNT_INCLUDES,
  };

  const response = await fetch(`https://api.stripe.com/v2/core/accounts/${encodeURIComponent(connectedAccountId)}`, {
    method: "POST",
    headers: {
      ...stripeHeaders(apiKey, "json", STRIPE_ACCOUNTS_V2_API_VERSION),
      ...(clean(idempotencyKey) ? { "Idempotency-Key": clean(idempotencyKey) } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: json.id, account: normalizeStripeAccount(json) };
}

export async function createStripeAccountLink({
  accountId,
  refreshUrl,
  returnUrl,
  collectionFields = "eventually_due",
  includeFutureRequirements = true,
  tenantId,
  credentials,
}: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
  collectionFields?: "currently_due" | "eventually_due";
  includeFutureRequirements?: boolean;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }
  if (invalidPaymentRedirectUrl(refreshUrl, returnUrl)) {
    return { ok: false, configured: true, provider: "stripe", error: "Payment return links must use secure HTTPS URLs." };
  }

  const connectedAccountId = clean(accountId);
  if (!connectedAccountId.startsWith("acct_")) {
    return { ok: false, configured: true, provider: "stripe", error: "Connected payout account id is invalid." };
  }
  const connectedAccount = await retrieveStripeConnectedAccount(connectedAccountId, { tenantId, credentials });
  if (!connectedAccount.ok || !connectedAccount.account) {
    return {
      ok: false,
      configured: connectedAccount.configured,
      provider: "stripe",
      error: connectedAccount.error || "The connected account configurations could not be verified.",
    };
  }
  const configurations = connectedAccount.account.configurations;
  if (!configurations.length) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: "The connected account does not have an applied onboarding configuration.",
    };
  }

  const response = await fetch("https://api.stripe.com/v2/core/account_links", {
    method: "POST",
    headers: stripeHeaders(apiKey, "json", STRIPE_ACCOUNTS_V2_API_VERSION),
    body: JSON.stringify({
      account: connectedAccountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations,
          collection_options: {
            fields: collectionFields,
            ...(includeFutureRequirements ? { future_requirements: "include" } : {}),
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
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
      providerStatus: response.status,
    };
  }
  if (!isSecurePaymentUrl(json.url)) {
    return { ok: false, configured: true, provider: "stripe", error: "Payment processor returned an insecure onboarding URL." };
  }

  return { ok: true, configured: true, provider: "stripe", id: connectedAccountId, url: json.url };
}

export async function createStripeExpressDashboardLoginLink({
  accountId,
  tenantId,
  credentials,
}: {
  accountId: string;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }

  const connectedAccountId = clean(accountId);
  if (!connectedAccountId.startsWith("acct_")) {
    return { ok: false, configured: true, provider: "stripe", error: "Connected payout account id is invalid." };
  }

  const response = await fetch(`https://api.stripe.com/v1/accounts/${connectedAccountId}/login_links`, {
    method: "POST",
    headers: stripeHeaders(apiKey, "form"),
    body: new URLSearchParams(),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { url?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.url) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
    };
  }
  if (!isSecurePaymentUrl(json.url)) {
    return { ok: false, configured: true, provider: "stripe", error: "Payment processor returned an insecure dashboard URL." };
  }

  return { ok: true, configured: true, provider: "stripe", id: connectedAccountId, url: json.url };
}

export async function createStripePayoutBankSelectionLink({
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
}): Promise<IntegrationSendResult & { mode: "dashboard" | "onboarding" }> {
  const dashboard = await createStripeExpressDashboardLoginLink({
    accountId,
    tenantId,
    credentials,
  });
  if (dashboard.ok && dashboard.url) {
    return { ...dashboard, mode: "dashboard" };
  }

  if (!/has not completed onboarding/i.test(dashboard.error || "")) {
    return { ...dashboard, mode: "dashboard" };
  }

  const onboarding = await createStripeAccountLink({
    accountId,
    refreshUrl,
    returnUrl,
    tenantId,
    credentials,
  });
  return { ...onboarding, mode: "onboarding" };
}

export async function listStripeConnectedAccountPayoutBanks({
  accountId,
  tenantId,
  credentials,
}: {
  accountId: string;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { banks: StripePayoutBankSnapshot[]; defaultBank: StripePayoutBankSnapshot | null }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      provider: "stripe",
      error: "Payment processor is not configured.",
      banks: [],
      defaultBank: null,
    };
  }

  const connectedAccountId = clean(accountId);
  if (!connectedAccountId.startsWith("acct_")) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: "Connected payout account id is invalid.",
      banks: [],
      defaultBank: null,
    };
  }

  const params = new URLSearchParams({ object: "bank_account", limit: "10" });
  const response = await fetch(
    `https://api.stripe.com/v1/accounts/${connectedAccountId}/external_accounts?${params.toString()}`,
    {
      method: "GET",
      headers: stripeHeaders(apiKey, "form"),
      signal: AbortSignal.timeout(10_000),
    },
  );
  const json = await response.json().catch(() => null) as {
    data?: Array<Record<string, unknown>>;
    error?: { message?: string };
  } | null;

  if (!response.ok || !Array.isArray(json?.data)) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
      banks: [],
      defaultBank: null,
    };
  }

  const banks = json.data
    .filter((item) => clean(item.object) === "bank_account")
    .map((item): StripePayoutBankSnapshot => ({
      id: clean(item.id),
      bankName: clean(item.bank_name) || null,
      last4: clean(item.last4) || null,
      status: clean(item.status) || null,
      currency: clean(item.currency) || null,
      country: clean(item.country) || null,
      defaultForCurrency: item.default_for_currency === true,
    }))
    .filter((bank) => bank.id.startsWith("ba_"));
  const defaultBank =
    banks.find((bank) => bank.defaultForCurrency && bank.currency === "usd") ??
    banks.find((bank) => bank.defaultForCurrency) ??
    (banks.length === 1 ? banks[0] : null);

  return {
    ok: true,
    configured: true,
    provider: "stripe",
    id: connectedAccountId,
    banks,
    defaultBank,
  };
}

export async function setStripeConnectedAccountDailyPayouts({
  accountId,
  tenantId,
  credentials,
}: {
  accountId: string;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { balanceSettings?: Record<string, unknown> }> {
  return setStripeConnectedAccountPayoutSchedule({ accountId, interval: "daily", tenantId, credentials });
}

export async function setStripeConnectedAccountManualPayouts({
  accountId,
  tenantId,
  credentials,
}: {
  accountId: string;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { balanceSettings?: Record<string, unknown> }> {
  return setStripeConnectedAccountPayoutSchedule({ accountId, interval: "manual", tenantId, credentials });
}

export async function setStripeConnectedAccountPayoutSchedule({
  accountId,
  interval,
  tenantId,
  credentials,
}: {
  accountId: string;
  interval: "daily" | "manual";
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { balanceSettings?: Record<string, unknown> }> {
  const apiKey = await getStripeSecretKey({ tenantId, credentials });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }

  const connectedAccountId = clean(accountId);
  if (!connectedAccountId.startsWith("acct_")) {
    return { ok: false, configured: true, provider: "stripe", error: "Connected payout account id is invalid." };
  }

  const body = new URLSearchParams({ "payments[payouts][schedule][interval]": interval });
  if (interval === "daily") body.set("payments[settlement_timing][delay_days_override]", "");
  const response = await fetch("https://api.stripe.com/v1/balance_settings", {
    method: "POST",
    headers: connectedStripeHeaders(apiKey, "form", connectedAccountId),
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;

  if (!response.ok || !json) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: clean(asRecord(json?.error).message) || `Payment processor returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: connectedAccountId, balanceSettings: json };
}

export async function retrieveStripeConnectedAccount(
  accountId: string,
  input: TenantCredentialRuntimeInput = {},
): Promise<IntegrationSendResult & { account?: StripeConnectedAccountSnapshot }> {
  const apiKey = await getStripeSecretKey(input);
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured." };
  }

  const params = new URLSearchParams();
  STRIPE_CONNECTED_ACCOUNT_INCLUDES.forEach((include, index) => {
    params.append(`include[${index}]`, include);
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
    const legacy = await retrieveLegacyStripeConnectedAccount(accountId, apiKey);
    if (legacy.ok) return legacy;

    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
    };
  }

  return { ok: true, configured: true, provider: "stripe", id: json.id, account: normalizeStripeAccount(json) };
}

function stripeUnixDate(value: Date) {
  return Math.floor(value.getTime() / 1000);
}

function stripeTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

export async function listStripeBalanceTransactions(input: {
  connectedAccountId: string;
  createdGte: Date;
  createdLte: Date;
  limit?: number;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { transactions: StripeBalanceTransactionSnapshot[]; hasMore: boolean }> {
  const apiKey = await getStripeSecretKey(input);
  if (!apiKey) return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured.", transactions: [], hasMore: false };
  if (!clean(input.connectedAccountId).startsWith("acct_")) {
    return { ok: false, configured: true, provider: "stripe", error: "A connected school account is required.", transactions: [], hasMore: false };
  }
  const params = new URLSearchParams({
    "created[gte]": String(stripeUnixDate(input.createdGte)),
    "created[lte]": String(stripeUnixDate(input.createdLte)),
    limit: String(Math.min(Math.max(input.limit || 100, 1), 100)),
  });
  const response = await fetch(`https://api.stripe.com/v1/balance_transactions?${params}`, {
    headers: connectedStripeHeaders(apiKey, "form", input.connectedAccountId),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { data?: unknown[]; has_more?: boolean; error?: { message?: string } } | null;
  if (!response.ok || !Array.isArray(json?.data)) {
    return { ok: false, configured: true, provider: "stripe", error: clean(json?.error?.message) || `Payment processor returned ${response.status}.`, transactions: [], hasMore: false };
  }
  const transactions = json.data.map((item) => {
    const row = asRecord(item);
    return {
      id: clean(row.id),
      type: clean(row.type),
      amountCents: typeof row.amount === "number" ? row.amount : 0,
      feeCents: typeof row.fee === "number" ? row.fee : 0,
      netCents: typeof row.net === "number" ? row.net : 0,
      sourceId: clean(row.source) || null,
      createdAt: stripeReconciliationTimestamp(row.created),
      availableOn: stripeReconciliationTimestamp(row.available_on),
    };
  });
  return { ok: true, configured: true, provider: "stripe", transactions, hasMore: json.has_more === true };
}

export async function listStripePayouts(input: {
  connectedAccountId: string;
  createdGte: Date;
  createdLte: Date;
  limit?: number;
  tenantId?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { payouts: StripePayoutSnapshot[]; hasMore: boolean }> {
  const apiKey = await getStripeSecretKey(input);
  if (!apiKey) return { ok: false, configured: false, provider: "stripe", error: "Payment processor is not configured.", payouts: [], hasMore: false };
  if (!clean(input.connectedAccountId).startsWith("acct_")) {
    return { ok: false, configured: true, provider: "stripe", error: "A connected school account is required.", payouts: [], hasMore: false };
  }
  const params = new URLSearchParams({
    "created[gte]": String(stripeUnixDate(input.createdGte)),
    "created[lte]": String(stripeUnixDate(input.createdLte)),
    limit: String(Math.min(Math.max(input.limit || 100, 1), 100)),
  });
  const response = await fetch(`https://api.stripe.com/v1/payouts?${params}`, {
    headers: connectedStripeHeaders(apiKey, "form", input.connectedAccountId),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { data?: unknown[]; has_more?: boolean; error?: { message?: string } } | null;
  if (!response.ok || !Array.isArray(json?.data)) {
    return { ok: false, configured: true, provider: "stripe", error: clean(json?.error?.message) || `Payment processor returned ${response.status}.`, payouts: [], hasMore: false };
  }
  const payouts = json.data.map((item) => {
    const row = asRecord(item);
    return {
      id: clean(row.id),
      amountCents: typeof row.amount === "number" ? row.amount : 0,
      status: clean(row.status),
      createdAt: stripeReconciliationTimestamp(row.created),
      arrivalDate: stripeReconciliationTimestamp(row.arrival_date),
      failureCode: clean(row.failure_code) || null,
    };
  });
  return { ok: true, configured: true, provider: "stripe", payouts, hasMore: json.has_more === true };
}

async function retrieveLegacyStripeConnectedAccount(
  accountId: string,
  apiKey: string,
): Promise<IntegrationSendResult & { account?: StripeConnectedAccountSnapshot }> {
  const response = await fetch(`https://api.stripe.com/v1/accounts/${encodeURIComponent(accountId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Stripe-Version": STRIPE_API_VERSION,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;

  if (!response.ok || !json?.id) {
    return {
      ok: false,
      configured: true,
      provider: "stripe",
      error: json?.error?.message || `Payment processor returned ${response.status}.`,
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
  if (!signature || !secret) return false;

  const parts = signature.split(",").reduce<{ timestamp?: string; signatures: string[] }>((acc, part) => {
    const [rawKey, ...rest] = part.split("=");
    const key = rawKey.trim();
    const value = rest.join("=").trim();
    if (key === "t") acc.timestamp = value;
    if (key === "v1" && value) acc.signatures.push(value);
    return acc;
  }, { signatures: [] });
  if (!parts.timestamp || !/^\d+$/.test(parts.timestamp) || !parts.signatures.length) return false;
  const timestamp = Number(parts.timestamp);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return false;

  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest();
  return parts.signatures.some((signed) => {
    if (!/^[0-9a-f]{64}$/i.test(signed)) return false;
    const actual = Buffer.from(signed, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  });
}

export function stripeWebhookSecretFingerprint(secret: string) {
  const cleaned = secret.trim();
  if (!cleaned) return null;
  return createHash("sha256").update(cleaned).digest("hex").slice(0, 12);
}
