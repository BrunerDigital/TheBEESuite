import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const transientErrorPatterns = [
  /audit endpoint returned an error/i,
  /\b503\b/,
  /service unavailable/i,
  /eai_again/i,
  /econnreset/i,
  /econnrefused/i,
  /etimedout/i,
  /socket hang up/i,
  /timed out/i,
];

/**
 * @typedef {{
 *   status?: number | null;
 *   stdout?: string;
 *   stderr?: string;
 *   error?: { message?: string } | null;
 * }} AuditCommandResult
 */

/**
 * @typedef {{
 *   warn?: (message: string) => void;
 * }} AuditLogger
 */

function isTransientAuditError(message) {
  return transientErrorPatterns.some((pattern) => pattern.test(message));
}

function parseAuditJson(stdout) {
  if (!stdout.trim()) return null;

  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function extractAuditError(parsed) {
  if (!parsed?.error) return "";
  if (typeof parsed.error === "string") return parsed.error;

  return [parsed.error.summary, parsed.error.message, parsed.error.detail].filter(Boolean).join("\n");
}

function summarizeVulnerabilities(vulnerabilities = {}) {
  const severities = ["critical", "high", "moderate", "low", "info"];
  const counts = severities
    .map((severity) => [severity, vulnerabilities[severity]])
    .filter(([, count]) => typeof count === "number" && count > 0)
    .map(([severity, count]) => `${count} ${severity}`);

  const total = typeof vulnerabilities.total === "number" ? vulnerabilities.total : counts.reduce((sum, entry) => sum + Number.parseInt(entry, 10), 0);
  const noun = total === 1 ? "vulnerability" : "vulnerabilities";
  return counts.length ? `${total} production ${noun} (${counts.join(", ")})` : `${total} production ${noun}`;
}

/**
 * @param {AuditCommandResult} result
 */
export function classifyAuditResult({ status, stdout = "", stderr = "", error = null }) {
  const parsed = parseAuditJson(stdout);
  const vulnerabilities = parsed?.metadata?.vulnerabilities;
  const combinedError = [extractAuditError(parsed), stderr, error?.message].filter(Boolean).join("\n").trim();

  if (typeof vulnerabilities?.total === "number") {
    if (vulnerabilities.total === 0) {
      return { ok: true, kind: "clean", summary: "npm audit found no production vulnerabilities." };
    }

    return {
      ok: false,
      kind: "vulnerabilities",
      summary: `npm audit found ${summarizeVulnerabilities(vulnerabilities)}.`,
      vulnerabilities,
    };
  }

  if (status === 0) {
    return { ok: true, kind: "clean", summary: "npm audit completed successfully." };
  }

  if (isTransientAuditError(combinedError)) {
    return {
      ok: false,
      kind: "transient-error",
      summary: combinedError || `npm audit failed with status ${status ?? "unknown"}.`,
    };
  }

  return {
    ok: false,
    kind: "error",
    summary: combinedError || `npm audit failed with status ${status ?? "unknown"}.`,
  };
}

function runAuditCommand() {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(command, ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/**
 * @param {{
 *   attempts?: number;
 *   retryDelayMs?: number;
 *   runner?: () => AuditCommandResult;
 *   log?: AuditLogger;
 * }} [options]
 */
export async function auditProductionDependencies({ attempts = 3, retryDelayMs = 5000, runner = runAuditCommand, log = console } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = classifyAuditResult(runner());

    if (result.kind === "clean") {
      return { ...result, attemptsUsed: attempt };
    }

    if (result.kind === "vulnerabilities" || result.kind === "error") {
      return { ...result, attemptsUsed: attempt };
    }

    if (attempt < attempts) {
      log.warn?.(`npm audit advisory service unavailable on attempt ${attempt}/${attempts}; retrying in ${retryDelayMs}ms.`);
      await sleep(retryDelayMs);
      continue;
    }

    return {
      ok: true,
      kind: "transient-warning",
      summary: `npm audit advisory service remained unavailable after ${attempts} attempts; continuing without failing validation.`,
      detail: result.summary,
      attemptsUsed: attempt,
    };
  }

  return {
    ok: false,
    kind: "error",
    summary: "npm audit did not run.",
    attemptsUsed: 0,
  };
}

async function main() {
  const result = await auditProductionDependencies();

  if (result.kind === "vulnerabilities" || result.kind === "error") {
    console.error(result.summary);
    process.exitCode = 1;
  } else if (result.kind === "transient-warning") {
    console.warn(result.summary);
    if (result.detail) console.warn(result.detail);
  } else {
    console.log(result.summary);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
