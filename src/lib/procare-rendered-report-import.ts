import { createHash } from "node:crypto";

type Row = string[];
type RecordRow = Record<string, string>;
type InventoryItem = {
  sourceName: string;
  reportKind: "rendered_account_information" | "rendered_registration" | "rendered_enrollment_status" | "rendered_balance" | "evidence_only" | "ignored";
  rows: number;
  matchedHeaderAliases: number;
  note?: string;
};
type AccountChild = {
  accountId: string; accountName: string; payerName: string; payerAddress: string; payerContact: string;
  childName: string; childDob: string; classroom: string; status: string;
};
type Registration = {
  childName: string; childDob: string; gender: string; classroom: string; status: string; address: string;
  relationships: Array<{ name: string; relation: string; address: string; flags: string; contact: string }>;
};

const SIGNATURES = {
  account: /FD_AccountInformation\d+\.rpt|Account Information Sheet/i,
  registration: /Child Registration Information/i,
  enrollment: /FD_ChildEnrollment05\.rpt|Child Enrollment Status List/i,
  classroom: /FD_ChildEnrollment01\.rpt|Enrolled Children by Classroom/i,
  balance: /FA_AccountBalanceSummary\d+\.rpt|Account Balance Summary/i,
  payments: /TE_PaymentByType\d+\.rpt|Tuition Express Payments by Type/i,
};

function parseCsv(text: string) {
  const rows: Row[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\r" || char === "\n") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("The rendered ProCare CSV contains an unterminated quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function decode(buffer: Buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { return new TextDecoder("windows-1252").decode(buffer); }
}
function cell(row: Row, column: number) { return (row[column - 1] ?? "").trim(); }
function accountKey(input: string) { return input.match(/\[\*?([A-Z0-9_-]+)\]/i)?.[1]?.toUpperCase() ?? ""; }
function normalizedName(input: string) { return input.trim().replace(/\s+/g, " ").toLowerCase(); }
function displayName(input: string) {
  const clean = input.trim().replace(/\s+/g, " ");
  const [last, ...first] = clean.split(",").map((part) => part.trim());
  return first.length ? `${first.join(" ")} ${last}`.trim() : clean;
}
function dateIn(input: string) { return input.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/)?.[1] ?? ""; }
function genderIn(input: string) { return input.match(/^(male|female|nonbinary|non-binary)\b/i)?.[1] ?? ""; }
function emailIn(input: string) { return input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? ""; }
function phoneIn(input: string) {
  const line = input.split(/\r?\n/).find((part) => /(?:cell|home|work|phone)|\d{3}\D*\d{3}\D*\d{4}/i.test(part)) ?? "";
  const digits = line.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(0, 10) : "";
}
function stableId(...parts: string[]) {
  return createHash("sha256").update(parts.map((part) => part.trim().toLowerCase()).join("\0")).digest("hex").slice(0, 24);
}
function childKey(name: string, dob: string) { return `${normalizedName(name)}\0${dob}`; }

function accountChildren(rows: Row[]) {
  return rows.flatMap<AccountChild>((row) => {
    const accountId = accountKey(cell(row, 6));
    const childName = displayName(cell(row, 15));
    if (!accountId || !childName) return [];
    const payerName = displayName(cell(row, 9));
    return [{
      accountId,
      accountName: payerName ? `${payerName} Family` : `ProCare ${accountId}`,
      payerName,
      payerAddress: cell(row, 10),
      payerContact: cell(row, 11),
      childName,
      childDob: dateIn(cell(row, 18)),
      classroom: cell(row, 17),
      status: cell(row, 19),
    }];
  });
}

function registrations(rows: Row[]) {
  const result = new Map<string, Registration>();
  for (const row of rows) {
    const childName = displayName(cell(row, 5));
    const childDob = dateIn(cell(row, 6));
    if (!childName || !childDob) continue;
    const key = childKey(childName, childDob);
    const registration = result.get(key) ?? {
      childName, childDob, gender: genderIn(cell(row, 6)), classroom: cell(row, 8),
      status: cell(row, 11), address: cell(row, 9), relationships: [],
    };
    const name = displayName(cell(row, 15));
    if (name) {
      const relationship = { name, relation: cell(row, 16) || "Unknown", address: cell(row, 17), flags: cell(row, 18), contact: cell(row, 19) };
      const fingerprint = JSON.stringify(relationship);
      if (!registration.relationships.some((item) => JSON.stringify(item) === fingerprint)) registration.relationships.push(relationship);
    }
    result.set(key, registration);
  }
  return result;
}

function statuses(rows: Row[]) {
  const result = new Map<string, Array<{ status: string; startDate: string }>>();
  for (const row of rows) {
    const name = displayName(cell(row, 10));
    if (!name) continue;
    const key = normalizedName(name);
    result.set(key, [...(result.get(key) ?? []), { status: cell(row, 6), startDate: dateIn(cell(row, 11)) }]);
  }
  return result;
}

function balances(rows: Row[]) {
  const result = new Map<string, string>();
  for (const row of rows) {
    const id = accountKey(cell(row, 10));
    const balance = cell(row, 11).replace(/,/g, "");
    if (id && /^-?\d+(?:\.\d{1,2})?$/.test(balance)) result.set(id, balance);
  }
  return result;
}

export function buildRenderedProcareReportRowsFromFiles(entries: Map<string, Buffer>) {
  const inventory: InventoryItem[] = [];
  const children: AccountChild[] = [];
  const registrationByChild = new Map<string, Registration>();
  const statusesByName = new Map<string, Array<{ status: string; startDate: string }>>();
  const balanceByAccount = new Map<string, string>();
  let detected = false;

  for (const [sourceName, buffer] of entries) {
    if (/\.xls(?:x)?$/i.test(sourceName) || (buffer[0] === 0xd0 && buffer[1] === 0xcf)) {
      inventory.push({ sourceName, reportKind: "evidence_only", rows: 0, matchedHeaderAliases: 0, note: "Legacy Excel workbook listed for immunization reconciliation; export it from ProCare as a flat CSV before structured medical import." });
      continue;
    }
    let rows: Row[];
    try { rows = parseCsv(decode(buffer)); }
    catch (error) {
      inventory.push({ sourceName, reportKind: "ignored", rows: 0, matchedHeaderAliases: 0, note: error instanceof Error ? error.message : "Could not parse this report." });
      continue;
    }
    const signature = rows.slice(0, 3).flat().join(" ");
    if (SIGNATURES.account.test(signature)) {
      detected = true;
      const parsed = accountChildren(rows);
      children.push(...parsed);
      inventory.push({ sourceName, reportKind: "rendered_account_information", rows: parsed.length, matchedHeaderAliases: 7 });
    } else if (SIGNATURES.registration.test(signature)) {
      detected = true;
      for (const [key, registration] of registrations(rows)) registrationByChild.set(key, registration);
      inventory.push({ sourceName, reportKind: "rendered_registration", rows: rows.length, matchedHeaderAliases: 9 });
    } else if (SIGNATURES.enrollment.test(signature)) {
      detected = true;
      for (const [key, value] of statuses(rows)) statusesByName.set(key, value);
      inventory.push({ sourceName, reportKind: "rendered_enrollment_status", rows: rows.length, matchedHeaderAliases: 3 });
    } else if (SIGNATURES.balance.test(signature)) {
      detected = true;
      for (const [key, value] of balances(rows)) balanceByAccount.set(key, value);
      inventory.push({ sourceName, reportKind: "rendered_balance", rows: rows.length, matchedHeaderAliases: 2 });
    } else if (SIGNATURES.classroom.test(signature)) {
      detected = true;
      inventory.push({ sourceName, reportKind: "evidence_only", rows: rows.length, matchedHeaderAliases: 2, note: "Classroom head-count reconciliation only; child assignments come from the account and registration reports." });
    } else if (SIGNATURES.payments.test(signature)) {
      detected = true;
      inventory.push({ sourceName, reportKind: "evidence_only", rows: rows.length, matchedHeaderAliases: 5, note: "Historical payment reconciliation only; payment rows are not recreated as BEE Suite charges or Stripe payments." });
    } else {
      inventory.push({ sourceName, reportKind: "ignored", rows: rows.length, matchedHeaderAliases: 0, note: "This file is not a recognized rendered ProCare report." });
    }
  }
  if (!detected || !children.length) return null;

  const exact = new Map<string, AccountChild[]>();
  const byName = new Map<string, AccountChild[]>();
  for (const child of children) {
    exact.set(childKey(child.childName, child.childDob), [...(exact.get(childKey(child.childName, child.childDob)) ?? []), child]);
    byName.set(normalizedName(child.childName), [...(byName.get(normalizedName(child.childName)) ?? []), child]);
  }

  const usedBalances = new Set<string>();
  const records: RecordRow[] = [];
  for (const registration of registrationByChild.values()) {
    const exactMatches = exact.get(childKey(registration.childName, registration.childDob)) ?? [];
    const nameMatches = byName.get(normalizedName(registration.childName)) ?? [];
    const matches = exactMatches.length ? exactMatches : nameMatches;
    const match = matches.length === 1 ? matches[0] : null;
    if (!match) {
      records.push({
        "row type": "procare_rendered_registration_needs_resolution",
        "child name": registration.childName,
        "date of birth": registration.childDob,
        classroom: registration.classroom,
        "child status": registration.status,
        "import warning": matches.length ? "This child matches more than one ProCare account and needs an account decision." : "This child is missing from the account-information report and needs an account decision.",
      });
      continue;
    }
    const statusRows = statusesByName.get(normalizedName(registration.childName)) ?? [];
    const uniqueStatus = statusRows.length === 1 ? statusRows[0] : null;
    const relationships = registration.relationships.map((relationship) => ({
      externalId: `rendered-person-${stableId(match.accountId, relationship.name, relationship.contact)}`,
      name: relationship.name,
      relation: relationship.relation,
      phone: phoneIn(relationship.contact),
      email: emailIn(relationship.contact),
      address: relationship.address,
      livesWith: /lives with/i.test(relationship.flags),
      emergency: /emergency/i.test(relationship.flags),
      authorizedPickup: /pickup/i.test(relationship.flags),
      guardian: /lives with/i.test(relationship.flags) || /mom|dad|mother|father|parent|guardian/i.test(relationship.relation),
      sourceFields: { flags: relationship.flags, contact: relationship.contact },
    }));
    const guardian = relationships.find((relationship) => relationship.guardian) ?? relationships[0];
    const record: RecordRow = {
      "row type": "procare_rendered_report_child",
      "account id": match.accountId,
      "family name": match.accountName,
      "child id": `rendered-child-${stableId(match.accountId, registration.childName, registration.childDob)}`,
      "child name": registration.childName,
      "date of birth": registration.childDob,
      gender: registration.gender,
      classroom: registration.classroom || match.classroom,
      "child status": uniqueStatus?.status || registration.status || match.status,
      "start date": uniqueStatus?.startDate ?? "",
      address: registration.address || match.payerAddress,
      "guardian name": guardian?.name || match.payerName,
      "guardian email": guardian?.email || emailIn(match.payerContact),
      "guardian phone": guardian?.phone || phoneIn(match.payerContact),
      "procare relationship records": JSON.stringify(relationships),
      "procare rendered source match": exactMatches.length ? "name_and_dob" : "unique_name_fallback",
    };
    if (!exactMatches.length) {
      record["import warning"] = "This child matched an account by unique name because the account report did not provide the same DOB. Confirm the account before import.";
    }
    if (!usedBalances.has(match.accountId) && balanceByAccount.has(match.accountId)) {
      record.balance = balanceByAccount.get(match.accountId) ?? "";
      usedBalances.add(match.accountId);
    }
    records.push(record);
  }

  const importedKeys = new Set(records.map((record) => childKey(record["child name"] ?? "", record["date of birth"] ?? "")));
  for (const child of children) {
    if (importedKeys.has(childKey(child.childName, child.childDob))) continue;
    const record: RecordRow = {
      "row type": "procare_rendered_account_child",
      "account id": child.accountId,
      "family name": child.accountName,
      "child id": `rendered-child-${stableId(child.accountId, child.childName, child.childDob)}`,
      "child name": child.childName,
      "date of birth": child.childDob,
      classroom: child.classroom,
      "child status": child.status || "Enrolled",
      address: child.payerAddress,
      "guardian name": child.payerName,
      "guardian email": emailIn(child.payerContact),
      "guardian phone": phoneIn(child.payerContact),
      "import warning": child.childDob ? "Registration detail was not found for this account child; review guardian relationships before import." : "Registration detail and date of birth were not found for this account child.",
    };
    if (!usedBalances.has(child.accountId) && balanceByAccount.has(child.accountId)) {
      record.balance = balanceByAccount.get(child.accountId) ?? "";
      usedBalances.add(child.accountId);
    }
    records.push(record);
  }

  const coverage = {
    version: "rendered-procare-report-v1",
    sourceInventory: inventory,
    sourceRows: { accountChildren: children.length, registrations: registrationByChild.size, enrollmentStatusNames: statusesByName.size, balances: balanceByAccount.size },
    rawSourceRows: Object.fromEntries(inventory.map((item) => [item.sourceName, item.rows])),
    duplicateSourceRowsRemoved: {},
    normalizedRows: {
      total: records.length,
      ready: records.filter((record) => !record["import warning"]).length,
      needsResolution: records.filter((record) => Boolean(record["import warning"])).length,
    },
  };
  const manifest = JSON.stringify(coverage);
  return {
    records: records.map<RecordRow>((record) => ({ ...record, "procare dataset coverage manifest": manifest })),
    datasetCoverage: coverage,
  };
}
