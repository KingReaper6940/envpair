import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = args => spawnSync(process.execPath, ['scripts/check.mjs', ...args], { encoding: 'utf8' });

test('CLI emits deterministic report and missing/empty exit status', () => {
  const result = run(['examples/reference.txt', 'examples/target.txt']);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.summary, { missing: 1, empty: 1, present: 2, extra: 1 });
  assert.equal(result.stdout.includes('https://example.test'), false);
});
test('CLI handles ready, malformed, too large and unreadable files without value leakage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'envpair-test-'));
  try {
    const reference = join(dir, 'reference.txt');
    const target = join(dir, 'target.txt');
    await writeFile(reference, 'A=');
    await writeFile(target, 'A=sentinel-secret');
    assert.equal(run([reference, target]).status, 0);
    await writeFile(target, 'A="sentinel-secret');
    const invalid = run([reference, target]);
    assert.equal(invalid.status, 2);
    assert.equal(invalid.stdout.includes('sentinel-secret'), false);
    await writeFile(target, 'x'.repeat(400001));
    const oversized = run([reference, target]);
    assert.equal(oversized.status, 2);
    assert.equal(oversized.stdout, '');
    const absent = run([reference, join(dir, 'absent')]);
    assert.equal(absent.status, 2);
    assert.equal(absent.stderr.includes(dir), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('CLI rejects missing arguments with usage', () => {
  const result = run([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});
