import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildPlan,
  loadActorUserIds,
  sendWave,
  type WaveScope,
} from "../../../../../scripts/send-imported-parent-invitation-wave";

export const runtime = "nodejs";
export const maxDuration = 300;

const EXPECTED_OPERATION_TOKEN_HASH = "63c209bd789af9642d517e72affd5933523b9edd90078b235d7a758248404822";
const CANONICAL_EVENT_WEBHOOK_URL = "https://thebeesuite.io/api/sendgrid/events";
const MAX_BATCH_SIZE = 25;

type Action = "provider-status" | "configure-webhook" | "plan" | "send-batch";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function operationAuthorized(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"));
  const expected = Buffer.from(EXPECTED_OPERATION_TOKEN_HASH);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function sendGridRequest(path: string, init?: RequestInit) {
  const apiKey = clean(process.env.SENDGRID_API_KEY);
  if (!apiKey) throw new Error("SendGrid is not configured in the production runtime.");
  let response: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(`https://api.sendgrid.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status !== 429 || attempt === 3) break;
    const retryAfterSeconds = Math.min(Math.max(Number(response.headers.get("retry-after")) || 1, 1), 10);
    await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1_000));
  }
  if (!response) throw new Error(`SendGrid ${path} did not return a response.`);
  const text = await response.text();
  if (!response.ok) throw new Error(`SendGrid ${path} returned ${response.status}.`);
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`SendGrid ${path} returned an invalid response.`);
    }
  }
  return data;
}

type EventWebhookSettings = Record<string, unknown> & {
  id?: unknown;
  url?: unknown;
  public_key?: unknown;
};

async function eventWebhooks() {
  const result = await sendGridRequest("/v3/user/webhooks/event/settings/all") as { webhooks?: EventWebhookSettings[] };
  return Array.isArray(result.webhooks) ? result.webhooks : [];
}

function canonicalEventWebhook(webhooks: EventWebhookSettings[]) {
  return webhooks.find((webhook) => clean(webhook.url) === CANONICAL_EVENT_WEBHOOK_URL) ?? null;
}

async function providerStatus() {
  const [webhooks, domains, verifiedSenders, clickTracking] = await Promise.all([
    eventWebhooks(),
    sendGridRequest("/v3/whitelabel/domains?limit=200"),
    sendGridRequest("/v3/verified_senders"),
    sendGridRequest("/v3/tracking_settings/click"),
  ]) as [EventWebhookSettings[], Array<Record<string, unknown>>, { results?: Array<Record<string, unknown>> }, Record<string, unknown>];
  const eventSettings = canonicalEventWebhook(webhooks);
  const fromEmail = clean(process.env.SENDGRID_FROM_EMAIL).toLowerCase();
  const fromDomain = fromEmail.split("@")[1] ?? "";
  const authenticatedDomain = domains.some((domain) => clean(domain.domain).toLowerCase() === fromDomain && domain.valid === true);
  const verifiedSender = (verifiedSenders.results ?? []).some((sender) => clean(sender.from_email).toLowerCase() === fromEmail && sender.verified === true);
  const webhookUrl = clean(eventSettings?.url);
  return {
    fromDomain,
    senderReady: authenticatedDomain || verifiedSender,
    authenticatedDomain,
    verifiedSender,
    eventWebhook: {
      enabled: eventSettings?.enabled === true,
      canonicalUrl: webhookUrl === CANONICAL_EVENT_WEBHOOK_URL,
      delivered: eventSettings?.delivered === true,
      bounce: eventSettings?.bounce === true,
      deferred: eventSettings?.deferred === true,
      dropped: eventSettings?.dropped === true,
      spamReport: eventSettings?.spam_report === true,
    },
    signedEventWebhook: {
      enabled: Boolean(clean(eventSettings?.public_key)),
      hasPublicKey: Boolean(clean(eventSettings?.public_key)),
      verificationKeyDeployed: Boolean(clean(process.env.SENDGRID_EVENT_WEBHOOK_VERIFICATION_KEY)),
    },
    globalClickTracking: clickTracking.enabled === true,
  };
}

async function configureSignedEventWebhook() {
  const current = canonicalEventWebhook(await eventWebhooks());
  const currentId = clean(current?.id);
  const settings = await sendGridRequest(currentId
    ? `/v3/user/webhooks/event/settings/${encodeURIComponent(currentId)}`
    : "/v3/user/webhooks/event/settings", {
    method: currentId ? "PATCH" : "POST",
    body: JSON.stringify({
      enabled: true,
      url: CANONICAL_EVENT_WEBHOOK_URL,
      processed: true,
      deferred: true,
      delivered: true,
      bounce: true,
      dropped: true,
      spam_report: true,
      group_resubscribe: false,
    }),
  }) as EventWebhookSettings;
  const webhookId = currentId || clean(settings.id);
  if (!webhookId) throw new Error("SendGrid did not return an Event Webhook ID.");
  const signed = await sendGridRequest(`/v3/user/webhooks/event/settings/signed/${encodeURIComponent(webhookId)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: true }),
  }) as Record<string, unknown>;
  const publicKey = clean(signed.public_key);
  if (!publicKey) throw new Error("SendGrid did not return an Event Webhook verification key.");
  return { publicKey, status: await providerStatus() };
}

const SUPPRESSION_PATHS = {
  bounce: "/v3/suppression/bounces",
  block: "/v3/suppression/blocks",
  invalid: "/v3/suppression/invalid_emails",
  spamReport: "/v3/suppression/spam_reports",
  globalUnsubscribe: "/v3/suppression/unsubscribes",
} as const;

async function suppressedEmails(path: string) {
  const emails = new Set<string>();
  const pageSize = 500;
  for (let offset = 0; offset < 50_000; offset += pageSize) {
    const separator = path.includes("?") ? "&" : "?";
    const page = await sendGridRequest(`${path}${separator}limit=${pageSize}&offset=${offset}`);
    if (!Array.isArray(page)) throw new Error(`SendGrid ${path} returned an invalid suppression list.`);
    for (const entry of page) {
      if (!entry || typeof entry !== "object") continue;
      const email = clean((entry as { email?: unknown }).email).toLowerCase();
      if (email) emails.add(email);
    }
    if (page.length < pageSize) return emails;
  }
  throw new Error(`SendGrid ${path} suppression list exceeded the safe pagination limit.`);
}

async function preflightCandidates<T extends { email: string }>(candidates: T[]) {
  const suppressed = new Set<string>();
  for (const path of Object.values(SUPPRESSION_PATHS)) {
    for (const email of await suppressedEmails(path)) suppressed.add(email);
  }
  const ready: T[] = [];
  let suppressedCount = 0;
  for (const candidate of candidates) {
    if (suppressed.has(candidate.email.toLowerCase())) suppressedCount += 1;
    else ready.push(candidate);
  }
  return { ready, suppressed: suppressedCount };
}

async function requestBody(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  const action = clean(body.action) as Action;
  if (!["provider-status", "configure-webhook", "plan", "send-batch"].includes(action)) throw new Error("Unsupported operation action.");
  const scope = clean(body.scope) as WaveScope;
  if ((action === "plan" || action === "send-batch") && scope !== "kid_city" && scope !== "miss_honeys") throw new Error("A valid tenant scope is required.");
  const requestedLimit = Number(body.limit ?? MAX_BATCH_SIZE);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_BATCH_SIZE) : MAX_BATCH_SIZE;
  return { action, scope, limit, acknowledgePriorInactive: body.acknowledgePriorInactive === true };
}

export async function POST(request: NextRequest) {
  if (!operationAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  try {
    const input = await requestBody(request);
    if (input.action === "provider-status") return NextResponse.json({ ok: true, provider: await providerStatus() });
    if (input.action === "configure-webhook") return NextResponse.json({ ok: true, ...(await configureSignedEventWebhook()) });

    const plan = await buildPlan({ scope: input.scope, useDirectProfileEvidence: true });
    if (input.action === "plan") {
      const preflight = await preflightCandidates(plan.eligible);
      return NextResponse.json({
        ok: true,
        scope: input.scope,
        summary: plan.summary,
        providerSuppressed: preflight.suppressed,
        providerSendable: preflight.ready.length,
      });
    }

    if (!input.acknowledgePriorInactive) throw new Error("Previously invited inactive profiles must be explicitly acknowledged as excluded.");
    if (plan.interrupted.length) throw new Error("Interrupted preparation records require separate repair before sending.");
    const provider = await providerStatus();
    if (!provider.senderReady) throw new Error("SendGrid sender authentication is not ready.");
    if (!provider.eventWebhook.enabled || !provider.eventWebhook.canonicalUrl || !provider.signedEventWebhook.enabled || !provider.signedEventWebhook.verificationKeyDeployed) {
      throw new Error("The signed canonical SendGrid Event Webhook is not fully ready.");
    }
    const preflight = await preflightCandidates(plan.eligible);
    const batch = preflight.ready.slice(0, input.limit);
    if (!batch.length) {
      return NextResponse.json({ ok: true, scope: input.scope, accepted: 0, failed: 0, providerSuppressed: preflight.suppressed, remainingSendableNow: plan.eligible.length });
    }
    const actorUserIdByCenter = await loadActorUserIds(plan, input.scope);
    const result = await sendWave({ ...plan, eligible: batch }, actorUserIdByCenter, { concurrency: 3 });
    const postPlan = await buildPlan({ scope: input.scope, useDirectProfileEvidence: true });
    return NextResponse.json({
      ok: result.totals.failed === 0,
      scope: input.scope,
      batchPlanned: batch.length,
      ...result.totals,
      providerSuppressed: preflight.suppressed,
      remainingSendableNow: postPlan.eligible.length,
      remainingInterruptedPreparation: postPlan.interrupted.length,
    }, { status: result.totals.failed ? 502 : 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Operation failed." }, { status: 409 });
  }
}
