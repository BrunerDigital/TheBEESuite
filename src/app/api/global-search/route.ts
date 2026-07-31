import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser, getLeadScopeWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessModule } from "@/lib/rbac";
import { withApiLogging } from "@/lib/request-response-logging";
import { formatZonedTimestamp } from "@/lib/zoned-date-time";

export const runtime = "nodejs";

type GlobalSearchResult = {
  id: string;
  type: "family" | "child" | "guardian" | "lead" | "tour" | "invoice" | "payment";
  label: string;
  detail: string;
  href: string;
  badge?: string;
};

function centerIdFilter(centerIds: string[]) {
  return centerIds.length ? { in: centerIds } : { in: ["__no_visible_centers__"] };
}

function textContains(query: string) {
  return { contains: query, mode: Prisma.QueryMode.insensitive };
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function familyProfileHref(familyId: string, childId?: string | null) {
  const params = new URLSearchParams({ familyId });
  if (childId) params.set("childId", childId);
  return `/family-detail?${params.toString()}#family-editor`;
}

function billingFamilyHref(family: { id: string; centerId: string | null }) {
  const params = new URLSearchParams({ familyId: family.id });
  if (family.centerId) params.set("centerId", family.centerId);
  return `/billing-invoices?${params.toString()}#billing-workbench`;
}

function crmSearchHref(query: string) {
  return `/crm-leads?q=${encodeURIComponent(query)}`;
}

function centerLabel(centerNames: Map<string, string>, centerId: string | null | undefined) {
  return centerId ? centerNames.get(centerId) ?? "Visible school" : "School not set";
}

async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ ok: true, query, results: [] });
  }

  const centers = await prisma.center.findMany({
    where: { ...getLeadScopeWhere(user), status: { not: "closed" } },
    select: { id: true, name: true, crmLocationId: true },
  });
  const centerIds = centers.map((center) => center.id);
  const scopedCenterIds = centerIdFilter(centerIds);
  const centerNames = new Map(centers.map((center) => [center.id, center.crmLocationId ?? center.name]));

  const canSearchFamilies = canAccessModule(user, "family-detail") || canAccessModule(user, "child-profile");
  const canSearchBilling = canAccessModule(user, "billing-invoices") || canAccessModule(user, "payments");
  const canSearchEnrollment = canAccessModule(user, "crm-leads") || canAccessModule(user, "tours");

  const familyQuery: Prisma.FamilyWhereInput = {
    centerId: scopedCenterIds,
    OR: [
      { name: textContains(query) },
      { billingEmail: textContains(query) },
      { address: textContains(query) },
      { guardians: { some: { OR: [{ fullName: textContains(query) }, { email: textContains(query) }, { phone: textContains(query) }] } } },
      { children: { some: { OR: [{ fullName: textContains(query) }, { preferredName: textContains(query) }, { ageGroup: textContains(query) }] } } },
    ],
  };

  const [
    families,
    children,
    guardians,
    leads,
    tours,
    invoices,
    payments,
  ] = await Promise.all([
    canSearchFamilies
      ? prisma.family.findMany({
          where: familyQuery,
          orderBy: { updatedAt: "desc" },
          take: 6,
          select: {
            id: true,
            centerId: true,
            name: true,
            billingEmail: true,
            updatedAt: true,
            children: { select: { fullName: true }, orderBy: { fullName: "asc" }, take: 3 },
            guardians: { select: { fullName: true }, orderBy: { fullName: "asc" }, take: 2 },
          },
        })
      : Promise.resolve([]),
    canSearchFamilies
      ? prisma.child.findMany({
          where: {
            family: { is: { centerId: scopedCenterIds } },
            OR: [{ fullName: textContains(query) }, { preferredName: textContains(query) }, { ageGroup: textContains(query) }],
          },
          orderBy: { fullName: "asc" },
          take: 6,
          select: {
            id: true,
            fullName: true,
            preferredName: true,
            ageGroup: true,
            enrollmentStatus: true,
            family: { select: { id: true, name: true, centerId: true } },
          },
        })
      : Promise.resolve([]),
    canSearchFamilies
      ? prisma.guardian.findMany({
          where: {
            family: { is: { centerId: scopedCenterIds } },
            OR: [{ fullName: textContains(query) }, { email: textContains(query) }, { phone: textContains(query) }],
          },
          orderBy: { fullName: "asc" },
          take: 6,
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            relation: true,
            family: { select: { id: true, name: true, centerId: true } },
          },
        })
      : Promise.resolve([]),
    canSearchEnrollment
      ? prisma.lead.findMany({
          where: {
            centerId: scopedCenterIds,
            status: { notIn: ["closed", "merged"] },
            OR: [
              { familyName: textContains(query) },
              { childName: textContains(query) },
              { parentFirstName: textContains(query) },
              { parentLastName: textContains(query) },
              { email: textContains(query) },
              { phone: textContains(query) },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: 6,
          select: {
            id: true,
            centerId: true,
            familyName: true,
            childName: true,
            email: true,
            phone: true,
            stage: true,
            score: true,
          },
        })
      : Promise.resolve([]),
    canSearchEnrollment && canAccessModule(user, "tours")
      ? prisma.tour.findMany({
          where: {
            centerId: scopedCenterIds,
            OR: [
              { notes: textContains(query) },
              { lead: { is: { OR: [{ familyName: textContains(query) }, { childName: textContains(query) }, { email: textContains(query) }, { phone: textContains(query) }] } } },
            ],
          },
          orderBy: { startsAt: "asc" },
          take: 5,
          select: {
            id: true,
            centerId: true,
            startsAt: true,
            status: true,
            lead: { select: { familyName: true, childName: true, email: true, phone: true } },
          },
        })
      : Promise.resolve([]),
    canSearchBilling
      ? prisma.invoice.findMany({
          where: {
            billingAccount: { family: { is: { centerId: scopedCenterIds } } },
            OR: [
              { number: textContains(query) },
              { billingAccount: { family: { is: { OR: [{ name: textContains(query) }, { billingEmail: textContains(query) }] } } } },
            ],
          },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          take: 6,
          select: {
            id: true,
            number: true,
            status: true,
            dueDate: true,
            totalCents: true,
            billingAccount: { select: { family: { select: { id: true, name: true, billingEmail: true, centerId: true } } } },
          },
        })
      : Promise.resolve([]),
    canSearchBilling
      ? prisma.payment.findMany({
          where: {
            billingAccount: { family: { is: { centerId: scopedCenterIds } } },
            OR: [
              { provider: textContains(query) },
              { externalIdPlaceholder: textContains(query) },
              { billingAccount: { family: { is: { OR: [{ name: textContains(query) }, { billingEmail: textContains(query) }] } } } },
            ],
          },
          orderBy: [{ paidAt: "desc" }, { id: "desc" }],
          take: 5,
          select: {
            id: true,
            amountCents: true,
            status: true,
            provider: true,
            paidAt: true,
            billingAccount: { select: { family: { select: { id: true, name: true, billingEmail: true, centerId: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  const results: GlobalSearchResult[] = [
    ...families.map((family) => ({
      id: `family:${family.id}`,
      type: "family" as const,
      label: family.name,
      detail: [
        centerLabel(centerNames, family.centerId),
        family.billingEmail ?? "No billing email",
        `${family.children.length} child${family.children.length === 1 ? "" : "ren"}`,
        `${family.guardians.length} guardian${family.guardians.length === 1 ? "" : "s"}`,
      ].join(" · "),
      href: familyProfileHref(family.id),
      badge: "Family",
    })),
    ...children.map((child) => ({
      id: `child:${child.id}`,
      type: "child" as const,
      label: child.fullName,
      detail: `${child.family.name} · ${centerLabel(centerNames, child.family.centerId)} · ${child.enrollmentStatus.replaceAll("_", " ")}`,
      href: familyProfileHref(child.family.id, child.id),
      badge: child.ageGroup,
    })),
    ...guardians.map((guardian) => ({
      id: `guardian:${guardian.id}`,
      type: "guardian" as const,
      label: guardian.fullName,
      detail: `${guardian.family.name} · ${guardian.relation} · ${guardian.email ?? guardian.phone ?? "No contact info"}`,
      href: familyProfileHref(guardian.family.id),
      badge: "Guardian",
    })),
    ...leads.map((lead) => ({
      id: `lead:${lead.id}`,
      type: "lead" as const,
      label: lead.familyName,
      detail: `${centerLabel(centerNames, lead.centerId)} · ${lead.stage.replaceAll("_", " ")} · ${lead.email ?? lead.phone ?? lead.childName ?? "No contact info"}`,
      href: crmSearchHref(lead.familyName),
      badge: `Score ${lead.score}`,
    })),
    ...tours.map((tour) => ({
      id: `tour:${tour.id}`,
      type: "tour" as const,
      label: tour.lead?.familyName ?? "Unlinked tour",
      detail: `${centerLabel(centerNames, tour.centerId)} · ${formatZonedTimestamp(tour.startsAt, user.timeZone || "America/New_York")} · ${tour.status}`,
      href: `/tours?q=${encodeURIComponent(tour.lead?.familyName ?? query)}`,
      badge: "Tour",
    })),
    ...invoices.map((invoice) => ({
      id: `invoice:${invoice.id}`,
      type: "invoice" as const,
      label: invoice.number,
      detail: `${invoice.billingAccount.family.name} · ${money(invoice.totalCents)} · Due ${formatDate(invoice.dueDate)}`,
      href: billingFamilyHref(invoice.billingAccount.family),
      badge: invoice.status,
    })),
    ...payments.map((payment) => ({
      id: `payment:${payment.id}`,
      type: "payment" as const,
      label: `${payment.billingAccount.family.name} payment`,
      detail: `${payment.provider} · ${money(payment.amountCents)} · ${formatZonedTimestamp(payment.paidAt, user.timeZone || "America/New_York")}`,
      href: billingFamilyHref(payment.billingAccount.family),
      badge: payment.status,
    })),
  ].slice(0, 18);

  return NextResponse.json({ ok: true, query, results });
}

export const GET = withApiLogging("GET", GETHandler);
