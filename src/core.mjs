export const MAX_CHARS = 100000;
export const MAX_KEYS = 1000;

// Values exist only while classifying a line; the result contains names and flags.
export function parseEnv(text) {
  if (typeof text !== 'string' || text.length > MAX_CHARS) {
    throw new Error('Each input must be text of at most 100,000 characters.');
  }
  const keys = new Map();
  const diagnostics = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  for (let index = 0; index < lines.length; index++) {
    const line = index + 1;
    const source = lines[index].trim();
    if (!source || source.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(source);
    if (!match) {
      diagnostics.push({ line, code: 'invalid-assignment' });
      continue;
    }
    const [, key, raw] = match;
    let value;
    if (raw.startsWith('"') || raw.startsWith("'")) {
      const quote = raw[0];
      let end = -1;
      for (let pos = 1; pos < raw.length; pos++) {
        if (raw[pos] === quote) { end = pos; break; }
        if (quote === '"' && raw[pos] === '\\') pos++;
      }
      if (end < 0 || !/^\s*(?:#.*)?$/.test(raw.slice(end + 1))) {
        diagnostics.push({ line, key, code: 'invalid-quoted-value' });
        continue;
      }
      value = raw.slice(1, end);
    } else {
      if (raw.startsWith('`')) {
        diagnostics.push({ line, key, code: 'unsupported-backtick-value' });
        continue;
      }
      value = raw.split('#', 1)[0].trim();
    }
    if (keys.has(key)) {
      diagnostics.push({ line, key, code: 'duplicate-key', firstLine: keys.get(key).line });
    } else {
      if (keys.size >= MAX_KEYS) throw new Error('Each input supports at most 1,000 unique keys.');
      keys.set(key, { key, line, empty: value.trim().length === 0 });
    }
  }
  return { keys: [...keys.values()], diagnostics };
}

export function audit(referenceText, targetText) {
  const reference = parseEnv(referenceText);
  const target = parseEnv(targetText);
  const diagnostics = [
    ...reference.diagnostics.map(item => ({ side: 'reference', ...item })),
    ...target.diagnostics.map(item => ({ side: 'target', ...item }))
  ];
  if (!reference.keys.length) diagnostics.push({ side: 'reference', code: 'empty-reference' });
  if (diagnostics.length) return { version: 1, valid: false, ready: false, diagnostics, rows: [], summary: null };
  const expected = new Set(reference.keys.map(item => item.key));
  const actual = new Map(target.keys.map(item => [item.key, item]));
  const rows = reference.keys.map(item => ({
    key: item.key,
    status: !actual.has(item.key) ? 'missing' : actual.get(item.key).empty ? 'empty' : 'present',
    referenceLine: item.line,
    targetLine: actual.get(item.key)?.line ?? null
  }));
  for (const item of target.keys) {
    if (!expected.has(item.key)) rows.push({ key: item.key, status: 'extra', referenceLine: null, targetLine: item.line });
  }
  const summary = { missing: 0, empty: 0, present: 0, extra: 0 };
  for (const row of rows) summary[row.status]++;
  return { version: 1, valid: true, ready: summary.missing === 0 && summary.empty === 0, diagnostics: [], rows, summary };
}

export function checklist(report) {
  if (!report.valid) throw new Error('Resolve diagnostics before exporting a checklist.');
  return ['# Environment checklist', '',
    'Values intentionally omitted. Present means non-empty, not runtime-valid.', '',
    ...report.rows.map(row => `- [${row.status === 'present' ? 'x' : ' '}] ${row.key} — ${row.status}`), ''
  ].join('\n');
}

export function blankTemplate(report) {
  if (!report.valid) throw new Error('Resolve diagnostics before exporting a template.');
  return report.rows.filter(row => row.referenceLine !== null).map(row => `${row.key}=`).join('\n') + '\n';
}

export function unresolvedTemplate(report) {
  if (!report.valid) throw new Error('Resolve diagnostics before exporting unresolved keys.');
  const names = report.rows.filter(row => ['missing', 'empty'].includes(row.status)).map(row => `${row.key}=`);
  return names.length ? '# Fill these values, then merge manually. Do not replace your existing file.\n' + names.join('\n') + '\n' : '';
}
