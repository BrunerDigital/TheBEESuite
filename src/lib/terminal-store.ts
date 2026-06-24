import { UserRole } from "@prisma/client";
import { getStripeSecretKey, type IntegrationSendResult } from "@/lib/integrations";

export type TerminalStoreCategory = "reader" | "accessory";

export type TerminalStoreItem = {
  id: string;
  name: string;
  category: TerminalStoreCategory;
  description: string;
  stripeBasePriceCents: number;
  priceCents: number;
  sourceUrl: string;
};

export type TerminalStoreLineItem = {
  itemId: string;
  quantity: number;
};

const TERMINAL_STORE_MARKUP_BPS = 2_000;
const MAX_TERMINAL_STORE_QUANTITY = 20;

const terminalStoreRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

export function terminalStorePriceCents(stripeBasePriceCents: number) {
  return Math.round(stripeBasePriceCents * (1 + TERMINAL_STORE_MARKUP_BPS / 10_000));
}

function item(input: Omit<TerminalStoreItem, "priceCents">): TerminalStoreItem {
  return {
    ...input,
    priceCents: terminalStorePriceCents(input.stripeBasePriceCents),
  };
}

export const terminalStoreCatalog = [
  item({
    id: "stripe-reader-s710",
    name: "Stripe Reader S710",
    category: "reader",
    description: "Cellular-capable smart reader for countertop and handheld payments.",
    stripeBasePriceCents: 29_900,
    sourceUrl: "https://stripe.com/terminal",
  }),
  item({
    id: "stripe-reader-s700",
    name: "Stripe Reader S700",
    category: "reader",
    description: "Wi-Fi smart reader with touchscreen for countertop and handheld payments.",
    stripeBasePriceCents: 29_900,
    sourceUrl: "https://stripe.com/terminal/s700",
  }),
  item({
    id: "bbpos-wisepos-e",
    name: "BBPOS WisePOS E",
    category: "reader",
    description: "Touchscreen smart reader for countertop and handheld use.",
    stripeBasePriceCents: 24_900,
    sourceUrl: "https://stripe.com/terminal/wisepose",
  }),
  item({
    id: "stripe-reader-m2",
    name: "Stripe Reader M2",
    category: "reader",
    description: "Compact Bluetooth mobile reader for phones and tablets.",
    stripeBasePriceCents: 5_900,
    sourceUrl: "https://stripe.com/terminal/m2",
  }),
  item({
    id: "s700-s710-dock",
    name: "Stripe Reader S700/S710 Dock",
    category: "accessory",
    description: "Countertop dock for S700 and S710 readers.",
    stripeBasePriceCents: 4_900,
    sourceUrl: "https://stripe.com/terminal/s700",
  }),
  item({
    id: "s700-s710-hub",
    name: "Stripe Reader S700/S710 Hub",
    category: "accessory",
    description: "USB and Ethernet hub for S700 and S710 readers.",
    stripeBasePriceCents: 3_900,
    sourceUrl: "https://stripe.com/terminal/s700",
  }),
  item({
    id: "s700-s710-case",
    name: "Stripe Reader S700/S710 Case",
    category: "accessory",
    description: "Protective case for S700 and S710 readers.",
    stripeBasePriceCents: 1_900,
    sourceUrl: "https://stripe.com/terminal/s700",
  }),
  item({
    id: "wisepos-e-dock",
    name: "BBPOS WisePOS E Dock",
    category: "accessory",
    description: "Countertop dock for the BBPOS WisePOS E reader.",
    stripeBasePriceCents: 4_900,
    sourceUrl: "https://stripe.com/terminal/wisepose",
  }),
  item({
    id: "stripe-reader-m2-dock",
    name: "Stripe Reader M2 Dock",
    category: "accessory",
    description: "Countertop dock for the Stripe Reader M2.",
    stripeBasePriceCents: 1_900,
    sourceUrl: "https://stripe.com/terminal/m2",
  }),
  item({
    id: "stripe-reader-m2-mount",
    name: "Stripe Reader M2 Mount",
    category: "accessory",
    description: "Mount for holding a Stripe Reader M2.",
    stripeBasePriceCents: 500,
    sourceUrl: "https://stripe.com/terminal/m2",
  }),
] satisfies TerminalStoreItem[];

const catalogById = new Map(terminalStoreCatalog.map((catalogItem) => [catalogItem.id, catalogItem]));

export function canAccessTerminalStore(user: { role: UserRole }) {
  return terminalStoreRoles.has(user.role);
}

export function terminalStoreItemById(itemId: string) {
  return catalogById.get(itemId) ?? null;
}

export function normalizeTerminalStoreLineItems(items: TerminalStoreLineItem[]) {
  const quantitiesById = new Map<string, number>();
  for (const item of items) {
    const product = terminalStoreItemById(clean(item.itemId));
    if (!product) continue;
    const quantity = Math.max(0, Math.min(MAX_TERMINAL_STORE_QUANTITY, Math.floor(Number(item.quantity) || 0)));
    if (!quantity) continue;
    quantitiesById.set(product.id, Math.min(MAX_TERMINAL_STORE_QUANTITY, (quantitiesById.get(product.id) ?? 0) + quantity));
  }
  return Array.from(quantitiesById.entries()).map(([itemId, quantity]) => {
    const product = terminalStoreItemById(itemId);
    if (!product) throw new Error(`Unknown terminal store item: ${itemId}`);
    return { item: product, quantity };
  });
}

export function terminalStoreOrderTotals(items: TerminalStoreLineItem[]) {
  const normalizedItems = normalizeTerminalStoreLineItems(items);
  const subtotalCents = normalizedItems.reduce((sum, row) => sum + row.item.priceCents * row.quantity, 0);
  const stripeBaseSubtotalCents = normalizedItems.reduce((sum, row) => sum + row.item.stripeBasePriceCents * row.quantity, 0);
  return {
    items: normalizedItems,
    subtotalCents,
    stripeBaseSubtotalCents,
    markupCents: subtotalCents - stripeBaseSubtotalCents,
  };
}

function stripeHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

export async function createTerminalStoreCheckoutSession({
  items,
  purchaserEmail,
  purchaserName,
  successUrl,
  cancelUrl,
  metadata,
  idempotencyKey,
  credentials,
}: {
  items: TerminalStoreLineItem[];
  purchaserEmail?: string | null;
  purchaserName?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  idempotencyKey?: string | null;
  credentials?: Record<string, string>;
}): Promise<IntegrationSendResult & { totalCents?: number; stripeBaseSubtotalCents?: number; markupCents?: number }> {
  const apiKey = await getStripeSecretKey({ credentials: credentials ?? {} });
  if (!apiKey) {
    return { ok: false, configured: false, provider: "stripe", error: "Stripe is not configured." };
  }

  const totals = terminalStoreOrderTotals(items);
  if (!totals.items.length || totals.subtotalCents <= 0) {
    return { ok: false, configured: true, provider: "stripe", error: "Select at least one store item." };
  }

  const body = new URLSearchParams({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: metadata.orderReference || metadata.purchaserUserId || "terminal-store",
    billing_address_collection: "required",
    customer_creation: "always",
    "shipping_address_collection[allowed_countries][0]": "US",
    "phone_number_collection[enabled]": "true",
    "invoice_creation[enabled]": "true",
  });

  if (isEmail(purchaserEmail)) body.set("customer_email", purchaserEmail!);

  totals.items.forEach((row, index) => {
    body.set(`line_items[${index}][quantity]`, String(row.quantity));
    body.set(`line_items[${index}][price_data][currency]`, "usd");
    body.set(`line_items[${index}][price_data][unit_amount]`, String(row.item.priceCents));
    body.set(`line_items[${index}][price_data][product_data][name]`, row.item.name);
    body.set(`line_items[${index}][price_data][product_data][description]`, row.item.description);
    body.set(`line_items[${index}][price_data][product_data][metadata][terminalStoreItemId]`, row.item.id);
    body.set(`line_items[${index}][price_data][product_data][metadata][stripeBasePriceCents]`, String(row.item.stripeBasePriceCents));
  });

  const compactItems = totals.items
    .map((row) => `${row.item.id}:${row.quantity}`)
    .join(",");
  const sessionMetadata = {
    ...metadata,
    source: "terminal_store",
    purchaserEmail: isEmail(purchaserEmail) ? purchaserEmail! : "",
    purchaserName: clean(purchaserName),
    itemSummary: compactItems.slice(0, 500),
    itemCount: String(totals.items.reduce((sum, row) => sum + row.quantity, 0)),
    checkoutTotalCents: String(totals.subtotalCents),
    stripeBaseSubtotalCents: String(totals.stripeBaseSubtotalCents),
    beeSuiteMarkupCents: String(totals.markupCents),
  };
  Object.entries(sessionMetadata).forEach(([key, value]) => {
    body.set(`metadata[${key}]`, value);
    body.set(`payment_intent_data[metadata][${key}]`, value);
    body.set(`invoice_creation[invoice_data][metadata][${key}]`, value);
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      ...stripeHeaders(apiKey),
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
      totalCents: totals.subtotalCents,
      stripeBaseSubtotalCents: totals.stripeBaseSubtotalCents,
      markupCents: totals.markupCents,
    };
  }

  return {
    ok: true,
    configured: true,
    provider: "stripe",
    id: json.id,
    url: json.url,
    totalCents: totals.subtotalCents,
    stripeBaseSubtotalCents: totals.stripeBaseSubtotalCents,
    markupCents: totals.markupCents,
  };
}
