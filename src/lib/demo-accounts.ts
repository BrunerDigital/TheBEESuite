const demoLoginAliases: Record<string, string> = {
  demoschool: "demoschool@demo.thebeesuite.io",
  demoexec: "demoexec@demo.thebeesuite.io",
};

export function resolveLoginIdentifier(value: string) {
  const normalized = value.trim().toLowerCase();
  return demoLoginAliases[normalized] ?? normalized;
}

export const demoAccountEmails = {
  school: demoLoginAliases.demoschool,
  executive: demoLoginAliases.demoexec,
} as const;
