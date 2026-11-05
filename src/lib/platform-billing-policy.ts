export const PLATFORM_PAYMENT_SCOPE = "bee_suite_platform_billing";

export type PlatformBillingViewer = {
  role?: string | null;
  accessScope?: string | null;
  applicationAccess?: string | null;
  workspace?: { mode?: string | null; readOnlyHistory?: boolean } | null;
};

export function canManagePlatformBilling(user: PlatformBillingViewer | null | undefined) {
  return user?.role === "PLATFORM_OWNER"
    && user.accessScope === "platform"
    && user.applicationAccess !== "fte_only"
    && user.workspace?.readOnlyHistory !== true
    && (!user.workspace || user.workspace.mode === "all");
}

export class PlatformBillingError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

export function billingText(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\x00-\x1f]/.test(value)) {
    throw new PlatformBillingError(`Enter a valid ${label} (up to ${max} characters).`);
  }
  return value.trim();
}

export function platformBillingEmail(value: unknown) {
  const email = billingText(value, "billing email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PlatformBillingError("Enter a valid billing email.");
  return email;
}

export function platformBillingAmount(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,6}(\.\d{1,2})?$/.test(value.trim())) {
    throw new PlatformBillingError("Enter a USD amount with no more than two decimal places.");
  }
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents < 50 || cents > 99_999_999) throw new PlatformBillingError("Enter an amount from $0.50 to $999,999.99.");
  return cents;
}

export function platformBillingRequestId(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) {
    throw new PlatformBillingError("A valid request ID is required. Refresh the page and try again.");
  }
  return value.toLowerCase();
}

export function stripeId(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return "";
}

export function billingRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function platformObjectMetadata(object: unknown) {
  const record = billingRecord(object);
  const direct = billingRecord(record.metadata);
  if (direct.paymentScope === PLATFORM_PAYMENT_SCOPE) return direct;
  const parent = billingRecord(record.parent);
  const details = billingRecord(parent.subscription_details ?? record.subscription_details);
  return billingRecord(details.metadata);
}

export function platformCheckoutUrl(value: string | null | undefined) {
  try { const url = new URL(value || ""); return url.protocol === "https:" && url.hostname === "checkout.stripe.com"; }
  catch { return false; }
}

export function platformInvoiceUrl(value: string | null | undefined) {
  try { const url = new URL(value || ""); return url.protocol === "https:" && url.hostname === "invoice.stripe.com"; }
  catch { return false; }
}
