export type PasswordRecoveryCredential = {
  accessToken?: string;
  tokenHash?: string;
};

export type PasswordRecoveryLinkResolution =
  | { status: "ready"; credential: PasswordRecoveryCredential }
  | { status: "invalid"; message: string; reason: "expired" | "unverified" | "missing" };

export const EXPIRED_PASSWORD_RECOVERY_LINK_MESSAGE =
  "This reset link has expired or was already used or replaced. Request one fresh link, then open only the newest email.";

export const UNVERIFIED_PASSWORD_RECOVERY_LINK_MESSAGE =
  "This reset link could not be verified. Request one fresh link, then open only the newest email.";

export const MISSING_PASSWORD_RECOVERY_LINK_MESSAGE =
  "This page must be opened from the newest password reset email. Request one fresh link, then open only the newest message.";

const RECOVERY_QUERY_KEYS = [
  "access_token",
  "code",
  "error",
  "error_code",
  "error_description",
  "expires_at",
  "expires_in",
  "provider_refresh_token",
  "provider_token",
  "refresh_token",
  "token_hash",
  "tokenHash",
  "token_type",
  "type",
] as const;

function paramsFrom(value: string) {
  return new URLSearchParams(value.replace(/^[?#]/, ""));
}

function recoveryCredential(params: URLSearchParams): PasswordRecoveryCredential | null {
  if (params.get("type") !== "recovery") return null;

  const tokenHash = params.get("token_hash") || params.get("tokenHash");
  if (tokenHash) return { tokenHash };

  const accessToken = params.get("access_token");
  if (accessToken) return { accessToken };

  return null;
}

function recoveryError(query: URLSearchParams, fragment: URLSearchParams) {
  const error = query.get("error") || fragment.get("error") || "";
  const errorCode = query.get("error_code") || fragment.get("error_code") || "";
  const description = query.get("error_description") || fragment.get("error_description") || "";
  return { error, errorCode, description };
}

export function resolvePasswordRecoveryLink(search: string, hash: string): PasswordRecoveryLinkResolution {
  const query = paramsFrom(search);
  const fragment = paramsFrom(hash);
  const credential = recoveryCredential(query) || recoveryCredential(fragment);

  if (credential) return { status: "ready", credential };

  const providerError = recoveryError(query, fragment);
  if (providerError.error || providerError.errorCode || providerError.description) {
    const expired =
      providerError.errorCode === "otp_expired" ||
      /expired|invalid|one-time token|already used/i.test(providerError.description);

    return expired
      ? { status: "invalid", reason: "expired", message: EXPIRED_PASSWORD_RECOVERY_LINK_MESSAGE }
      : { status: "invalid", reason: "unverified", message: UNVERIFIED_PASSWORD_RECOVERY_LINK_MESSAGE };
  }

  if (query.has("code") || fragment.has("code")) {
    return { status: "invalid", reason: "unverified", message: UNVERIFIED_PASSWORD_RECOVERY_LINK_MESSAGE };
  }

  return { status: "invalid", reason: "missing", message: MISSING_PASSWORD_RECOVERY_LINK_MESSAGE };
}

export function passwordRecoveryUrlWithoutSecrets(value: string) {
  const url = new URL(value);
  for (const key of RECOVERY_QUERY_KEYS) url.searchParams.delete(key);
  return `${url.pathname}${url.search}`;
}
