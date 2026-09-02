export type RoleExperience = {
  role: string;
  homeLabel: string;
  mainPriorities: readonly string[];
  primaryActions: readonly string[];
  attentionAreas: readonly string[];
  primaryNavigation: readonly string[];
  mobileNavigation: readonly string[];
};

const defaultExperience: RoleExperience = {
  role: "DEFAULT",
  homeLabel: "Workspace overview",
  mainPriorities: ["Current work", "Needs attention", "Authorized activity"],
  primaryActions: ["dashboard", "notifications", "messages"],
  attentionAreas: ["Assigned tasks", "Unread updates", "Exceptions"],
  primaryNavigation: ["dashboard", "notifications", "messages", "help"],
  mobileNavigation: ["dashboard", "notifications", "messages"],
};

export const roleExperiences: Record<string, RoleExperience> = {
  PLATFORM_OWNER: {
    role: "PLATFORM_OWNER",
    homeLabel: "Platform operations",
    mainPriorities: ["Workspace health", "Cross-location exceptions", "Release and access posture"],
    primaryActions: ["dashboard", "multi-location-dashboard", "data-readiness", "ai-command"],
    attentionAreas: ["Operational exceptions", "Migration blockers", "Security and audit events"],
    primaryNavigation: ["dashboard", "multi-location-dashboard", "notifications", "messages", "ai-command"],
    mobileNavigation: ["dashboard", "multi-location-dashboard", "notifications", "messages"],
  },
  BRAND_ADMIN: {
    role: "BRAND_ADMIN",
    homeLabel: "Company overview",
    mainPriorities: ["Location performance", "Enrollment and operations", "Company-wide exceptions"],
    primaryActions: ["dashboard", "multi-location-dashboard", "crm-leads", "analytics"],
    attentionAreas: ["Location exceptions", "Enrollment follow-up", "Compliance and billing risk"],
    primaryNavigation: ["dashboard", "multi-location-dashboard", "notifications", "messages", "analytics"],
    mobileNavigation: ["dashboard", "multi-location-dashboard", "notifications", "messages"],
  },
  REGIONAL_MANAGER: {
    role: "REGIONAL_MANAGER",
    homeLabel: "Regional operations",
    mainPriorities: ["School performance", "Director follow-up", "Regional exceptions"],
    primaryActions: ["dashboard", "multi-location-dashboard", "crm-leads", "classroom-dashboard"],
    attentionAreas: ["School-level exceptions", "Staffing and compliance", "Enrollment follow-up"],
    primaryNavigation: ["dashboard", "multi-location-dashboard", "notifications", "messages", "classroom-dashboard"],
    mobileNavigation: ["dashboard", "multi-location-dashboard", "notifications", "messages"],
  },
  CENTER_DIRECTOR: {
    role: "CENTER_DIRECTOR",
    homeLabel: "Today at your school",
    mainPriorities: ["Today and needs attention", "Classroom coverage", "Family and enrollment work"],
    primaryActions: ["dashboard", "classroom-dashboard", "crm-leads", "messages"],
    attentionAreas: ["Attendance and ratios", "Family requests", "Required records and billing exceptions"],
    primaryNavigation: ["dashboard", "classroom-dashboard", "notifications", "messages", "crm-leads"],
    mobileNavigation: ["dashboard", "classroom-dashboard", "notifications", "messages"],
  },
  ASSISTANT_DIRECTOR: {
    role: "ASSISTANT_DIRECTOR",
    homeLabel: "Today at your school",
    mainPriorities: ["Daily operations", "Classroom support", "Family follow-up"],
    primaryActions: ["dashboard", "classroom-dashboard", "crm-leads", "messages"],
    attentionAreas: ["Attendance and ratios", "Open tasks", "Family and staff requests"],
    primaryNavigation: ["dashboard", "classroom-dashboard", "notifications", "messages", "crm-leads"],
    mobileNavigation: ["dashboard", "classroom-dashboard", "notifications", "messages"],
  },
  TEACHER: {
    role: "TEACHER",
    homeLabel: "Today in your classroom",
    mainPriorities: ["Roster and attendance", "Daily reports", "Family communication"],
    primaryActions: ["teacher-portal", "attendance", "daily-reports", "messages"],
    attentionAreas: ["Missing attendance", "Incomplete reports", "Unread family messages"],
    primaryNavigation: ["teacher-portal", "classroom-dashboard", "messages", "documents"],
    mobileNavigation: ["teacher-portal", "classroom-dashboard", "messages"],
  },
  BILLING_ADMIN: {
    role: "BILLING_ADMIN",
    homeLabel: "Billing work queue",
    mainPriorities: ["Balances needing review", "Payment status", "Family billing follow-up"],
    primaryActions: ["dashboard", "billing-invoices", "payments", "messages"],
    attentionAreas: ["Past-due accounts", "Failed or processing payments", "Billing questions"],
    primaryNavigation: ["dashboard", "billing-invoices", "notifications", "messages"],
    mobileNavigation: ["dashboard", "billing-invoices", "notifications", "messages"],
  },
  PARENT_GUARDIAN: {
    role: "PARENT_GUARDIAN",
    homeLabel: "Your family today",
    mainPriorities: ["Child updates", "Messages", "Payments and forms"],
    primaryActions: ["parent-portal"],
    attentionAreas: ["New updates", "Required forms", "Account actions"],
    primaryNavigation: ["parent-portal"],
    mobileNavigation: ["parent-portal"],
  },
  AUTHORIZED_PICKUP: {
    role: "AUTHORIZED_PICKUP",
    homeLabel: "Pickup access",
    mainPriorities: ["Approved pickup access", "Identity guidance", "Current child status"],
    primaryActions: ["parent-portal"],
    attentionAreas: ["Access changes", "Pickup instructions"],
    primaryNavigation: ["parent-portal"],
    mobileNavigation: ["parent-portal"],
  },
  READ_ONLY_AUDITOR: {
    role: "READ_ONLY_AUDITOR",
    homeLabel: "Read-only review",
    mainPriorities: ["Compliance posture", "Reports", "Audit evidence"],
    primaryActions: ["dashboard", "multi-location-dashboard", "analytics", "audit-logs"],
    attentionAreas: ["Compliance exceptions", "Missing evidence", "Material changes"],
    primaryNavigation: ["dashboard", "multi-location-dashboard", "analytics", "audit-logs"],
    mobileNavigation: ["dashboard", "multi-location-dashboard", "analytics", "audit-logs"],
  },
};

export function roleExperienceFor(role?: string | null) {
  return role ? roleExperiences[role] ?? defaultExperience : defaultExperience;
}

export function navigationNeighborhoodLabel(groupTitle: string) {
  const labels: Record<string, string> = {
    Command: "Overview and command",
    "School Day": "Daily operations",
    People: "People, billing, and records",
    Administration: "Administration",
    Growth: "Enrollment and growth",
    Utilities: "Settings and support",
  };
  return labels[groupTitle] ?? groupTitle;
}
