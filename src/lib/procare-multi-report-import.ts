import yauzl from "yauzl";

type CsvRow = Record<string, string>;

type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
};

type MergedProcareReport = ParsedCsv & {
  rawRows: number;
  duplicateRowsRemoved: number;
};

type ProcareReportKind = keyof typeof PROCARE_MULTI_REPORT_COVERAGE_MANIFEST.reports;

type DetectedProcareReport = {
  sourceName: string;
  parsed: ParsedCsv;
  score: number;
  aliasMatches: number;
};

type ProcareSourceInventoryItem = {
  sourceName: string;
  reportKind: ProcareReportKind | "ignored";
  rows: number;
  matchedHeaderAliases: number;
  note?: string;
};

type ProcareImportDiagnostic = {
  code:
    | "account_link_missing"
    | "account_link_ambiguous"
    | "shared_child_accounts_merged"
    | "account_has_no_payer"
    | "account_without_enrollment"
    | "source_child_without_enrollment"
    | "enrollment_child_id_missing"
    | "parent_account_id_missing"
    | "relationship_child_id_missing"
    | "child_info_child_id_missing";
  severity: "warning" | "info";
  candidateAccountCount?: number;
  relationshipPersonCount?: number;
  linkedPersonCount?: number;
  unlinkedPersonCount?: number;
  sourceRowCount?: number;
  relationshipRowCount?: number;
  childInfoRowCount?: number;
  message: string;
};

export const PROCARE_MULTI_REPORT_COVERAGE_MANIFEST = {
  version: 4,
  reports: {
    enrollment: {
      requiredColumns: ["Child ID"],
      retainedAs: "procare enrollment source record",
      mappedAreas: ["child identity", "enrollment status", "classroom", "dates"],
    },
    parentinfo: {
      requiredColumns: ["Account ID", "Person ID", "Person Type"],
      retainedAs: "procare account person records",
      mappedAreas: ["account identity", "guardian identity", "contact information", "address"],
    },
    relationships: {
      requiredColumns: ["Child ID", "Person ID", "Person Type"],
      retainedAs: "procare relationship source records and procare relationship records[].sourceFields",
      mappedAreas: ["guardian", "emergency contact", "authorized pickup", "lives with"],
    },
    childinfo: {
      requiredColumns: ["Child ID", "Category Description", "Item Description", "Item Is Active"],
      retainedAs: "procare child info source records",
      mappedAreas: ["allergies", "other child information retained for review"],
    },
  },
  accountResolution: {
    method: "nonblank relationship/enrollment person identifiers joined to nonblank parentinfo account identifiers",
    ambiguousBehavior: "retain diagnostics without selecting an account unless the same child is explicitly listed in every candidate account and exactly one account contains another child",
    sharedChildBehavior: "select the unique sibling household as canonical and merge payer records from every explicitly linked child account",
  },
  sourceOnlyRetention: {
    accountWithoutEnrollment: "procare_multi_report_family_only",
    childWithoutEnrollment: "procare_multi_report_source_child_without_enrollment",
    missingSourceIdentifier: "one warning record per otherwise-unlinkable source row",
  },
} as const;

function normalizeColumnName(value: string) {
  return value.replace(/^\ufeff/, "").trim().toLowerCase().replace(/#/g, " number ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const REPORT_COLUMN_ALIASES: Record<ProcareReportKind, Record<string, readonly string[]>> = {
  enrollment: {
    "Child ID": ["child id", "child key", "child number", "child no", "child #", "student id", "student key", "student number", "student no", "student #"],
    "Person ID": ["person id", "person key", "child person id", "student person id"],
    "Person Type": ["person type", "record type", "member type"],
    "Full Name": ["full name", "child name", "child full name", "student name", "student full name"],
    "First Name": ["first name", "child first name", "student first name", "given name"],
    "Middle Initial": ["middle initial", "middle name", "child middle name", "student middle name"],
    "Last Name": ["last name", "child last name", "student last name", "surname"],
    "Date of Birth": ["date of birth", "dob", "birth date", "birthdate", "birthday"],
    Gender: ["gender", "sex"],
    "Primary Classroom": ["primary classroom", "classroom", "classroom name", "room", "room name", "assigned classroom", "assigned room", "program room"],
    "Classroom ID": ["classroom id", "class id", "room id", "room key", "classroom key"],
    "Enrollment Status": ["enrollment status", "child status", "student status", "enrollment state", "current enrollment status"],
    "Status Start Date": ["status start date", "start date", "enrollment start date", "enrollment date", "begin date", "first day"],
    "Status End Date": ["status end date", "end date", "withdrawal date", "termination date", "last day"],
    "Relationship 1 Id": ["relationship 1 id", "relationship 1 person id", "related person 1 id", "contact 1 id"],
    "Relationship 2 Id": ["relationship 2 id", "relationship 2 person id", "related person 2 id", "contact 2 id"],
    "Relationship 3 Id": ["relationship 3 id", "relationship 3 person id", "related person 3 id", "contact 3 id"],
    "Row ID": ["row id", "record id", "enrollment row id"],
  },
  parentinfo: {
    "Account ID": ["account id", "account key", "account number", "account no", "account #", "family id", "family key", "family number", "household id"],
    "Person ID": ["person id", "person key", "contact id", "parent id", "guardian id", "payer id"],
    "Person Type": ["person type", "contact type", "member type", "role", "account person type"],
    "Person Sort ID": ["person sort id", "person sort order", "sort id", "sort order"],
    "Full Name": ["full name", "person name", "contact name", "parent name", "guardian name", "payer name"],
    "First Name": ["first name", "given name"],
    "Middle Initial": ["middle initial", "middle name"],
    "Last Name": ["last name", "surname", "family name"],
    Email: ["email", "email address", "e mail", "primary email"],
    "Add 1, Line 1": ["add 1 line 1", "address 1", "address line 1", "street address", "street"],
    "Add 1, Line 2": ["add 1 line 2", "address 2", "address line 2", "unit", "suite"],
    "Add 1, City": ["add 1 city", "city"],
    "Add 1, Region": ["add 1 region", "state", "province", "region"],
    "Add 1, Postal Code": ["add 1 postal code", "postal code", "zip", "zip code"],
    "Phone 1": ["phone 1", "primary phone", "phone", "phone number", "mobile phone", "cell phone"],
    "Phone 2": ["phone 2", "secondary phone", "home phone"],
  },
  relationships: {
    "Child ID": ["child id", "child key", "child number", "child no", "child #", "student id", "student key", "student number", "student no", "student #"],
    "Row ID": ["row id", "record id", "relationship id", "relationship row id"],
    "Person ID": ["person id", "person key", "contact id", "related person id", "parent id", "guardian id"],
    "Person Type": ["person type", "contact type", "member type", "role", "relationship person type"],
    "Person Sort Order": ["person sort order", "person sort id", "sort order", "sort id"],
    "Full Name": ["full name", "person name", "contact name", "parent name", "guardian name"],
    "First Name": ["first name", "given name"],
    "Middle Initial": ["middle initial", "middle name"],
    "Last Name": ["last name", "surname", "family name"],
    Email: ["email", "email address", "e mail", "primary email"],
    "Relationship Type": ["relationship type", "relationship", "relation", "relation type", "relationship description"],
    "Lives With": ["lives with", "liveswith", "resides with", "household member"],
    Emergency: ["emergency", "emergency contact", "is emergency contact"],
    "Authorized Pickup": ["authorized pickup", "authorised pickup", "pickup authorized", "can pickup", "pickup permission"],
    "Add 1, Line 1": ["add 1 line 1", "address 1", "address line 1", "street address", "street"],
    "Add 1, Line 2": ["add 1 line 2", "address 2", "address line 2", "unit", "suite"],
    "Add 1, City": ["add 1 city", "city"],
    "Add 1, Region": ["add 1 region", "state", "province", "region"],
    "Add 1, Postal Code": ["add 1 postal code", "postal code", "zip", "zip code"],
    "Phone 1": ["phone 1", "primary phone", "phone", "phone number", "mobile phone", "cell phone"],
    "Phone 2": ["phone 2", "secondary phone", "home phone"],
    "Phone 3": ["phone 3", "work phone"],
    "Phone 4": ["phone 4"],
    "Phone 5": ["phone 5"],
  },
  childinfo: {
    "Child ID": ["child id", "child key", "child number", "child no", "child #", "student id", "student key", "student number", "student no", "student #"],
    "Person ID": ["person id", "person key", "child person id", "student person id"],
    "Full Name": ["full name", "child name", "child full name", "student name", "student full name"],
    "Category Description": ["category description", "category", "information category", "child info category", "item category"],
    "Category Sort ID": ["category sort id", "category sort order", "category order"],
    "Item Description": ["item description", "item", "information item", "detail", "description"],
    "Item Sort ID": ["item sort id", "item sort order", "item order"],
    "Item Is Active": ["item is active", "is active", "active", "item active", "active item"],
  },
};

const REPORT_KINDS = Object.keys(PROCARE_MULTI_REPORT_COVERAGE_MANIFEST.reports) as ProcareReportKind[];

function aliasesForReport(reportKind: ProcareReportKind) {
  return new Map(Object.entries(REPORT_COLUMN_ALIASES[reportKind]).flatMap(([canonical, aliases]) => (
    [canonical, ...aliases].map((alias) => [normalizeColumnName(alias), canonical] as const)
  )));
}

const REPORT_ALIAS_LOOKUPS = Object.fromEntries(
  REPORT_KINDS.map((reportKind) => [reportKind, aliasesForReport(reportKind)]),
) as Record<ProcareReportKind, Map<string, string>>;

const rowLookupCache = new WeakMap<CsvRow, Map<string, string>>();

function rowLookup(row: CsvRow) {
  const cached = rowLookupCache.get(row);
  if (cached) return cached;
  const lookup = new Map(Object.entries(row).map(([key, value]) => [normalizeColumnName(key), value.trim()]));
  rowLookupCache.set(row, lookup);
  return lookup;
}

function field(row: CsvRow | undefined, ...names: string[]) {
  if (!row) return "";
  const lookup = rowLookup(row);
  for (const name of names) {
    const found = lookup.get(normalizeColumnName(name));
    if (found) return found;
  }
  return "";
}

function checked(value: string) {
  return /^(checked|yes|true|1|x)$/i.test(value.trim());
}

export function decodeProcareTabularBuffer(buffer: Buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer.subarray(2));
  }
  if (buffer.length >= 4 && buffer[1] === 0 && buffer[3] === 0) return buffer.toString("utf16le");
  if (buffer.length >= 4 && buffer[0] === 0 && buffer[2] === 0) return new TextDecoder("utf-16be").decode(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const candidates = [",", "\t", ";", "|"] as const;
  const counts = candidates.map((delimiter) => {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < sample.length; index += 1) {
      const char = sample[index];
      if (char === '"' && quoted && sample[index + 1] === '"') index += 1;
      else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) count += 1;
    }
    return { delimiter, count };
  }).sort((left, right) => right.count - left.count);
  if (!counts[0]?.count) throw new Error("The uploaded report does not contain recognizable tabular columns.");
  return counts[0].delimiter;
}

function parseCsv(text: string, reportName: string): ParsedCsv {
  const delimiter = detectDelimiter(text);
  const values: string[][] = [];
  let fieldValue = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      fieldValue += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(fieldValue.trim());
      fieldValue = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(fieldValue.trim());
      fieldValue = "";
      if (row.some(Boolean)) values.push(row);
      row = [];
    } else {
      fieldValue += char;
    }
  }
  if (quoted) throw new Error(`${reportName} contains an unterminated quoted field.`);
  row.push(fieldValue.trim());
  if (row.some(Boolean)) values.push(row);

  const headers = (values[0] ?? []).map((value) => value.replace(/^\ufeff/, "").trim());
  if (!headers.length) throw new Error(`${reportName} does not contain a header row.`);
  const normalizedHeaders = headers.map(normalizeColumnName);
  const duplicateHeaders = normalizedHeaders.filter((header, index) => header && normalizedHeaders.indexOf(header) !== index);
  if (duplicateHeaders.length) {
    throw new Error(`${reportName} contains duplicate column headings: ${[...new Set(duplicateHeaders)].join(", ")}.`);
  }

  return {
    headers,
    rows: values.slice(1).map((rowValues, rowIndex) => {
      if (rowValues.slice(headers.length).some(Boolean)) {
        throw new Error(`${reportName} row ${rowIndex + 2} contains more values than its header row.`);
      }
      return Object.fromEntries(headers.map((header, column) => [header, rowValues[column] ?? ""]));
    }),
  };
}

function canonicalizeReport(parsed: ParsedCsv, reportKind: ProcareReportKind): ParsedCsv & { aliasMatches: number } {
  const lookup = REPORT_ALIAS_LOOKUPS[reportKind];
  const canonicalNames = new Map(Object.keys(REPORT_COLUMN_ALIASES[reportKind]).map((name) => [normalizeColumnName(name), name]));
  const exactTargets = new Set(parsed.headers.map(normalizeColumnName).filter((header) => canonicalNames.has(header)));
  const usedTargets = new Set(exactTargets);
  const canonicalHeaders = parsed.headers.map((header) => {
    const normalized = normalizeColumnName(header);
    const exactCanonical = canonicalNames.get(normalized);
    if (exactCanonical) {
      return exactCanonical;
    }
    const suggested = lookup.get(normalized);
    if (!suggested || usedTargets.has(normalizeColumnName(suggested))) return header;
    usedTargets.add(normalizeColumnName(suggested));
    return suggested;
  });
  const duplicateCanonicalHeaders = canonicalHeaders
    .map(normalizeColumnName)
    .filter((header, index, headers) => header && headers.indexOf(header) !== index);
  if (duplicateCanonicalHeaders.length) {
    throw new Error(`Multiple uploaded columns resolve to the same ${reportKind} field: ${[...new Set(duplicateCanonicalHeaders)].join(", ")}. Review the export's duplicate headings.`);
  }
  const aliasMatches = parsed.headers.filter((header, index) => canonicalHeaders[index] !== header).length;
  return {
    headers: canonicalHeaders,
    aliasMatches,
    rows: parsed.rows.map((row) => Object.fromEntries(parsed.headers.flatMap((sourceHeader, index) => {
      const canonicalHeader = canonicalHeaders[index];
      const sourceValue = row[sourceHeader] ?? "";
      return canonicalHeader === sourceHeader
        ? [[sourceHeader, sourceValue]]
        : [[sourceHeader, sourceValue], [canonicalHeader, sourceValue]];
    }))),
  };
}

const REPORT_DISTINCTIVE_COLUMNS: Record<ProcareReportKind, readonly string[]> = {
  enrollment: ["Enrollment Status", "Primary Classroom", "Date of Birth", "Relationship 1 Id", "Status Start Date"],
  parentinfo: ["Account ID", "Account Key", "Person Sort ID", "Email", "Phone 1"],
  relationships: ["Relationship Type", "Lives With", "Emergency", "Authorized Pickup", "Person Sort Order"],
  childinfo: ["Category Description", "Item Description", "Item Is Active", "Category Sort ID"],
};

function reportCandidate(sourceName: string, parsed: ParsedCsv, reportKind: ProcareReportKind): DetectedProcareReport | null {
  const canonicalized = canonicalizeReport(parsed, reportKind);
  const available = new Set(canonicalized.headers.map(normalizeColumnName));
  const required = PROCARE_MULTI_REPORT_COVERAGE_MANIFEST.reports[reportKind].requiredColumns;
  if (!required.every((column) => available.has(normalizeColumnName(column)))) return null;
  const distinctiveMatches = REPORT_DISTINCTIVE_COLUMNS[reportKind]
    .filter((column) => available.has(normalizeColumnName(column))).length;
  if (!distinctiveMatches) return null;
  return {
    sourceName,
    parsed: canonicalized,
    score: required.length * 100 + distinctiveMatches * 10 + canonicalized.aliasMatches,
    aliasMatches: canonicalized.aliasMatches,
  };
}

function detectReports(entries: Map<string, Buffer>) {
  const inventory: ProcareSourceInventoryItem[] = [];
  const parsedEntries = [...entries].flatMap(([sourceName, buffer]) => {
    try {
      return [{ sourceName, parsed: parseCsv(decodeProcareTabularBuffer(buffer), sourceName) }];
    } catch (error) {
      inventory.push({
        sourceName,
        reportKind: "ignored",
        rows: 0,
        matchedHeaderAliases: 0,
        note: error instanceof Error ? error.message : "This file is not a supported tabular report.",
      });
      return [];
    }
  });
  const reports: Record<ProcareReportKind, DetectedProcareReport[]> = {
    enrollment: [],
    parentinfo: [],
    relationships: [],
    childinfo: [],
  };

  for (const entry of parsedEntries) {
    const candidates = REPORT_KINDS.flatMap((reportKind) => {
      try {
        const candidate = reportCandidate(entry.sourceName, entry.parsed, reportKind);
        return candidate ? [{ reportKind, candidate }] : [];
      } catch {
        return [];
      }
    }).sort((left, right) => right.candidate.score - left.candidate.score);
    if (!candidates.length) {
      inventory.push({ sourceName: entry.sourceName, reportKind: "ignored", rows: entry.parsed.rows.length, matchedHeaderAliases: 0, note: "No supported ProCare report shape was recognized." });
      continue;
    }
    if (candidates.length > 1 && candidates[0].candidate.score === candidates[1].candidate.score) {
      throw new Error(`${entry.sourceName} matches more than one ProCare report type equally. Keep the original header row or remove unrelated columns so the director can review it safely.`);
    }
    const selected = candidates[0];
    reports[selected.reportKind].push(selected.candidate);
    inventory.push({
      sourceName: entry.sourceName,
      reportKind: selected.reportKind,
      rows: selected.candidate.parsed.rows.length,
      matchedHeaderAliases: selected.candidate.aliasMatches,
    });
  }

  const missing = REPORT_KINDS.filter((reportKind) => !reports[reportKind].length);
  if (missing.length) {
    throw new Error(`The uploaded files could not be identified safely by their columns. Missing or ambiguous report data: ${missing.join(", ")}. Filenames do not matter; include all four ProCare reports and keep their header rows.`);
  }
  return { reports, inventory };
}

function mergeDetectedReports(reports: DetectedProcareReport[]): MergedProcareReport {
  const headers = [...new Set(reports.flatMap((report) => report.parsed.headers))];
  const seenRows = new Set<string>();
  const rows: CsvRow[] = [];
  let rawRows = 0;
  for (const report of reports) {
    for (const row of report.parsed.rows) {
      rawRows += 1;
      const fingerprint = JSON.stringify(headers.map((header) => [header, field(row, header)]));
      if (seenRows.has(fingerprint)) continue;
      seenRows.add(fingerprint);
      rows.push(row);
    }
  }
  return {
    headers,
    rows,
    rawRows,
    duplicateRowsRemoved: rawRows - rows.length,
  };
}

function requireColumns(reportName: string, parsed: ParsedCsv, requiredColumns: readonly string[]) {
  const available = new Set(parsed.headers.map(normalizeColumnName));
  const missing = requiredColumns.filter((column) => !available.has(normalizeColumnName(column)));
  if (missing.length) throw new Error(`${reportName} is missing required columns: ${missing.join(", ")}.`);
}

function zipEntries(buffer: Buffer) {
  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error("The ProCare ZIP could not be opened."));
      const entries = new Map<string, Buffer>();
      let totalUncompressedBytes = 0;
      zip.readEntry();
      zip.on("entry", (entry) => {
        totalUncompressedBytes += entry.uncompressedSize;
        if (entries.size >= 200 || totalUncompressedBytes > 100 * 1024 * 1024) {
          zip.close();
          return reject(new Error("The ProCare ZIP exceeds the safe import size or file-count limit."));
        }
        if (/\/$/.test(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError ?? new Error("A ProCare ZIP entry could not be read."));
          const chunks: Buffer[] = [];
          stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on("error", reject);
          stream.on("end", () => {
            const filename = entry.fileName.replaceAll("\\", "/");
            if (entries.has(filename)) {
              zip.close();
              return reject(new Error(`The ProCare ZIP contains more than one file named ${filename}.`));
            }
            entries.set(filename, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(entries));
      zip.on("error", reject);
    });
  });
}

function isZipArchive(buffer: Buffer) {
  return buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50;
}

export async function expandProcareSourceEntries(entries: Map<string, Buffer>) {
  const expanded = new Map<string, Buffer>();
  for (const [sourceName, buffer] of entries) {
    if (!isZipArchive(buffer)) {
      expanded.set(sourceName, buffer);
      continue;
    }
    const archivedEntries = await zipEntries(buffer);
    for (const [archivedName, archivedBuffer] of archivedEntries) {
      if (isZipArchive(archivedBuffer)) {
        throw new Error(`${sourceName} contains a nested ZIP (${archivedName}). Extract nested archives first so the director can review every source file.`);
      }
      const expandedName = `${sourceName}/${archivedName}`;
      if (expanded.has(expandedName)) throw new Error(`More than one uploaded source resolves to ${expandedName}.`);
      expanded.set(expandedName, archivedBuffer);
    }
  }
  if (expanded.size > 500) throw new Error("The selected ProCare sources contain more than 500 files. Split the handoff into reviewed batches.");
  return expanded;
}

function fullName(row?: CsvRow) {
  if (!row) return "";
  return field(row, "Full Name") || [field(row, "First Name"), field(row, "Middle Initial"), field(row, "Last Name")].filter(Boolean).join(" ");
}

function address(row?: CsvRow) {
  if (!row) return "";
  const locality = [field(row, "Add 1, City"), field(row, "Add 1, Region"), field(row, "Add 1, Postal Code")].filter(Boolean).join(", ");
  return [field(row, "Add 1, Line 1"), field(row, "Add 1, Line 2"), locality].filter(Boolean).join("\n");
}

function personType(row: CsvRow) {
  return field(row, "Person Type").toLowerCase();
}

function numericSortValue(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER;
}

function comparePeople(left: CsvRow, right: CsvRow) {
  return numericSortValue(field(left, "Person Sort ID", "Person Sort Order")) - numericSortValue(field(right, "Person Sort ID", "Person Sort Order"))
    || field(left, "Person ID").localeCompare(field(right, "Person ID"));
}

function uniquePeople(rows: CsvRow[]) {
  const seen = new Set<string>();
  return [...rows].sort(comparePeople).filter((row) => {
    const personId = field(row, "Person ID");
    if (!personId || seen.has(personId)) return false;
    seen.add(personId);
    return true;
  });
}

function accountResolution({
  child,
  related,
  accountsByPerson,
  peopleByAccount,
}: {
  child: CsvRow;
  related: CsvRow[];
  accountsByPerson: Map<string, Set<string>>;
  peopleByAccount: Map<string, CsvRow[]>;
}) {
  const relationshipPersonIds = new Set(
    related.map((row) => field(row, "Person ID")).filter(Boolean),
  );
  for (const column of ["Relationship 1 Id", "Relationship 2 Id", "Relationship 3 Id"]) {
    const personId = field(child, column);
    if (personId) relationshipPersonIds.add(personId);
  }

  const candidateAccountIds = new Set<string>();
  let linkedPersonCount = 0;
  for (const personId of relationshipPersonIds) {
    const accountIds = accountsByPerson.get(personId);
    if (!accountIds?.size) continue;
    linkedPersonCount += 1;
    for (const accountId of accountIds) candidateAccountIds.add(accountId);
  }

  const sortedCandidateAccountIds = [...candidateAccountIds].sort((left, right) => left.localeCompare(right));
  const candidateAccountCount = sortedCandidateAccountIds.length;
  const childPersonId = field(child, "Person ID");
  const sharedChildCandidates = childPersonId && candidateAccountCount > 1
    ? sortedCandidateAccountIds.map((accountId) => {
        const accountPeople = peopleByAccount.get(accountId) ?? [];
        const explicitlyContainsChild = accountPeople.some((person) => (
          field(person, "Person ID") === childPersonId && personType(person) === "child"
        ));
        const otherChildPersonIds = new Set(accountPeople
          .filter((person) => personType(person) === "child" && field(person, "Person ID") !== childPersonId)
          .map((person) => field(person, "Person ID"))
          .filter(Boolean));
        return { accountId, explicitlyContainsChild, otherChildCount: otherChildPersonIds.size };
      })
    : [];
  const highestSiblingCount = Math.max(0, ...sharedChildCandidates.map((candidate) => candidate.otherChildCount));
  const uniqueSiblingHousehold = highestSiblingCount > 0
    && sharedChildCandidates.every((candidate) => candidate.explicitlyContainsChild)
    ? sharedChildCandidates.filter((candidate) => candidate.otherChildCount === highestSiblingCount)
    : [];
  const mergedAccountIds = uniqueSiblingHousehold.length === 1 ? sortedCandidateAccountIds : [];
  const status = candidateAccountCount === 1 || mergedAccountIds.length
    ? "resolved"
    : candidateAccountCount === 0 ? "missing" : "ambiguous";
  return {
    status,
    accountId: mergedAccountIds.length
      ? uniqueSiblingHousehold[0]?.accountId ?? ""
      : status === "resolved" ? sortedCandidateAccountIds[0] ?? "" : "",
    candidateAccountIds: sortedCandidateAccountIds,
    candidateAccountCount,
    mergedAccountIds,
    relationshipPersonCount: relationshipPersonIds.size,
    linkedPersonCount,
    unlinkedPersonCount: relationshipPersonIds.size - linkedPersonCount,
  } as const;
}

function relationshipRecord(row: CsvRow, payerPersonIds: Set<string>, childPersonId: string) {
  const personId = field(row, "Person ID");
  const relationshipType = field(row, "Relationship Type") || "Guardian";
  const livesWith = checked(field(row, "Lives With"));
  const isChildSelf = Boolean(childPersonId && personId === childPersonId);
  return {
    externalId: personId,
    personId,
    relationshipExternalId: field(row, "Row ID"),
    childId: field(row, "Child ID"),
    personType: field(row, "Person Type"),
    name: fullName(row),
    relation: relationshipType,
    email: field(row, "Email"),
    phone: field(row, "Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5"),
    phones: ["Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5"].map((name) => field(row, name)).filter(Boolean),
    address: address(row),
    livesWith: !isChildSelf && livesWith,
    emergency: !isChildSelf && checked(field(row, "Emergency")),
    authorizedPickup: !isChildSelf && checked(field(row, "Authorized Pickup")),
    guardian: !isChildSelf && (payerPersonIds.has(personId)
      || livesWith
      || /\b(mom|mother|dad|father|parent|guardian|foster|stepmother|stepfather)\b/i.test(relationshipType)),
    sourceFields: row,
  };
}

function diagnosticForResolution(
  resolution: ReturnType<typeof accountResolution>,
  payerCount: number,
): ProcareImportDiagnostic[] {
  if (resolution.status === "missing") {
    return [{
      code: "account_link_missing",
      severity: "warning",
      candidateAccountCount: 0,
      relationshipPersonCount: resolution.relationshipPersonCount,
      linkedPersonCount: resolution.linkedPersonCount,
      unlinkedPersonCount: resolution.unlinkedPersonCount,
      message: "No ProCare account could be linked from the row's nonblank person and relationship identifiers.",
    }];
  }
  if (resolution.status === "ambiguous") {
    return [{
      code: "account_link_ambiguous",
      severity: "warning",
      candidateAccountCount: resolution.candidateAccountCount,
      relationshipPersonCount: resolution.relationshipPersonCount,
      linkedPersonCount: resolution.linkedPersonCount,
      unlinkedPersonCount: resolution.unlinkedPersonCount,
      message: `More than one ProCare account matched the row's relationship identifiers (${resolution.candidateAccountCount} candidates).`,
    }];
  }
  if (resolution.mergedAccountIds.length) {
    return [{
      code: "shared_child_accounts_merged",
      severity: "info",
      candidateAccountCount: resolution.candidateAccountCount,
      relationshipPersonCount: resolution.relationshipPersonCount,
      linkedPersonCount: resolution.linkedPersonCount,
      unlinkedPersonCount: resolution.unlinkedPersonCount,
      message: "The child is explicitly listed in multiple ProCare accounts. The unique sibling household was selected and payer records from the linked accounts were merged.",
    }];
  }
  if (payerCount === 0) {
    return [{
      code: "account_has_no_payer",
      severity: "warning",
      candidateAccountCount: 1,
      relationshipPersonCount: resolution.relationshipPersonCount,
      linkedPersonCount: resolution.linkedPersonCount,
      unlinkedPersonCount: resolution.unlinkedPersonCount,
      message: "The linked ProCare account does not contain a payer record.",
    }];
  }
  return [];
}

export async function buildProcareMultiReportRowsFromFiles(entries: Map<string, Buffer>): Promise<Array<Record<string, string>>> {
  const detected = detectReports(entries);
  const parsedReports: Record<ProcareReportKind, MergedProcareReport> = {
    enrollment: mergeDetectedReports(detected.reports.enrollment),
    parentinfo: mergeDetectedReports(detected.reports.parentinfo),
    relationships: mergeDetectedReports(detected.reports.relationships),
    childinfo: mergeDetectedReports(detected.reports.childinfo),
  };
  for (const [reportName, coverage] of Object.entries(PROCARE_MULTI_REPORT_COVERAGE_MANIFEST.reports)) {
    requireColumns(reportName, parsedReports[reportName as ProcareReportKind], coverage.requiredColumns);
  }

  const enrollment = parsedReports.enrollment.rows;
  const parents = parsedReports.parentinfo.rows;
  const relationships = parsedReports.relationships.rows;
  const childInfo = parsedReports.childinfo.rows;

  const accountsByPerson = new Map<string, Set<string>>();
  const peopleByAccount = new Map<string, CsvRow[]>();
  const parentsWithoutAccount: CsvRow[] = [];
  for (const person of parents) {
    const personId = field(person, "Person ID");
    const accountId = field(person, "Account ID");
    if (accountId) {
      peopleByAccount.set(accountId, [...(peopleByAccount.get(accountId) ?? []), person]);
    } else {
      parentsWithoutAccount.push(person);
    }
    if (personId && accountId) {
      const personAccounts = accountsByPerson.get(personId) ?? new Set<string>();
      personAccounts.add(accountId);
      accountsByPerson.set(personId, personAccounts);
    }
  }

  const relationshipSourceRowsByChild = new Map<string, CsvRow[]>();
  const relationshipsByChild = new Map<string, CsvRow[]>();
  const relationshipsWithoutChild: CsvRow[] = [];
  for (const relationship of relationships) {
    const childId = field(relationship, "Child ID");
    if (childId) {
      relationshipSourceRowsByChild.set(childId, [...(relationshipSourceRowsByChild.get(childId) ?? []), relationship]);
      if (personType(relationship) === "relationship") {
        relationshipsByChild.set(childId, [...(relationshipsByChild.get(childId) ?? []), relationship]);
      }
    } else {
      relationshipsWithoutChild.push(relationship);
    }
  }

  const childDetails = new Map<string, CsvRow[]>();
  const childInfoWithoutChild: CsvRow[] = [];
  for (const detail of childInfo) {
    const childId = field(detail, "Child ID");
    if (childId) {
      childDetails.set(childId, [...(childDetails.get(childId) ?? []), detail]);
    } else {
      childInfoWithoutChild.push(detail);
    }
  }

  const enrollmentContexts = enrollment.map((child) => {
    const childId = field(child, "Child ID");
    const related = [...(relationshipsByChild.get(childId) ?? [])].sort(comparePeople);
    const relationshipSourceRows = relationshipSourceRowsByChild.get(childId) ?? [];
    const resolution = accountResolution({ child, related, accountsByPerson, peopleByAccount });
    return { child, childId, related, relationshipSourceRows, details: childDetails.get(childId) ?? [], resolution };
  });
  const enrollmentChildIds = new Set(enrollmentContexts.map((context) => context.childId).filter(Boolean));
  const enrollmentLinkedAccountIds = new Set(enrollmentContexts.flatMap((context) => context.resolution.candidateAccountIds));
  const sourceChildIdsWithoutEnrollment = [...new Set([
    ...relationshipSourceRowsByChild.keys(),
    ...childDetails.keys(),
  ])].filter((childId) => !enrollmentChildIds.has(childId)).sort((left, right) => left.localeCompare(right));
  const sourceOnlyChildContexts = sourceChildIdsWithoutEnrollment.map((childId) => {
    const related = [...(relationshipsByChild.get(childId) ?? [])].sort(comparePeople);
    const relationshipSourceRows = relationshipSourceRowsByChild.get(childId) ?? [];
    const details = childDetails.get(childId) ?? [];
    const childSource = details[0]
      ?? relationshipSourceRows.find((row) => personType(row) === "child")
      ?? { "Child ID": childId };
    const child = { ...childSource, "Child ID": childId, "Enrollment Status": "Withdrawn" };
    const resolution = accountResolution({ child, related, accountsByPerson, peopleByAccount });
    return { childId, child, related, relationshipSourceRows, details, resolution };
  });
  const sourceOnlyLinkedAccountIds = new Set(sourceOnlyChildContexts.flatMap((context) => context.resolution.candidateAccountIds));
  const childLinkedAccountIds = new Set([...enrollmentLinkedAccountIds, ...sourceOnlyLinkedAccountIds]);
  const accountIdsWithoutEnrollmentLink = [...peopleByAccount.keys()]
    .filter((accountId) => !enrollmentLinkedAccountIds.has(accountId));
  const accountIdsWithoutChildSource = [...peopleByAccount.keys()]
    .filter((accountId) => !childLinkedAccountIds.has(accountId))
    .sort((left, right) => left.localeCompare(right));

  const directAccountResolution = (accountId: string): ReturnType<typeof accountResolution> => ({
    status: "resolved",
    accountId,
    candidateAccountIds: [accountId],
    candidateAccountCount: 1,
    mergedAccountIds: [],
    relationshipPersonCount: 0,
    linkedPersonCount: 0,
    unlinkedPersonCount: 0,
  });
  const missingAccountResolution = (): ReturnType<typeof accountResolution> => ({
    status: "missing",
    accountId: "",
    candidateAccountIds: [],
    candidateAccountCount: 0,
    mergedAccountIds: [],
    relationshipPersonCount: 0,
    linkedPersonCount: 0,
    unlinkedPersonCount: 0,
  });

  const buildNormalizedRow = ({
    rowType,
    child,
    enrollmentSource,
    related = [],
    relationshipSourceRows,
    details = [],
    resolution,
    accountPeopleOverride,
    additionalDiagnostics = [],
    includeResolutionDiagnostics = true,
    resolutionMethod,
  }: {
    rowType: string;
    child?: CsvRow;
    enrollmentSource?: CsvRow;
    related?: CsvRow[];
    relationshipSourceRows?: CsvRow[];
    details?: CsvRow[];
    resolution: ReturnType<typeof accountResolution>;
    accountPeopleOverride?: CsvRow[];
    additionalDiagnostics?: ProcareImportDiagnostic[];
    includeResolutionDiagnostics?: boolean;
    resolutionMethod?: string | null;
  }): Record<string, string> => {
    const retainedRelationshipSourceRows = relationshipSourceRows ?? related;
    const accountPeople = accountPeopleOverride
      ?? (resolution.mergedAccountIds.length
        ? resolution.mergedAccountIds.flatMap((accountId) => [...(peopleByAccount.get(accountId) ?? [])].sort(comparePeople))
        : resolution.accountId ? [...(peopleByAccount.get(resolution.accountId) ?? [])].sort(comparePeople) : []);
    const candidateAccountPeople = resolution.status === "ambiguous"
      ? resolution.candidateAccountIds.flatMap((accountId) => (
          [...(peopleByAccount.get(accountId) ?? [])]
            .sort(comparePeople)
        ))
      : [];
    const childPersonId = field(child, "Person ID");
    const payers = uniquePeople(accountPeople.filter((row) => (
      personType(row) === "payer" && field(row, "Person ID") !== childPersonId
    )));
    const candidatePayers = uniquePeople(candidateAccountPeople.filter((row) => (
      personType(row) === "payer" && field(row, "Person ID") !== childPersonId
    )));
    const payerPersonIds = new Set([...payers, ...candidatePayers].map((row) => field(row, "Person ID")).filter(Boolean));
    const primary = payers[0];
    const secondary = payers[1];
    const allergySourceRecords = details.filter((row) => /allerg/i.test(field(row, "Category Description")));
    const activeAllergySourceRecords = allergySourceRecords.filter((row) => checked(field(row, "Item Is Active")));
    const allergyRecords = activeAllergySourceRecords.map((row) => field(row, "Item Description")).filter(Boolean);
    const relationshipRecords = related.map((row) => relationshipRecord(row, payerPersonIds, childPersonId));
    const diagnostics = [
      ...additionalDiagnostics,
      ...(includeResolutionDiagnostics ? diagnosticForResolution(resolution, payers.length) : []),
    ];
    const childId = field(child, "Child ID");
    const coverage = {
      version: PROCARE_MULTI_REPORT_COVERAGE_MANIFEST.version,
      normalizedRecordKind: rowType,
      accountResolution: {
        status: resolution.status,
        method: resolutionMethod === undefined
          ? resolution.mergedAccountIds.length
            ? "shared_child_unique_sibling_household"
            : resolution.status === "resolved" ? "person_identifier_to_unique_account_identifier" : null
          : resolutionMethod,
        candidateAccountCount: resolution.candidateAccountCount,
        relationshipPersonCount: resolution.relationshipPersonCount,
        linkedPersonCount: resolution.linkedPersonCount,
        unlinkedPersonCount: resolution.unlinkedPersonCount,
      },
      sourceRows: {
        enrollment: enrollmentSource ? 1 : 0,
        accountPeople: accountPeople.length,
        candidateAccountPeople: candidateAccountPeople.length,
        payers: payers.length,
        relationships: retainedRelationshipSourceRows.length,
        childInfo: details.length,
        allergyItems: allergySourceRecords.length,
        activeAllergyItems: activeAllergySourceRecords.length,
        otherChildInfoItems: details.length - allergySourceRecords.length,
      },
      identifiers: {
        childId: Boolean(childId),
        accountId: Boolean(resolution.accountId),
        enrollmentPersonId: Boolean(field(enrollmentSource, "Person ID")),
        relationshipRowsWithPersonId: retainedRelationshipSourceRows.filter((row) => Boolean(field(row, "Person ID"))).length,
        relationshipRowsWithRowId: retainedRelationshipSourceRows.filter((row) => Boolean(field(row, "Row ID"))).length,
      },
      mappedRows: {
        relationships: relationshipRecords.length,
      },
      retainedSourceRecords: {
        enrollment: Boolean(enrollmentSource),
        accountPeople: accountPeople.length,
        candidateAccountPeople: candidateAccountPeople.length,
        relationships: retainedRelationshipSourceRows.length,
        childInfo: details.length,
        allergyItems: allergySourceRecords.length,
      },
    };

    return {
      "row type": rowType,
      "account id": resolution.accountId,
      "family name": primary ? `${field(primary, "Last Name") || fullName(primary)} Household` : "",
      "child id": childId,
      "child person id": field(child, "Person ID"),
      "child name": fullName(child),
      "child first name": field(child, "First Name"),
      "child middle name": field(child, "Middle Initial"),
      "child last name": field(child, "Last Name"),
      "date of birth": field(child, "Date of Birth"),
      "gender": field(child, "Gender"),
      "classroom": field(child, "Primary Classroom"),
      "classroom id": field(child, "Classroom ID"),
      "child status": field(child, "Enrollment Status"),
      "start date": field(child, "Status Start Date", "Status Date"),
      "end date": field(child, "Status End Date"),
      "guardian id": field(primary, "Person ID"),
      "guardian name": primary ? fullName(primary) : "",
      "guardian email": field(primary, "Email"),
      "guardian phone": field(primary, "Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5"),
      "address": address(primary),
      "secondary guardian id": field(secondary, "Person ID"),
      "secondary guardian": secondary ? fullName(secondary) : "",
      "secondary email": field(secondary, "Email"),
      "secondary phone": field(secondary, "Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5"),
      "allergies": allergyRecords.join("; "),
      "procare allergy records": JSON.stringify(allergyRecords),
      "procare allergy source records": JSON.stringify(allergySourceRecords),
      "procare relationship records": JSON.stringify(relationshipRecords),
      "procare relationship source records": JSON.stringify(retainedRelationshipSourceRows),
      "procare enrollment source record": JSON.stringify(enrollmentSource ?? null),
      "procare account person records": JSON.stringify(accountPeople),
      "procare candidate account person records": JSON.stringify(candidateAccountPeople),
      "procare child info source records": JSON.stringify(details),
      "procare import diagnostics": JSON.stringify(diagnostics),
      "procare coverage manifest": JSON.stringify(coverage),
      "import warning": diagnostics
        .filter((diagnostic) => diagnostic.severity === "warning")
        .map((diagnostic) => diagnostic.message)
        .join(" "),
    };
  };

  const normalizedRows: Array<Record<string, string>> = enrollmentContexts.map((context) => buildNormalizedRow({
    rowType: "procare_multi_report_child",
    child: context.child,
    enrollmentSource: context.child,
    related: context.related,
    relationshipSourceRows: context.relationshipSourceRows,
    details: context.details,
    resolution: context.resolution,
    additionalDiagnostics: context.childId ? [] : [{
      code: "enrollment_child_id_missing",
      severity: "warning",
      sourceRowCount: 1,
      message: "An enrollment source row has no ProCare Child ID and cannot be linked automatically.",
    }],
  }));

  for (const context of sourceOnlyChildContexts) {
    normalizedRows.push(buildNormalizedRow({
      rowType: "procare_multi_report_source_child_without_enrollment",
      child: context.child,
      related: context.related,
      relationshipSourceRows: context.relationshipSourceRows,
      details: context.details,
      resolution: context.resolution,
      additionalDiagnostics: [{
        code: "source_child_without_enrollment",
        severity: "info",
        sourceRowCount: context.relationshipSourceRows.length + context.details.length,
        relationshipRowCount: context.relationshipSourceRows.length,
        childInfoRowCount: context.details.length,
        message: "ProCare relationship or child-information source rows reference a child that is absent from enrollment.csv.",
      }],
    }));
  }

  for (const accountId of accountIdsWithoutChildSource) {
    const accountPeople = [...(peopleByAccount.get(accountId) ?? [])].sort(comparePeople);
    normalizedRows.push(buildNormalizedRow({
      rowType: "procare_multi_report_family_only",
      resolution: directAccountResolution(accountId),
      accountPeopleOverride: accountPeople,
      resolutionMethod: "source_account_identifier_without_enrollment",
      additionalDiagnostics: [{
        code: "account_without_enrollment",
        severity: "info",
        sourceRowCount: accountPeople.length,
        message: "A ProCare account has no linked enrollment row and is retained as a family-only source record for review.",
      }],
    }));
  }

  for (const person of parentsWithoutAccount) {
    normalizedRows.push(buildNormalizedRow({
      rowType: "procare_multi_report_parent_without_account_id",
      resolution: missingAccountResolution(),
      accountPeopleOverride: [person],
      includeResolutionDiagnostics: false,
      resolutionMethod: null,
      additionalDiagnostics: [{
        code: "parent_account_id_missing",
        severity: "warning",
        sourceRowCount: 1,
        message: "A ParentInfo source row has no ProCare Account ID and cannot be linked automatically.",
      }],
    }));
  }

  for (const relationship of relationshipsWithoutChild) {
    const related = personType(relationship) === "relationship" ? [relationship] : [];
    const resolution = accountResolution({ child: {}, related, accountsByPerson, peopleByAccount });
    normalizedRows.push(buildNormalizedRow({
      rowType: "procare_multi_report_relationship_without_child_id",
      related,
      relationshipSourceRows: [relationship],
      resolution,
      additionalDiagnostics: [{
        code: "relationship_child_id_missing",
        severity: "warning",
        sourceRowCount: 1,
        relationshipRowCount: 1,
        message: "A Relationships source row has no ProCare Child ID and cannot be linked to a child automatically.",
      }],
    }));
  }

  for (const detail of childInfoWithoutChild) {
    normalizedRows.push(buildNormalizedRow({
      rowType: "procare_multi_report_child_info_without_child_id",
      child: detail,
      details: [detail],
      resolution: missingAccountResolution(),
      includeResolutionDiagnostics: false,
      resolutionMethod: null,
      additionalDiagnostics: [{
        code: "child_info_child_id_missing",
        severity: "warning",
        sourceRowCount: 1,
        childInfoRowCount: 1,
        message: "A ChildInfo source row has no ProCare Child ID and cannot be linked automatically.",
      }],
    }));
  }

  const sourceOnlyRelationshipRows = sourceChildIdsWithoutEnrollment.reduce(
    (total, childId) => total + (relationshipSourceRowsByChild.get(childId)?.length ?? 0),
    0,
  );
  const sourceOnlyChildInfoRows = sourceChildIdsWithoutEnrollment.reduce(
    (total, childId) => total + (childDetails.get(childId)?.length ?? 0),
    0,
  );
  const normalizedRowsByKind = Object.fromEntries(
    [...new Set(normalizedRows.map((row) => row["row type"]))]
      .sort((left, right) => left.localeCompare(right))
      .map((rowType) => [rowType, normalizedRows.filter((row) => row["row type"] === rowType).length]),
  );
  const datasetCoverage = {
    version: PROCARE_MULTI_REPORT_COVERAGE_MANIFEST.version,
    reportDetection: Object.fromEntries(REPORT_KINDS.map((reportKind) => [reportKind, {
      sourceName: detected.reports[reportKind].map((report) => report.sourceName).join(", "),
      sourceNames: detected.reports[reportKind].map((report) => report.sourceName),
      sourceFileCount: detected.reports[reportKind].length,
      matchedHeaderAliases: detected.reports[reportKind].reduce((total, report) => total + report.aliasMatches, 0),
    }])),
    sourceInventory: detected.inventory,
    sourceRows: {
      enrollment: enrollment.length,
      accountPeople: parents.length,
      relationships: relationships.length,
      childInfo: childInfo.length,
    },
    rawSourceRows: {
      enrollment: parsedReports.enrollment.rawRows,
      accountPeople: parsedReports.parentinfo.rawRows,
      relationships: parsedReports.relationships.rawRows,
      childInfo: parsedReports.childinfo.rawRows,
    },
    duplicateSourceRowsRemoved: {
      enrollment: parsedReports.enrollment.duplicateRowsRemoved,
      accountPeople: parsedReports.parentinfo.duplicateRowsRemoved,
      relationships: parsedReports.relationships.duplicateRowsRemoved,
      childInfo: parsedReports.childinfo.duplicateRowsRemoved,
    },
    sourceIdentifiers: {
      accounts: peopleByAccount.size,
      enrollmentChildren: enrollmentChildIds.size,
      relationshipChildren: relationshipSourceRowsByChild.size,
      childInfoChildren: childDetails.size,
    },
    warningCoverage: {
      accountIdentifiersWithoutEnrollmentChild: accountIdsWithoutEnrollmentLink.length,
      familyOnlyAccountsWithoutAnyChildSource: accountIdsWithoutChildSource.length,
      accountsLinkedOnlyToSourceChildrenWithoutEnrollment: [...sourceOnlyLinkedAccountIds]
        .filter((accountId) => !enrollmentLinkedAccountIds.has(accountId)).length,
      sourceChildrenWithoutEnrollment: sourceChildIdsWithoutEnrollment.length,
      relationshipRowsForChildrenWithoutEnrollment: sourceOnlyRelationshipRows,
      childInfoRowsForChildrenWithoutEnrollment: sourceOnlyChildInfoRows,
      enrollmentRowsWithoutChildIdentifier: enrollmentContexts.filter((context) => !context.childId).length,
      parentRowsWithoutAccountIdentifier: parentsWithoutAccount.length,
      relationshipRowsWithoutChildIdentifier: relationshipsWithoutChild.length,
      childInfoRowsWithoutChildIdentifier: childInfoWithoutChild.length,
    },
    normalizedRows: {
      total: normalizedRows.length,
      byKind: normalizedRowsByKind,
    },
    retainedSourceRows: {
      enrollment: enrollment.length,
      accountPeople: parents.length,
      relationships: relationships.length,
      childInfo: childInfo.length,
    },
  };
  const encodedDatasetCoverage = JSON.stringify(datasetCoverage);
  return normalizedRows.map((row) => ({
    ...row,
    "procare dataset coverage manifest": encodedDatasetCoverage,
  }));
}

export async function buildProcareMultiReportRows(buffer: Buffer) {
  return buildProcareMultiReportRowsFromFiles(await zipEntries(buffer));
}
