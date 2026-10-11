const fs = require('fs');
const path = require('path');
const { stripVTControlCharacters } = require('util');
const { classify } = require('./execution-summary');
const knownIssues = require('../fixtures/known-issues.json');

function maskTitle(title) {
  const secrets = Object.entries(process.env)
    .filter(([name, value]) => /EMAIL|PASSWORD|TOKEN/i.test(name) && value)
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets) title = title.split(secret).join('<masked>');
  return title;
}

class SummaryReporter {
  constructor() {
    this.results = new Map();
  }

  onTestEnd(test, result) {
    const project = test.parent.project()?.name || '';
    // Use the original title for exact matching; mask only the exported metadata.
    this.results.set(test.id, {
      title: test.title,
      project,
      status: result.status,
      retries: result.retry,
      errors: (result.errors || []).map(error => stripVTControlCharacters(error.message || '').slice(0, 2000)),
    });
  }

  onEnd() {
    // Listing is not an execution and must not overwrite a previous run's summary.
    if (!process.argv.includes('--list')) {
      const summary = classify([...this.results.values()], knownIssues);
      for (const test of summary.tests) test.title = maskTitle(stripVTControlCharacters(test.title));
      const file = path.resolve('test-results/execution-summary.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), ...summary }, null, 2) + '\n');
      console.log('Execution summary');
      for (const [category, count] of Object.entries(summary.counts)) {
        console.log(`${category}: ${count}`);
        if (category !== 'passed') {
          const keys = [...new Set(summary.tests.filter(test => test.category === category).map(test => test.jira).filter(Boolean))];
          console.log(`  Jira: ${keys.join(', ') || '(none)'}`);
        }
      }
    }
  }
}

module.exports = SummaryReporter;
