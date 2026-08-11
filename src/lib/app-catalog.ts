export type BeeWebWorkspaceAliasKey =
  | "enrollment"
  | "growth"
  | "operations"
  | "billing"
  | "records"
  | "insights"
  | "staff";

export type BeeWebWorkspaceAliasDefinition = {
  brandLabel: string;
  functionalLabel: string;
  kind: "embedded-web-workspace";
};

// Presentation aliases only. This catalog does not define routes, permissions,
// installability, manifests, native identities, or app-store publication.
export const beeWebWorkspaceAliases = {
  enrollment: {
    brandLabel: "The Honey Pot",
    functionalLabel: "Enrollment",
    kind: "embedded-web-workspace",
  },
  growth: {
    brandLabel: "Hive Growth",
    functionalLabel: "Campaigns & Automations",
    kind: "embedded-web-workspace",
  },
  operations: {
    brandLabel: "Hive Day",
    functionalLabel: "School Operations",
    kind: "embedded-web-workspace",
  },
  billing: {
    brandLabel: "Honey Ledger",
    functionalLabel: "Billing & Payments",
    kind: "embedded-web-workspace",
  },
  records: {
    brandLabel: "Honeycomb Records",
    functionalLabel: "Records & Compliance",
    kind: "embedded-web-workspace",
  },
  insights: {
    brandLabel: "Hive Insights",
    functionalLabel: "Insights & Reputation",
    kind: "embedded-web-workspace",
  },
  staff: {
    brandLabel: "Hive Team",
    functionalLabel: "Staff & Access",
    kind: "embedded-web-workspace",
  },
} as const satisfies Record<BeeWebWorkspaceAliasKey, BeeWebWorkspaceAliasDefinition>;
