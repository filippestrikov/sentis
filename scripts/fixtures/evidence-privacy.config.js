const path = require('path');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'evidence-privacy.spec.js',
  outputDir: path.join(process.env.SENTIS_PRIVACY_TEMP, 'results'),
  workers: 1,
  retries: 0,
  reporter: [
    [require.resolve('../../tests/support/mask-reporter')],
    [require.resolve('./evidence-privacy-reporter')],
  ],
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium' }, { name: 'public' }],
});
