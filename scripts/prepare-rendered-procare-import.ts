import fs from "node:fs";
import path from "node:path";
import { buildRenderedProcareReportRowsFromFiles } from "../src/lib/procare-rendered-report-import";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function csv(records: Array<Record<string, string>>) {
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))]
    .filter((header) => header !== "procare dataset coverage manifest");
  return [
    headers.map(csvCell).join(","),
    ...records.map((record) => headers.map((header) => csvCell(record[header] ?? "")).join(",")),
  ].join("\r\n");
}

const inputDirectory = path.resolve(process.argv[2] ?? "");
const outputDirectory = path.resolve(process.argv[3] ?? "");
if (!process.argv[2] || !process.argv[3]) {
  throw new Error("Usage: npx tsx scripts/prepare-rendered-procare-import.ts <source-folder> <output-folder>");
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
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "01-canton-import-ready.csv"), `${csv(ready)}\r\n`, "utf8");
fs.writeFileSync(path.join(outputDirectory, "02-canton-needs-account-resolution.csv"), `${csv(needsResolution)}\r\n`, "utf8");
fs.writeFileSync(
  path.join(outputDirectory, "IMPORT-INSTRUCTIONS.txt"),
  [
    "Canton ProCare import package",
    "",
    `Ready records: ${ready.length}`,
    `Records requiring an account decision: ${needsResolution.length}`,
    "",
    "Upload only 01-canton-import-ready.csv to NC | Canton.",
    "Submit the preview and confirm the source inventory before committing.",
    "Do not upload 02-canton-needs-account-resolution.csv until each warning has been resolved against an all-accounts ProCare export.",
    "The original payment report and immunization workbook remain reconciliation evidence and are not included in the import-ready CSV.",
  ].join("\r\n"),
  "utf8",
);

console.log(JSON.stringify({
  readyFile: path.join(outputDirectory, "01-canton-import-ready.csv"),
  resolutionFile: path.join(outputDirectory, "02-canton-needs-account-resolution.csv"),
  instructionsFile: path.join(outputDirectory, "IMPORT-INSTRUCTIONS.txt"),
  ready: ready.length,
  needsResolution: needsResolution.length,
}, null, 2));
