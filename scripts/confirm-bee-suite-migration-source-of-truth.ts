import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsvBuffer } from "./prepare-procare-location-workflow";

type CsvRow = Record<string, string>;

type PreparationManifest = {
  version: number;
  location: string;
  sourceFiles: Array<{ filename: string; sha256: string }>;
  metrics: {
    enrolledRecords?: number;
    activePortalSafeRecords?: number;
    currentFamilyBalanceAccounts?: number;
  };
  outputHashes: {
    activePortalSafeImportSha256: string;
    migrationSourceOfTruthTemplateSha256: string;
  };
};

const TEMPLATE_FILENAME = "17-bee-suite-migration-source-of-truth.csv";
const SAFE_ROSTER_FILENAME = "13-active-portal-safe-import.csv";
const EDITABLE_COLUMNS = new Set([
  "Confirmed Account ID",
  "Confirmed Child ID",
  "Confirmed Opening Balance Cents",
  "Opening Balance Confirmation",
  "Confirmed Weekly Tuition Cents",
  "Confirmed Tuition Cadence",
  "Tuition Effective Week",
  "Tuition Confirmation",
  "Family Child Link Confirmation",
  "Disposition",
  "Review Notes",
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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

function integer(value: string, label: string) {
  invariant(/^-?\d+$/.test(clean(value)), `${label} must be an integer number of cents.`);
  const parsed = Number(value);
  invariant(Number.isSafeInteger(parsed), `${label} is outside the supported cents range.`);
  return parsed;
}

function confirmed(value: string) {
  return clean(value).toLowerCase() === "confirmed";
}

function sourceKey(row: CsvRow) {
  return `${clean(row["Source Account ID"])}\u0000${clean(row["Source Child ID"])}`;
}

function rosterKey(row: CsvRow) {
  return `${clean(row["account id"])}\u0000${clean(row["child id"])}`;
}

function compareSourceColumns(baseline: CsvRow, reviewed: CsvRow, rowNumber: number) {
  const columns = new Set([...Object.keys(baseline), ...Object.keys(reviewed)]);
  for (const column of columns) {
    if (EDITABLE_COLUMNS.has(column)) continue;
    invariant(
      clean(reviewed[column]) === clean(baseline[column]),
      `Reviewed template row ${rowNumber} changed source column ${column}. Correct the source export and regenerate the package instead.`,
    );
  }
}

export function confirmBeeSuiteMigrationSourceOfTruth(input: {
  packageDirectory: string;
  reviewedTemplatePath: string;
  outputDirectory?: string;
}) {
  const packageDirectory = path.resolve(input.packageDirectory);
  const reviewedTemplatePath = path.resolve(input.reviewedTemplatePath);
  const outputDirectory = path.resolve(input.outputDirectory ?? path.join(packageDirectory, "confirmed"));
  const manifestPath = path.join(packageDirectory, "manifest.json");
  const baselinePath = path.join(packageDirectory, TEMPLATE_FILENAME);
  const safeRosterPath = path.join(packageDirectory, SAFE_ROSTER_FILENAME);
  invariant(fs.existsSync(manifestPath), `Missing ${manifestPath}.`);
  invariant(fs.existsSync(baselinePath), `Missing ${baselinePath}.`);
  invariant(fs.existsSync(safeRosterPath), `Missing ${safeRosterPath}.`);
  invariant(fs.existsSync(reviewedTemplatePath), `Missing reviewed template ${reviewedTemplatePath}.`);
  invariant(reviewedTemplatePath !== baselinePath, "Keep the generated template unchanged and review a copy of it.");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PreparationManifest;
  invariant(manifest.version >= 4, "Regenerate this migration package with the current BEE Suite preparer.");
  const baselineBuffer = fs.readFileSync(baselinePath);
  const safeRosterBuffer = fs.readFileSync(safeRosterPath);
  const reviewedBuffer = fs.readFileSync(reviewedTemplatePath);
  invariant(
    sha256(baselineBuffer) === manifest.outputHashes.migrationSourceOfTruthTemplateSha256,
    "The generated BEE migration template changed after preparation. Regenerate the package.",
  );
  invariant(
    sha256(safeRosterBuffer) === manifest.outputHashes.activePortalSafeImportSha256,
    "The guarded roster changed after preparation. Regenerate the package.",
  );

  const baseline = parseCsvBuffer(baselineBuffer, TEMPLATE_FILENAME);
  const reviewed = parseCsvBuffer(reviewedBuffer, path.basename(reviewedTemplatePath));
  const safeRoster = parseCsvBuffer(safeRosterBuffer, SAFE_ROSTER_FILENAME);
  invariant(baseline.rows.length > 0, "The migration template contains no enrolled child rows.");
  invariant(reviewed.rows.length === baseline.rows.length, "The reviewed template must retain every generated child row exactly once.");
  invariant(safeRoster.rows.length === baseline.rows.length, "Not every enrolled child is in the portal-safe guarded roster. Resolve family, guardian, or balance blockers and regenerate.");
  invariant(manifest.metrics.enrolledRecords === baseline.rows.length, "The template child count no longer matches the preparation manifest.");
  invariant(manifest.metrics.activePortalSafeRecords === baseline.rows.length, "The preparation manifest still has blocked active family rows.");

  const baselineByKey = new Map<string, CsvRow>();
  for (const [index, row] of baseline.rows.entries()) {
    const key = sourceKey(row);
    invariant(clean(row["Source Account ID"]), `Generated template row ${index + 2} is missing Source Account ID.`);
    invariant(clean(row["Source Child ID"]), `Generated template row ${index + 2} is missing Source Child ID.`);
    invariant(!baselineByKey.has(key), `Generated template contains duplicate account/child key ${key.replace("\u0000", "/")}.`);
    baselineByKey.set(key, row);
  }

  const reviewedByKey = new Map<string, CsvRow>();
  const balanceByAccount = new Map<string, number>();
  const confirmedRows = reviewed.rows.map((row, index) => {
    const rowNumber = index + 2;
    const key = sourceKey(row);
    const baselineRow = baselineByKey.get(key);
    invariant(baselineRow, `Reviewed template row ${rowNumber} is not present in the generated package.`);
    invariant(!reviewedByKey.has(key), `Reviewed template duplicates account/child key ${key.replace("\u0000", "/")}.`);
    reviewedByKey.set(key, row);
    compareSourceColumns(baselineRow, row, rowNumber);
    invariant(clean(row["BEE Migration Template Version"]) === "1", `Reviewed template row ${rowNumber} has an unsupported template version.`);
    invariant(clean(row.Location) === manifest.location, `Reviewed template row ${rowNumber} is for a different location.`);
    invariant(clean(row["Confirmed Account ID"]) === clean(row["Source Account ID"]), `Reviewed template row ${rowNumber} does not confirm the source Account ID.`);
    invariant(clean(row["Confirmed Child ID"]) === clean(row["Source Child ID"]), `Reviewed template row ${rowNumber} does not confirm the source Child ID.`);
    invariant(confirmed(row["Family Child Link Confirmation"]), `Reviewed template row ${rowNumber} must confirm the family-child link.`);
    invariant(Number(clean(row["Guardian Relationship Count"])) > 0, `Reviewed template row ${rowNumber} has no relationship-backed guardian.`);

    const sourceBalanceCents = integer(row["Source Opening Balance Cents"], `Reviewed template row ${rowNumber} source opening balance`);
    const confirmedBalanceCents = integer(row["Confirmed Opening Balance Cents"], `Reviewed template row ${rowNumber} confirmed opening balance`);
    invariant(sourceBalanceCents === confirmedBalanceCents, `Reviewed template row ${rowNumber} opening balance does not match the source.`);
    invariant(confirmed(row["Opening Balance Confirmation"]), `Reviewed template row ${rowNumber} must confirm the opening balance.`);
    const previousBalance = balanceByAccount.get(row["Source Account ID"]);
    invariant(previousBalance === undefined || previousBalance === sourceBalanceCents, `Account ${row["Source Account ID"]} has conflicting opening balances across its children.`);
    balanceByAccount.set(row["Source Account ID"], sourceBalanceCents);

    const sourceTuitionCents = integer(row["Source Weekly Tuition Cents"], `Reviewed template row ${rowNumber} source weekly tuition`);
    const confirmedTuitionCents = integer(row["Confirmed Weekly Tuition Cents"], `Reviewed template row ${rowNumber} confirmed weekly tuition`);
    invariant(sourceTuitionCents > 0 && sourceTuitionCents === confirmedTuitionCents, `Reviewed template row ${rowNumber} weekly tuition must be a positive exact source match.`);
    invariant(clean(row["Confirmed Tuition Cadence"]).toLowerCase() === "weekly", `Reviewed template row ${rowNumber} tuition cadence must be weekly.`);
    invariant(/^\d{4}-W\d{2}$/.test(clean(row["Tuition Effective Week"])), `Reviewed template row ${rowNumber} needs an ISO effective week such as 2026-W34.`);
    invariant(confirmed(row["Tuition Confirmation"]), `Reviewed template row ${rowNumber} must confirm weekly tuition.`);
    invariant(clean(row.Disposition).toLowerCase() === "ready", `Reviewed template row ${rowNumber} disposition must be ready.`);
    return {
      sourceAccountId: row["Source Account ID"],
      sourceChildId: row["Source Child ID"],
      sourceChildName: row["Source Child Name"],
      openingBalanceCents: confirmedBalanceCents,
      weeklyTuitionCents: confirmedTuitionCents,
      tuitionEffectiveWeek: row["Tuition Effective Week"],
      sourceTuitionKind: row["Source Tuition Kind"],
    };
  });
  invariant(reviewedByKey.size === baselineByKey.size, "The reviewed template does not cover every generated child row.");

  const safeRosterByKey = new Map(safeRoster.rows.map((row) => [rosterKey(row), row]));
  invariant(safeRosterByKey.size === safeRoster.rows.length, "The guarded roster contains duplicate family-child rows.");
  const confirmedRosterRows = confirmedRows.map((row) => {
    const roster = safeRosterByKey.get(`${row.sourceAccountId}\u0000${row.sourceChildId}`);
    invariant(roster, `The guarded roster is missing ${row.sourceAccountId}/${row.sourceChildId}.`);
    return {
      ...roster,
      balance: (row.openingBalanceCents / 100).toFixed(2),
      "confirmed opening balance cents": String(row.openingBalanceCents),
      "migration confirmation source child id": row.sourceChildId,
    };
  });
  const tuitionRows = confirmedRows.map((row): CsvRow => ({
    location: manifest.location,
    "source account id": row.sourceAccountId,
    "source child id": row.sourceChildId,
    "source child name": row.sourceChildName,
    "weekly tuition cents": String(row.weeklyTuitionCents),
    cadence: "weekly",
    "effective week": row.tuitionEffectiveWeek,
    "source tuition kind": row.sourceTuitionKind,
    status: "confirmed_source_rate_requires_post_import_child_id_reconciliation",
  }));
  const confirmedRosterCsv = csvFromRows(confirmedRosterRows, safeRoster.headers);
  const confirmedTuitionCsv = csvFromRows(tuitionRows);
  const reviewedTemplateSha256 = sha256(reviewedBuffer);
  const confirmation = {
    version: 1,
    status: "confirmed_source_of_truth",
    preparationOnly: true,
    location: manifest.location,
    confirmedAt: new Date().toISOString(),
    sourceFiles: manifest.sourceFiles,
    baselineTemplateSha256: manifest.outputHashes.migrationSourceOfTruthTemplateSha256,
    reviewedTemplateSha256,
    confirmedRosterSha256: sha256(confirmedRosterCsv),
    confirmedWeeklyTuitionSha256: sha256(confirmedTuitionCsv),
    counts: {
      familyAccounts: balanceByAccount.size,
      children: confirmedRows.length,
      weeklyTuitionAssignments: confirmedRows.length,
    },
    totals: {
      openingBalanceCents: [...balanceByAccount.values()].reduce((sum, amount) => sum + amount, 0),
      weeklyTuitionCents: confirmedRows.reduce((sum, row) => sum + row.weeklyTuitionCents, 0),
    },
    gates: {
      rosterImport: "reviewed_artifact_only_not_import_authorization",
      openingBalances: "reviewed_artifact_only_not_reconciliation_authorization",
      weeklyTuition: "requires_post_import_child_id_reconciliation_and_separate_activation_approval",
      invitations: "held",
      billingAndPayments: "held",
      cutover: "held",
    },
  };
  const fingerprint = sha256(stableJson({
    location: confirmation.location,
    sourceFiles: confirmation.sourceFiles,
    baselineTemplateSha256: confirmation.baselineTemplateSha256,
    reviewedTemplateSha256,
    confirmedRows,
  }));
  const confirmationWithFingerprint = { ...confirmation, fingerprint };
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "confirmed-roster-import.csv"), confirmedRosterCsv, "utf8");
  fs.writeFileSync(path.join(outputDirectory, "confirmed-weekly-tuition-source.csv"), confirmedTuitionCsv, "utf8");
  fs.writeFileSync(path.join(outputDirectory, "confirmation.json"), `${JSON.stringify(confirmationWithFingerprint, null, 2)}\n`, "utf8");
  return confirmationWithFingerprint;
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? clean(process.argv[index + 1]) : "";
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedScriptUrl === import.meta.url) {
  const packageDirectory = option("--package-dir");
  const reviewedTemplatePath = option("--reviewed-template");
  invariant(packageDirectory && reviewedTemplatePath, "Pass --package-dir and --reviewed-template. Optional: --output-dir.");
  const result = confirmBeeSuiteMigrationSourceOfTruth({
    packageDirectory,
    reviewedTemplatePath,
    outputDirectory: option("--output-dir") || undefined,
  });
  console.log(JSON.stringify(result, null, 2));
}
