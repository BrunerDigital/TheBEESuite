import assert from "node:assert/strict";
import test from "node:test";
import { resolveTwilioInboundGuardian, tenantIdForTwilioInboundGuardian, type TwilioInboundGuardianCandidate } from "../src/lib/twilio-inbound-scope";

function candidate(id: string, phone: string, familyTenantId: string | null, userTenantId = familyTenantId): TwilioInboundGuardianCandidate {
  return {
    id,
    phone,
    userId: `${id}_user`,
    email: `${id}@example.com`,
    customFields: {},
    user: userTenantId ? { tenantId: userTenantId } : null,
    family: {
      id: `family_${id}`,
      name: `Family ${id}`,
      centerId: familyTenantId ? `center_${id}` : null,
      tenantId: familyTenantId,
    },
  };
}

test("tenant credentials resolve only one exact guardian in that tenant", () => {
  const tenantA = candidate("a", "+1 (555) 111-2222", "tenant_a");
  const tenantB = candidate("b", "+1 555-111-2222", "tenant_b");
  const resolved = resolveTwilioInboundGuardian({
    candidates: [tenantA, tenantB],
    fromPhoneKey: "5551112222",
    signatureTenantId: "tenant_a",
  });
  assert.equal(resolved?.candidate.id, "a");
  assert.equal(resolved?.tenantId, "tenant_a");
});

test("a shared platform credential fails closed on an ambiguous sender phone", () => {
  assert.equal(resolveTwilioInboundGuardian({
    candidates: [
      candidate("a", "5551112222", "tenant_a"),
      candidate("b", "5551112222", "tenant_b"),
    ],
    fromPhoneKey: "5551112222",
    signatureTenantId: null,
  }), null);
});

test("inconsistent guardian identity tenants fail closed", () => {
  const inconsistent = candidate("a", "5551112222", "tenant_a", "tenant_b");
  assert.equal(tenantIdForTwilioInboundGuardian(inconsistent), null);
  assert.equal(resolveTwilioInboundGuardian({
    candidates: [inconsistent],
    fromPhoneKey: "5551112222",
    signatureTenantId: null,
  }), null);
});
