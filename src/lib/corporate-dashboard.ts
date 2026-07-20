export function prioritizeFteFollowUp<T extends { fteSubmitted: boolean; name: string }>(schools: readonly T[]) {
  return [...schools].sort((left, right) => {
    if (left.fteSubmitted !== right.fteSubmitted) return left.fteSubmitted ? 1 : -1;
    return left.name.localeCompare(right.name);
  });
}
