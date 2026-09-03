import { createHash } from "node:crypto";
import { UserRole } from "@prisma/client";

export const SYNTHETIC_ROLE_QA_SOURCE = "bee_suite_credentialed_ux_qa";
export const SYNTHETIC_ROLE_QA_TENANT_SLUG = "bee-suite-isolated-demo";
export const SYNTHETIC_ROLE_QA_CENTER_EXTERNAL_ID = "demo-center-little-harbor";

export type SyntheticRoleQaAccount = {
  key: "executive" | "director" | "billing" | "teacher" | "parent";
  email: string;
  name: string;
  role: UserRole;
  scope: "brand" | "center" | "family";
  loginPath: "/executives" | "/directors" | "/teachers" | "/parents";
  landingPath: "/dashboard" | "/teacher-portal" | "/parent-portal";
};

export const SYNTHETIC_ROLE_QA_ACCOUNTS: readonly SyntheticRoleQaAccount[] = [
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
    key: "director",
    email: "ux-qa-director@synthetic.thebeesuite.io",
    name: "Synthetic QA Director",
    role: UserRole.CENTER_DIRECTOR,
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
