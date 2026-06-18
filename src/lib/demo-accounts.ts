const demoSchoolEmail = "demoschool@kidcityusa.com";
const demoExecutiveEmail = "demoexec@demo.thebeesuite.io";
const demoTeacherEmail = "demoteacher@kidcityusa.com";

const demoLoginAliases: Record<string, string> = {
  demoschool: demoSchoolEmail,
  "demoschool@kidcityusa.com": demoSchoolEmail,
  "demoschool@demo.thebeesuite.io": demoSchoolEmail,
  demoexec: demoExecutiveEmail,
  demoexecutive: demoExecutiveEmail,
  demobrand: demoExecutiveEmail,
  "demoexec@demo.thebeesuite.io": demoExecutiveEmail,
  demoteacher: demoTeacherEmail,
  "demo teacher": demoTeacherEmail,
  "demoteacher@kidcityusa.com": demoTeacherEmail,
  "demo teacher@kidcityusa.com": demoTeacherEmail,
  "demo.teacher@kidcityusa.com": demoTeacherEmail,
};

export function resolveLoginIdentifier(value: string) {
  const normalized = value.trim().toLowerCase();
  return demoLoginAliases[normalized] ?? normalized;
}

export const demoAccountEmails = {
  school: demoSchoolEmail,
  executive: demoExecutiveEmail,
  teacher: demoTeacherEmail,
} as const;

const demoAccountEmailSet = new Set<string>(Object.values(demoAccountEmails));

export function isDemoAccountEmail(value: string | null | undefined) {
  return Boolean(value && demoAccountEmailSet.has(value.trim().toLowerCase()));
}
