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

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--reporter' || arg === '-r' || arg.startsWith('--reporter=') || arg.startsWith('-r=') || /^-r[^-]/.test(arg)) {
    const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1)
      : arg.startsWith('-r') && arg.length > 2 ? arg.slice(2) : process.argv[++i];
    const first = value?.split(',')[0].replace(/\\/g, '/');
    if (first !== './tests/support/mask-reporter.js' && first !== 'tests/support/mask-reporter.js') {
      throw new Error('Reporter override must put mask-reporter.js first to protect credentials. Use --reporter=./tests/support/mask-reporter.js,list');
    }
  }
}

module.exports = defineConfig({
  testDir: './tests',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['./tests/support/mask-reporter.js'],
    ['list'],
    ['html', { open: 'never' }],
    ['./tests/support/evidence-reporter.js'],
    ...(process.env.CI ? [['junit', { outputFile: 'test-results/junit.xml' }]] : []),
    ['./tests/support/summary-reporter.js'],
  ],
  use: {
    baseURL: 'https://sam.sentis.com/',
    // ~2x the slowest measured load: stalls fail at page.goto with a screenshot instead of an anonymous test timeout.
    navigationTimeout: 20000,
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
      grepInvert: /@public|@shared-account/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'off' },
    },
    {
      name: 'shared-account',
      grep: /@shared-account/,
      dependencies: ['setup'],
      workers: 1,
      use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'off' },
    },
    ...(process.env.SENTIS_WEBKIT === '1' ? [{
      name: 'public-webkit',
      grep: /@public/,
      use: { ...devices['iPhone 15 Pro Max'], trace: 'off' },
    }] : []),
  ],
});
