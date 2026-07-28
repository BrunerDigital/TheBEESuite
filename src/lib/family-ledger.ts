export function filterFamilyLedgerEntries<T extends {
  billingAccount: { family: { id: string } };
}>(entries: readonly T[], familyId: string) {
  if (!familyId) return [];
  return entries.filter((entry) => entry.billingAccount.family.id === familyId);
}
