import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildProcareMultiReportRowsFromFiles,
  expandProcareSourceEntries,
} from "../src/lib/procare-multi-report-import";
import { preparedProcareCsv } from "./prepare-rendered-procare-import";

const EMPTY_CHILD_INFO_FILENAME = "Bee Suite reviewed empty child information tracking placeholder.csv";
const EMPTY_CHILD_INFO = Buffer.from(
  [
    "Child ID",
    "Person ID",
    "Full Name",
    "Category Description",
    "Category Sort ID",
    "Item Description",
    "Item Sort ID",
    "Item Is Active",
  ].join(","),
  "utf8",
);

function sha256(buffer: Buffer | string) {
  return createHash("sha256").update(buffer).digest("hex");
}

function warningCodeSummary(records: Array<Record<string, string>>) {
  const counts: Record<string, number> = {};
  for (const record of records) {
    try {
      const diagnostics = JSON.parse(record["procare import diagnostics"] || "[]") as Array<{
        code?: string;
        severity?: string;
      }>;
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

async function normalizedRows(inputBuffer: Buffer, allowEmptyChildInfo: boolean) {
  const entries = await expandProcareSourceEntries(new Map([["uploaded-procare.zip", inputBuffer]]));
  try {
    return {
      records: await buildProcareMultiReportRowsFromFiles(entries),
      emptyChildInfoPlaceholderUsed: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!allowEmptyChildInfo || !/Missing or ambiguous report data: childinfo\./.test(message)) {
      throw error;
    }
    entries.set(EMPTY_CHILD_INFO_FILENAME, EMPTY_CHILD_INFO);
    return {
      records: await buildProcareMultiReportRowsFromFiles(entries),
      emptyChildInfoPlaceholderUsed: true,
    };
  }
}

export async function prepareProcareMultiReportImport(
  inputPath: string,
  outputPath: string,
  options: { allowEmptyChildInfo?: boolean } = {},
) {
  const inputFile = path.resolve(inputPath);
  const outputDirectory = path.resolve(outputPath);
  if (!fs.statSync(inputFile).isFile()) throw new Error("The ProCare input must be a ZIP file.");
  if (inputFile === outputDirectory) {
    throw new Error("Choose a separate output folder so the original ProCare export remains unchanged.");
  }

  const inputBuffer = fs.readFileSync(inputFile);
  const result = await normalizedRows(inputBuffer, options.allowEmptyChildInfo === true);
  const records = result.records;
  const ready = records.filter((record) => !record["import warning"]);
  const needsResolution = records.filter((record) => Boolean(record["import warning"]));
  const reviewedCsv = `${preparedProcareCsv(records)}\r\n`;
  const readyCsv = `${preparedProcareCsv(ready)}\r\n`;
  const resolutionCsv = needsResolution.length ? `${preparedProcareCsv(needsResolution)}\r\n` : "";
  const datasetCoverage = records.length
    ? JSON.parse(records[0]["procare dataset coverage manifest"] || "null")
    : null;

  fs.mkdirSync(outputDirectory, { recursive: true });
  const reviewedFile = path.join(outputDirectory, "01-procare-reviewed-import.csv");
  const readyReferenceFile = path.join(outputDirectory, "02-procare-ready-reference.csv");
  const resolutionFile = path.join(outputDirectory, "03-procare-needs-resolution.csv");
  const manifestFile = path.join(outputDirectory, "manifest.json");
  const instructionsFile = path.join(outputDirectory, "IMPORT-INSTRUCTIONS.txt");
  fs.writeFileSync(reviewedFile, reviewedCsv, "utf8");
  fs.writeFileSync(readyReferenceFile, readyCsv, "utf8");
  fs.writeFileSync(resolutionFile, resolutionCsv, "utf8");
  fs.writeFileSync(
    manifestFile,
    `${JSON.stringify({
      preparedAt: new Date().toISOString(),
      originalFilename: path.basename(inputFile),
      originalSha256: sha256(inputBuffer),
      reviewedSha256: sha256(reviewedCsv),
      totalRecords: records.length,
      readyRecords: ready.length,
      needsResolutionRecords: needsResolution.length,
      warningCodes: warningCodeSummary(needsResolution),
      emptyChildInfoPlaceholderUsed: result.emptyChildInfoPlaceholderUsed,
      emptyChildInfoMeaning: result.emptyChildInfoPlaceholderUsed
        ? "No child-information facts were supplied or invented; identity, enrollment, account, and relationship sources remain available."
        : null,
      datasetCoverage,
    }, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    instructionsFile,
    [
      `${path.basename(inputFile)} reviewed ProCare import package`,
      "",
      `Ready records: ${ready.length}`,
      `Records requiring disposition: ${needsResolution.length}`,
      `Empty child-information placeholder used: ${result.emptyChildInfoPlaceholderUsed ? "yes" : "no"}`,
      "",
      "Upload 01-procare-reviewed-import.csv to the intended school and run the dry-run review.",
      "Commit only the rows that the dry run marks ready.",
      "Dispose the unchanged warning row numbers in the same audited batch only with explicit partial-import authorization.",
      "03-procare-needs-resolution.csv is retained for a later corrected ProCare export; do not import it separately.",
    ].join("\r\n"),
    "utf8",
  );

  return {
    reviewedFile,
    readyReferenceFile,
    resolutionFile,
    manifestFile,
    instructionsFile,
    total: records.length,
    ready: ready.length,
    needsResolution: needsResolution.length,
    warningCodes: warningCodeSummary(needsResolution),
    emptyChildInfoPlaceholderUsed: result.emptyChildInfoPlaceholderUsed,
  };
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedScriptUrl === import.meta.url) {
  const args = process.argv.slice(2);
  const allowEmptyChildInfo = args.includes("--allow-empty-child-info");
  const positional = args.filter((arg) => arg !== "--allow-empty-child-info");
  if (!positional[0] || !positional[1]) {
    throw new Error(
      "Usage: npm run procare:prepare-multi -- <source.zip> <output-folder> [--allow-empty-child-info]",
    );
  }
  void prepareProcareMultiReportImport(positional[0], positional[1], { allowEmptyChildInfo })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
