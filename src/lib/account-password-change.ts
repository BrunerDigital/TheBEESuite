export type AccountPasswordChange = { currentPassword: string; password: string; confirmPassword: string };

/** Fixed own-account endpoint; no automatic retry, storage, telemetry, or redirect. */
export async function submitAccountPasswordChange(input: AccountPasswordChange, send: typeof fetch = fetch) {
  const currentPassword = input.currentPassword.trim();
  const password = input.password.trim();
  const confirmPassword = input.confirmPassword.trim();
  if (!currentPassword) return { ok: false, error: "Enter your current password." };
  if (password.length < 8) return { ok: false, error: "Use at least 8 characters for your new password." };
  if (password !== confirmPassword) return { ok: false, error: "The new passwords do not match." };
  if (password === currentPassword) return { ok: false, error: "Choose a different new password." };
  try {
    const response = await send("/api/profile/password", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, password, confirmPassword }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.ok && body && typeof body === "object" && "ok" in body && body.ok === true) return { ok: true };
    const error = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Password could not be updated. Check your account security and try again.";
    return { ok: false, error };
  } catch {
    return { ok: false, error: "The update could not be confirmed. Sign in again to check your password before trying another change." };
  }
}
