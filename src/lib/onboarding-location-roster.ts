export type OnboardingLocation = {
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  licensedCapacity: number;
  dataSetupPath: "import_existing" | "start_clean" | null;
  dataSourceSystem: "procare" | "other" | null;
};

const headerAliases: Record<keyof Omit<OnboardingLocation, "licensedCapacity"> | "licensedCapacity", string[]> = {
  name: ["name", "school", "school name", "location", "location name", "center", "center name"],
  address: ["address", "street", "street address"],
  city: ["city"],
  state: ["state", "region", "province"],
  postalCode: ["postal code", "postal", "zip", "zip code"],
  phone: ["phone", "phone number"],
  email: ["email", "school email", "location email"],
  licensedCapacity: ["licensed capacity", "capacity"],
  dataSetupPath: ["data path", "data setup path", "starting data", "starting point"],
  dataSourceSystem: ["source", "source system", "previous system"],
};

const orderedFields = Object.keys(headerAliases) as Array<keyof OnboardingLocation>;

function clean(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function normalizedHeader(value: string) {
  return clean(value).toLowerCase().replace(/[_-]+/g, " ");
}

function parseDelimitedRow(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      cells.push(clean(current));
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(clean(current));
  return cells;
}

function sourceLines(value: unknown) {
  return (typeof value === "string" ? value : "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function delimiterFor(lines: string[]) {
  const candidates = ["\t", "|", ","];
  return candidates
    .map((delimiter) => ({ delimiter, score: lines.slice(0, 5).reduce((sum, line) => sum + parseDelimitedRow(line, delimiter).length, 0) }))
    .sort((left, right) => right.score - left.score)[0]?.delimiter ?? "|";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseOnboardingLocationRoster(
  value: unknown,
  defaults: { state?: string; email?: string; dataSetupPath?: string; dataSourceSystem?: string } = {},
) {
  const allLines = sourceLines(value);
  if (!allLines.length) return { locations: [] as OnboardingLocation[], errors: [] as string[] };
  const lines = allLines.slice(0, 102);
  const delimiter = delimiterFor(lines);
  const parsed = lines.map((line) => parseDelimitedRow(line, delimiter));
  const firstHeaders = parsed[0].map(normalizedHeader);
  const headerFields = firstHeaders.map((header) => orderedFields.find((field) => headerAliases[field].includes(header)) ?? null);
  const hasHeader = headerFields.filter(Boolean).length >= 2;
  const fields = hasHeader ? headerFields : orderedFields;
  const dataRows = hasHeader ? parsed.slice(1) : parsed;
  const errors: string[] = [];
  const locations = dataRows.slice(0, 100).map((cells, rowIndex) => {
    const input: Record<string, string> = {};
    fields.forEach((field, columnIndex) => {
      if (field) input[field] = clean(cells[columnIndex]);
    });
    const displayRow = rowIndex + (hasHeader ? 2 : 1);
    const capacityText = clean(input.licensedCapacity);
    const capacity = capacityText ? Number(capacityText) : 0;
    const rawDataPath = clean(input.dataSetupPath || defaults.dataSetupPath).toLowerCase().replace(/[\s-]+/g, "_");
    const rawSourceSystem = clean(input.dataSourceSystem || defaults.dataSourceSystem).toLowerCase();
    const dataSetupPath = rawDataPath === "import_existing" || rawDataPath === "start_clean" ? rawDataPath : null;
    const dataSourceSystem = rawSourceSystem === "procare" || rawSourceSystem === "other" ? rawSourceSystem : null;
    const location: OnboardingLocation = {
      name: clean(input.name, 200),
      address: clean(input.address, 300),
      city: clean(input.city, 150),
      state: clean(input.state || defaults.state, 100),
      postalCode: clean(input.postalCode, 30),
      phone: clean(input.phone, 50),
      email: clean(input.email || defaults.email, 320).toLowerCase(),
      licensedCapacity: Number.isInteger(capacity) && capacity >= 0 && capacity <= 10_000 ? capacity : 0,
      dataSetupPath,
      dataSourceSystem: dataSetupPath === "import_existing" ? dataSourceSystem : null,
    };
    if (!location.name) errors.push(`Location row ${displayRow}: school name is required.`);
    if (!location.address) errors.push(`Location row ${displayRow}: street address is required.`);
    if (!location.city) errors.push(`Location row ${displayRow}: city is required.`);
    if (!location.state) errors.push(`Location row ${displayRow}: state or region is required.`);
    if (!location.postalCode) errors.push(`Location row ${displayRow}: postal code is required.`);
    if (!location.email || !isEmail(location.email)) errors.push(`Location row ${displayRow}: a valid school email is required.`);
    if (capacityText && (!/^\d+$/.test(capacityText) || capacity <= 0 || capacity > 10_000)) errors.push(`Location row ${displayRow}: licensed capacity must be a positive whole number no greater than 10,000.`);
    if (clean(input.dataSetupPath) && !dataSetupPath) errors.push(`Location row ${displayRow}: data path must be import_existing or start_clean.`);
    if (dataSetupPath === "import_existing" && !dataSourceSystem) errors.push(`Location row ${displayRow}: choose procare or other as the previous source.`);
    return location;
  });
  const maximumSourceLines = hasHeader ? 101 : 100;
  if (allLines.length > maximumSourceLines) errors.push("Location roster is limited to 100 schools per intake.");
  return { locations, errors: [...new Set(errors)] };
}
