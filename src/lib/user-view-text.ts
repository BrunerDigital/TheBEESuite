const userViewReplacements: ReadonlyArray<readonly [RegExp, string]> = [
  [/Kid City USA\s*-\s*Demo/gi, "Kid City USA - Little Harbor"],
  [/\bDemo Brand Executive\b/gi, "Brand Executive"],
  [/\bDemo School Director\b/gi, "School Director"],
  [/\bExecutive Demo Family\b/gi, "Rivera Family"],
  [/\bDemo parent message\b/gi, "Parent message"],
  [/\bDemo website inquiry\b/gi, "Website inquiry"],
  [/\bDemo Child A\b/gi, "Ava Rivera"],
  [/\bDemo Child B\b/gi, "Mia Rivera"],
  [/\bDemo Child C\b/gi, "Noah Rivera"],
  [/\bJordan Demo\b/gi, "Jordan Rivera"],
  [/\bTaylor Demo\b/gi, "Taylor Rivera"],
  [/\bDemo Campus\b/gi, "Central Florida"],
  [/\bAll demo centers\b/gi, "All centers"],
  [/\bDemo workspace\b/gi, "Current workspace"],
  [/\bDemo school\b/gi, "Current school"],
  [/\bDEMO-(\d+)\b/g, "KC-$1"],
  [/demoexec@demo\.thebeesuite\.io/gi, "executive@example.com"],
  [/demoschool@kidcityusa\.com/gi, "school@example.com"],
  [/demoteacher@kidcityusa\.com/gi, "teacher@example.com"],
  [/demo-parent@example\.com/gi, "parent@example.com"],
  [/demo-guardian@example\.com/gi, "guardian@example.com"],
];

export function removeDemoMarkersFromUserView(value: string) {
  return userViewReplacements.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}
