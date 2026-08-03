import { prisma } from "../src/lib/prisma";
import { STRIPE_WEBHOOK_SUPPORTED_EVENT_TYPES } from "../src/lib/stripe-webhook-event-types";

type StripeListPage = {
  data?: Array<{
    id?: string;
    type?: string;
    created?: number;
    account?: string;
    livemode?: boolean;
    data?: { object?: Record<string, unknown> };
  }>;
  has_more?: boolean;
};

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim() || null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function listStripeEvents(apiKey: string, sinceSeconds: number) {
  const supported = new Set<string>(STRIPE_WEBHOOK_SUPPORTED_EVENT_TYPES);
  const events: Array<Record<string, unknown>> = [];
  let startingAfter: string | null = null;

  for (;;) {
    const params = new URLSearchParams({ limit: "100", "created[gte]": String(sinceSeconds) });
    if (startingAfter) params.set("starting_after", startingAfter);
    const response = await fetch(`https://api.stripe.com/v1/events?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Stripe event listing returned HTTP ${response.status}.`);
    const page = await response.json() as StripeListPage;
    const pageEvents = page.data || [];
    for (const event of pageEvents) {
      if (!event.id || !event.type || !supported.has(event.type)) continue;
      const object = objectValue(event.data?.object);
      const metadata = objectValue(object.metadata);
      events.push({
        eventId: event.id,
        type: event.type,
        createdAt: event.created ? new Date(event.created * 1000).toISOString() : null,
        livemode: event.livemode ?? null,
        connectedAccountId: stringValue(event.account),
        objectId: stringValue(object.id),
        tenantId: stringValue(metadata.tenantId),
        centerId: stringValue(metadata.centerId) || stringValue(metadata.schoolId),
        billingAccountId: stringValue(metadata.billingAccountId),
        invoiceId: stringValue(metadata.invoiceId),
        paymentId: stringValue(metadata.paymentId),
        setupFlow: stringValue(metadata.setupFlow),
        paymentScope: stringValue(metadata.paymentScope),
      });
    }
    if (!page.has_more || !pageEvents.length) break;
    startingAfter = pageEvents[pageEvents.length - 1]?.id || null;
    if (!startingAfter) break;
  }

  return events;
}

async function retrieveStripeAccountId(apiKey: string) {
  const response = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Stripe account lookup returned HTTP ${response.status}.`);
  const account = await response.json() as { id?: string };
  if (!account.id) throw new Error("Stripe account lookup did not return an account ID.");
  return account.id;
}

async function main() {
  const since = argumentValue("since");
  if (!since || !Number.isFinite(Date.parse(since))) {
    throw new Error("Provide --since=<ISO timestamp>.");
  }
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!apiKey) throw new Error("STRIPE_SECRET_KEY is not configured.");
  const expectedAccount = argumentValue("expected-account");
  const stripeAccountId = await retrieveStripeAccountId(apiKey);
  if (expectedAccount && stripeAccountId !== expectedAccount) {
    throw new Error(`Configured Stripe account ${stripeAccountId} does not match the expected account.`);
  }

  const events = await listStripeEvents(apiKey, Math.floor(Date.parse(since) / 1000));
  const eventIds = events.map((event) => String(event.eventId));
  const receipts = await prisma.stripeWebhookEvent.findMany({
    where: { eventId: { in: eventIds } },
    select: { eventId: true, type: true, objectId: true, status: true, error: true, processedAt: true, createdAt: true },
  });
  const receiptsByEventId = new Map(receipts.map((receipt) => [receipt.eventId, receipt]));

  const rows = events.map((event) => {
    const receipt = receiptsByEventId.get(String(event.eventId));
    return {
      ...event,
      beeSuiteReceipt: receipt ? {
        type: receipt.type,
        objectId: receipt.objectId,
        status: receipt.status,
        reason: receipt.error,
        receivedAt: receipt.createdAt.toISOString(),
        processedAt: receipt.processedAt?.toISOString() || null,
      } : null,
      reconciliation: receipt ? "received" : "missing_receipt",
    };
  });

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    since,
    stripeAccountId,
    supportedEventTypes: STRIPE_WEBHOOK_SUPPORTED_EVENT_TYPES,
    eventCount: rows.length,
    missingReceiptCount: rows.filter((row) => row.reconciliation === "missing_receipt").length,
    rows,
    limitations: [
      "Read-only: this command does not replay events or modify BEE Suite data.",
      "Stripe Accounts v2 thin-event destinations must also be reconciled in their destination delivery view.",
      "Only identifiers and metadata needed for reconciliation are emitted; complete Stripe payloads are omitted.",
    ],
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Webhook reconciliation failed.",
    }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
