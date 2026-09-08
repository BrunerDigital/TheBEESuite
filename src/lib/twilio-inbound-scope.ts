import { phoneMatchKey } from "@/lib/twilio-messaging";

export type TwilioInboundGuardianCandidate = {
  id: string;
  phone: string | null;
  userId: string | null;
  email: string | null;
  customFields: unknown;
  user: { tenantId: string } | null;
  family: {
    id: string;
    name: string;
    centerId: string | null;
    tenantId: string | null;
  };
};

export function tenantIdForTwilioInboundGuardian(candidate: TwilioInboundGuardianCandidate) {
  const familyTenantId = candidate.family.tenantId;
  const userTenantId = candidate.user?.tenantId ?? null;
  if (familyTenantId && userTenantId && familyTenantId !== userTenantId) return null;
  return familyTenantId ?? userTenantId;
}

export function resolveTwilioInboundGuardian(input: {
  candidates: readonly TwilioInboundGuardianCandidate[];
  fromPhoneKey: string;
  signatureTenantId: string | null;
}) {
  const exact = input.candidates
    .filter((candidate) => phoneMatchKey(candidate.phone) === input.fromPhoneKey)
    .map((candidate) => ({ candidate, tenantId: tenantIdForTwilioInboundGuardian(candidate) }))
    .filter((item): item is { candidate: TwilioInboundGuardianCandidate; tenantId: string } => Boolean(item.tenantId))
    .filter((item) => !input.signatureTenantId || item.tenantId === input.signatureTenantId);

  // A shared platform credential identifies the Twilio account, not the BEE
  // tenant. Never guess when the sender number maps to multiple guardians.
  if (exact.length !== 1) return null;
  return exact[0];
}
