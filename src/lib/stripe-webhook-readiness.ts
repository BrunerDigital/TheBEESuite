import { getTenantIntegrationCredentialEntries } from "@/lib/integration-credentials";
import { stripeWebhookSecretFingerprint, verifyStripeSignature } from "@/lib/integrations";

export type StripeWebhookSecretCandidate = {
  owner: "platform_destination" | "tenant_destination";
  source: "STRIPE_THIN_WEBHOOK_SECRET" | "STRIPE_CONNECT_WEBHOOK_SECRET" | "STRIPE_PLATFORM_WEBHOOK_SECRET" | "STRIPE_WEBHOOK_SECRET" | "tenant_integration_credential";
  tenantId: string | null;
  secret: string;
};

export async function stripeWebhookSecretCandidates(): Promise<StripeWebhookSecretCandidate[]> {
  const candidates: StripeWebhookSecretCandidate[] = [];
  const thinSecret = process.env.STRIPE_THIN_WEBHOOK_SECRET?.trim();
  if (thinSecret) {
    candidates.push({
      owner: "platform_destination",
      source: "STRIPE_THIN_WEBHOOK_SECRET",
      tenantId: null,
      secret: thinSecret,
    });
  }
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();
  if (connectSecret) {
    candidates.push({
      owner: "platform_destination",
      source: "STRIPE_CONNECT_WEBHOOK_SECRET",
      tenantId: null,
      secret: connectSecret,
    });
  }
  const preferredPlatformSecret = process.env.STRIPE_PLATFORM_WEBHOOK_SECRET?.trim();
  if (preferredPlatformSecret) {
    candidates.push({
      owner: "platform_destination",
      source: "STRIPE_PLATFORM_WEBHOOK_SECRET",
      tenantId: null,
      secret: preferredPlatformSecret,
    });
  }
  const platformSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (platformSecret) {
    candidates.push({
      owner: "platform_destination",
      source: "STRIPE_WEBHOOK_SECRET",
      tenantId: null,
      secret: platformSecret,
    });
  }

  const tenantSecrets = await getTenantIntegrationCredentialEntries("stripe", "STRIPE_WEBHOOK_SECRET").catch(() => []);
  for (const credential of tenantSecrets) {
    const secret = credential.value.trim();
    if (secret) candidates.push({
      owner: "tenant_destination",
      source: "tenant_integration_credential",
      tenantId: credential.tenantId,
      secret,
    });
  }

  return candidates;
}

export async function matchStripeWebhookSecret(payload: string, signature: string | null) {
  const candidates = await stripeWebhookSecretCandidates();
  for (const candidate of candidates) {
    if (verifyStripeSignature({ payload, signature, secret: candidate.secret })) {
      return {
        configured: true,
        matched: true,
        owner: candidate.owner,
        tenantId: candidate.tenantId,
      } as const;
    }
  }

  return {
    configured: candidates.length > 0,
    matched: false,
    owner: null,
    tenantId: null,
  } as const;
}

export async function stripeWebhookSecretReadiness() {
  const candidates = await stripeWebhookSecretCandidates();
  return {
    configured: candidates.length > 0,
    platformDestinationConfigured: candidates.some((candidate) => candidate.owner === "platform_destination"),
    candidates: candidates.map((candidate) => ({
      owner: candidate.owner,
      source: candidate.source,
      tenantId: candidate.tenantId,
      fingerprint: stripeWebhookSecretFingerprint(candidate.secret),
    })),
  };
}
