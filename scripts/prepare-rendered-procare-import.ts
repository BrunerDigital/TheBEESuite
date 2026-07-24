import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildRenderedProcareReportRowsFromFiles } from "../src/lib/procare-rendered-report-import";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function preparedProcareCsv(records: Array<Record<string, string>>) {
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  return [
    headers.map(csvCell).join(","),
    ...records.map((record, recordIndex) => headers.map((header) => {
      if (header === "procare dataset coverage manifest" && recordIndex > 0) return csvCell("");
      return csvCell(record[header] ?? "");
    }).join(",")),
  ].join("\r\n");
}

export function prepareRenderedProcareImport(inputPath: string, outputPath: string) {
  const inputDirectory = path.resolve(inputPath);
  const outputDirectory = path.resolve(outputPath);
  if (inputDirectory === outputDirectory) {
    throw new Error("Choose a separate output folder so the original ProCare exports remain unchanged.");
  }

  const entries = new Map(
    fs.readdirSync(inputDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [entry.name, fs.readFileSync(path.join(inputDirectory, entry.name))]),
  );
  const result = buildRenderedProcareReportRowsFromFiles(entries);
  if (!result) throw new Error("No supported rendered ProCare account package was detected.");

  const ready = result.records.filter((record) => !record["import warning"]);
  const needsResolution = result.records.filter((record) => Boolean(record["import warning"]));
  const warningSummary = Object.entries(
    needsResolution.reduce<Record<string, number>>((summary, record) => {
      const warning = record["import warning"] || "Unspecified import warning";
      summary[warning] = (summary[warning] ?? 0) + 1;
      return summary;
    }, {}),
  ).map(([warning, count]) => ({ warning, count }));
  const packageLabel = path.basename(inputDirectory).replace(/\s+procare\s+exports?$/i, "").trim() || "ProCare";
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "01-procare-import-ready.csv"), `${preparedProcareCsv(ready)}\r\n`, "utf8");
  fs.writeFileSync(path.join(outputDirectory, "02-procare-needs-account-resolution.csv"), `${preparedProcareCsv(needsResolution)}\r\n`, "utf8");
  fs.writeFileSync(
    path.join(outputDirectory, "IMPORT-INSTRUCTIONS.txt"),
    [
      `${packageLabel} ProCare import package`,
      "",
      `Ready records: ${ready.length}`,
      `Records requiring an account decision: ${needsResolution.length}`,
      "",
      "Upload only 01-procare-import-ready.csv to the intended school.",
      "Submit the preview and confirm the source inventory before committing.",
      "Do not upload 02-procare-needs-account-resolution.csv until each warning has been resolved against an all-accounts ProCare export.",
      "The original payment report and immunization workbook remain reconciliation evidence and are not included in the import-ready CSV.",
    ].join("\r\n"),
    "utf8",
  );

  return {
    readyFile: path.join(outputDirectory, "01-procare-import-ready.csv"),
    resolutionFile: path.join(outputDirectory, "02-procare-needs-account-resolution.csv"),
    instructionsFile: path.join(outputDirectory, "IMPORT-INSTRUCTIONS.txt"),
    ready: ready.length,
    needsResolution: needsResolution.length,
    sourceInventory: result.datasetCoverage.sourceInventory,
    warningSummary,
  };
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedScriptUrl === import.meta.url) {
  if (!process.argv[2] || !process.argv[3]) {
    throw new Error("Usage: npm run procare:prepare-rendered -- <source-folder> <output-folder>");
  }
  console.log(JSON.stringify(prepareRenderedProcareImport(process.argv[2], process.argv[3]), null, 2));
}
