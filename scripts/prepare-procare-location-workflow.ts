import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildProcareMultiReportRowsFromFiles } from "../src/lib/procare-multi-report-import";
import { preparedProcareCsv } from "./prepare-rendered-procare-import";

type CsvRow = Record<string, string>;

type SourceFile = {
  filename: string;
  path: string;
  buffer: Buffer;
  sha256: string;
  headers: string[];
  rows: CsvRow[];
  renderedRows: string[][];
  kinds: string[];
};

type GateStatus = "ready" | "review_required" | "blocked" | "held";

type Gate = {
  status: GateStatus;
  summary: string;
  details: string[];
};

const EMPTY_CHILD_INFO_FILENAME = "BEE reviewed empty child information placeholder.csv";
const EMPTY_CHILD_INFO_HEADERS = [
  "Child ID",
  "Person ID",
  "Full Name",
  "Category Description",
  "Category Sort ID",
  "Item Description",
  "Item Sort ID",
  "Item Is Active",
];

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value: string) {
  return value.replace(/^\ufeff/, "").trim().toLowerCase().replace(/#/g, " number ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function field(row: CsvRow | undefined, ...names: string[]) {
  if (!row) return "";
  const wanted = new Set(names.map(normalize));
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(normalize(key)) && clean(value)) return clean(value);
  }
  return "";
}

function checked(value: string) {
  return /^(checked|yes|true|1|x)$/i.test(value.trim());
}

function decodeCsvBuffer(buffer: Buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const candidates = [",", "\t", ";", "|"] as const;
  const ranked = candidates.map((delimiter) => {
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
  if (!ranked[0]?.count) throw new Error("The report does not contain recognizable tabular columns.");
  return ranked[0].delimiter;
}

export function parseCsvValues(buffer: Buffer, reportName: string) {
  const text = decodeCsvBuffer(buffer).replace(/^\ufeff/, "");
  const delimiter = detectDelimiter(text);
  const values: string[][] = [];
  let value = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      value = "";
      if (row.some(Boolean)) values.push(row);
      row = [];
    } else value += char;
  }
  if (quoted) throw new Error(`${reportName} contains an unterminated quoted value.`);
  row.push(value.trim());
  if (row.some(Boolean)) values.push(row);
  return values;
}

export function parseCsvBuffer(buffer: Buffer, reportName: string) {
  const values = parseCsvValues(buffer, reportName);
  const headers = (values[0] ?? []).map((header) => header.replace(/^\ufeff/, "").trim());
  if (!headers.length) throw new Error(`${reportName} has no header row.`);
  const normalizedHeaders = headers.map(normalize);
  const duplicates = normalizedHeaders.filter((header, index) => header && normalizedHeaders.indexOf(header) !== index);
  if (duplicates.length) throw new Error(`${reportName} contains duplicate columns: ${[...new Set(duplicates)].join(", ")}.`);
  const rows = values.slice(1).map((rowValues, index) => {
    if (rowValues.slice(headers.length).some(Boolean)) throw new Error(`${reportName} row ${index + 2} has more values than its header row.`);
    return Object.fromEntries(headers.map((header, column) => [header, rowValues[column] ?? ""]));
  });
  return { headers, rows };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvFromRows(rows: CsvRow[], preferredHeaders: string[] = []) {
  const headers = [...new Set([...preferredHeaders, ...rows.flatMap((row) => Object.keys(row))])];
  return `${[
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(",")),
  ].join("\r\n")}\r\n`;
}

function classify(headers: string[]) {
  const available = new Set(headers.map(normalize));
  const has = (...names: string[]) => names.every((name) => available.has(normalize(name)));
  const any = (...names: string[]) => names.some((name) => available.has(normalize(name)));
  const kinds: string[] = [];
  const relationshipReport = has("Child ID", "Person ID", "Person Type")
    && any("Relationship Type")
    && any("Lives With", "Emergency", "Authorized Pickup");
  if (relationshipReport) kinds.push("relationships");
  if (!relationshipReport && has("Child ID", "Enrollment Status") && any("Primary Classroom", "Classroom ID") && any("Status Start Date", "Status Date")) kinds.push("enrollment");
  if (has("Child ID", "Category Description", "Item Description", "Item Is Active")) kinds.push("childinfo");
  if (has("Account ID", "Person ID", "Person Type")) kinds.push("parentinfo");
  if (has("Account ID", "Balance")) kinds.push("balance");
  if (has("Account ID", "Person ID") && !has("Person Type")) kinds.push("account_reference");
  if (has("Account ID", "Post Date", "Description", "Amount")) kinds.push("ledger");
  if (has("Employee ID", "Employment Status")) kinds.push("employee");
  if (has("Employee ID") && any("Punch In Date/Time", "Clock In Date/Time")) kinds.push("timecard");
  if (has("Classroom ID") && any("Capacity", "Licensed Capacity", "Max Capacity", "Ratio", "Ratio Rule")) kinds.push("classroom_settings");
  const tuitionIdentity = any("Child ID", "Child Key", "Student ID");
  const tuitionAmount = any("Weekly Rate", "Tuition Rate", "Charge Amount", "Amount", "Rate");
  const tuitionCadence = any("Frequency", "Cadence", "Billing Period", "Charge Frequency");
  if (tuitionIdentity && tuitionAmount && tuitionCadence) kinds.push("tuition");
  return kinds;
}

function renderedReportKind(values: string[][]) {
  const first = values[0] ?? [];
  if (clean(first[0]) === "Child Contract Billing Summary" && /FA_ContractBillingSummary/i.test(clean(first.at(-1)))) {
    return "rendered_contract_billing";
  }
  if (clean(first[1]) === "Classroom Schedule Summary" && /FD_ClassroomScheduleSummary/i.test(clean(first.at(-1)))) {
    return "rendered_classroom_schedule";
  }
  return "";
}

function sourceFilenameMatchesLocation(filename: string, location: string) {
  const name = filename.toLocaleLowerCase("en-US");
  const normalizedLocation = location.trim().toLocaleLowerCase("en-US");
  if (name.startsWith(`${normalizedLocation} - `)) return true;
  const suffix = name.slice(normalizedLocation.length + 1);
  return name.startsWith(`${normalizedLocation} `) && (
    suffix.startsWith("child contract billing summary") ||
    suffix.startsWith("classroom schedule summary")
  );
}

function evidenceKey(value: string) {
  return clean(value).normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function loadSources(sourceDirectory: string, location: string) {
  return fs.readdirSync(sourceDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile()
      && sourceFilenameMatchesLocation(entry.name, location)
      && /\.(csv|tsv|txt)$/i.test(entry.name))
    .map((entry): SourceFile => {
      const filePath = path.join(sourceDirectory, entry.name);
      const buffer = fs.readFileSync(filePath);
      const renderedRows = parseCsvValues(buffer, entry.name);
      const renderedKind = renderedReportKind(renderedRows);
      const parsed = renderedKind ? { headers: [] as string[], rows: [] as CsvRow[] } : parseCsvBuffer(buffer, entry.name);
      return {
        filename: entry.name,
        path: filePath,
        buffer,
        sha256: sha256(buffer),
        headers: parsed.headers,
        rows: parsed.rows,
        renderedRows,
        kinds: renderedKind ? [renderedKind] : classify(parsed.headers),
      };
    })
    .sort((left, right) => left.filename.localeCompare(right.filename));
}

function parseMoneyCell(value: string) {
  const source = clean(value).replaceAll(",", "").replaceAll("$", "");
  const normalized = /^\(.*\)$/.test(source) ? `-${source.slice(1, -1)}` : source;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

function renderedContractBillingReview(source: SourceFile | null) {
  if (!source) return [] as CsvRow[];
  const uniqueComponents = new Map<string, {
    childName: string;
    classroom: string;
    payerLabel: string;
    cadence: string;
    description: string;
    note: string;
    amountCents: number;
  }>();
  for (const row of source.renderedRows) {
    if (clean(row[0]) !== "Child Contract Billing Summary") continue;
    const childName = clean(row[8]);
    const classroom = clean(row[10]);
    const payerLabel = clean(row[13]);
    const cadence = clean(row[14]);
    const description = clean(row[15]);
    const note = clean(row[16]);
    const amountCents = parseMoneyCell(row[17] ?? "");
    if (!childName || !classroom || !cadence || !description || amountCents === null) continue;
    const key = [childName, classroom, payerLabel, cadence, description, note].map(evidenceKey).concat(String(amountCents)).join("\u0000");
    if (!uniqueComponents.has(key)) uniqueComponents.set(key, { childName, classroom, payerLabel, cadence, description, note, amountCents });
  }

  const grouped = new Map<string, {
    childName: string;
    classroom: string;
    payerLabel: string;
    cadence: string;
    descriptions: Set<string>;
    notes: Set<string>;
    componentCount: number;
    amountCents: number;
  }>();
  for (const component of uniqueComponents.values()) {
    const key = [component.childName, component.classroom, component.payerLabel, component.cadence].map(evidenceKey).join("\u0000");
    const existing = grouped.get(key) ?? {
      childName: component.childName,
      classroom: component.classroom,
      payerLabel: component.payerLabel,
      cadence: component.cadence,
      descriptions: new Set<string>(),
      notes: new Set<string>(),
      componentCount: 0,
      amountCents: 0,
    };
    existing.descriptions.add(component.description);
    if (component.note) existing.notes.add(component.note);
    existing.componentCount += 1;
    existing.amountCents += component.amountCents;
    grouped.set(key, existing);
  }

  return [...grouped.values()].map((item): CsvRow => {
    const descriptions = [...item.descriptions].sort((left, right) => left.localeCompare(right));
    const notes = [...item.notes].sort((left, right) => left.localeCompare(right));
    return {
      "source child name": item.childName,
      "source classroom": item.classroom,
      "source payer label": item.payerLabel,
      "source cadence": item.cadence,
      "source charge descriptions": descriptions.join(" | "),
      "source charge notes": notes.join(" | "),
      "source component count": String(item.componentCount),
      "source amount cents": String(item.amountCents),
      "confirmed child id": "",
      "confirmed account id": "",
      "confirmed tuition cents": /^weekly$/i.test(item.cadence) && item.amountCents > 0 ? String(item.amountCents) : "",
      "confirmed cadence": item.cadence,
      "effective date": "",
      disposition: "review_required",
      "review note": "Rendered report has no stable Child or Account ID. Use the payer label only as supporting evidence; match to one reviewed child and account or hold.",
    };
  }).sort((left, right) => (
    left["source child name"].localeCompare(right["source child name"])
    || left["source payer label"].localeCompare(right["source payer label"])
  ));
}

function renderedClassroomScheduleReview(source: SourceFile | null) {
  if (!source) return [] as CsvRow[];
  const unique = new Map<string, CsvRow>();
  for (const row of source.renderedRows) {
    if (clean(row[1]) !== "Classroom Schedule Summary") continue;
    const classroom = clean(row[5]);
    const childName = clean(row[11]);
    const dates = row.slice(6, 11).map(clean);
    const schedules = row.slice(12, 17).map(clean);
    if (!classroom || !childName) continue;
    const key = [classroom, childName, ...schedules].map(evidenceKey).join("\u0000");
    if (!unique.has(key)) unique.set(key, {
      "source child name": childName,
      "source classroom": classroom,
      monday: schedules[0] ?? "",
      tuesday: schedules[1] ?? "",
      wednesday: schedules[2] ?? "",
      thursday: schedules[3] ?? "",
      friday: schedules[4] ?? "",
      "source week": dates.filter(Boolean).join(" | "),
      "confirmed child id": "",
      "confirmed classroom id": "",
      "confirmed classroom name": classroom,
      disposition: "review_required",
      "review note": "Rendered report has no stable Child or Classroom ID. Confirm both against reviewed source IDs or hold.",
    });
  }
  return [...unique.values()].sort((left, right) => (
    left["source classroom"].localeCompare(right["source classroom"])
    || left["source child name"].localeCompare(right["source child name"])
  ));
}

function renderedChildNameKey(value: string) {
  const parts = clean(value).split(",").map((part) => part.trim()).filter(Boolean);
  return evidenceKey(parts.length === 2 ? `${parts[1]} ${parts[0]}` : value);
}

function singleSource(sources: SourceFile[], kind: string, required = true) {
  const matches = sources.filter((source) => source.kinds.includes(kind));
  if (matches.length > 1) throw new Error(`More than one ${kind} report was detected: ${matches.map((source) => source.filename).join(", ")}.`);
  if (required && !matches[0]) throw new Error(`No ${kind} report was detected.`);
  return matches[0] ?? null;
}

function derivePrimaryPayerReport(balanceSource: SourceFile) {
  const accountIds = new Set<string>();
  const accountsByPerson = new Map<string, Set<string>>();
  const derived: CsvRow[] = [];
  for (const row of balanceSource.rows) {
    const accountId = field(row, "Account ID");
    const personId = field(row, "Person ID");
    if (!accountId || !personId) throw new Error(`${balanceSource.filename} contains a row without both Account ID and Person ID.`);
    if (accountIds.has(accountId)) throw new Error(`${balanceSource.filename} contains duplicate Account ID ${accountId}; primary-payer derivation is unsafe.`);
    accountIds.add(accountId);
    const personAccounts = accountsByPerson.get(personId) ?? new Set<string>();
    personAccounts.add(accountId);
    accountsByPerson.set(personId, personAccounts);
    derived.push({
      ...row,
      "Person Type": "Payer",
      "Person Sort ID": "0",
      "BEE Derivation Method": "Account Balance Summary one-to-one Account ID and Person ID",
      "BEE Source Filename": balanceSource.filename,
    });
  }
  const multiAccountPeople = [...accountsByPerson].filter(([, accounts]) => accounts.size > 1);
  const csv = csvFromRows(derived, [...balanceSource.headers, "Person Type", "Person Sort ID", "BEE Derivation Method", "BEE Source Filename"]);
  return {
    buffer: Buffer.from(csv, "utf8"),
    rowCount: derived.length,
    multiAccountPersonCount: multiAccountPeople.length,
  };
}

function warningCodes(records: CsvRow[]) {
  const counts: Record<string, number> = {};
  for (const record of records) {
    try {
      const diagnostics = JSON.parse(record["procare import diagnostics"] || "[]") as Array<{ code?: string; severity?: string }>;
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity !== "warning") continue;
        const code = diagnostic.code || "unspecified_warning";
        counts[code] = (counts[code] ?? 0) + 1;
      }
    } catch {
      counts.invalid_diagnostics = (counts.invalid_diagnostics ?? 0) + 1;
    }
  }
  return counts;
}

function parseMoneyCents(value: string) {
  const trimmed = value.trim();
  const negative = /^\(.*\)$/.test(trimmed);
  const normalized = trimmed.replace(/[^0-9.-]/g, "").replace(/^\((.*)\)$/, "$1");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) * (negative ? -1 : 1);
}

function normalizedPhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizedPersonName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function ledgerPostTime(row: CsvRow) {
  const value = field(row, "Post Date", "Creation Date");
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function isTuitionChargeLedgerRow(row: CsvRow) {
  const amountCents = parseMoneyCents(field(row, "Amount"));
  if (amountCents === null || amountCents <= 0) return false;
  const description = [field(row, "Description"), field(row, "GL Account"), field(row, "Comment")].filter(Boolean).join(" ");
  if (!/tuition/i.test(description)) return false;
  return !/\b(pmt|payment|refund|credit|reversal|void|late|registration|deposit)\b/i.test(description);
}

function recurringWeeklyLedgerCandidates(rows: CsvRow[]) {
  const byAccount = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const accountId = field(row, "Account ID");
    if (!accountId) continue;
    byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), row]);
  }
  const result = new Map<string, {
    ledgerRows: number;
    tuitionChargeRows: number;
    candidates: Array<{ amountCents: number; dates: string[] }>;
  }>();
  for (const [accountId, accountRows] of byAccount) {
    const tuitionRows = accountRows.filter(isTuitionChargeLedgerRow);
    const byAmount = new Map<number, CsvRow[]>();
    for (const row of tuitionRows) {
      const amountCents = parseMoneyCents(field(row, "Amount"));
      if (amountCents === null) continue;
      byAmount.set(amountCents, [...(byAmount.get(amountCents) ?? []), row]);
    }
    const candidates = [...byAmount].flatMap(([amountCents, amountRows]) => {
      const dated = amountRows
        .map((row) => ({ row, time: ledgerPostTime(row) }))
        .filter((item): item is { row: CsvRow; time: number } => item.time !== null)
        .sort((left, right) => left.time - right.time);
      const uniqueDates = [...new Set(dated.map((item) => field(item.row, "Post Date", "Creation Date")))];
      if (dated.length < 3 || uniqueDates.length < 3) return [];
      const intervals = dated.slice(1).map((item, index) => Math.round((item.time - dated[index].time) / 86_400_000));
      if (!intervals.every((days) => days >= 5 && days <= 9)) return [];
      return [{ amountCents, dates: uniqueDates }];
    });
    result.set(accountId, { ledgerRows: accountRows.length, tuitionChargeRows: tuitionRows.length, candidates });
  }
  return result;
}

function statusOf(record: CsvRow) {
  return field(record, "child status", "Enrollment Status").toLowerCase();
}

function relationshipCounts(record: CsvRow) {
  try {
    const relationships = JSON.parse(record["procare relationship records"] || "[]") as Array<{ guardian?: boolean; emergency?: boolean; authorizedPickup?: boolean }>;
    return {
      guardians: relationships.filter((item) => item.guardian).length,
      emergencyContacts: relationships.filter((item) => item.emergency).length,
      authorizedPickups: relationships.filter((item) => item.authorizedPickup).length,
    };
  } catch {
    return { guardians: 0, emergencyContacts: 0, authorizedPickups: 0 };
  }
}

function personSortValue(row: CsvRow) {
  const value = Number(field(row, "Person Sort ID", "Person Sort Order"));
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function personFullName(row: CsvRow | undefined) {
  return field(row, "Full Name") || [field(row, "First Name"), field(row, "Middle Initial"), field(row, "Last Name")].filter(Boolean).join(" ");
}

function personAddress(row: CsvRow | undefined) {
  const locality = [field(row, "Add 1, City"), field(row, "Add 1, Region"), field(row, "Add 1, Postal Code")].filter(Boolean).join(", ");
  return [field(row, "Add 1, Line 1"), field(row, "Add 1, Line 2"), locality].filter(Boolean).join("\n");
}

function resolveAmbiguousRecordToAccount(input: {
  record: CsvRow;
  accountId: string;
  method: string;
  diagnosticCode: string;
  diagnosticMessage: string;
}) {
  try {
    const coverage = JSON.parse(input.record["procare coverage manifest"] || "{}") as {
      accountResolution?: { status?: string; candidateAccountCount?: number; [key: string]: unknown };
      [key: string]: unknown;
    };
    if (coverage.accountResolution?.status !== "ambiguous") return { record: input.record, resolved: false };
    const candidates = JSON.parse(input.record["procare candidate account person records"] || "[]") as CsvRow[];
    const accountPeople = candidates.filter((person) => field(person, "Account ID") === input.accountId);
    const childPersonId = input.record["child person id"];
    const payers = accountPeople
      .filter((person) => /^payer$/i.test(field(person, "Person Type")) && field(person, "Person ID") !== childPersonId)
      .sort((left, right) => personSortValue(left) - personSortValue(right) || field(left, "Person ID").localeCompare(field(right, "Person ID")));
    if (!payers.length) return { record: input.record, resolved: false };
    const primary = payers[0];
    const secondary = payers[1];
    const diagnostics = JSON.parse(input.record["procare import diagnostics"] || "[]") as Array<Record<string, unknown>>;
    const revisedDiagnostics = [
      ...diagnostics.filter((diagnostic) => diagnostic.code !== "account_link_ambiguous"),
      {
        code: input.diagnosticCode,
        severity: "info",
        candidateAccountCount: coverage.accountResolution?.candidateAccountCount,
        message: input.diagnosticMessage,
      },
    ];
    const revisedCoverage = {
      ...coverage,
      accountResolution: {
        ...coverage.accountResolution,
        status: "resolved",
        method: input.method,
        selectedAccountId: input.accountId,
      },
    };
    return {
      resolved: true,
      record: {
        ...input.record,
        "account id": input.accountId,
        "family name": `${field(primary, "Last Name") || personFullName(primary)} Household`,
        "guardian id": field(primary, "Person ID"),
        "guardian name": personFullName(primary),
        "guardian email": field(primary, "Email"),
        "guardian phone": field(primary, "Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5"),
        address: personAddress(primary),
        "secondary guardian id": field(secondary, "Person ID"),
        "secondary guardian": personFullName(secondary),
        "secondary email": field(secondary, "Email"),
        "secondary phone": field(secondary, "Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5"),
        "procare account person records": JSON.stringify(accountPeople),
        "procare import diagnostics": JSON.stringify(revisedDiagnostics),
        "procare coverage manifest": JSON.stringify(revisedCoverage),
        "import warning": revisedDiagnostics
          .filter((diagnostic) => diagnostic.severity === "warning")
          .map((diagnostic) => String(diagnostic.message ?? ""))
          .filter(Boolean)
          .join(" "),
        "BEE Account Resolution": input.method.replaceAll("_", " "),
      },
    };
  } catch {
    return { record: input.record, resolved: false };
  }
}

function resolveUniqueExplicitChildMembership(record: CsvRow) {
  try {
    const coverage = JSON.parse(record["procare coverage manifest"] || "{}") as {
      accountResolution?: { status?: string; directChildAccountCount?: number; [key: string]: unknown };
      [key: string]: unknown;
    };
    if (coverage.accountResolution?.status !== "ambiguous" || coverage.accountResolution.directChildAccountCount !== 1) {
      return { record, resolved: false };
    }
    const childPersonId = record["child person id"];
    if (!childPersonId) return { record, resolved: false };
    const candidates = JSON.parse(record["procare candidate account person records"] || "[]") as CsvRow[];
    const directAccountIds = [...new Set(candidates.filter((person) => (
      field(person, "Person ID") === childPersonId && /^child$/i.test(field(person, "Person Type"))
    )).map((person) => field(person, "Account ID")).filter(Boolean))];
    if (directAccountIds.length !== 1) return { record, resolved: false };
    return resolveAmbiguousRecordToAccount({
      record,
      accountId: directAccountIds[0],
      method: "unique_explicit_child_membership_over_shared_relationship_account",
      diagnosticCode: "account_link_resolved_by_unique_explicit_child_membership",
      diagnosticMessage: "Multiple relationship identifiers crossed accounts, but the child Person ID is explicitly listed as Child in exactly one ProCare account.",
    });
  } catch {
    return { record, resolved: false };
  }
}

function resolveUniqueLivesWithPayerAccount(record: CsvRow) {
  try {
    const coverage = JSON.parse(record["procare coverage manifest"] || "{}") as { accountResolution?: { status?: string } };
    if (coverage.accountResolution?.status !== "ambiguous") return { record, resolved: false };
    const candidates = JSON.parse(record["procare candidate account person records"] || "[]") as CsvRow[];
    const relationships = JSON.parse(record["procare relationship records"] || "[]") as Array<{
      personId?: string;
      externalId?: string;
      livesWith?: boolean;
      guardian?: boolean;
    }>;
    const livesWithPersonIds = new Set(relationships
      .filter((relationship) => relationship.guardian && relationship.livesWith)
      .map((relationship) => clean(relationship.personId) || clean(relationship.externalId))
      .filter(Boolean));
    const accountIds = [...new Set(candidates
      .filter((person) => livesWithPersonIds.has(field(person, "Person ID")) && /^payer$/i.test(field(person, "Person Type")))
      .map((person) => field(person, "Account ID"))
      .filter(Boolean))];
    if (accountIds.length !== 1) return { record, resolved: false };
    return resolveAmbiguousRecordToAccount({
      record,
      accountId: accountIds[0],
      method: "unique_lives_with_payer_account_over_non_household_contact",
      diagnosticCode: "account_link_resolved_by_unique_lives_with_payer",
      diagnosticMessage: "Multiple relationship identifiers crossed accounts, but exactly one candidate account belongs to a guardian explicitly marked Lives With; non-household contacts were not used for ownership.",
    });
  } catch {
    return { record, resolved: false };
  }
}

function embeddedPersonName(row: CsvRow) {
  return personFullName(row);
}

function canonicalizeExactGuardianAliases(record: CsvRow) {
  try {
    const accountPeople = JSON.parse(record["procare account person records"] || "[]") as CsvRow[];
    const payers = accountPeople.filter((person) => /^payer$/i.test(field(person, "Person Type")));
    const relationships = JSON.parse(record["procare relationship records"] || "[]") as Array<Record<string, unknown>>;
    const resolutions: Array<{ sourcePersonId: string; canonicalPayerPersonId: string; method: string; matchedFields: string[] }> = [];
    const revised = relationships.map((relationship) => {
      if (!relationship.guardian) return relationship;
      const sourcePersonId = clean(relationship.personId) || clean(relationship.externalId);
      const relationshipName = normalizedPersonName(clean(relationship.name));
      const relationshipEmail = clean(relationship.email).toLowerCase();
      const relationshipPhone = normalizedPhone(clean(relationship.phone));
      if (!sourcePersonId || !relationshipName) return relationship;
      const exactPayers = payers.filter((payer) => {
        const payerId = field(payer, "Person ID");
        const payerEmail = field(payer, "Email").toLowerCase();
        const payerPhone = normalizedPhone(field(payer, "Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5"));
        const emailMatch = Boolean(payerEmail && relationshipEmail && payerEmail === relationshipEmail);
        const phoneMatch = Boolean(payerPhone && relationshipPhone && payerPhone === relationshipPhone);
        const emailConflict = Boolean(payerEmail && relationshipEmail && payerEmail !== relationshipEmail);
        const phoneConflict = Boolean(payerPhone && relationshipPhone && payerPhone !== relationshipPhone);
        return payerId && payerId !== sourcePersonId
          && normalizedPersonName(embeddedPersonName(payer)) === relationshipName
          && (emailMatch || phoneMatch)
          && !emailConflict
          && !phoneConflict;
      });
      if (exactPayers.length !== 1) return relationship;
      const canonicalPayerPersonId = field(exactPayers[0], "Person ID");
      resolutions.push({
        sourcePersonId,
        canonicalPayerPersonId,
        method: "same_account_exact_name_and_nonconflicting_contact",
        matchedFields: [
          relationshipEmail && field(exactPayers[0], "Email").toLowerCase() === relationshipEmail ? "email" : "",
          relationshipPhone && normalizedPhone(field(exactPayers[0], "Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5")) === relationshipPhone ? "phone" : "",
        ].filter(Boolean),
      });
      return {
        ...relationship,
        sourcePersonId,
        sourceExternalId: clean(relationship.externalId) || sourcePersonId,
        personId: canonicalPayerPersonId,
        externalId: canonicalPayerPersonId,
        beeDeduplicationMethod: "same_account_exact_name_and_nonconflicting_contact",
      };
    });
    if (!resolutions.length) return { record, resolutionKeys: [] as string[] };
    return {
      resolutionKeys: resolutions.map((resolution) => `${resolution.sourcePersonId}->${resolution.canonicalPayerPersonId}`),
      record: {
        ...record,
        "procare relationship records": JSON.stringify(revised),
        "BEE Guardian Alias Resolutions": JSON.stringify(resolutions),
      },
    };
  } catch {
    return { record, resolutionKeys: [] as string[] };
  }
}

function sourceSummary(sources: SourceFile[]) {
  return sources.map((source) => {
    const rendered = source.kinds.some((kind) => kind.startsWith("rendered_"));
    return {
      filename: source.filename,
      sha256: source.sha256,
      rows: rendered ? source.renderedRows.length : source.rows.length,
      columns: rendered ? Math.max(0, ...source.renderedRows.map((row) => row.length)) : source.headers.length,
      classifiedAs: source.kinds.length ? source.kinds : ["ignored"],
    };
  });
}

function markdownReport(input: {
  location: string;
  generatedAt: string;
  gates: Record<string, Gate>;
  metrics: Record<string, unknown>;
  sourceFiles: ReturnType<typeof sourceSummary>;
}) {
  const gateRows = Object.entries(input.gates).map(([name, gate]) => (
    `| ${name} | ${gate.status.toUpperCase()} | ${gate.summary.replaceAll("|", "\\|")} |`
  ));
  const detailSections = Object.entries(input.gates).map(([name, gate]) => [
    `## ${name}`,
    "",
    ...gate.details.map((detail) => `- ${detail}`),
  ].join("\n"));
  return [
    `# ${input.location} ProCare import preparation`,
    "",
    `Generated: ${input.generatedAt}`,
    "",
    "This package is preparation evidence only. It does not import records, change access, send invitations, create PINs, activate staff, reconcile balances, assign tuition, or authorize ProCare cutover.",
    "",
    "| Gate | Status | Summary |",
    "| --- | --- | --- |",
    ...gateRows,
    "",
    "## Metrics",
    "",
    "```json",
    JSON.stringify(input.metrics, null, 2),
    "```",
    "",
    ...detailSections.flatMap((section) => [section, ""]),
    "## Source inventory",
    "",
    ...input.sourceFiles.map((source) => `- ${source.filename}: ${source.rows} rows, ${source.columns} columns, ${source.classifiedAs.join(" + ")}, SHA-256 ${source.sha256}`),
    "",
  ].join("\n");
}

function writeCsv(filePath: string, rows: CsvRow[], headers: string[] = []) {
  fs.writeFileSync(filePath, csvFromRows(rows, headers), "utf8");
}

export async function prepareProcareLocationWorkflow(input: {
  location: string;
  sourceDirectory: string;
  outputDirectory: string;
}) {
  const generatedAt = new Date().toISOString();
  const sourceDirectory = path.resolve(input.sourceDirectory);
  const outputDirectory = path.resolve(input.outputDirectory);
  const sources = loadSources(sourceDirectory, input.location);
  if (!sources.length) throw new Error(`No source files beginning with "${input.location} - " were found.`);
  if (sources.some((source) => path.resolve(source.path).startsWith(`${outputDirectory}${path.sep}`))) {
    throw new Error("The output directory must not contain the source exports.");
  }

  const enrollment = singleSource(sources, "enrollment");
  const relationships = singleSource(sources, "relationships");
  const balance = singleSource(sources, "balance");
  const ledger = singleSource(sources, "ledger", false);
  const childInfo = singleSource(sources, "childinfo", false);
  const tuition = singleSource(sources, "tuition", false);
  const classroomSettings = singleSource(sources, "classroom_settings", false);
  const renderedContractBilling = singleSource(sources, "rendered_contract_billing", false);
  const renderedClassroomSchedule = singleSource(sources, "rendered_classroom_schedule", false);
  const renderedBillingReview = renderedContractBillingReview(renderedContractBilling);
  const renderedScheduleReview = renderedClassroomScheduleReview(renderedClassroomSchedule);
  const canonicalParentInfo = singleSource(sources, "parentinfo", false);
  const employeeSources = sources.filter((source) => source.kinds.includes("employee"));
  const staffSource = employeeSources.sort((left, right) => {
    const score = (source: SourceFile) => ["Is Hidden", "Email", "Phone 1", "Work Area ID"].filter((header) => source.headers.some((candidate) => normalize(candidate) === normalize(header))).length;
    return score(right) - score(left) || right.rows.length - left.rows.length;
  })[0] ?? null;

  let parentInfoBuffer: Buffer;
  let parentInfoFilename: string;
  let parentInfoMode: "canonical" | "derived_primary_payer";
  let derivedParentInfoRows = 0;
  let derivedMultiAccountPeople = 0;
  if (canonicalParentInfo) {
    parentInfoBuffer = canonicalParentInfo.buffer;
    parentInfoFilename = canonicalParentInfo.filename;
    parentInfoMode = "canonical";
  } else {
    const derived = derivePrimaryPayerReport(balance);
    parentInfoBuffer = derived.buffer;
    parentInfoFilename = `${input.location} - BEE derived primary payer account information.csv`;
    parentInfoMode = "derived_primary_payer";
    derivedParentInfoRows = derived.rowCount;
    derivedMultiAccountPeople = derived.multiAccountPersonCount;
  }

  const childInfoBuffer = childInfo?.buffer ?? Buffer.from(`${EMPTY_CHILD_INFO_HEADERS.join(",")}\r\n`, "utf8");
  const reportEntries = new Map<string, Buffer>([
    [enrollment!.filename, enrollment!.buffer],
    [relationships!.filename, relationships!.buffer],
    [parentInfoFilename, parentInfoBuffer],
    [childInfo?.filename ?? EMPTY_CHILD_INFO_FILENAME, childInfoBuffer],
  ]);
  const baseNormalizedRecords = await buildProcareMultiReportRowsFromFiles(reportEntries);
  let uniqueExplicitChildMembershipResolutions = 0;
  let uniqueLivesWithPayerResolutions = 0;
  const exactGuardianAliasResolutionKeys = new Set<string>();
  const normalizedRecords = baseNormalizedRecords.map((record) => {
    const explicitMembership = resolveUniqueExplicitChildMembership(record);
    if (explicitMembership.resolved) uniqueExplicitChildMembershipResolutions += 1;
    const livesWithPayer = resolveUniqueLivesWithPayerAccount(explicitMembership.record);
    if (livesWithPayer.resolved) uniqueLivesWithPayerResolutions += 1;
    const guardianAliases = canonicalizeExactGuardianAliases(livesWithPayer.record);
    for (const key of guardianAliases.resolutionKeys) exactGuardianAliasResolutionKeys.add(key);
    return guardianAliases.record;
  });
  const exactGuardianAliasResolutions = exactGuardianAliasResolutionKeys.size;
  const readyRecords = normalizedRecords.filter((record) => !record["import warning"]);
  const resolutionRecords = normalizedRecords.filter((record) => Boolean(record["import warning"]));
  const enrolledRecords = normalizedRecords.filter((record) => record["row type"] === "procare_multi_report_child" && statusOf(record) === "enrolled");
  const enrolledReadyRecords = enrolledRecords.filter((record) => !record["import warning"]);

  const relationshipReview = normalizedRecords
    .filter((record) => record["child id"])
    .map((record) => {
      const counts = relationshipCounts(record);
      let resolutionStatus = "unknown";
      try {
        resolutionStatus = JSON.parse(record["procare coverage manifest"] || "{}").accountResolution?.status ?? "unknown";
      } catch {
        // Preserve the row for review without pretending its embedded evidence parsed.
      }
      return {
        "child id": record["child id"],
        "account id": record["account id"],
        "child status": record["child status"],
        "classroom id": record["classroom id"],
        "classroom": record["classroom"],
        "account resolution": resolutionStatus,
        "guardian relationships": String(counts.guardians),
        "emergency contacts": String(counts.emergencyContacts),
        "authorized pickups": String(counts.authorizedPickups),
        "import warning": record["import warning"],
      };
    });

  const classroomCounts = new Map<string, { classroomId: string; classroom: string; counts: Record<string, number> }>();
  for (const record of normalizedRecords.filter((candidate) => candidate["child id"])) {
    const classroomId = record["classroom id"] || "(missing)";
    const classroom = record["classroom"] || "(missing)";
    const key = `${classroomId}\u0000${classroom}`;
    const current = classroomCounts.get(key) ?? { classroomId, classroom, counts: {} };
    const status = statusOf(record) || "blank";
    current.counts[status] = (current.counts[status] ?? 0) + 1;
    classroomCounts.set(key, current);
  }
  const classroomReview = [...classroomCounts.values()].map((item) => ({
    "classroom id": item.classroomId,
    classroom: item.classroom,
    enrolled: String(item.counts.enrolled ?? 0),
    "pre-registered": String(item.counts["pre-registered"] ?? 0),
    "waiting list": String(item.counts["waiting list"] ?? 0),
    withdrawn: String(item.counts.withdrawn ?? 0),
    total: String(Object.values(item.counts).reduce((sum, count) => sum + count, 0)),
    status: /^(\(missing\)|unknown)$/i.test(item.classroomId) || /^(\(missing\)|unknown)$/i.test(item.classroom)
      ? "review_required"
      : "mapped",
  })).sort((left, right) => left.classroom.localeCompare(right.classroom));

  const enrolledChildrenByAccount = new Map<string, number>();
  for (const record of enrolledRecords) {
    const accountId = record["account id"];
    if (!accountId) continue;
    enrolledChildrenByAccount.set(accountId, (enrolledChildrenByAccount.get(accountId) ?? 0) + 1);
  }
  const currentBalanceRows: CsvRow[] = [];
  const historicalBalanceRows: CsvRow[] = [];
  let currentBalanceTotalCents = 0;
  let invalidBalanceRows = 0;
  for (const sourceRow of balance!.rows) {
    const accountId = field(sourceRow, "Account ID");
    const balanceCents = parseMoneyCents(field(sourceRow, "Balance"));
    if (balanceCents === null) invalidBalanceRows += 1;
    const enrolledChildren = enrolledChildrenByAccount.get(accountId) ?? 0;
    const reviewRow = {
      ...sourceRow,
      "BEE Current Enrolled Children": String(enrolledChildren),
      "BEE Balance Cents": balanceCents === null ? "" : String(balanceCents),
      "BEE Scope": enrolledChildren ? "current_family" : "historical_or_unmatched",
    };
    if (enrolledChildren) {
      currentBalanceRows.push(reviewRow);
      if (balanceCents !== null) currentBalanceTotalCents += balanceCents;
    } else historicalBalanceRows.push(reviewRow);
  }

  const ledgerCandidates = recurringWeeklyLedgerCandidates(ledger?.rows ?? []);
  const enrolledChildrenPerAccount = new Map<string, number>();
  for (const record of enrolledRecords) {
    const accountId = record["account id"];
    if (!accountId) continue;
    enrolledChildrenPerAccount.set(accountId, (enrolledChildrenPerAccount.get(accountId) ?? 0) + 1);
  }
  const weeklyTuitionReview = enrolledRecords.map((record) => {
    const accountId = record["account id"];
    const evidence = ledgerCandidates.get(accountId);
    const candidates = evidence?.candidates ?? [];
    const singleChildAccount = (enrolledChildrenPerAccount.get(accountId) ?? 0) === 1;
    const candidate = candidates.length === 1 && singleChildAccount ? candidates[0] : null;
    let status = tuition
      ? "source_requires_review"
      : ledger
        ? "blocked_incomplete_statement_history_and_missing_contract_source"
        : "blocked_missing_contract_or_tuition_rate_source";
    let evidenceNote = tuition
      ? "A formal tuition source is present and requires child-level review."
      : ledger
        ? "The supplied ledger does not contain three recurring weekly tuition charge rows for this child/account."
        : "No formal tuition source or statement ledger was supplied.";
    if (!tuition && candidates.length === 1 && !singleChildAccount) {
      status = "blocked_account_total_cannot_be_allocated_across_children";
      evidenceNote = "Recurring weekly statement history exists at the account level, but the account has multiple enrolled children and the source does not allocate the amount by Child ID.";
    } else if (!tuition && candidates.length > 1) {
      status = "blocked_conflicting_recurring_statement_rates";
      evidenceNote = "More than one recurring weekly tuition amount appears in statement history; a child contract or billing schedule is required.";
    } else if (!tuition && candidate) {
      status = "candidate_from_recurring_statement_history_requires_approval";
      evidenceNote = "One positive tuition charge amount repeated at 5-9 day intervals at least three times for a single-child account. The effective week still requires confirmation.";
    }
    return {
      "child id": record["child id"],
      "account id": accountId,
      "classroom id": record["classroom id"],
      classroom: record["classroom"],
      "weekly tuition cents": candidate ? String(candidate.amountCents) : "",
      "observed first post date": candidate?.dates[0] ?? "",
      "observed last post date": candidate?.dates.at(-1) ?? "",
      "effective week": "",
      cadence: candidate ? "weekly_candidate" : "",
      "statement ledger rows": String(evidence?.ledgerRows ?? 0),
      "tuition charge evidence rows": String(evidence?.tuitionChargeRows ?? 0),
      "rate evidence": evidenceNote,
      status,
    };
  });

  type GuardianAuditPerson = { personId: string; email: string; phone: string; source: string; childId: string };
  const guardianPeopleByAccount = new Map<string, GuardianAuditPerson[]>();
  const guardianAccountsByPerson = new Map<string, Set<string>>();
  const activeRecordsByAccount = new Map<string, CsvRow[]>();
  for (const record of enrolledRecords) {
    const accountId = record["account id"];
    if (!accountId) continue;
    activeRecordsByAccount.set(accountId, [...(activeRecordsByAccount.get(accountId) ?? []), record]);
    const people: GuardianAuditPerson[] = [];
    try {
      const accountPeople = JSON.parse(record["procare account person records"] || "[]") as CsvRow[];
      for (const payer of accountPeople.filter((person) => /^payer$/i.test(field(person, "Person Type")))) {
        people.push({
          personId: field(payer, "Person ID"),
          email: field(payer, "Email").toLowerCase(),
          phone: normalizedPhone(field(payer, "Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5")),
          source: "billing_payer",
          childId: record["child id"],
        });
      }
    } catch {
      // The record stays blocked by its source warnings; do not create inferred people.
    }
    try {
      const relationshipPeople = JSON.parse(record["procare relationship records"] || "[]") as Array<Record<string, unknown>>;
      for (const guardian of relationshipPeople.filter((person) => Boolean(person.guardian))) {
        people.push({
          personId: clean(guardian.personId) || clean(guardian.externalId),
          email: clean(guardian.email).toLowerCase(),
          phone: normalizedPhone(clean(guardian.phone)),
          source: "child_guardian_relationship",
          childId: record["child id"],
        });
      }
    } catch {
      // The record stays blocked by its source warnings; do not create inferred people.
    }
    const uniquePeople = people.filter((person, index) => person.personId && people.findIndex((candidate) => (
      candidate.personId === person.personId
      && candidate.source === person.source
      && candidate.childId === person.childId
    )) === index);
    guardianPeopleByAccount.set(accountId, [...(guardianPeopleByAccount.get(accountId) ?? []), ...uniquePeople]);
    for (const person of uniquePeople) {
      const accounts = guardianAccountsByPerson.get(person.personId) ?? new Set<string>();
      accounts.add(accountId);
      guardianAccountsByPerson.set(person.personId, accounts);
    }
  }

  const guardianDedupReview: CsvRow[] = [];
  const parentPortalBillingReview: CsvRow[] = [];
  for (const [accountId, records] of activeRecordsByAccount) {
    const people = guardianPeopleByAccount.get(accountId) ?? [];
    const relationshipPeople = people.filter((person) => person.source === "child_guardian_relationship");
    const payerPeople = people.filter((person) => person.source === "billing_payer");
    const relationshipGuardianIds = [...new Set(relationshipPeople.map((person) => person.personId))];
    const payerIds = [...new Set(payerPeople.map((person) => person.personId))];
    const portalReadyGuardianIds = [...new Set(relationshipPeople
      .filter((person) => person.email && person.phone)
      .map((person) => person.personId))];
    const crossAccountGuardianIds = [...new Set(people
      .filter((person) => (guardianAccountsByPerson.get(person.personId)?.size ?? 0) > 1)
      .map((person) => person.personId))];
    const collisionKeys = new Set<string>();
    for (const contactType of ["email", "phone"] as const) {
      const grouped = new Map<string, Set<string>>();
      for (const person of people) {
        const contact = person[contactType];
        if (!contact) continue;
        const ids = grouped.get(contact) ?? new Set<string>();
        ids.add(person.personId);
        grouped.set(contact, ids);
      }
      for (const ids of grouped.values()) {
        if (ids.size < 2) continue;
        const personIds = [...ids].sort();
        const key = `${contactType}:${personIds.join("|")}`;
        if (collisionKeys.has(key)) continue;
        collisionKeys.add(key);
        guardianDedupReview.push({
          "account id": accountId,
          "child ids": [...new Set(records.map((record) => record["child id"]))].sort().join(" | "),
          "collision field": contactType,
          "person ids": personIds.join(" | "),
          "source roles": [...new Set(people.filter((person) => ids.has(person.personId)).map((person) => person.source))].sort().join(" | "),
          status: "review_required_do_not_auto_deduplicate",
          reason: `Different stable ProCare Person IDs share the same ${contactType}; the importer could merge them by fallback contact matching, but the source does not prove they are the same person.`,
        });
      }
    }
    const balanceRows = balance!.rows.filter((row) => field(row, "Account ID") === accountId);
    const rowWarnings = records.filter((record) => record["import warning"]).map((record) => record["child id"]);
    const issues = [
      rowWarnings.length ? `unresolved child rows: ${rowWarnings.join(" | ")}` : "",
      relationshipGuardianIds.length ? "" : "no guardian relationship Person ID",
      portalReadyGuardianIds.length ? "" : "no relationship-backed guardian has both email and phone",
      balanceRows.length === 1 ? "" : `expected one balance row, found ${balanceRows.length}`,
      crossAccountGuardianIds.length ? `guardian/payer Person IDs cross active accounts: ${crossAccountGuardianIds.join(" | ")}` : "",
      collisionKeys.size ? `${collisionKeys.size} unresolved same-account guardian contact collision(s)` : "",
    ].filter(Boolean);
    parentPortalBillingReview.push({
      "account id": accountId,
      "child ids": [...new Set(records.map((record) => record["child id"]))].sort().join(" | "),
      "billing payer person ids": payerIds.sort().join(" | "),
      "relationship guardian person ids": relationshipGuardianIds.sort().join(" | "),
      "portal-ready guardian person ids": portalReadyGuardianIds.sort().join(" | "),
      "cross-account guardian person ids": crossAccountGuardianIds.sort().join(" | "),
      "balance source rows": String(balanceRows.length),
      "balance cents": balanceRows.length === 1 ? String(parseMoneyCents(field(balanceRows[0], "Balance")) ?? "") : "",
      "dedup contact collisions": String(collisionKeys.size),
      status: issues.length ? "blocked" : "ready_for_guarded_import_review",
      issues: issues.join("; "),
    });
  }
  for (const record of enrolledRecords.filter((candidate) => !candidate["account id"])) {
    parentPortalBillingReview.push({
      "account id": "",
      "child ids": record["child id"],
      "billing payer person ids": "",
      "relationship guardian person ids": "",
      "portal-ready guardian person ids": "",
      "cross-account guardian person ids": "",
      "balance source rows": "0",
      "balance cents": "",
      "dedup contact collisions": "0",
      status: "blocked",
      issues: "child account relationship is unresolved",
    });
  }

  const staffRowsByEmployee = new Map<string, Array<{ source: string; row: CsvRow }>>();
  for (const source of employeeSources) {
    for (const row of source.rows) {
      const employeeId = field(row, "Employee ID");
      if (!employeeId) continue;
      staffRowsByEmployee.set(employeeId, [...(staffRowsByEmployee.get(employeeId) ?? []), { source: source.filename, row }]);
    }
  }
  const staffReview = [...staffRowsByEmployee].flatMap(([employeeId, entries]) => {
    const preferredEntries = [
      ...entries.filter((entry) => entry.source === staffSource?.filename),
      ...entries.filter((entry) => entry.source !== staffSource?.filename),
    ];
    const first = (...names: string[]) => preferredEntries.map((entry) => field(entry.row, ...names)).find(Boolean) ?? "";
    const statuses = [...new Set(entries.map((entry) => field(entry.row, "Employment Status")).filter(Boolean))];
    const hidden = entries.some((entry) => checked(field(entry.row, "Is Hidden")));
    if (!statuses.some((status) => /^currently employed$/i.test(status)) || hidden) return [];
    const workAreas = [...new Set(entries.map((entry) => field(entry.row, "Primary Work Area", "Work Area Name")).filter(Boolean))];
    const workAreaIds = [...new Set(entries.map((entry) => field(entry.row, "Work Area ID")).filter(Boolean))];
    const email = first("Email");
    const phone = first("Phone 1", "Phone 2", "Phone 3");
    return [{
      "employee id": employeeId,
      "person id": first("Person ID"),
      "full name": first("Full Name"),
      "work area": workAreas[0] ?? "",
      "work area id": workAreaIds[0] ?? "",
      "employment status": statuses.join(" | "),
      email,
      phone,
      "source reports": [...new Set(entries.map((entry) => entry.source))].join(" | "),
      "cross-reference warning": [
        statuses.length > 1 ? "conflicting employment statuses" : "",
        workAreas.length > 1 ? "conflicting work areas" : "",
        workAreaIds.length > 1 ? "conflicting work area ids" : "",
        !email ? "missing email" : "",
        !phone ? "missing phone" : "",
        !workAreaIds.length ? "missing work area id" : "",
        workAreas.some((area) => /^unknown$/i.test(area)) ? "unknown work area" : "",
      ].filter(Boolean).join("; "),
      status: "held_staff_identity_and_access_not_authorized",
    }];
  });

  const currentBalanceValues = currentBalanceRows.map((row) => Number(row["BEE Balance Cents"])).filter(Number.isFinite);
  const currentBalanceNonzeroAccounts = currentBalanceValues.filter((value) => value !== 0).length;
  const currentBalanceDebitAccounts = currentBalanceValues.filter((value) => value > 0).length;
  const currentBalanceCreditAccounts = currentBalanceValues.filter((value) => value < 0).length;
  const currentHiddenBalanceAccounts = currentBalanceRows.filter((row) => checked(field(row, "Is Hidden"))).length;
  const staffMissingEmail = staffReview.filter((row) => !row.email).length;
  const staffMissingPhone = staffReview.filter((row) => !row.phone).length;
  const staffMissingWorkAreaId = staffReview.filter((row) => !row["work area id"]).length;
  const staffUnknownWorkArea = staffReview.filter((row) => /^unknown$/i.test(row["work area"])).length;

  const activeUnknownClassrooms = classroomReview.filter((row) => row.status !== "mapped" && Number(row.enrolled) > 0).length;
  const activeRelationshipWarnings = enrolledRecords.filter((record) => Boolean(record["import warning"])).length;
  const activeNoGuardian = relationshipReview.filter((row) => row["child status"].toLowerCase() === "enrolled" && Number(row["guardian relationships"]) === 0).length;
  const activeAccountsMissingBalance = [...enrolledChildrenByAccount.keys()].filter((accountId) => !balance!.rows.some((row) => field(row, "Account ID") === accountId)).length;
  const weeklyStatementCandidateChildren = weeklyTuitionReview.filter((row) => row.status === "candidate_from_recurring_statement_history_requires_approval").length;
  const weeklyStatementEvidenceRows = (ledger?.rows ?? []).filter(isTuitionChargeLedgerRow).length;
  const enrolledRenderedNameCounts = new Map<string, number>();
  for (const record of enrolledRecords) {
    const key = renderedChildNameKey(record["child name"] ?? "");
    if (key) enrolledRenderedNameCounts.set(key, (enrolledRenderedNameCounts.get(key) ?? 0) + 1);
  }
  const renderedBillingChildNames = new Set(renderedBillingReview
    .filter((row) => Number(row["confirmed tuition cents"]) > 0 && /^weekly$/i.test(row["confirmed cadence"] ?? ""))
    .map((row) => renderedChildNameKey(row["source child name"] ?? ""))
    .filter(Boolean));
  const renderedBillingCoveredChildren = enrolledRecords.filter((record) => {
    const key = renderedChildNameKey(record["child name"] ?? "");
    return Boolean(key) && enrolledRenderedNameCounts.get(key) === 1 && renderedBillingChildNames.has(key);
  }).length;
  const renderedBillingCoverageComplete = Boolean(renderedContractBilling)
    && renderedBillingReview.length > 0
    && renderedBillingCoveredChildren === enrolledRecords.length;
  const parentPortalBlockedFamilies = parentPortalBillingReview.filter((row) => row.status === "blocked").length;
  const parentPortalReadyFamilies = parentPortalBillingReview.length - parentPortalBlockedFamilies;
  const activePortalSafeAccountIds = new Set(parentPortalBillingReview
    .filter((row) => row.status === "ready_for_guarded_import_review")
    .map((row) => row["account id"])
    .filter(Boolean));
  const activePortalSafeRecords = enrolledRecords.filter((record) => (
    activePortalSafeAccountIds.has(record["account id"])
    && !record["import warning"]
  ));
  const activePortalSafeBalanceRows = currentBalanceRows.filter((row) => (
    activePortalSafeAccountIds.has(field(row, "Account ID"))
  ));
  const activePortalSafeBalanceTotalCents = activePortalSafeBalanceRows
    .reduce((sum, row) => sum + (Number(row["BEE Balance Cents"]) || 0), 0);
  const crossAccountGuardianPersonIds = [...guardianAccountsByPerson]
    .filter(([, accounts]) => accounts.size > 1)
    .map(([personId]) => personId);
  const gates: Record<string, Gate> = {
    "Roster and relationships": {
      status: activeRelationshipWarnings || activeNoGuardian ? "blocked" : parentInfoMode === "canonical" ? "ready" : "review_required",
      summary: `${enrolledReadyRecords.length}/${enrolledRecords.length} enrolled child rows are importer-ready; ${resolutionRecords.length} total rows require resolution.`,
      details: [
        `${normalizedRecords.length} normalized roster/family records were produced from stable ProCare identifiers.`,
        `${uniqueExplicitChildMembershipResolutions} cross-account rows were resolved only because the Child Person ID was explicitly present in exactly one candidate account.`,
        `${uniqueLivesWithPayerResolutions} cross-account rows were resolved only because exactly one candidate payer was a guardian explicitly marked Lives With; non-household contacts were excluded.`,
        `${exactGuardianAliasResolutions} payer/relationship aliases were canonicalized only within the same account when normalized names and at least one contact matched exactly with no conflicting populated email or phone; original source Person IDs remain retained in the relationship evidence.`,
        `${activeRelationshipWarnings} enrolled child rows have importer warnings; ${activeNoGuardian} enrolled children have no guardian-like relationship row.`,
        parentInfoMode === "canonical"
          ? `Used canonical account-person source ${parentInfoFilename}.`
          : `Derived ${derivedParentInfoRows} primary-payer rows from Account ID and Person ID evidence in ${balance!.filename}; ${derivedMultiAccountPeople} person identifiers occur in multiple accounts and remain warning-bearing rather than being guessed.`,
      ],
    },
    "Parent portal and billing links": {
      status: parentPortalBlockedFamilies ? "blocked" : "ready",
      summary: `${parentPortalReadyFamilies}/${parentPortalBillingReview.length} enrolled family accounts have a relationship-backed portal guardian, one balance row, and no unresolved identity collision.`,
      details: [
        `${exactGuardianAliasResolutions} same-account payer/relationship aliases were canonicalized using an exact normalized name plus at least one exact contact and no conflicting populated contact, while retaining the original source IDs.`,
        `${guardianDedupReview.length} remaining same-account contact collisions use different stable Person IDs and were held for review rather than deduplicated.`,
        `${crossAccountGuardianPersonIds.length} guardian/payer Person IDs occur across more than one active family account (${crossAccountGuardianPersonIds.join(" | ") || "none"}). A single parent portal user cannot safely span multiple Family rows in the current family-scope guard.`,
        "Portal readiness requires at least one relationship-backed guardian with both email and phone; payer-only contacts are retained for billing review but are not assumed to be parents.",
        "No invitations, Auth users, guardian user links, PINs, billing accounts, balances, invoices, or payments are created by this preparation workflow.",
      ],
    },
    Classrooms: {
      status: activeUnknownClassrooms || !classroomSettings ? "blocked" : "review_required",
      summary: `${classroomReview.filter((row) => Number(row.enrolled) > 0).length} classroom mappings cover enrolled children; ${activeUnknownClassrooms} active mappings require review; ${classroomSettings ? "capacity/ratio source detected" : "capacity/ratio source missing"}.`,
      details: [
        "Classrooms are keyed by ProCare Classroom ID and name; no capacity or ratio is inferred from roster counts.",
        `${activeUnknownClassrooms} active classroom ID/name combinations are missing or Unknown.`,
        classroomSettings
          ? `Detected ${classroomSettings.filename}; capacities and ratios still require director review before classroom setup.`
          : renderedClassroomSchedule
            ? `Detected ${renderedClassroomSchedule.filename} with ${renderedScheduleReview.length} editable child schedule rows. It proves classroom names and schedules, but not stable Classroom IDs, licensed capacity, age group, or ratio rule.`
            : "Required source: a classroom/work-area setup report or director-confirmed table with Classroom ID, name, licensed capacity, age group, and ratio rule.",
      ],
    },
    "Current-family balances": {
      status: invalidBalanceRows || activeAccountsMissingBalance || activeRelationshipWarnings ? "blocked" : "review_required",
      summary: `${currentBalanceRows.length} current-family accounts total ${currentBalanceTotalCents} cents in the source balance report.`,
      details: [
        `${historicalBalanceRows.length} historical or unmatched accounts were separated from the current-family balance review.`,
        `${currentBalanceNonzeroAccounts} current-family accounts have nonzero balances (${currentBalanceDebitAccounts} debit and ${currentBalanceCreditAccounts} credit); ${currentHiddenBalanceAccounts} current-family source accounts are hidden.`,
        `${activeAccountsMissingBalance} resolved current-family accounts are missing from the balance report; ${invalidBalanceRows} source balance rows are invalid.`,
        "This workflow does not alter BillingAccount, invoices, payments, ledger entries, or active-dashboard visibility.",
      ],
    },
    "Weekly tuition": {
      status: tuition || renderedBillingCoverageComplete || weeklyStatementCandidateChildren === enrolledRecords.length ? "review_required" : "blocked",
      summary: tuition
        ? `Detected ${tuition.filename}; rates still require child-level review and an explicit effective week.`
        : renderedContractBilling
          ? `Detected ${renderedContractBilling.filename} with ${renderedBillingReview.length} editable charge rows covering ${renderedBillingCoveredChildren}/${enrolledRecords.length} enrolled children by unique reviewed name evidence; stable Child IDs and effective dates still require confirmation.`
          : `${weeklyStatementCandidateChildren}/${enrolledRecords.length} enrolled children have a defensible recurring weekly statement-rate candidate; ${ledger?.rows.length ?? 0} ledger rows were supplied.`,
      details: [
        tuition
          ? "The detected tuition source must provide Child ID, amount, cadence, and effective-date evidence before a rate manifest can be approved."
          : renderedContractBilling
            ? `The rendered contract report preserves child name, classroom, charge description, amount, and cadence, but contains no stable Child ID. Reviewers must bind each accepted row to one source-backed Child ID or hold it; ${enrolledRecords.length - renderedBillingCoveredChildren} enrolled child row(s) still lack unique rendered name coverage.`
            : "A statement-derived candidate requires the same positive tuition amount at least three times at 5-9 day intervals, and can be assigned only when the account has exactly one enrolled child. Payments, credits, late fees, payroll rates, and point-in-time balances are excluded.",
        `${weeklyStatementEvidenceRows} supplied ledger rows qualify as positive tuition charges; ${weeklyStatementCandidateChildren} child-level weekly candidates were produced.`,
        "If statement evidence is incomplete or account-level amounts cover multiple children, provide a ProCare child contract/billing schedule export containing Child ID, charge description, amount, frequency/cadence, and effective dates.",
        "Employee ST Rate and OT Rate fields are payroll rates and are never treated as child tuition.",
        "No tuition plan, assignment, invoice, charge, payment, or refund is created by this workflow.",
      ],
    },
    "Child information": {
      status: childInfo ? "ready" : "blocked",
      summary: childInfo ? `Detected ${childInfo.filename}.` : "No child-information report was supplied; the roster package uses an explicit empty placeholder.",
      details: [
        childInfo
          ? "Allergy and other child-information rows remain source-backed."
          : "Required source: ProCare Child Information Tracking with Child ID, Category Description, Item Description, and Item Is Active.",
        "No allergy, medical, or child-detail value is invented from comments or names.",
      ],
    },
    Staff: {
      status: "held",
      summary: `${staffReview.length} currently employed visible staff rows are available for review only.`,
      details: [
        staffSource ? `Selected ${staffSource.filename} as the strongest employee roster source.` : "No employee roster source was detected.",
        `${staffMissingEmail} rows lack email, ${staffMissingPhone} lack phone, ${staffMissingWorkAreaId} lack Work Area ID, and ${staffUnknownWorkArea} are assigned to Unknown.`,
        "Staff profile creation, users, Auth identities, access grants, invitations, and classroom assignments remain held.",
      ],
    },
  };

  const metrics = {
    normalizedRecords: normalizedRecords.length,
    readyRecords: readyRecords.length,
    needsResolutionRecords: resolutionRecords.length,
    enrolledRecords: enrolledRecords.length,
    enrolledReadyRecords: enrolledReadyRecords.length,
    warningCodes: warningCodes(resolutionRecords),
    uniqueExplicitChildMembershipResolutions,
    uniqueLivesWithPayerResolutions,
    exactGuardianAliasResolutions,
    parentInfoMode,
    derivedMultiAccountPeople,
    sourceChildInfoPresent: Boolean(childInfo),
    sourceWeeklyTuitionPresent: Boolean(tuition),
    renderedContractBillingRows: renderedBillingReview.length,
    renderedBillingCoveredChildren,
    renderedClassroomScheduleRows: renderedScheduleReview.length,
    sourceLedgerPresent: Boolean(ledger),
    sourceLedgerRows: ledger?.rows.length ?? 0,
    weeklyStatementEvidenceRows,
    weeklyStatementCandidateChildren,
    parentPortalFamilyAccounts: parentPortalBillingReview.length,
    parentPortalReadyFamilies,
    parentPortalBlockedFamilies,
    activePortalSafeRecords: activePortalSafeRecords.length,
    activePortalSafeAccounts: activePortalSafeAccountIds.size,
    activePortalSafeBalanceAccounts: activePortalSafeBalanceRows.length,
    activePortalSafeBalanceTotalCents,
    guardianDedupReviewRows: guardianDedupReview.length,
    crossAccountGuardianPersonIds,
    sourceClassroomSettingsPresent: Boolean(classroomSettings),
    currentFamilyBalanceAccounts: currentBalanceRows.length,
    currentFamilyBalanceTotalCents: currentBalanceTotalCents,
    currentBalanceNonzeroAccounts,
    currentBalanceDebitAccounts,
    currentBalanceCreditAccounts,
    currentHiddenBalanceAccounts,
    historicalOrUnmatchedBalanceAccounts: historicalBalanceRows.length,
    activeAccountsMissingBalance,
    activeUnknownClassrooms,
    activeNoGuardian,
    staffReviewRows: staffReview.length,
    staffMissingEmail,
    staffMissingPhone,
    staffMissingWorkAreaId,
    staffUnknownWorkArea,
  };

  fs.mkdirSync(outputDirectory, { recursive: true });
  const reviewedCsv = `${preparedProcareCsv(normalizedRecords)}\r\n`;
  const readyCsv = `${preparedProcareCsv(readyRecords)}\r\n`;
  const resolutionCsv = resolutionRecords.length ? `${preparedProcareCsv(resolutionRecords)}\r\n` : "";
  const activePortalSafeCsv = `${preparedProcareCsv(activePortalSafeRecords)}\r\n`;
  fs.writeFileSync(path.join(outputDirectory, "01-roster-reviewed-import.csv"), reviewedCsv, "utf8");
  fs.writeFileSync(path.join(outputDirectory, "02-roster-ready-reference.csv"), readyCsv, "utf8");
  fs.writeFileSync(path.join(outputDirectory, "03-roster-needs-resolution.csv"), resolutionCsv, "utf8");
  writeCsv(path.join(outputDirectory, "04-family-relationship-review.csv"), relationshipReview);
  writeCsv(path.join(outputDirectory, "05-classroom-review.csv"), classroomReview);
  writeCsv(path.join(outputDirectory, "06-current-family-balance-review.csv"), currentBalanceRows);
  writeCsv(path.join(outputDirectory, "07-historical-or-unmatched-balance-review.csv"), historicalBalanceRows);
  writeCsv(path.join(outputDirectory, "08-weekly-tuition-review.csv"), weeklyTuitionReview);
  writeCsv(path.join(outputDirectory, "09-staff-review-held.csv"), staffReview);
  if (parentInfoMode === "derived_primary_payer") fs.writeFileSync(path.join(outputDirectory, "10-derived-primary-payer-source.csv"), parentInfoBuffer);
  writeCsv(path.join(outputDirectory, "11-parent-portal-billing-link-review.csv"), parentPortalBillingReview);
  writeCsv(path.join(outputDirectory, "12-guardian-dedup-review.csv"), guardianDedupReview, [
    "account id",
    "child ids",
    "collision field",
    "person ids",
    "source roles",
    "status",
    "reason",
  ]);
  fs.writeFileSync(path.join(outputDirectory, "13-active-portal-safe-import.csv"), activePortalSafeCsv, "utf8");
  writeCsv(path.join(outputDirectory, "14-active-portal-safe-balance-review.csv"), activePortalSafeBalanceRows);
  writeCsv(path.join(outputDirectory, "15-rendered-contract-billing-review.csv"), renderedBillingReview);
  writeCsv(path.join(outputDirectory, "16-rendered-classroom-schedule-review.csv"), renderedScheduleReview);

  const manifest = {
    version: 3,
    location: input.location,
    generatedAt,
    preparationOnly: true,
    sourceDirectory,
    outputDirectory,
    sourceFiles: sourceSummary(sources),
    selectedSources: {
      enrollment: enrollment!.filename,
      relationships: relationships!.filename,
      parentInfo: parentInfoFilename,
      parentInfoMode,
      childInfo: childInfo?.filename ?? EMPTY_CHILD_INFO_FILENAME,
      balance: balance!.filename,
      ledger: ledger?.filename ?? null,
      tuition: tuition?.filename ?? null,
      renderedContractBilling: renderedContractBilling?.filename ?? null,
      renderedClassroomSchedule: renderedClassroomSchedule?.filename ?? null,
      classroomSettings: classroomSettings?.filename ?? null,
      staff: staffSource?.filename ?? null,
    },
    metrics,
    gates,
    outputHashes: {
      reviewedRosterSha256: sha256(reviewedCsv),
      readyReferenceSha256: sha256(readyCsv),
      needsResolutionSha256: sha256(resolutionCsv),
      activePortalSafeImportSha256: sha256(activePortalSafeCsv),
    },
  };
  fs.writeFileSync(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDirectory, "READINESS.md"), markdownReport({
    location: input.location,
    generatedAt,
    gates,
    metrics,
    sourceFiles: sourceSummary(sources),
  }), "utf8");

  return { outputDirectory, metrics, gates, selectedSources: manifest.selectedSources };
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? clean(process.argv[index + 1]) : "";
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedScriptUrl === import.meta.url) {
  const location = option("--location");
  const sourceDirectory = option("--source-dir");
  const outputDirectory = option("--output-dir");
  if (!location || !sourceDirectory || !outputDirectory) {
    throw new Error("Usage: node --import tsx scripts/prepare-procare-location-workflow.ts --location <name> --source-dir <folder> --output-dir <folder>");
  }
  void prepareProcareLocationWorkflow({ location, sourceDirectory, outputDirectory })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
