import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const [role, ...capArgs] = process.argv.slice(2);
const supportedRoles = new Set(["parent", "teacher"]);

if (!supportedRoles.has(role) || capArgs.length === 0) {
  console.error("Usage: node scripts/run-capacitor-app.mjs <parent|teacher> <cap-command> [args...]");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const capacitorCli = require.resolve("@capacitor/cli/bin/capacitor");
const iosPath = role === "teacher" ? "ios-teacher" : "ios";

function normalizeSwiftPackagePaths() {
  const packagePath = path.join(process.cwd(), iosPath, "App", "CapApp-SPM", "Package.swift");
  if (!existsSync(packagePath)) return;

  const current = readFileSync(packagePath, "utf8");
  const normalized = current.replace(/(\.package\(name: "CapacitorApp", path: ")([^"]+)("\))/g, (_match, prefix, dependencyPath, suffix) => (
    `${prefix}${dependencyPath.replaceAll("\\", "/")}${suffix}`
  ));
  if (normalized !== current) writeFileSync(packagePath, normalized, "utf8");
}

const child = spawn(process.execPath, [capacitorCli, ...capArgs], {
  env: {
    ...process.env,
    BEE_SUITE_NATIVE_APP: role,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  if (code === 0) normalizeSwiftPackagePaths();
  process.exit(code ?? 1);
});
