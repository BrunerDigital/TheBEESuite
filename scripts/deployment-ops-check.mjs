import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function inspectDeploymentOps(root = workspaceRoot) {
  const failures = [];
  const notes = [];
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
  const buildCommand = packageJson.scripts?.["vercel-build"] || "";

  for (const required of ["prisma generate", "npm run lint", "npm run typecheck", "npm test", "next build"]) {
    if (!buildCommand.includes(required)) failures.push(`vercel-build is missing: ${required}`);
  }

  const cronRoot = resolve(root, "src", "app", "api", "cron");
  const implemented = readdirSync(cronRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve(cronRoot, entry.name, "route.ts")))
    .map((entry) => `/api/cron/${entry.name}`)
    .sort();
  const configured = [...new Set((vercel.crons || []).map((cron) => cron.path))].sort();

  for (const path of implemented.filter((path) => !configured.includes(path))) failures.push(`cron handler is not scheduled: ${path}`);
  for (const path of configured.filter((path) => !implemented.includes(path))) failures.push(`scheduled cron has no handler: ${path}`);

  for (const path of implemented) {
    const route = readFileSync(resolve(root, "src", "app", path.slice(1), "route.ts"), "utf8");
    if (!route.includes("CRON_SECRET") || !route.includes("authorization")) {
      failures.push(`cron handler does not enforce CRON_SECRET authorization: ${path}`);
    }
  }

  const migrationRoot = resolve(root, "prisma", "migrations");
  const migrations = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const duplicates = migrations.filter((name, index) => migrations.indexOf(name) !== index);
  if (duplicates.length) failures.push(`duplicate Prisma migration directories: ${[...new Set(duplicates)].join(", ")}`);
  for (const migration of migrations) {
    if (!existsSync(resolve(migrationRoot, migration, "migration.sql"))) failures.push(`migration.sql is missing: ${migration}`);
  }

  notes.push(`${implemented.length} cron handlers match ${configured.length} configured cron paths.`);
  notes.push(`${migrations.length} Prisma migration directories contain migration.sql files.`);
  notes.push("This static check does not query a database, apply migrations, verify backups, or prove cron execution.");
  return { ok: failures.length === 0, failures, notes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectDeploymentOps();
  for (const note of result.notes) console.log(`OK: ${note}`);
  for (const failure of result.failures) console.error(`FAIL: ${failure}`);
  process.exitCode = result.ok ? 0 : 1;
}
