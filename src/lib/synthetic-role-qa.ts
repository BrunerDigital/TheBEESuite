import { createHash } from "node:crypto";
import { UserRole } from "@prisma/client";

export const SYNTHETIC_ROLE_QA_SOURCE = "bee_suite_credentialed_ux_qa";
export const SYNTHETIC_ROLE_QA_TENANT_SLUG = "bee-suite-isolated-demo";
export const SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID = "demo-center-little-harbor";

export type SyntheticRoleQaAccount = {
  key: "platform" | "executive" | "regional" | "director" | "assistant" | "billing" | "teacher" | "parent" | "pickup" | "auditor";
  email: string;
  name: string;
  role: UserRole;
  scope: "platform" | "brand" | "center" | "family" | "pickup";
  loginPath: "/executives" | "/directors" | "/teachers" | "/parents";
  landingPath: "/dashboard" | "/teacher-portal" | "/parent-portal";
};

export const SYNTHETIC_ROLE_QA_ACCOUNTS: readonly SyntheticRoleQaAccount[] = [
  {
    key: "platform",
    email: "ux-qa-platform@synthetic.thebeesuite.io",
    name: "Synthetic QA Platform Owner",
    role: UserRole.PLATFORM_OWNER,
    scope: "platform",
    loginPath: "/executives",
    landingPath: "/dashboard",
  },
  {
    key: "executive",
    email: "ux-qa-executive@synthetic.thebeesuite.io",
    name: "Synthetic QA Executive",
    role: UserRole.BRAND_ADMIN,
    scope: "brand",
    loginPath: "/executives",
    landingPath: "/dashboard",
  },
  {
    key: "regional",
    email: "ux-qa-regional@synthetic.thebeesuite.io",
    name: "Synthetic QA Regional Manager",
    role: UserRole.REGIONAL_MANAGER,
    scope: "brand",
    loginPath: "/executives",
    landingPath: "/dashboard",
  },
  {
    key: "director",
    email: "ux-qa-director@synthetic.thebeesuite.io",
    name: "Synthetic QA Director",
    role: UserRole.CENTER_DIRECTOR,
    scope: "center",
    loginPath: "/directors",
    landingPath: "/dashboard",
  },
  {
    key: "assistant",
    email: "ux-qa-assistant@synthetic.thebeesuite.io",
    name: "Synthetic QA Assistant Director",
    role: UserRole.ASSISTANT_DIRECTOR,
    scope: "center",
    loginPath: "/directors",
    landingPath: "/dashboard",
  },
  {
    key: "billing",
    email: "ux-qa-billing@synthetic.thebeesuite.io",
    name: "Synthetic QA Billing",
    role: UserRole.BILLING_ADMIN,
    scope: "center",
    loginPath: "/directors",
    landingPath: "/dashboard",
  },
  {
    key: "teacher",
    email: "ux-qa-teacher@synthetic.thebeesuite.io",
    name: "Synthetic QA Teacher",
    role: UserRole.TEACHER,
    scope: "center",
    loginPath: "/teachers",
    landingPath: "/teacher-portal",
  },
  {
    key: "parent",
    email: "ux-qa-parent@synthetic.thebeesuite.io",
    name: "Synthetic QA Parent",
    role: UserRole.PARENT_GUARDIAN,
    scope: "family",
    loginPath: "/parents",
    landingPath: "/parent-portal",
  },
  {
    key: "pickup",
    email: "ux-qa-pickup@synthetic.thebeesuite.io",
    name: "Synthetic QA Authorized Pickup",
    role: UserRole.AUTHORIZED_PICKUP,
    scope: "pickup",
    loginPath: "/parents",
    landingPath: "/parent-portal",
  },
  {
    key: "auditor",
    email: "ux-qa-auditor@synthetic.thebeesuite.io",
    name: "Synthetic QA Read Only Auditor",
    role: UserRole.READ_ONLY_AUDITOR,
    scope: "brand",
    loginPath: "/executives",
    landingPath: "/dashboard",
  },
] as const;

export function syntheticRoleQaAccountRef(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 12);
}

export function isSyntheticRoleQaEmail(email: string | null | undefined) {
  return Boolean(email?.trim().toLowerCase().endsWith("@synthetic.thebeesuite.io"));
}

export function hasSyntheticRoleQaMarker(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const marker = value as Record<string, unknown>;
  return marker.syntheticTest === true && marker.qaSource === SYNTHETIC_ROLE_QA_SOURCE;
}

export function syntheticRoleQaMarker(existing?: unknown): Record<string, unknown> {
  const safeExisting = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  return {
    ...safeExisting,
    syntheticTest: true,
    qaSource: SYNTHETIC_ROLE_QA_SOURCE,
    qaPurpose: "credentialed_role_ux",
  };
}
