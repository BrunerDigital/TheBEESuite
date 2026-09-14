import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeReadinessSnapshot(directory: string, csv: string, now = new Date()) {
  await mkdir(directory, { recursive: true });
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const path = join(directory, `school-readiness-${timestamp}-${randomUUID()}.csv`);
  await writeFile(path, csv, { flag: "wx" });
  return path;
}
