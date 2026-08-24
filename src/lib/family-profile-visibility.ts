type FamilyRecord = {
  id: string;
};

export function familiesForCompleteRecordEditing<T extends FamilyRecord>({
  allFamilies,
  requestedFamilyId,
}: {
  currentFamilies: readonly T[];
  allFamilies: readonly T[];
  requestedFamilyId?: string | null;
}) {
  const completeFamilyById = new Map(allFamilies.map((family) => [family.id, family]));
  const requestedFamily = requestedFamilyId
    ? completeFamilyById.get(requestedFamilyId) ?? null
    : null;

  if (!requestedFamily) {
    return [...allFamilies];
  }

  return [
    requestedFamily,
    ...allFamilies.filter((family) => family.id !== requestedFamily.id),
  ];
}
