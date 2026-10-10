const EvidenceReporter = require('../../tests/support/evidence-reporter');

module.exports = class PrivacyProbeReporter extends EvidenceReporter {
  onTestEnd(test, result) {
    if (!test.title.startsWith('SNTS-9003:')) return super.onTestEnd(test, result);
    // Freeze only the reporter boundary so real failures deterministically collide in one second.
    const RealDate = Date;
    try {
      global.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : ['2026-10-10T12:00:00Z'])); }
      };
      super.onTestEnd(test, result);
    } finally { global.Date = RealDate; }
  }
};
