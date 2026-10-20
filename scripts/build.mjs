import { mkdir, copyFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
for (const file of ['src/core.mjs', 'src/app.mjs']) execFileSync(process.execPath, ['--check', file]);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/src', { recursive: true });
for (const file of ['index.html', 'style.css', 'favicon.svg', 'src/core.mjs', 'src/app.mjs']) await copyFile(file, `dist/${file}`);
console.log('Built static application in dist/');
