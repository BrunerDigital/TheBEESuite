export type BrandKind = "bee-suite" | "kid-city-usa" | "miss-honeys-learning-center";

export type WorkspaceBranding = {
  kind: BrandKind;
  name: string;
  shortName: string;
  tagline: string;
  logoSrc: string;
  logoWidth: number;
  logoHeight: number;
  markSrc: string;
  markWidth: number;
  markHeight: number;
  logoAlt: string;
};

export const BEE_SUITE_BRANDING: WorkspaceBranding = {
  kind: "bee-suite",
  name: "The BEE Suite",
  shortName: "BEE Suite",
  tagline: "Childcare CRM & Operations",
  logoSrc: "/brand/the-bee-suite/app-icon-dark.png",
  logoWidth: 1024,
  logoHeight: 1024,
  markSrc: "/brand/the-bee-suite/favicon-dark.png",
  markWidth: 512,
  markHeight: 512,
  logoAlt: "The BEE Suite logo",
};

export const KID_CITY_USA_BRANDING: WorkspaceBranding = {
  kind: "kid-city-usa",
  name: "Kid City USA",
  shortName: "Kid City USA",
  tagline: "Where Kids Can BEE Kids",
  logoSrc: "/brand/kid-city-usa/logo-horizontal.png",
  logoWidth: 413,
  logoHeight: 213,
  markSrc: "/brand/kid-city-usa/logo-square.jpg",
  markWidth: 1000,
  markHeight: 1000,
  logoAlt: "Kid City USA logo",
};

export const MISS_HONEYS_LEARNING_CENTER_BRANDING: WorkspaceBranding = {
  kind: "miss-honeys-learning-center",
  name: "Miss Honey's Learning Center",
  shortName: "Miss Honey's",
  tagline: "Learning Center",
  logoSrc: "/brand/miss-honeys-learning-center/logo-transparent.png",
  logoWidth: 1024,
  logoHeight: 1024,
  markSrc: "/brand/miss-honeys-learning-center/logo-transparent.png",
  markWidth: 1024,
  markHeight: 1024,
  logoAlt: "Miss Honey's Learning Center logo",
};

function normalizeBrandText(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isKidCityBrandText(value?: string | null) {
  const normalized = normalizeBrandText(value);
  const compact = normalized.replace(/\s+/g, "");
  return normalized.includes("kid city usa") || compact.includes("kidcityusa");
}

export function isMissHoneysBrandText(value?: string | null) {
  const normalized = normalizeBrandText(value);
  const compact = normalized.replace(/\s+/g, "");
  return normalized.includes("miss honey s learning center")
    || normalized.includes("miss honeys learning center")
    || compact.includes("misshoneyslearningcenter");
}

export function canUseKidCityCorporateBilling(role?: string | null, brandKind?: BrandKind | null) {
  return role === "PLATFORM_OWNER" || brandKind === "kid-city-usa";
}

export function resolveWorkspaceBranding(input?: {
  tenantName?: string | null;
  tenantSlug?: string | null;
  brandName?: string | null;
  brandSlug?: string | null;
  organizationName?: string | null;
  email?: string | null;
}) {
  const candidate = [
    input?.tenantName,
    input?.tenantSlug,
    input?.brandName,
    input?.brandSlug,
    input?.organizationName,
    input?.email,
  ].join(" ");

  if (isMissHoneysBrandText(candidate)) return MISS_HONEYS_LEARNING_CENTER_BRANDING;
  if (isKidCityBrandText(candidate)) return KID_CITY_USA_BRANDING;

  return BEE_SUITE_BRANDING;
}
