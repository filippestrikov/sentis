class MaskReporter {
  mask(step) {
    try {
      const secrets = Object.entries(process.env)
        .filter(([name, value]) => /EMAIL|PASSWORD|TOKEN/i.test(name) && value)
        .map(([, value]) => value)
        .sort((a, b) => b.length - a.length);
      for (const secret of secrets) step.title = step.title.split(secret).join('<masked>');
    } catch {
      console.warn('Mask reporter warning: could not mask step title.');
    }
  }

  // Register first so subsequent reporters receive masked step titles.
  onStepBegin(test, result, step) {
    this.mask(step);
  }

  onStepEnd(test, result, step) {
    this.mask(step);
  }
}

module.exports = MaskReporter;
