const DEFAULT_INQUIRY_ALLOWED_ORIGINS = [
  "https://kidcityusa.com",
  "https://www.kidcityusa.com",
  "https://thebeesuite.io",
  "https://www.thebeesuite.io",
];

type InquiryOriginEnv = Record<string, string | undefined>;

function cleanOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function getConfiguredInquiryAllowedOrigins(
  env: InquiryOriginEnv = process.env as InquiryOriginEnv,
) {
  const configured = env.INQUIRY_ALLOWED_ORIGINS?.split(",")
    .map(cleanOrigin)
    .filter(Boolean);

  return configured?.length ? configured : [...DEFAULT_INQUIRY_ALLOWED_ORIGINS];
}

export function isAllowedInquiryOrigin(
  origin?: string | null,
  env: InquiryOriginEnv = process.env as InquiryOriginEnv,
) {
  if (!origin) return true;
  const cleanedOrigin = cleanOrigin(origin);
  return getConfiguredInquiryAllowedOrigins(env).includes(cleanedOrigin);
}

export function getAllowedInquiryOrigin(
  origin?: string | null,
  env: InquiryOriginEnv = process.env as InquiryOriginEnv,
) {
  const origins = getConfiguredInquiryAllowedOrigins(env);
  if (!origin) return origins[0];

  const cleanedOrigin = cleanOrigin(origin);
  return origins.includes(cleanedOrigin) ? cleanedOrigin : origins[0];
}

export function inquiryCorsHeaders(
  origin?: string | null,
  env: InquiryOriginEnv = process.env as InquiryOriginEnv,
) {
  return {
    "Access-Control-Allow-Origin": getAllowedInquiryOrigin(origin, env),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
