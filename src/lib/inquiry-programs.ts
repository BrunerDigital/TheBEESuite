const programAliases = new Map<string, string>([
  ["daycare", "Daycare"],
  ["infant care", "Daycare"],
  ["toddler care", "Daycare"],
  ["preschool", "Preschool"],
  ["before & after school care", "Before & After School Care"],
  ["before and after school care", "Before & After School Care"],
  ["summer camp", "Summer Camp"],
  ["not sure yet", "Daycare"],
]);

export function normalizeInquiryProgram(value: unknown) {
  const program = typeof value === "string" ? value.trim() : "";
  return programAliases.get(program.toLowerCase()) ?? "";
}
