import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { getRuntimeDatabaseUrl } from "../src/lib/readiness-guardrails";

test("server runtime keeps a bounded pool large enough for concurrent dashboard queries", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/prisma.ts"), "utf8");
  const guardrailSource = fs.readFileSync(path.join(process.cwd(), "src/lib/readiness-guardrails.ts"), "utf8");

  assert.match(source, /getRuntimeDatabaseUrl\(process\.env\)/);
  assert.match(guardrailSource, /PRISMA_POOL_TIMEOUT \?\? "20"/);
  assert.match(guardrailSource, /url\.port === "6543"/);
  assert.match(guardrailSource, /url\.searchParams\.set\("pgbouncer", "true"\)/);
});

test("direct and session connections default to one backend per runtime", () => {
  for (const host of ["db.example.supabase.co", "example.pooler.supabase.com"]) {
    const url = new URL(getRuntimeDatabaseUrl({
      DATABASE_URL: `postgresql://postgres@${host}:5432/postgres?sslmode=require`,
    })!);
    assert.equal(url.searchParams.get("connection_limit"), "1");
    assert.equal(url.searchParams.get("sslmode"), "require");
    assert.equal(url.searchParams.get("pool_timeout"), "20");
    assert.equal(url.searchParams.has("pgbouncer"), false);
  }
});

test("transaction pooling retains concurrency and explicit tuning keeps precedence", () => {
  const pooled = new URL(getRuntimeDatabaseUrl({
    DATABASE_URL: "postgresql://postgres@example.pooler.supabase.com:6543/postgres",
  })!);
  assert.equal(pooled.searchParams.get("connection_limit"), "5");
  assert.equal(pooled.searchParams.get("pgbouncer"), "true");

  const direct = "postgresql://postgres@db.example.supabase.co:5432/postgres";
  assert.equal(new URL(getRuntimeDatabaseUrl({
    DATABASE_URL: direct, PRISMA_CONNECTION_LIMIT: "2",
  })!).searchParams.get("connection_limit"), "2");
  assert.equal(new URL(getRuntimeDatabaseUrl({
    DATABASE_URL: `${direct}?connection_limit=3`, PRISMA_CONNECTION_LIMIT: "2",
  })!).searchParams.get("connection_limit"), "3");
});
