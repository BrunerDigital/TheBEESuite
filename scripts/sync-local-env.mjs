import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";

const localPath = ".env.local";
const pulledPath = ".env.production.pulled.local";

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function parseEnv(path) {
  if (!existsSync(path)) return { entries: [], byKey: new Map() };

  const entries = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (!match) return { key: null, line, value: null };
      return { key: match[1].trim(), line, value: match[2] };
    });

  return {
    entries,
    byKey: new Map(entries.filter((entry) => entry.key).map((entry) => [entry.key, entry])),
  };
}

function hasValue(entry) {
  if (!entry || entry.value === null) return false;
  return entry.value.trim().replace(/^["']|["']$/g, "").length > 0;
}

if (!existsSync(pulledPath)) {
  throw new Error(`${pulledPath} is missing. Run npm run cloud:env:prod first.`);
}

if (existsSync(localPath)) {
  copyFileSync(localPath, `${localPath}.backup-${timestamp()}`);
}

const local = parseEnv(localPath);
const pulled = parseEnv(pulledPath);
const writtenKeys = new Set();
const output = [];
let preserved = 0;

for (const pulledEntry of pulled.entries) {
  if (!pulledEntry.key) {
    if (pulledEntry.line) output.push(pulledEntry.line);
    continue;
  }

  const localEntry = local.byKey.get(pulledEntry.key);
  if (!hasValue(pulledEntry) && hasValue(localEntry)) {
    output.push(localEntry.line);
    preserved += 1;
  } else {
    output.push(pulledEntry.line);
  }
  writtenKeys.add(pulledEntry.key);
}

for (const localEntry of local.entries) {
  if (localEntry.key && !writtenKeys.has(localEntry.key)) {
    output.push(localEntry.line);
    writtenKeys.add(localEntry.key);
  }
}

writeFileSync(localPath, `${output.join("\n").replace(/\n+$/, "")}\n`);

console.log(`Synced ${localPath} from ${pulledPath}.`);
console.log(`Preserved ${preserved} existing non-empty local values for blank pulled keys.`);
