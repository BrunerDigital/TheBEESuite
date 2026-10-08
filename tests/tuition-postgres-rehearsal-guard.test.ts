import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

for (const [name, url, confirmation] of [
  ['remote database', 'postgresql://fixture@db.example.com:55437/bee_tuition_rehearsal_fixture', 'synthetic-disposable-local'],
  ['query-string remote host override', 'postgresql://fixture@127.0.0.1:55437/bee_tuition_rehearsal_fixture?host=db.example.com', 'synthetic-disposable-local'],
  ['query-string socket override', 'postgresql://fixture@127.0.0.1:55437/bee_tuition_rehearsal_fixture?host=/var/run/postgresql', 'synthetic-disposable-local'],
  ['non-PostgreSQL protocol', 'mysql://fixture@127.0.0.1:55437/bee_tuition_rehearsal_fixture', 'synthetic-disposable-local'],
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

for (const dirty of [false, true]) {
  test(`PostgreSQL rehearsal rejects ${dirty ? 'dirty source' : 'mismatched revision'} before connecting`, (t) => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'bee-rehearsal-guard-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    const git = (args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
    git(['init', '-q']);
    writeFileSync(path.join(cwd, 'fixture.txt'), 'synthetic source');
    git(['add', 'fixture.txt']);
    git(['-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic fixture']);
    const revision = git(['rev-parse', 'HEAD']);
    if (dirty) writeFileSync(path.join(cwd, 'fixture.txt'), 'modified synthetic source');
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href, path.resolve('scripts/rehearse-tuition-cron-postgres.mjs')], {
      cwd, encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, TUITION_REHEARSAL_DATABASE_URL: 'postgresql://fixture@127.0.0.1:55437/bee_tuition_rehearsal_fixture',
        TUITION_REHEARSAL_CONFIRM: 'synthetic-disposable-local', TUITION_REHEARSAL_SOURCE_COMMIT: dirty ? revision : '0'.repeat(40) },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, dirty ? /clean tracked checkout/ : /source revision must match HEAD/);
    assert.doesNotMatch(result.stderr, /PrismaClientInitializationError|Can't reach database server/);
  });
}
