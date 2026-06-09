const demoLoginAliases: Record<string, string> = {
  demoschool: "demoschool@demo.thebeesuite.io",
  demoexec: "demoexec@demo.thebeesuite.io",
  demoexecutive: "demoexec@demo.thebeesuite.io",
  demobrand: "demoexec@demo.thebeesuite.io",
};

export function resolveLoginIdentifier(value: string) {
  const normalized = value.trim().toLowerCase();
  return demoLoginAliases[normalized] ?? normalized;
}

export const demoAccountEmails = {
  school: demoLoginAliases.demoschool,
  executive: demoLoginAliases.demoexec,
} as const;

const demoAccountEmailSet = new Set<string>(Object.values(demoAccountEmails));

export function isDemoAccountEmail(value: string | null | undefined) {
  return Boolean(value && demoAccountEmailSet.has(value.trim().toLowerCase()));
}
