/** Display only field labels from modern and imported schemas, never schema metadata. */
export function formSchemaSummary(schema: unknown): string {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return "No fields configured";
  const fields = (schema as Record<string, unknown>).fields;
  if (!Array.isArray(fields)) return "No fields configured";
  const labels = fields.flatMap((field): string[] => {
    if (typeof field === "string") return field.trim() ? [field.trim().replaceAll("_", " ")] : [];
    if (!field || typeof field !== "object" || Array.isArray(field)) return [];
    const row = field as Record<string, unknown>;
    const label = typeof row.label === "string" && row.label.trim() ? row.label : typeof row.key === "string" ? row.key : "";
    return label.trim() ? [label.trim().replaceAll("_", " ")] : [];
  });
  if (!labels.length) return "No fields configured";
  const preview = labels.slice(0, 3).join(", ");
  return `${labels.length} ${labels.length === 1 ? "field" : "fields"}: ${preview}${labels.length > 3 ? `, +${labels.length - 3} more` : ""}`;
}
