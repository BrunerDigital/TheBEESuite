import type { ModuleSlug } from "./demo-data";
import { canAccessModule } from "./rbac";

type HelpSubject = Parameters<typeof canAccessModule>[0];
export type HelpNavigationCard = { key: string; href: string; label: string; detail: string };

const protectedCards: Array<HelpNavigationCard & { moduleSlug: ModuleSlug }> = [
  { key: "school-setup", moduleSlug: "school-setup", href: "/billing-settings?view=setup", label: "School setup", detail: "Review launch readiness and school configuration." },
  { key: "families", moduleSlug: "family-detail", href: "/family-detail", label: "Families", detail: "Find family profiles, guardians and requested changes." },
  { key: "attendance", moduleSlug: "attendance", href: "/classroom-dashboard?view=attendance", label: "Attendance", detail: "Review check-in, pickup and classroom status." },
  { key: "billing", moduleSlug: "billing-invoices", href: "/billing-invoices", label: "Billing", detail: "Review tuition, invoices and family account history." },
  { key: "compliance", moduleSlug: "compliance", href: "/forms?view=compliance", label: "Compliance", detail: "Find incidents, medication logs, drills and reminders." },
  { key: "reports", moduleSlug: "analytics", href: "/analytics", label: "Reports", detail: "Review school results and available exports." },
];

/** Labels must describe an explicitly authorized module, not an unrelated fallback. */
export function helpNavigationCardsFor(subject: HelpSubject): HelpNavigationCard[] {
  return [
    { key: "guides", href: "/resources", label: "Guides", detail: "Step-by-step instructions for your role." },
    { key: "support", href: "/support", label: "Contact support", detail: "Get help with access, billing or daily tasks." },
    ...protectedCards.filter(card => canAccessModule(subject, card.moduleSlug)).map(({ key, href, label, detail }) => ({ key, href, label, detail })),
  ];
}
