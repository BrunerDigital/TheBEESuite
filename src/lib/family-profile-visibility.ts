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
  const editorFamilies = [
    ...allFamilies,
    ...currentFamilies.filter((family) => !completeFamilyById.has(family.id)),
  ];
  const requestedFamily = requestedFamilyId
    ? completeFamilyById.get(requestedFamilyId) ?? null
    : null;

  if (!requestedFamily) {
    return editorFamilies;
  }

  return [
    requestedFamily,
    ...editorFamilies.filter((family) => family.id !== requestedFamily.id),
  ];
}
