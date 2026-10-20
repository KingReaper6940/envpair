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
