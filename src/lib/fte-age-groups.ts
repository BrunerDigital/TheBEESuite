export type FteAgeBucket = "infants" | "toddlers" | "twos" | "preschool" | "preK" | "schoolAge";

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function fteAgeBucket(input: {
  ageGroup: string;
  classroomName?: string | null;
  classroomAgeGroup?: string | null;
}): FteAgeBucket {
  const ageGroup = normalized(input.ageGroup);
  if (ageGroup.includes("infant")) return "infants";
  if (ageGroup.includes("toddler")) return "toddlers";
  if (/\b(?:two|2)(?:s|[- ]?(?:year[- ]?olds?|y\/?o(?:s)?))?\b/.test(ageGroup)) return "twos";
  if (/\b(?:pre[- ]?k(?:indergarten)?|prekindergarten|vpk)\b/.test(ageGroup)) return "preK";
  if (/\b(?:school[- ]?aged?|after[- ]?school)\b/.test(ageGroup)) return "schoolAge";

  const classroom = normalized(`${input.classroomName ?? ""} ${input.classroomAgeGroup ?? ""}`);
  if (/\b(?:pre[- ]?k(?:indergarten)?|prekindergarten|vpk|four\s*\/\s*five|4\s*\/\s*5)\b/.test(classroom)) return "preK";
  if (/\b(?:school[- ]?aged?|after[- ]?school)\b/.test(classroom)) return "schoolAge";
  return "preschool";
}
