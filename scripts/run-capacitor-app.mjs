import { spawn } from "node:child_process";

const [role, ...capArgs] = process.argv.slice(2);
const supportedRoles = new Set(["parent", "teacher"]);

if (!supportedRoles.has(role) || capArgs.length === 0) {
  console.error("Usage: node scripts/run-capacitor-app.mjs <parent|teacher> <cap-command> [args...]");
  process.exit(1);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["cap", ...capArgs], {
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
  process.exit(code ?? 1);
});
