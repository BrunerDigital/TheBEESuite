export function updateKioskChildSelection(
  currentIds: string[],
  childId: string,
  selected: boolean,
) {
  if (selected) {
    return currentIds.includes(childId) ? currentIds : [...currentIds, childId];
  }

  return currentIds.includes(childId)
    ? currentIds.filter((id) => id !== childId)
    : currentIds;
}
