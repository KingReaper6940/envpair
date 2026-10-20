import { open } from 'node:fs/promises';
import { audit, MAX_CHARS } from '../src/core.mjs';

async function readBounded(path) {
  const handle = await open(path, 'r');
  try {
    // Fixed buffer bounds memory even for a growing file or unusual input stream.
    const buffer = Buffer.alloc(MAX_CHARS * 4 + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size === buffer.length) throw new Error('size-limit');
    return buffer.subarray(0, size).toString('utf8');
  } finally { await handle.close(); }
}
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node scripts/check.mjs <reference-file> <target-file>');
  process.exitCode = 2;
} else {
  try {
    const report = audit(await readBounded(args[0]), await readBounded(args[1]));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = !report.valid ? 2 : report.ready ? 0 : 1;
  } catch {
    // Do not echo input, paths or runtime exception details into build logs.
    console.error('Cannot audit inputs. Check readability and the 100,000-character / 1,000-key limits.');
    process.exitCode = 2;
  }
}
