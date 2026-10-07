import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

for (const [name, url, confirmation] of [
  ['remote database', 'postgresql://fixture@db.example.com:55437/bee_tuition_rehearsal_fixture', 'synthetic-disposable-local'],
  ['default cluster port', 'postgresql://fixture@127.0.0.1:5432/bee_tuition_rehearsal_fixture', 'synthetic-disposable-local'],
  ['ordinary database', 'postgresql://fixture@127.0.0.1:55437/postgres', 'synthetic-disposable-local'],
  ['missing explicit disposable confirmation', 'postgresql://fixture@127.0.0.1:55437/bee_tuition_rehearsal_fixture', ''],
] as const) {
  test(`PostgreSQL rehearsal rejects ${name} before connecting`, () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/rehearse-tuition-cron-postgres.mjs'], {
      encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, TUITION_REHEARSAL_DATABASE_URL: url, TUITION_REHEARSAL_CONFIRM: confirmation },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AssertionError/);
    assert.doesNotMatch(result.stderr, /PrismaClientInitializationError|Can't reach database server/);
  });
}
