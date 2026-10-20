import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv, MAX_CHARS, audit, checklist, blankTemplate, unresolvedTemplate } from '../src/core.mjs';

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

test('contract comparison reports missing, empty, present and extra in stable order', () => {
  const report = audit('A=example\nB=\nC=', 'C=ok\nA=" "\nD=extra');
  assert.deepEqual(report.summary, { missing: 1, empty: 1, present: 1, extra: 1 });
  assert.deepEqual(report.rows.map(x => [x.key, x.status]), [['A', 'empty'], ['B', 'missing'], ['C', 'present'], ['D', 'extra']]);
  assert.equal(report.ready, false);
});
test('names are case sensitive and prototype names remain ordinary keys', () => {
  const report = audit('__proto__=\nconstructor=\nPort=', '__proto__=x\nconstructor=y\nPORT=1');
  assert.deepEqual(report.summary, { missing: 1, empty: 0, present: 2, extra: 1 });
});
test('empty target is valid, empty reference is not', () => {
  assert.equal(audit('A=', '').rows[0].status, 'missing');
  assert.equal(audit('# blank', 'A=x').valid, false);
});
test('ambiguities block partial reports and exports', () => {
  const report = audit('A=\nA=x', 'A=x');
  assert.equal(report.valid, false);
  assert.deepEqual(report.rows, []);
  assert.throws(() => checklist(report), /diagnostics/);
  assert.throws(() => blankTemplate(report), /diagnostics/);
});
test('exports omit values and blanks template in reference order', () => {
  const report = audit('B=secret-reference\nA=', 'B=secret-target\nA=ok\nEXTRA=secret-extra');
  const outputs = JSON.stringify(report) + checklist(report) + blankTemplate(report);
  assert.equal(outputs.includes('secret-'), false);
  assert.equal(blankTemplate(report), 'B=\nA=\n');
  assert.equal(report.ready, true);
});

test('unresolved template includes only missing and empty keys, never extras or values', () => {
  const report = audit('A=reference-value\nB=\nC=', 'A=target-value\nB=\nEXTRA=other-value');
  assert.equal(unresolvedTemplate(report), '# Fill these values, then merge manually. Do not replace your existing file.\nB=\nC=\n');
  assert.equal(unresolvedTemplate(audit('A=', 'A=done')), '');
  assert.throws(() => unresolvedTemplate(audit('', '')), /diagnostics/);
});
test('single quoted values keep backslashes literal and comments require closed quotes', () => {
  assert.equal(parseEnv("A='a\\' # comment").keys[0].empty, false);
  assert.equal(parseEnv('A="ok"#comment').diagnostics.length, 0);
  assert.equal(parseEnv('A="ok" trailing').diagnostics[0].code, 'invalid-quoted-value');
});
