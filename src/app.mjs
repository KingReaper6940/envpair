import { audit, checklist, blankTemplate, MAX_CHARS } from './core.mjs';
const $ = id => document.getElementById(id);
let report = null;
let revision = 0;
let loading = 0;
const referenceSample = '# Expected environment keys\nAPP_URL=\nDATABASE_URL=\nMAIL_FROM=\nFEATURE_SEARCH=';
const targetSample = '# Fictional example values\nAPP_URL=https://example.test\nDATABASE_URL=\nFEATURE_SEARCH=false\nOLD_FLAG=true';

function message(text, error = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
}
function invalidate() {
  revision++;
  report = null;
  $('results').hidden = true;
  $('rows').replaceChildren();
  $('stats').replaceChildren();
  $('preview').value = '';
  message('Inputs changed. Check configuration to refresh the report.');
}
function renderRows() {
  $('rows').replaceChildren();
  const filter = $('filter').value;
  const selected = report.rows.filter(row => filter === 'all' || (filter === 'issues' ? ['missing', 'empty'].includes(row.status) : row.status === filter));
  for (const row of selected) {
    const tr = document.createElement('tr');
    for (const value of [row.key, row.status, row.referenceLine ?? '—', row.targetLine ?? '—']) {
      const cell = document.createElement('td');
      if (value === row.status) {
        const badge = document.createElement('span');
        badge.className = `badge ${row.status}`;
        badge.textContent = row.status;
        cell.append(badge);
      } else cell.textContent = value;
      tr.append(cell);
    }
    $('rows').append(tr);
  }
  $('no-rows').hidden = selected.length !== 0;
}
function exportText() {
  if (!report?.valid) return '';
  if ($('format').value === 'markdown') return checklist(report);
  if ($('format').value === 'template') return blankTemplate(report);
  return JSON.stringify(report, null, 2) + '\n';
}
function compare() {
  invalidate();
  try {
    report = audit($('reference').value, $('target').value);
    if (!report.valid) {
      message('Resolve these diagnostics before continuing:\n' + report.diagnostics.map(d => `${d.side}${d.line ? ` line ${d.line}` : ''}: ${d.code}${d.key ? ` (${d.key})` : ''}${d.firstLine ? `; first defined on line ${d.firstLine}` : ''}`).join('\n'), true);
      report = null;
      return;
    }
    for (const [status, count] of Object.entries(report.summary)) {
      const stat = document.createElement('div');
      stat.className = `stat ${status}`;
      const strong = document.createElement('strong');
      strong.textContent = count;
      const label = document.createElement('span');
      label.textContent = status[0].toUpperCase() + status.slice(1);
      stat.append(strong, label);
      $('stats').append(stat);
    }
    $('readiness').textContent = report.ready ? 'Required keys assigned' : 'Needs attention';
    $('filter').value = 'all';
    renderRows();
    $('preview').value = exportText();
    $('results').hidden = false;
    message(`Audit complete. ${report.summary.missing} missing, ${report.summary.empty} empty, ${report.summary.present} present, ${report.summary.extra} extra.`);
  } catch (error) { report = null; message(error.message, true); }
}
for (const side of ['reference', 'target']) {
  $(side).addEventListener('input', invalidate);
  $(`${side}-file`).addEventListener('change', async event => {
    invalidate();
    const file = event.target.files[0];
    if (!file) return;
    const current = revision;
    loading++;
    $('compare').disabled = true;
    try {
      if (file.size > MAX_CHARS * 4) throw new Error('File is too large. Use at most 100,000 characters.');
      const text = await file.text();
      if (current !== revision) return;
      if (text.length > MAX_CHARS) throw new Error('Use at most 100,000 characters per input.');
      $(side).value = text;
      message('File loaded locally. Check configuration when ready.');
    } catch (error) { if (current === revision) message(error.message, true); }
    finally { event.target.value = ''; loading--; $('compare').disabled = loading > 0; }
  });
}
$('compare').addEventListener('click', compare);
$('sample').addEventListener('click', () => {
  invalidate(); $('reference').value = referenceSample; $('target').value = targetSample; compare();
});
$('clear').addEventListener('click', () => {
  invalidate(); $('reference').value = ''; $('target').value = ''; message('Inputs cleared.'); $('reference').focus();
});
$('filter').addEventListener('change', renderRows);
$('format').addEventListener('change', () => { $('preview').value = exportText(); });
$('download').addEventListener('click', () => {
  if (!report?.valid) return;
  const formats = { json: ['envpair-report.json', 'application/json'], markdown: ['envpair-checklist.md', 'text/markdown'], template: ['.env.example', 'text/plain'] };
  const [name, type] = formats[$('format').value];
  const url = URL.createObjectURL(new Blob([exportText()], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('copy').addEventListener('click', async () => {
  if (!report?.valid) return;
  try { await navigator.clipboard.writeText(exportText()); message('Value-free export copied.'); }
  catch { message('Clipboard unavailable. Select and copy the export preview manually.', true); }
});
