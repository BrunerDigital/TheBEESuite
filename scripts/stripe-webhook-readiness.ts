import { stripeWebhookSecretReadiness } from "../src/lib/stripe-webhook-readiness";

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim() || null;
}

async function main() {
  const expectedPlatformFingerprint = argumentValue("expected-platform-fingerprint");
  const readiness = await stripeWebhookSecretReadiness();
  const platformCandidates = readiness.candidates.filter((candidate) => candidate.owner === "platform_destination");
  const platformFingerprintMatches = expectedPlatformFingerprint
    ? platformCandidates.some((candidate) => candidate.fingerprint === expectedPlatformFingerprint)
    : null;

  console.log(JSON.stringify({
    ...readiness,
    expectedPlatformFingerprint,
    platformFingerprintMatches,
    matchingPlatformSources: expectedPlatformFingerprint
      ? platformCandidates.filter((candidate) => candidate.fingerprint === expectedPlatformFingerprint).map((candidate) => candidate.source)
      : [],
    note: "Fingerprints are one-way SHA-256 prefixes. This command never prints webhook secrets.",
  }, null, 2));

  if (!readiness.platformDestinationConfigured || platformFingerprintMatches === false) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    errorType: error instanceof Error ? error.name : "UnknownError",
    message: "Stripe webhook readiness check failed without exposing credentials.",
  }));
  process.exitCode = 1;
});
