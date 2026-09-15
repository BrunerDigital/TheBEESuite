import type { SupabaseClient } from "@supabase/supabase-js";

export type LoginMfaFactor = { id: string; label: string };
export type MfaLoginResult =
  | { status: "verified"; mfaVerified?: boolean }
  | { status: "invalid_password" }
  | { status: "unavailable" }
  | { status: "unsupported_factor" }
  | { status: "mfa_required" | "invalid_code"; factors: LoginMfaFactor[] };

/** A password-authenticated provider session is never an application session. */
export async function authenticateMfaLogin(
  client: Pick<SupabaseClient, "auth">,
  input: { email: string; password: string; mfaFactorId?: string; mfaCode?: string },
): Promise<MfaLoginResult> {
  let signedIn = false;
  try {
    const login = await client.auth.signInWithPassword({ email: input.email, password: input.password });
    signedIn = Boolean(login.data.session);
    if (login.error) return { status: login.error.status === 400 || login.error.status === 401 ? "invalid_password" : "unavailable" };
    if (!login.data.session || !login.data.user?.id || login.data.user.email?.toLowerCase() !== input.email) {
      return { status: "unavailable" };
    }
    const listed = await client.auth.mfa.listFactors();
    if (listed.error || !listed.data || !Array.isArray(listed.data.all)) return { status: "unavailable" };
    const verified = listed.data.all.filter((factor) => factor.status === "verified");
    if (verified.length === 0) return { status: "verified" };
    const factors = verified.filter((factor) => factor.factor_type === "totp").map((factor, index) => ({
      id: factor.id, label: factor.friendly_name?.slice(0, 80) || `Authenticator ${index + 1}`,
    }));
    if (factors.length === 0) return { status: "unsupported_factor" };
    if (!input.mfaCode) return { status: "mfa_required", factors };
    const factorId = input.mfaFactorId || factors[0].id;
    if (!/^\d{6}$/.test(input.mfaCode) || !factors.some((factor) => factor.id === factorId)) {
      return { status: "invalid_code", factors };
    }
    const result = await client.auth.mfa.challengeAndVerify({ factorId, code: input.mfaCode });
    if (result.error) return { status: "invalid_code", factors };
    if (result.data.user.id !== login.data.user.id || result.data.user.email?.toLowerCase() !== input.email) {
      return { status: "unavailable" };
    }
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return !assurance.error && assurance.data?.currentLevel === "aal2"
      ? { status: "verified", mfaVerified: true } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  } finally {
    // Release this request's temporary provider session only. App sessions and
    // other devices are independent and must not be globally signed out.
    if (signedIn) await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}
