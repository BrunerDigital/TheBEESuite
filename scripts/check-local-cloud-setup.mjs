import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const expected = {
  gitRemote: "https://github.com/BrunerDigital/TheBEESuite.git",
  vercelProjectId: "prj_7hJhGdgUtCmonOXuOudqm7D48dmz",
  vercelOrgId: "team_h6ZwzwfpcrqR0oglI4xFdnaM",
  supabaseRef: "nqjrlktoewiueiwrubas",
};

function run(command, args = []) {
  try {
    const fullCommand = [command, ...args.map((arg) => JSON.stringify(arg))].join(" ");
    return execSync(fullCommand, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: true }).trim();
  } catch {
    return "";
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseEnvKeys(path) {
  if (!existsSync(path)) return new Set();

  return new Set(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.split("=")[0]?.trim())
      .filter(Boolean)
  );
}

function statusLine(ok, label, detail = "") {
  const marker = ok ? "OK" : "WARN";
  return formatLine(marker, label, detail);
}

function formatLine(marker, label, detail = "") {
  return `${marker}  ${label}${detail ? ` - ${detail}` : ""}`;
}

const lines = [];
const branch = run("git", ["branch", "--show-current"]);
const remote = run("git", ["remote", "get-url", "origin"]);
const status = run("git", ["status", "--short"]);

lines.push(statusLine(branch === "main", "Git branch", branch || "unknown"));
lines.push(statusLine(remote === expected.gitRemote, "GitHub remote", remote || "missing"));
lines.push(statusLine(!status, "Working tree", status ? "has local changes" : "clean"));

if (existsSync(".vercel/project.json")) {
  const project = readJson(".vercel/project.json");
  lines.push(statusLine(project.projectId === expected.vercelProjectId, "Vercel project", project.projectName || project.projectId));
  lines.push(statusLine(project.orgId === expected.vercelOrgId, "Vercel team", project.orgId));
} else {
  lines.push(statusLine(false, "Vercel project", "run npm run cloud:link"));
}

if (existsSync(".mcp.json")) {
  const mcp = readJson(".mcp.json");
  const url = mcp.mcpServers?.supabase?.url || "";
  lines.push(statusLine(url.includes(expected.supabaseRef), "Supabase MCP", url.includes("read_only=true") ? "read-only production link" : "not read-only"));
} else {
  lines.push(statusLine(false, "Supabase MCP", ".mcp.json missing"));
}

const exampleKeys = parseEnvKeys(".env.example");
const localKeys = parseEnvKeys(".env.local");
const missingKeys = [...exampleKeys].filter((key) => !localKeys.has(key));
lines.push(statusLine(localKeys.size > 0, "Local env", localKeys.size ? `${localKeys.size} keys in .env.local` : "run npm run cloud:env"));
lines.push(
  missingKeys.length === 0
    ? statusLine(true, "Env template coverage", "complete")
    : formatLine("INFO", "Optional env template keys", `${missingKeys.length} .env.example keys are not in .env.local`)
);

lines.push(statusLine(Boolean(run("node", ["--version"])), "Node", run("node", ["--version"])));
lines.push(statusLine(Boolean(run("npm", ["--version"])), "npm", run("npm", ["--version"])));
lines.push(statusLine(Boolean(run("gh", ["--version"])), "GitHub CLI", run("gh", ["--version"]).split(/\r?\n/)[0]));
const githubAuth = run("gh", ["auth", "status", "--hostname", "github.com"]);
lines.push(statusLine(Boolean(githubAuth), "GitHub authentication", githubAuth ? "active" : "run gh auth login --hostname github.com"));
lines.push(statusLine(Boolean(run("vercel", ["--version"])), "Vercel CLI", run("vercel", ["--version"]).split(/\r?\n/).at(-1)));
const vercelAccount = run("vercel", ["whoami"]);
lines.push(statusLine(Boolean(vercelAccount), "Vercel authentication", vercelAccount || "run vercel login or set VERCEL_TOKEN"));
lines.push(statusLine(Boolean(run("supabase", ["--version"])), "Supabase CLI", run("supabase", ["--version"])));
lines.push(statusLine(Boolean(run("docker", ["--version"])), "Docker CLI", run("docker", ["--version"])));

console.log(lines.join("\n"));
