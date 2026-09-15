import type { SupabaseClient } from "@supabase/supabase-js";

export type ManagedMfaFactor = { id: string; label: string; verified: boolean };
export type MfaManagementInput = {
  email: string; password: string; action: "list" | "enroll" | "confirm" | "remove";
  factorId?: string; code?: string; currentFactorId?: string; currentCode?: string; label?: string;
};
export type MfaManagementResult = {
  ok: boolean; error?: string; requiresMfa?: boolean; factors?: ManagedMfaFactor[];
  enrollment?: { id: string; secret: string; uri: string }; signInRequired?: boolean;
};

/** Provider tokens remain request-local. No password, seed or code is persisted by the app. */
export async function manageMfa(
  client: Pick<SupabaseClient, "auth">,
  input: MfaManagementInput,
  beforeFactorChange: () => Promise<void>,
): Promise<MfaManagementResult> {
  let signedIn = false;
  let revoked = false;
  const fail = (error: string): MfaManagementResult => ({ ok: false, error, ...(revoked ? { signInRequired: true } : {}) });
  try {
    const login = await client.auth.signInWithPassword({ email: input.email, password: input.password });
    signedIn = Boolean(login.data.session);
    if (login.error || !login.data.session || !login.data.user?.id || login.data.user.email?.toLowerCase() !== input.email) {
      return fail("Password verification failed. Check your password and try again.");
    }
    const listed = await client.auth.mfa.listFactors();
    if (listed.error || !listed.data || !Array.isArray(listed.data.all)) return fail("Authenticator service is unavailable.");
    const all = listed.data.all;
    const factors = all.filter((factor) => factor.factor_type === "totp").map((factor, index) => ({
      id: factor.id, label: factor.friendly_name?.slice(0, 80) || `Authenticator ${index + 1}`, verified: factor.status === "verified",
    }));
    const verified = all.filter((factor) => factor.status === "verified");
    if (input.action === "list") return { ok: true, factors };
    if (verified.length) {
      const current = factors.find((factor) => factor.verified && factor.id === input.currentFactorId);
      if (!current || !/^\d{6}$/.test(input.currentCode ?? "")) return { ok: false, requiresMfa: true, factors, error: "Enter a code from an existing authenticator first." };
      const proof = await client.auth.mfa.challengeAndVerify({ factorId: current.id, code: input.currentCode! });
      const assurance = proof.error ? null : await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (proof.error || proof.data.user.id !== login.data.user.id || assurance?.error || assurance?.data?.currentLevel !== "aal2") {
        return { ok: false, requiresMfa: true, factors, error: "That existing authenticator code did not work. Try a fresh code." };
      }
    }
    if (input.action === "enroll") {
      const label = input.label?.trim();
      if (!label || label.length > 80) return fail("Name this authenticator (up to 80 characters).");
      if (all.length >= 10) return fail("Remove an unused setup before adding another authenticator.");
      const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: label, issuer: "The BEE Suite" });
      if (enrolled.error) return fail("Could not start setup. Use a unique authenticator name and try again.");
      return { ok: true, enrollment: { id: enrolled.data.id, secret: enrolled.data.totp.secret, uri: enrolled.data.totp.uri } };
    }
    const target = factors.find((factor) => factor.id === input.factorId);
    if (!target) return fail("That authenticator does not belong to this account.");
    if (input.action === "confirm" && (target.verified || !/^\d{6}$/.test(input.code ?? ""))) return fail("Enter the six-digit code from the new authenticator.");
    // Keep at least one working authenticator. Recovery uses a separately enrolled backup.
    if (input.action === "remove" && target.verified && factors.filter((factor) => factor.verified).length < 2) {
      return fail("Add and verify a replacement authenticator before removing your last one.");
    }
    // Invalidate BEE sessions BEFORE provider activation/removal. If the database
    // fails, do not mutate the provider. Even a provider timeout requires fresh login.
    await beforeFactorChange();
    revoked = true;
    if (input.action === "confirm") {
      const confirmed = await client.auth.mfa.challengeAndVerify({ factorId: target.id, code: input.code! });
      const assurance = confirmed.error ? null : await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (confirmed.error || confirmed.data.user.id !== login.data.user.id || assurance?.error || assurance?.data?.currentLevel !== "aal2") return fail("The new code could not be verified. Sign in and retry the pending setup with a fresh code.");
    } else {
      const removed = await client.auth.mfa.unenroll({ factorId: target.id });
      if (removed.error) return fail("The authenticator could not be removed. Sign in to check its current status.");
    }
    return { ok: true, signInRequired: true };
  } catch {
    return fail("Authenticator service is unavailable. Please try again.");
  } finally {
    if (signedIn) await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}
