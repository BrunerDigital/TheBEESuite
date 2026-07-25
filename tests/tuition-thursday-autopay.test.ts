import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WEEKLY_TUITION_AUTOBILL_DAY,
  weeklyTuitionChargeDateForPeriod,
} from "../src/lib/billing-workflows";

test("weekly tuition is scheduled on Thursday for the following week", () => {
  assert.equal(WEEKLY_TUITION_AUTOBILL_DAY, 4);
  assert.equal(
    weeklyTuitionChargeDateForPeriod("2026-W31").toISOString(),
    "2026-07-23T12:00:00.000Z",
  );
});

test("tuition cron overrides legacy Friday assignments and runs before autopay", () => {
  const tuitionRoute = readFileSync(
    "src/app/api/cron/tuition-billing/route.ts",
    "utf8",
  );
  const schedules = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons: Array<{ path: string; schedule: string }>;
  };

  assert.match(
    tuitionRoute,
    /cadence === "weekly"[\s\S]*WEEKLY_TUITION_AUTOBILL_DAY/,
  );
  assert.match(tuitionRoute, /weeklyTuitionChargeDateForPeriod/);

  const tuitionCron = schedules.crons.find(
    (cron) => cron.path === "/api/cron/tuition-billing",
  );
  const autopayCron = schedules.crons.find(
    (cron) => cron.path === "/api/cron/autopay-invoices",
  );
  assert.equal(tuitionCron?.schedule, "15 13 * * *");
  assert.equal(autopayCron?.schedule, "30 15 * * *");
});
