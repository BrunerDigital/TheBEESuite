type FamilyRecord = {
  id: string;
};

export function familiesForCompleteRecordEditing<T extends FamilyRecord>({
  currentFamilies,
  allFamilies,
  requestedFamilyId,
}: {
  currentFamilies: readonly T[];
  allFamilies: readonly T[];
  requestedFamilyId?: string | null;
}) {
  const completeFamilyById = new Map(allFamilies.map((family) => [family.id, family]));
  const completeCurrentFamilies = currentFamilies.map(
    (family) => completeFamilyById.get(family.id) ?? family,
  );
  const requestedFamily = requestedFamilyId
    ? completeFamilyById.get(requestedFamilyId) ?? null
    : null;

  if (!requestedFamily) {
    return completeCurrentFamilies;
  }

  return [
    requestedFamily,
    ...completeCurrentFamilies.filter((family) => family.id !== requestedFamily.id),
  ];
}
