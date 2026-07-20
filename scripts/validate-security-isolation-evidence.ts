import { readFile } from "node:fs/promises";
import { validateIsolationEvidence, type IsolationEvidenceRecord } from "../src/lib/security-readiness";

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: tsx scripts/validate-security-isolation-evidence.ts <evidence.json>");
  const records = JSON.parse(await readFile(path, "utf8")) as IsolationEvidenceRecord[];
  const errors = validateIsolationEvidence(records);
  process.stdout.write(`${JSON.stringify({ cases: records.length, valid: errors.length === 0, errors }, null, 2)}\n`);
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Evidence validation failed"}\n`);
  process.exitCode = 2;
});
