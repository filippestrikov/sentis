const fs = require('fs');
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

// Node 18 has no process.loadEnvFile; read KEY=value lines from .env without overriding the shell.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

module.exports = defineConfig({
  testDir: './tests',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./tests/support/evidence-reporter.js'],
    ...(process.env.CI ? [['junit', { outputFile: 'test-results/junit.xml' }]] : []),
  ],
  use: {
    baseURL: 'https://sam.sentis.com/',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Signs each configured role in once and saves its session under .auth/.
    { name: 'setup', testMatch: /auth\.setup\.js$/, use: { trace: 'off', screenshot: 'off' } },
    {
      name: 'public',
      grep: /@public/,
      use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
    },
    {
      name: 'chromium',
      grepInvert: /@public/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], trace: 'off' },
    },
    ...(process.env.SENTIS_WEBKIT === '1' ? [{
      name: 'public-webkit',
      grep: /@public/,
      use: { ...devices['iPhone 15 Pro Max'], trace: 'off' },
    }] : []),
  ],
});
