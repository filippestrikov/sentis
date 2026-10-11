const categories = [
  'passed', 'known-product-defect', 'requirement-unclear', 'environment-failure',
  'blocked-or-skipped', 'unexpected-failure', 'unexpected-pass',
];
const environmentPatterns = [
  /\(environment\)/, /ENVIRONMENT SAFETY INCIDENT/, /^Staging API:/,
  /^App (navigation|bootstrap):/, /marked unsafe/,
];

function classify(tests, knownIssues) {
  const knownByTitle = new Map(knownIssues.map(entry => [entry.test, {
    classification: entry.classification,
    // Playwright appends matcher diagnostics after the custom failure message line.
    signatures: entry.signatures.map(source => new RegExp(source, 'm')),
  }]));
  const counts = Object.fromEntries(categories.map(category => [category, 0]));
  const classified = tests.map(test => {
    const known = knownByTitle.get(test.title);
    const errors = test.errors || [];
    let category;
    let note;
    if (test.status === 'skipped') {
      category = 'blocked-or-skipped';
    } else if (test.status === 'passed') {
      category = known ? 'unexpected-pass' : 'passed';
      if (test.retries > 0) note = 'flaky';
    } else if (errors.some(error => environmentPatterns.some(pattern => pattern.test(error)))) {
      category = 'environment-failure';
    } else if (known && errors.length > 0 && errors.every(error => known.signatures.some(pattern => pattern.test(error)))) {
      category = known.classification === 'product-defect' ? 'known-product-defect' : 'requirement-unclear';
    } else {
      category = 'unexpected-failure';
      if (known) note = 'known issue, signature mismatch — review';
    }
    counts[category]++;
    return {
      jira: test.title.match(/\bSNTS-\d+\b/)?.[0] || null,
      title: test.title,
      project: test.project,
      category,
      ...(note ? { note } : {}),
    };
  });
  return { counts, tests: classified };
}

module.exports = { classify };
