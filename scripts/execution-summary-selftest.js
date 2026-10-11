const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const classifierPath = path.resolve(__dirname, '../tests/support/execution-summary.js');
assert(fs.existsSync(classifierPath), 'Execution summary classifier must exist');
const { classify } = require(classifierPath);
const knownIssues = require('../tests/fixtures/known-issues.json');
let checks = 0;
function check(label, fn) {
  fn();
  checks++;
  console.log(`PASS: ${label}`);
}
const known = knownIssues.find(entry => entry.jira === 'SNTS-138');
const unclear = knownIssues.find(entry => entry.jira === 'SNTS-242');
const contrast = knownIssues.find(entry => entry.jira === 'SNTS-161');
function result(title, status, errors = [], retries = 0, project = 'chromium') {
  return classify([{ title, project, status, retries, errors }], knownIssues);
}
function category(title, status, errors, expected, note, retries = 0) {
  const summary = result(title, status, errors, retries);
  assert.strictEqual(summary.tests[0].category, expected);
  assert.strictEqual(summary.tests[0].note, note);
  assert.strictEqual(summary.counts[expected], 1);
  assert.strictEqual(Object.values(summary.counts).reduce((a, b) => a + b, 0), 1);
}

check('reviewed signature classifies a product defect', () => {
  category(known.test, 'failed', ['Selecting Custom must display a calendar/date picker'], 'known-product-defect');
});
check('every error must match; mismatch needs review', () => {
  category(known.test, 'failed', ['Selecting Custom must display a calendar/date picker', 'different error'],
    'unexpected-failure', 'known issue, signature mismatch — review');
});
check('known pass is unexpected', () => category(known.test, 'passed', [], 'unexpected-pass'));
check('unknown failure and same Jira with different title stay unexpected', () => {
  category('SNTS-999: unknown scenario', 'failed', ['different error'], 'unexpected-failure');
  category('SNTS-138: another scenario', 'failed', ['Selecting Custom must display a calendar/date picker'], 'unexpected-failure');
});
check('all environment patterns override known signatures', () => {
  for (const error of ['failure (environment)', 'ENVIRONMENT SAFETY INCIDENT', 'Staging API: unavailable',
    'App navigation: failed', 'App bootstrap: failed', 'role marked unsafe']) {
    category(known.test, 'failed', ['Selecting Custom must display a calendar/date picker', error], 'environment-failure');
  }
});
check('skipped precedes other rules', () => category(known.test, 'skipped', ['(environment)'], 'blocked-or-skipped'));
check('reviewed unclear requirement', () => category(unclear.test, 'failed', ['Expected string: "Pre-start Development Guide"'], 'requirement-unclear'));
check('contrast ratio signature excludes inconclusive visual review', () => {
  category(contrast.test, 'failed', ['ratioMin=1.2; ratioMax=2.1; pixelRatio=1; threshold=3'], 'known-product-defect');
  category(contrast.test, 'failed', ['ratioMin=1.2; ratioMax=2.1; pixelRatio=1; threshold=3; needs-visual-review'],
    'unexpected-failure', 'known issue, signature mismatch — review');
});
check('contrast signature matches real Playwright diagnostics but excludes inconclusive diagnostics', () => {
  const { expect } = require('@playwright/test');
  const { stripVTControlCharacters } = require('util');
  function assertionMessage(customMessage) {
    try { expect('fail', customMessage).toBe('pass'); }
    // Outside the runner, expect omits the custom header that Playwright prepends in a test.
    catch (error) { return customMessage + '\n\n' + stripVTControlCharacters(error.message); }
    assert.fail('Synthetic assertion must fail');
  }
  const ratios = 'ratioMin=1.2; ratioMax=2.1; pixelRatio=1; threshold=3';
  category(contrast.test, 'failed', [assertionMessage(ratios)], 'known-product-defect');
  category(contrast.test, 'failed', [assertionMessage(ratios + '; needs-visual-review: measurement inconclusive')],
    'unexpected-failure', 'known issue, signature mismatch — review');
});
check('flaky passes retain note for both known and unknown tests', () => {
  category('SNTS-999: passing scenario', 'passed', [], 'passed', 'flaky', 1);
  category(known.test, 'passed', [], 'unexpected-pass', 'flaky', 2);
});
check('timeouts, interruptions, setup and empty errors classify conservatively', () => {
  category(known.test, 'timedOut', ['Selecting Custom must display a calendar/date picker'], 'known-product-defect');
  category(known.test, 'interrupted', ['(environment)'], 'environment-failure');
  category(known.test, 'failed', [], 'unexpected-failure', 'known issue, signature mismatch — review');
  const setup = result('sign in as super-admin', 'failed', ['Staging API: unavailable'], 0, 'setup').tests[0];
  assert.strictEqual(setup.category, 'environment-failure');
  assert.strictEqual(setup.jira, null);
});
check('summary contains metadata only and never error text', () => {
  const input = [{ title: known.test, project: 'chromium', status: 'failed', retries: 0,
    errors: ['PLANTED_ERROR_MARKER https://example.invalid private@example.invalid'] }];
  const before = JSON.stringify(input);
  const summary = classify(input, knownIssues);
  const json = JSON.stringify(summary);
  for (const marker of ['PLANTED_ERROR_MARKER', 'https://', 'private@example.invalid']) assert(!json.includes(marker));
  assert(summary.tests.every(test => Object.keys(test).every(key => ['jira', 'title', 'project', 'category', 'note'].includes(key))));
  assert.strictEqual(JSON.stringify(input), before);
});
check('all reviewed titles occur in offline Playwright listing; regexes are valid', () => {
  const listing = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--list'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  assert.strictEqual(listing.status, 0, 'Offline listing must succeed');
  const titles = new Set(listing.stdout.split(/\r?\n/).map(line => line.match(/\s›\s([^›]+)$/)?.[1]));
  assert.strictEqual(knownIssues.length, 11);
  assert.strictEqual(new Set(knownIssues.map(entry => entry.test)).size, 11);
  for (const entry of knownIssues) {
    assert(titles.has(entry.test), `Reviewed title missing for ${entry.jira}`);
    assert.strictEqual(entry.reviewedBy, 'claude');
    assert.strictEqual(entry.reviewedOn, '2026-10-11');
    assert(entry.signatures.length > 0);
    for (const signature of entry.signatures) assert(new RegExp(signature));
  }
});
check('reporter keeps final attempts, strips ANSI, truncates errors and masks titles', () => {
  const SummaryReporter = require('../tests/support/summary-reporter');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sentis-summary-'));
  const cwd = process.cwd();
  const envName = 'SENTIS_SUMMARY_SELFTEST_TOKEN';
  const previous = process.env[envName];
  const originalLog = console.log;
  const output = [];
  try {
    process.chdir(temp);
    process.env[envName] = 'synthetic-summary-marker';
    console.log = line => output.push(String(line));
    const reporter = new SummaryReporter();
    const project = name => ({ project: () => ({ name }) });
    const test = { id: 'retry-test', title: known.test, parent: project('chromium') };
    reporter.onTestEnd(test, { status: 'failed', retry: 0, errors: [{ message: 'PLANTED_ERROR_MARKER' }] });
    reporter.onTestEnd(test, { status: 'passed', retry: 1, errors: [] });
    reporter.onTestEnd({ id: 'contrast', title: contrast.test, parent: project('chromium') }, {
      status: 'failed', retry: 0, errors: [{ message: '\u001b[31mratioMin=1; ratioMax=2; pixelRatio=1; threshold=3\u001b[0m' }],
    });
    reporter.onTestEnd({ id: 'private', title: 'SNTS-999: synthetic-summary-marker', parent: project('setup') }, {
      status: 'failed', retry: 0, errors: [{ message: 'x'.repeat(2000) + ' (environment)', stack: 'PLANTED_ERROR_MARKER' }],
    });
    assert.strictEqual(reporter.onEnd({ status: 'failed' }), undefined);
    const json = fs.readFileSync(path.join(temp, 'test-results/execution-summary.json'), 'utf8');
    const summary = JSON.parse(json);
    assert(!Number.isNaN(Date.parse(summary.generatedAt)));
    assert.strictEqual(summary.tests.length, 3);
    assert.strictEqual(summary.counts['unexpected-pass'], 1);
    assert.strictEqual(summary.counts['known-product-defect'], 1);
    assert.strictEqual(summary.counts['unexpected-failure'], 1);
    assert.strictEqual(summary.tests[0].note, 'flaky');
    assert.strictEqual(summary.tests[2].title, 'SNTS-999: <masked>');
    for (const marker of ['PLANTED_ERROR_MARKER', 'synthetic-summary-marker', '(environment)', '\u001b']) {
      assert(!(json + output.join('\n')).includes(marker));
    }
    assert(output.some(line => line.includes('SNTS-138')));
    assert(output.some(line => line.includes('SNTS-161')));
    assert(output.some(line => line.includes('SNTS-999')));
  } finally {
    console.log = originalLog;
    process.chdir(cwd);
    if (previous === undefined) delete process.env[envName];
    else process.env[envName] = previous;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
console.log(`Execution summary: ${checks} checks passed, 0 failed.`);
