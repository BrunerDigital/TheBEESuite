export const PARENT_PORTAL_VIEWS = ["home", "updates", "messages", "payments", "family"] as const;
export const PARENT_PORTAL_FAMILY_SECTIONS = [
  "children",
  "check-in",
  "documents",
  "billing",
  "profile",
  "notifications",
] as const;

export type ParentPortalView = (typeof PARENT_PORTAL_VIEWS)[number];
export type ParentPortalFamilySection = (typeof PARENT_PORTAL_FAMILY_SECTIONS)[number];

export type ParentPortalWorkspaceHrefOptions = {
  view: ParentPortalView;
  previewHrefBase?: string;
  familyId?: string | null;
  section?: ParentPortalFamilySection | null;
  hash?: string | null;
};

const parentPortalViewSet = new Set<string>(PARENT_PORTAL_VIEWS);

export function normalizeParentPortalView(value: unknown): ParentPortalView {
  if (typeof value !== "string") return "home";

  const normalized = value.trim().toLowerCase();
  return parentPortalViewSet.has(normalized) ? normalized as ParentPortalView : "home";
}

export function parentPortalHref(view: ParentPortalView): string {
  return `/parent-portal?view=${view}`;
}

function hrefWithSearchParams(
  baseHref: string,
  values: Record<string, string | null | undefined>,
  nextHash?: string | null,
): string {
  const hashIndex = baseHref.indexOf("#");
  const hrefWithoutHash = hashIndex >= 0 ? baseHref.slice(0, hashIndex) : baseHref;
  const currentHash = hashIndex >= 0 ? baseHref.slice(hashIndex) : "";
  const queryIndex = hrefWithoutHash.indexOf("?");
  const path = queryIndex >= 0 ? hrefWithoutHash.slice(0, queryIndex) : hrefWithoutHash;
  const query = queryIndex >= 0 ? hrefWithoutHash.slice(queryIndex + 1) : "";
  const searchParams = new URLSearchParams(query);

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (value === null || !value.trim()) searchParams.delete(key);
    else searchParams.set(key, value);
  }

  const hash = nextHash === undefined
    ? currentHash
    : nextHash
      ? `#${nextHash.replace(/^#/, "")}`
      : "";
  return `${path}?${searchParams.toString()}${hash}`;
}

export function parentPortalWorkspaceHref({
  view,
  previewHrefBase,
  familyId,
  section,
  hash,
}: ParentPortalWorkspaceHrefOptions): string {
  const previewMode = Boolean(previewHrefBase);
  const baseHref = previewHrefBase || "/parent-portal";

  return hrefWithSearchParams(
    baseHref,
    {
      view: previewMode ? undefined : view,
      screen: previewMode ? view : null,
      section: view === "family" ? section : null,
      familyId,
    },
    hash,
  );
}

export function parentPortalPreviewHref(baseHref: string, view: ParentPortalView): string {
  return hrefWithSearchParams(baseHref, { screen: view });
}

export function parentPortalFamilySectionHref(section: ParentPortalFamilySection): string {
  return `${parentPortalHref("family")}&section=${section}`;
}

export function parentPortalPreviewFamilySectionHref(
  baseHref: string,
  section: ParentPortalFamilySection,
): string {
  return hrefWithSearchParams(baseHref, { screen: "family", section });
}

export const PARENT_PORTAL_HREFS = {
  home: parentPortalHref("home"),
  updates: parentPortalHref("updates"),
  messages: parentPortalHref("messages"),
  payments: parentPortalHref("payments"),
  family: parentPortalHref("family"),
} as const satisfies Record<ParentPortalView, string>;
