import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv, MAX_CHARS } from '../src/core.mjs';

test('parses BOM, CRLF, export prefixes, comments, and quoted hashes', () => {
  const result = parseEnv('\uFEFF# example\r\nexport PORT = 3000\r\nTOKEN="a#b" # note\r\nEMPTY= # note');
  assert.deepEqual(result.keys, [
    { key: 'PORT', line: 2, empty: false },
    { key: 'TOKEN', line: 3, empty: false },
    { key: 'EMPTY', line: 4, empty: true }
  ]);
  assert.deepEqual(result.diagnostics, []);
});
test('values never survive parsing, including invalid lines', () => {
  const result = parseEnv('TOKEN=sentinel-secret\ninvalid sentinel-secret\nBAD="sentinel-secret');
  assert.equal(JSON.stringify(result).includes('sentinel-secret'), false);
  assert.equal(result.diagnostics.length, 2);
});
test('duplicate diagnostics retain both locations and first definition', () => {
  const result = parseEnv('A=\nA=second');
  assert.equal(result.keys[0].empty, true);
  assert.deepEqual(result.diagnostics, [{ line: 2, key: 'A', code: 'duplicate-key', firstLine: 1 }]);
});
test('handles escaped double quotes and whitespace-only quoted values', () => {
  const result = parseEnv('A="a\\"b"\nB=\'   \'\nC=""');
  assert.deepEqual(result.keys.map(x => x.empty), [false, true, true]);
});
test('rejects multiline, backtick and malformed assignments explicitly', () => {
  const result = parseEnv('A="multi\nline"\nB=`value`\nC="closed"junk\n1X=x');
  assert.equal(result.diagnostics.length, 5);
});
test('supports literal expansion without evaluating it', () => {
  assert.equal(parseEnv('A=${MISSING}\nB=$(command)').keys.every(x => !x.empty), true);
});
test('enforces input and unique-key limits', () => {
  assert.throws(() => parseEnv('a'.repeat(MAX_CHARS + 1)), /100,000/);
  assert.throws(() => parseEnv(Array.from({ length: 1001 }, (_, i) => `K${i}=x`).join('\n')), /1,000/);
});
