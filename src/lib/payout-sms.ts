import { securePublicAppUrlForPath } from "@/lib/public-app-url";
import type { IntegrationSendResult } from "@/lib/integrations";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function payoutSmsRecipient(customFields: unknown) {
  const setup = objectValue(objectValue(customFields).stripeConnectSetup);
  return clean(setup.payoutContactPhone) || null;
}

export function beeSuitePayoutDetailsUrl(centerId: string) {
  const search = new URLSearchParams({ center: centerId });
  return securePublicAppUrlForPath("/payouts", `?${search.toString()}`);
}

export function formatPayoutAmount(amountCents: number, currency: string) {
  const normalizedCurrency = clean(currency).toUpperCase();
  if (!Number.isSafeInteger(amountCents) || amountCents < 0 || normalizedCurrency !== "USD") return null;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      currencyDisplay: "symbol",
    }).format(amountCents / 100);
  } catch {
    return null;
  }
}

export function beeSuitePayoutSmsBody({
  amountCents,
  currency,
  centerId,
}: {
  amountCents: number;
  currency: string;
  centerId: string;
}) {
  const amount = formatPayoutAmount(amountCents, currency);
  const normalizedCenterId = clean(centerId);
  if (!amount || !normalizedCenterId) return null;

  return `Hello! Your ${amount} payout from The BEE Suite is on its way. View payout details: ${beeSuitePayoutDetailsUrl(normalizedCenterId)}`;
}

export async function sendPayoutSmsSafely(send: () => Promise<IntegrationSendResult>): Promise<IntegrationSendResult> {
  try {
    return await send();
  } catch {
    return {
      ok: false,
      configured: true,
      provider: "twilio",
      error: "Twilio request failed before receiving a response.",
    };
  }
}
