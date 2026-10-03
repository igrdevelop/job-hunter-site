// Prints one line per failing test of a Playwright JSON report, for the
// Telegram alert step of .github/workflows/smoke.yml:
//
//   [project] file › title — first line of the error
//
// Usage: node .github/scripts/smoke-failed-tests.mjs smoke/results.json
//
// Best-effort by design: a missing or unparseable report (the run died before
// Playwright started — npm ci, browser install, the allowlist abort) prints
// nothing and exits 0, so the alert still goes out with the run URL alone.
// Output is capped so the Telegram message stays far below its 4096-char
// limit.
import fs from 'node:fs';

const MAX_TESTS = 10;
const MAX_ERROR_CHARS = 200;

function firstErrorLine(result) {
  const error = result?.errors?.[0] ?? result?.error;
  const message = String(error?.message ?? '')
    // Strip ANSI colour codes Playwright embeds in assertion messages.
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!message) return '';
  return message.length > MAX_ERROR_CHARS ? `${message.slice(0, MAX_ERROR_CHARS - 1)}…` : message;
}

// `describes` = titles of the enclosing test.describe() blocks; the top-level
// suites of a JSON report are the files themselves, whose title is the path.
function collect(suite, describes, out) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      // "unexpected" = failed on every attempt; "flaky" passed on a retry and
      // did not fail the run, so it is not reported here.
      if (test.status !== 'unexpected') continue;
      const results = test.results ?? [];
      const last = results[results.length - 1];
      const error = firstErrorLine(last);
      const where = spec.file ? `${spec.file} › ` : '';
      const title = [...describes, spec.title].join(' › ');
      out.push(`[${test.projectName ?? '?'}] ${where}${title}${error ? ` — ${error}` : ''}`);
    }
  }
  for (const child of suite.suites ?? []) collect(child, [...describes, child.title], out);
}

const reportPath = process.argv[2];
let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
} catch {
  process.exit(0);
}

const failed = [];
// Errors outside any test (a spec file that fails to load, a worker crash).
for (const error of report.errors ?? []) {
  const line = firstErrorLine({ error });
  if (line) failed.push(`(run) ${line}`);
}
for (const suite of report.suites ?? []) collect(suite, [], failed);
for (const line of failed.slice(0, MAX_TESTS)) console.log(`• ${line}`);
if (failed.length > MAX_TESTS) console.log(`… and ${failed.length - MAX_TESTS} more`);
