import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  assertNonProductionBaseUrl,
  percentile,
  QA_RECOMMENDED_THRESHOLDS,
  QA_SYNTHETIC_SCENARIOS,
} from "./qa-standards";

function argument(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const baseUrl = assertNonProductionBaseUrl(argument("--base-url", "http://127.0.0.1:4177"));
const requestsPerScenario = Math.max(1, Number(argument("--requests", "100")));
const concurrency = Math.max(1, Math.min(50, Number(argument("--concurrency", "10"))));
const outputPath = resolve(argument("--output", `outputs/qa/synthetic-load-${Date.now()}.json`));

type Sample = { durationMs: number; ok: boolean; status: number; error?: string };

async function sample(path: string): Promise<Sample> {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    return { durationMs: performance.now() - startedAt, ok: response.status < 500, status: response.status };
  } catch (error) {
    return { durationMs: performance.now() - startedAt, ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runScenario(path: string) {
  const samples: Sample[] = [];
  let next = 0;
  async function worker() {
    while (next < requestsPerScenario) {
      next += 1;
      samples.push(await sample(path));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, requestsPerScenario) }, () => worker()));
  return samples;
}

const results = [];
for (const scenario of QA_SYNTHETIC_SCENARIOS) {
  const samples = await runScenario(scenario.path);
  const durations = samples.map((sampleResult) => sampleResult.durationMs);
  const failures = samples.filter((sampleResult) => !sampleResult.ok);
  const threshold = QA_RECOMMENDED_THRESHOLDS.http[scenario.threshold];
  const metrics = {
    requests: samples.length,
    concurrency,
    p50Ms: Math.round(percentile(durations, 50)),
    p95Ms: Math.round(percentile(durations, 95)),
    p99Ms: Math.round(percentile(durations, 99)),
    errorRatePercent: Number(((failures.length / samples.length) * 100).toFixed(2)),
  };
  const passed = metrics.p95Ms <= threshold.p95Ms && metrics.p99Ms <= threshold.p99Ms && metrics.errorRatePercent <= threshold.errorRatePercent;
  results.push({ ...scenario, threshold, metrics, passed, errors: failures.slice(0, 5) });
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  baseUrl,
  nonProductionGuard: true,
  results,
  passed: results.every((result) => result.passed),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`Evidence: ${outputPath}`);
if (!report.passed) process.exitCode = 1;

