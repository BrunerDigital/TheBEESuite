import type { BrandKind } from "./brand-assets";

const managementRoles = new Set([
  "PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR",
]);

export function canUseBeesResources(user?: {
  role?: string | null;
  branding?: { kind: BrandKind } | null;
} | null) {
  return user?.branding?.kind === "kid-city-usa" && managementRoles.has(user.role ?? "");
}

// Existing destinations verified on https://kidcityusa.com/bees/.
// Drive remains the source of truth and enforces its own account permissions.
export const beesResourceFolders = [
  { title: "Director / Owner Resources", description: "School leadership guides and operational resources.", id: "1k3lZdC2TUqdN2cGfaBKoHoPebOZtnhBF" },
  { title: "Kid City USA Forms", description: "School forms, templates, and reference documents.", id: "1DKo-lsGdFTPzRwq1ebMlu6FpsKtPiVtd" },
  { title: "Bee All You Can Bee Curriculum Resources", description: "Curriculum materials and classroom planning resources.", id: "1R6j5lzfCxDIQNL-eHQVORI8O4LCdvZFe" },
  { title: "Employee Trainings & Resources", description: "Training materials and resources for your team.", id: "1-714Gf9VFbV0HBD2XasySsN_r3235Ep8" },
  { title: "Monthly Menu", description: "Menus shared with Kid City USA schools.", id: "1SBSVSfsE5glluRxk9kvk86V-vRRmkDDL" },
  { title: "Manager’s Success Training", description: "Manager training materials and reference files.", id: "1AgrKC7lf_m7TXkwPzEaFSA0e09tgbfgl" },
] as const;

export const beesOnlineForms = [
  { title: "FTE Report", href: "https://forms.gle/16kWSqdCckLojP1y9" },
  { title: "PTO Request", href: "https://forms.gle/bgX55JYMqmvvT9Zd9" },
  { title: "MST Waitlist", href: "https://docs.google.com/forms/d/e/1FAIpQLSe0C_Fnu1UoJBaN-P_p-hATVJd6p6EPZxzAtNmZbF2cp--ZSA/viewform" },
  { title: "Call-To-Action", href: "https://docs.google.com/forms/d/e/1FAIpQLSfJkfme2at8LA7gvEhzr6ITP-pOQqt3SlEDqI0qLoUintj4-g/viewform" },
] as const;
