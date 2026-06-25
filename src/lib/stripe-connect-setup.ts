export type StripeConnectSetupDetails = {
  legalBusinessName: string;
  displayName: string;
  payoutContactName: string;
  payoutContactEmail: string;
  payoutContactPhone: string;
  supportEmail: string;
  supportPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  businessUrl: string;
  productDescription: string;
};

export type StripeConnectSetupInput = Partial<Record<keyof StripeConnectSetupDetails, unknown>>;

export type StripeConnectSetupValidationResult = {
  ok: boolean;
  details: StripeConnectSetupDetails;
  errors: Partial<Record<keyof StripeConnectSetupDetails, string>>;
};

export type StripeConnectSetupFallback = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  customFields?: unknown;
};

export const STRIPE_CONNECT_PRODUCT_DESCRIPTION_DEFAULT =
  "Childcare tuition, registration fees, deposits, and school account payouts.";

export const STRIPE_CONNECT_RESTRICTED_KEY_PERMISSIONS = [
  "Core > Accounts: Read",
  "Core > Accounts: Write",
  "Connect > Account Links: Write",
] as const;

export const STRIPE_CONNECT_RESTRICTED_KEY_FIX_MESSAGE =
  `Stripe rejected payout setup because the restricted key is missing required permissions. In Stripe Dashboard > API keys, edit the restricted key and enable: ${STRIPE_CONNECT_RESTRICTED_KEY_PERMISSIONS.join(", ")}. This Accounts v2 flow creates and verifies /v2/core/accounts, so Connect-only write access is not enough. Then try Save and continue again.`;

const US_STATES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

const requiredFields: Array<keyof StripeConnectSetupDetails> = [
  "legalBusinessName",
  "displayName",
  "payoutContactEmail",
  "payoutContactPhone",
  "supportEmail",
  "supportPhone",
  "addressLine1",
  "city",
  "state",
  "postalCode",
  "productDescription",
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown, maxLength = 120) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanEmail(value: unknown) {
  return cleanText(value, 254).toLowerCase();
}

function cleanState(value: unknown) {
  return cleanText(value, 2).toUpperCase();
}

function cleanPostalCode(value: unknown) {
  return cleanText(value, 20).toUpperCase();
}

function cleanPhone(value: unknown) {
  const raw = cleanText(value, 40);
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return raw;
}

function cleanUrl(value: unknown) {
  const raw = cleanText(value, 200);
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function savedSetup(customFields: unknown): Partial<StripeConnectSetupDetails> {
  const custom = asRecord(customFields);
  const setup = asRecord(custom.stripeConnectSetup);
  return {
    legalBusinessName: cleanText(setup.legalBusinessName),
    displayName: cleanText(setup.displayName),
    payoutContactName: cleanText(setup.payoutContactName),
    payoutContactEmail: cleanEmail(setup.payoutContactEmail),
    payoutContactPhone: cleanPhone(setup.payoutContactPhone),
    supportEmail: cleanEmail(setup.supportEmail),
    supportPhone: cleanPhone(setup.supportPhone),
    addressLine1: cleanText(setup.addressLine1),
    addressLine2: cleanText(setup.addressLine2),
    city: cleanText(setup.city),
    state: cleanState(setup.state),
    postalCode: cleanPostalCode(setup.postalCode),
    businessUrl: cleanUrl(setup.businessUrl),
    productDescription: cleanText(setup.productDescription, 240),
  };
}

function firstValue(...values: Array<unknown>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0) ?? "";
}

export function normalizeStripeConnectSetupInput(
  input: StripeConnectSetupInput = {},
  fallback: StripeConnectSetupFallback = {},
): StripeConnectSetupValidationResult {
  const saved = savedSetup(fallback.customFields);
  const legalBusinessName = cleanText(firstValue(input.legalBusinessName, saved.legalBusinessName, fallback.name), 120);
  const displayName = cleanText(firstValue(input.displayName, saved.displayName, legalBusinessName, fallback.name), 120);
  const payoutContactEmail = cleanEmail(firstValue(input.payoutContactEmail, saved.payoutContactEmail, fallback.email));
  const payoutContactPhone = cleanPhone(firstValue(input.payoutContactPhone, saved.payoutContactPhone, fallback.phone));
  const supportEmail = cleanEmail(firstValue(input.supportEmail, saved.supportEmail, payoutContactEmail, fallback.email));
  const supportPhone = cleanPhone(firstValue(input.supportPhone, saved.supportPhone, payoutContactPhone, fallback.phone));

  const details: StripeConnectSetupDetails = {
    legalBusinessName,
    displayName,
    payoutContactName: cleanText(firstValue(input.payoutContactName, saved.payoutContactName), 120),
    payoutContactEmail,
    payoutContactPhone,
    supportEmail,
    supportPhone,
    addressLine1: cleanText(firstValue(input.addressLine1, saved.addressLine1, fallback.address), 120),
    addressLine2: cleanText(firstValue(input.addressLine2, saved.addressLine2), 120),
    city: cleanText(firstValue(input.city, saved.city, fallback.city), 80),
    state: cleanState(firstValue(input.state, saved.state, fallback.state)),
    postalCode: cleanPostalCode(firstValue(input.postalCode, saved.postalCode, fallback.postalCode)),
    businessUrl: cleanUrl(firstValue(input.businessUrl, saved.businessUrl)),
    productDescription: cleanText(
      firstValue(input.productDescription, saved.productDescription, STRIPE_CONNECT_PRODUCT_DESCRIPTION_DEFAULT),
      240,
    ),
  };

  const errors: Partial<Record<keyof StripeConnectSetupDetails, string>> = {};
  for (const field of requiredFields) {
    if (!details[field]) errors[field] = "Required";
  }
  if (details.payoutContactEmail && !isEmail(details.payoutContactEmail)) {
    errors.payoutContactEmail = "Enter a valid email.";
  }
  if (details.supportEmail && !isEmail(details.supportEmail)) {
    errors.supportEmail = "Enter a valid email.";
  }
  if (details.payoutContactPhone && phoneDigits(details.payoutContactPhone).length < 10) {
    errors.payoutContactPhone = "Enter a valid phone number.";
  }
  if (details.supportPhone && phoneDigits(details.supportPhone).length < 10) {
    errors.supportPhone = "Enter a valid phone number.";
  }
  if (details.state && !US_STATES.has(details.state)) {
    errors.state = "Use a valid two-letter state.";
  }
  if (details.postalCode && !/^\d{5}(-\d{4})?$/.test(details.postalCode)) {
    errors.postalCode = "Use a valid ZIP code.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    details,
    errors,
  };
}

export function stripeConnectSetupCustomFieldPatch(details: StripeConnectSetupDetails) {
  return {
    stripeConnectSetup: details,
  };
}
