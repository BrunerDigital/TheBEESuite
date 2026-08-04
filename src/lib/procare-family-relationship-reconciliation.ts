import { decodeProcareTabularBuffer } from "@/lib/procare-multi-report-import";

export type ProcareCsvRow = Record<string, string>;

export type ProcareSourcePerson = {
  personId: string;
  personType: string;
  fullName: string;
  email: string;
  phone: string;
  relation: string;
  livesWith: boolean;
  emergency: boolean;
  authorizedPickup: boolean;
};

export type ProcareAccountSource = {
  accountId: string;
  accountKey: string;
  payers: ProcareSourcePerson[];
};

export type ProcareAccountResolution = {
  status: "resolved" | "ambiguous" | "missing";
  accountId: string | null;
  tier:
    | "single_payer_union"
    | "single_payer_intersection"
    | "direct_confirmed"
    | "direct_only"
    | "direct_disambiguates_shared_payer"
    | "multiple_direct_accounts"
    | "direct_payer_conflict"
    | "disjoint_payer_accounts"
    | "multiple_payer_accounts"
    | "malformed_relationship_group"
    | "missing_account_evidence";
  directAccountIds: string[];
  payerUnionAccountIds: string[];
  payerIntersectionAccountIds: string[];
};

export type ProcareChildRelationshipSource = {
  childId: string;
  personId: string;
  fullName: string;
  dateOfBirth: string;
  enrollmentStatus: string;
  integrityIssues: string[];
  accountResolution: ProcareAccountResolution;
  contacts: ProcareSourcePerson[];
};

export type ProcareRelationshipDataset = {
  accounts: Map<string, ProcareAccountSource>;
  children: Map<string, ProcareChildRelationshipSource>;
  schema: {
    authoritativeForLiveReconciliation: boolean;
    missingAccountColumns: string[];
    missingRelationshipColumns: string[];
  };
  integrity: {
    malformedChildren: number;
    duplicateContactRows: number;
    childSelfContactRows: number;
  };
  inventory: {
    accountRows: number;
    relationshipRows: number;
    accounts: number;
    children: number;
    payers: number;
  };
};

function normalizeHeader(value: string) {
  return value.replace(/^\ufeff/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseCsv(buffer: Buffer, label: string) {
  const text = decodeProcareTabularBuffer(buffer);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\r" || char === "\n") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error(`${label} contains an unterminated quoted field.`);
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);

  const headers = rows[0]?.map((value) => value.replace(/^\ufeff/, "").trim()) ?? [];
  if (!headers.length) throw new Error(`${label} has no header row.`);
  const normalized = headers.map(normalizeHeader);
  const duplicates = normalized.filter((value, index) => value && normalized.indexOf(value) !== index);
  if (duplicates.length) throw new Error(`${label} has duplicate headers: ${[...new Set(duplicates)].join(", ")}.`);
  const records = rows.slice(1).map((values, rowIndex) => {
    if (values.slice(headers.length).some(Boolean)) throw new Error(`${label} row ${rowIndex + 2} has more fields than its header.`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
  return { headers, normalized, records };
}

function value(row: ProcareCsvRow, ...names: string[]) {
  const lookup = new Map(Object.entries(row).map(([key, fieldValue]) => [normalizeHeader(key), fieldValue.trim()]));
  for (const name of names) {
    const found = lookup.get(normalizeHeader(name));
    if (found) return found;
  }
  return "";
}

function checked(input: string) {
  return /^(checked|yes|true|1|x)$/i.test(input.trim());
}

function displayName(row: ProcareCsvRow) {
  const existing = value(row, "Full Name").replace(/\s+/g, " ").trim();
  if (existing.includes(",")) {
    const [last, ...first] = existing.split(",").map((part) => part.trim());
    return `${first.join(" ")} ${last}`.replace(/\s+/g, " ").trim();
  }
  if (existing) return existing;
  return [value(row, "First Name"), value(row, "Middle Initial"), value(row, "Last Name")].filter(Boolean).join(" ");
}

function firstPhone(row: ProcareCsvRow) {
  return value(row, "Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5");
}

function sourcePerson(row: ProcareCsvRow): ProcareSourcePerson {
  return {
    personId: value(row, "Person ID"),
    personType: value(row, "Person Type"),
    fullName: displayName(row),
    email: value(row, "Email").toLowerCase(),
    phone: firstPhone(row),
    relation: value(row, "Relationship Type") || "Unknown",
    livesWith: checked(value(row, "Lives With")),
    emergency: checked(value(row, "Emergency")),
    authorizedPickup: checked(value(row, "Authorized Pickup")),
  };
}

function sorted(values: Iterable<string>) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function intersection(sets: Set<string>[]) {
  if (!sets.length) return new Set<string>();
  return new Set([...sets[0]].filter((candidate) => sets.slice(1).every((set) => set.has(candidate))));
}

export function resolveProcareChildAccount(input: {
  directAccountIds: Iterable<string>;
  payerAccountSets: Iterable<Iterable<string>>;
}): ProcareAccountResolution {
  const direct = sorted(input.directAccountIds);
  const payerSets = [...input.payerAccountSets]
    .map((values) => new Set(sorted(values)))
    .filter((set) => set.size > 0);
  const union = sorted(payerSets.flatMap((set) => [...set]));
  const common = sorted(intersection(payerSets));

  const result = (
    status: ProcareAccountResolution["status"],
    accountId: string | null,
    tier: ProcareAccountResolution["tier"],
  ): ProcareAccountResolution => ({
    status,
    accountId,
    tier,
    directAccountIds: direct,
    payerUnionAccountIds: union,
    payerIntersectionAccountIds: common,
  });

  if (direct.length > 1) return result("ambiguous", null, "multiple_direct_accounts");
  if (direct.length === 1) {
    const accountId = direct[0];
    if (!payerSets.length) return result("resolved", accountId, "direct_only");
    if (common.length === 1 && common[0] === accountId) return result("resolved", accountId, "direct_confirmed");
    if (common.length > 1 && common.includes(accountId)) return result("resolved", accountId, "direct_disambiguates_shared_payer");
    if (!common.length && union.includes(accountId)) return result("ambiguous", null, "disjoint_payer_accounts");
    return result("ambiguous", null, "direct_payer_conflict");
  }

  if (common.length === 1) {
    return result("resolved", common[0], union.length === 1 ? "single_payer_union" : "single_payer_intersection");
  }
  if (!union.length) return result("missing", null, "missing_account_evidence");
  return result("ambiguous", null, "multiple_payer_accounts");
}

function assertColumns(headers: string[], label: string, required: string[]) {
  const available = new Set(headers.map(normalizeHeader));
  const missing = required.filter((name) => !available.has(normalizeHeader(name)));
  if (missing.length) throw new Error(`${label} is missing required columns: ${missing.join(", ")}.`);
}

function missingColumns(headers: string[], required: string[]) {
  const available = new Set(headers.map(normalizeHeader));
  return required.filter((name) => !available.has(normalizeHeader(name)));
}

const AUTHORITATIVE_ACCOUNT_COLUMNS = [
  "Account ID",
  "Account Key",
  "Person ID",
  "Person Type",
  "Full Name",
] as const;

const AUTHORITATIVE_RELATIONSHIP_COLUMNS = [
  "Child ID",
  "Row ID",
  "Person ID",
  "Person Type",
  "Full Name",
  "Date of Birth",
  "Enrollment Status",
  "Status Date",
  "Relationship Type",
  "Lives With",
  "Emergency",
  "Authorized Pickup",
] as const;

export function buildProcareRelationshipDataset(accountBuffer: Buffer, relationshipBuffer: Buffer): ProcareRelationshipDataset {
  const accountCsv = parseCsv(accountBuffer, "Account Information");
  const relationshipCsv = parseCsv(relationshipBuffer, "Child Relationships");
  assertColumns(accountCsv.headers, "Account Information", ["Account ID", "Person ID", "Person Type", "Full Name"]);
  assertColumns(relationshipCsv.headers, "Child Relationships", ["Child ID", "Person ID", "Person Type", "Full Name", "Relationship Type", "Lives With", "Emergency", "Authorized Pickup"]);
  const missingAccountColumns = missingColumns(accountCsv.headers, [...AUTHORITATIVE_ACCOUNT_COLUMNS]);
  const missingRelationshipColumns = missingColumns(relationshipCsv.headers, [...AUTHORITATIVE_RELATIONSHIP_COLUMNS]);

  const accountRowsById = new Map<string, ProcareCsvRow[]>();
  for (const row of accountCsv.records) {
    const accountId = value(row, "Account ID");
    const personId = value(row, "Person ID");
    if (!accountId || !personId || !value(row, "Person Type")) throw new Error("Account Information contains a row without Account ID, Person ID, or Person Type.");
    accountRowsById.set(accountId, [...(accountRowsById.get(accountId) ?? []), row]);
  }

  const payerAccountsByPerson = new Map<string, Set<string>>();
  const childAccountsByPerson = new Map<string, Set<string>>();
  const accounts = new Map<string, ProcareAccountSource>();
  for (const [accountId, rows] of accountRowsById) {
    const accountKeys = sorted(rows.map((row) => value(row, "Account Key")).filter(Boolean));
    if (accountKeys.length > 1) throw new Error(`Account ${accountId} has more than one Account Key.`);
    const payers = rows.filter((row) => /^payer$/i.test(value(row, "Person Type"))).map(sourcePerson);
    if (!payers.length) throw new Error(`Account ${accountId} has no payer rows.`);
    for (const payer of payers) {
      payerAccountsByPerson.set(payer.personId, new Set([...(payerAccountsByPerson.get(payer.personId) ?? []), accountId]));
    }
    for (const child of rows.filter((row) => /^child$/i.test(value(row, "Person Type")))) {
      const personId = value(child, "Person ID");
      childAccountsByPerson.set(personId, new Set([...(childAccountsByPerson.get(personId) ?? []), accountId]));
    }
    accounts.set(accountId, { accountId, accountKey: accountKeys[0] ?? "", payers });
  }

  const relationshipRowsByChild = new Map<string, ProcareCsvRow[]>();
  for (const row of relationshipCsv.records) {
    const childId = value(row, "Child ID");
    const personId = value(row, "Person ID");
    if (!childId || !personId || !value(row, "Person Type")) throw new Error("Child Relationships contains a row without Child ID, Person ID, or Person Type.");
    relationshipRowsByChild.set(childId, [...(relationshipRowsByChild.get(childId) ?? []), row]);
  }

  const children = new Map<string, ProcareChildRelationshipSource>();
  let malformedChildren = 0;
  let duplicateContactRows = 0;
  let childSelfContactRows = 0;
  for (const [childId, rows] of relationshipRowsByChild) {
    const childRows = rows.filter((row) => /^child$/i.test(value(row, "Person Type")));
    if (childRows.length !== 1) throw new Error(`Child ${childId} has ${childRows.length} child self rows; exactly one is required.`);
    const child = childRows[0];
    const contactRows = rows.filter((row) => !/^child$/i.test(value(row, "Person Type")));
    const contactPersonIds = contactRows.map((row) => value(row, "Person ID"));
    const duplicateContactPersonIds = sorted(contactPersonIds.filter((personId, index) => contactPersonIds.indexOf(personId) !== index));
    const integrityIssues: string[] = [];
    if (duplicateContactPersonIds.length) {
      integrityIssues.push("duplicate_contact_person");
      duplicateContactRows += duplicateContactPersonIds.length;
    }
    if (contactPersonIds.includes(value(child, "Person ID"))) {
      integrityIssues.push("child_self_person_is_contact");
      childSelfContactRows += 1;
    }
    if (integrityIssues.length) malformedChildren += 1;
    const parsedContacts = contactRows.map(sourcePerson);
    const contacts = integrityIssues.length ? [] : parsedContacts;
    const payerSets = parsedContacts
      .map((contact) => payerAccountsByPerson.get(contact.personId))
      .filter((set): set is Set<string> => Boolean(set?.size));
    const baseResolution = resolveProcareChildAccount({
      directAccountIds: childAccountsByPerson.get(value(child, "Person ID")) ?? [],
      payerAccountSets: payerSets,
    });
    const accountResolution: ProcareAccountResolution = integrityIssues.length
      ? { ...baseResolution, status: "ambiguous", accountId: null, tier: "malformed_relationship_group" }
      : baseResolution;
    children.set(childId, {
      childId,
      personId: value(child, "Person ID"),
      fullName: displayName(child),
      dateOfBirth: value(child, "Date of Birth"),
      enrollmentStatus: value(child, "Enrollment Status"),
      integrityIssues,
      accountResolution,
      contacts,
    });
  }

  return {
    accounts,
    children,
    schema: {
      authoritativeForLiveReconciliation: missingAccountColumns.length === 0 && missingRelationshipColumns.length === 0,
      missingAccountColumns,
      missingRelationshipColumns,
    },
    integrity: { malformedChildren, duplicateContactRows, childSelfContactRows },
    inventory: {
      accountRows: accountCsv.records.length,
      relationshipRows: relationshipCsv.records.length,
      accounts: accounts.size,
      children: children.size,
      payers: [...accounts.values()].reduce((total, account) => total + account.payers.length, 0),
    },
  };
}

export function normalizedPersonName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizedDate(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : "";
}

export function procareRelationshipGuardian(person: ProcareSourcePerson) {
  return person.livesWith || /\b(mom|mother|dad|father|parent|guardian|foster|step[ -]?mother|step[ -]?father|step[ -]?dad)\b/i.test(person.relation);
}
