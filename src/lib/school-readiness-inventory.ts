type SchoolCandidate = {
  id: string;
  name: string;
  status?: string | null;
  crmLocationId: string | null;
  locationId: string | null;
};

export function inventoryReadinessSchools<T extends SchoolCandidate>(centers: T[]) {
  const included: T[] = [];
  const excluded: Array<{ centerId: string; label: string; reason: string }> = [];
  for (const center of centers) {
    const identifiers = [center.name, center.crmLocationId, center.locationId];
    if (center.status?.trim().toLowerCase() !== "active") {
      excluded.push({ centerId: center.id, label: center.name, reason: "School status is not active." });
    } else if (identifiers.some(value => /\bunassigned\b/i.test(value ?? ""))) {
      excluded.push({ centerId: center.id, label: center.name, reason: "Unassigned lead queue, not a school workspace." });
    } else {
      // Readiness inventory is independent of public listing and CRM formatting.
      // Missing identity is a visible review gap, never a reason to omit a school.
      included.push(center);
    }
  }
  return { included, excluded };
}
