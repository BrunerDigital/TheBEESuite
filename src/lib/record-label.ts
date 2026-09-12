export function formatRecordLabel(value: string | null | undefined) {
  if (!value) return "Not set";
  const acronyms = new Set(["FTE", "SMS", "API", "ACH", "ID", "URL", "QR"]);
  const words = value
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => {
      const upper = word.toLocaleUpperCase();
      return acronyms.has(upper) ? upper : word.toLocaleLowerCase();
    })
    .join(" ");

  return words.replace(/^\w/, (letter) => letter.toLocaleUpperCase());
}
