/** Strict fake-row matcher for the small Prisma predicate subset used in authority tests. */
export function matchesPrismaWhere(row: unknown, where: unknown): boolean {
  if (where === undefined) throw new Error("Undefined fake query predicate");
  if (where === null || typeof where !== "object") return row === where;
  if (where instanceof Date) return row instanceof Date && row.getTime() === where.getTime();
  if (Array.isArray(where)) throw new Error("Unexpected fake predicate array");
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND" || key === "OR") {
      const parts = Array.isArray(value) ? value : [value];
      return key === "AND" ? parts.every(part => matchesPrismaWhere(row, part)) : parts.some(part => matchesPrismaWhere(row, part));
    }
    if (key === "in") return Array.isArray(value) && value.some(item => matchesPrismaWhere(row, item));
    if (key === "some") return Array.isArray(row) && row.some(item => matchesPrismaWhere(item, value));
    if (key === "is") return matchesPrismaWhere(row, value);
    if (key === "lte" || key === "gte") {
      if (!(row instanceof Date) || !(value instanceof Date)) throw new Error("Unsupported fake range type");
      return key === "lte" ? row.getTime() <= value.getTime() : row.getTime() >= value.getTime();
    }
    return row !== null && typeof row === "object" && Object.hasOwn(row, key)
      && matchesPrismaWhere((row as Record<string, unknown>)[key], value);
  });
}
