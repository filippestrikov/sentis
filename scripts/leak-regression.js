const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { zipEntries } = require('./check-artifact-leaks');

const root = path.resolve(__dirname, '..');
const scanner = path.join(__dirname, 'check-artifact-leaks.js');
function run(args, env) {
  return spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

function main() {
  const control = run([scanner, '--self-test'], process.env);
  console.log(control.stdout.trim());
  if (control.status !== 0) { console.log('Leak regression failed: scanner self-test.'); return 1; }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sentis-leakcheck-'));
  const env = { ...process.env, CI: '1', SENTIS_EVIDENCE_DIR: path.join(temp, 'evidence') };
  env.PLAYWRIGHT_HTML_OUTPUT_DIR = path.join(root, 'playwright-report');
  env.PLAYWRIGHT_HTML_OPEN = 'never';
  env.PLAYWRIGHT_JUNIT_OUTPUT_FILE = path.join(root, 'test-results', 'junit.xml');
  env.PLAYWRIGHT_NO_COPY_PROMPT = '';
  // Blank other credential variables before config loads .env; shell values always win.
  for (const name of Object.keys(env)) {
    if (/EMAIL|PASSWORD|TOKEN/i.test(name) || name.startsWith('SENTIS_LEAKCHECK_')) env[name] = '';
  }
  const envFile = path.join(root, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const name = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
      if (name && (/EMAIL|PASSWORD|TOKEN/i.test(name) || name.startsWith('SENTIS_LEAKCHECK_'))) env[name] = '';
    }
  }
  for (const role of ['SUPER_ADMIN', 'CLIENT_ADMIN']) {
    const suffix = crypto.randomBytes(12).toString('hex');
    env[`SENTIS_${role}_EMAIL`] = `leakcheck-${role === 'SUPER_ADMIN' ? 'sa' : 'ca'}-${suffix}@example.invalid`;
    env[`SENTIS_${role}_PASSWORD`] = `LeakCheckPwd-${suffix}`;
    for (const kind of ['EMAIL', 'PASSWORD']) env[`SENTIS_LEAKCHECK_${role}_${kind}`] = env[`SENTIS_${role}_${kind}`];
  }
  // Preserve even pre-existing sessions if a supposedly nonexistent account signs in.
  const auth = path.join(root, '.auth');
  const backup = path.join(temp, 'auth-backup');
  const hadAuth = fs.existsSync(auth);
  if (hadAuth) fs.cpSync(auth, backup, { recursive: true });
  try {
    // A startup failure must not be mistaken for a previous successful gate run.
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    for (const file of ['playwright-report/index.html', 'test-results/junit.xml']) {
      fs.rmSync(path.join(root, file), { force: true });
    }
    // These are the same CLI arguments as npx playwright test, without a shell wrapper.
    const result = run([require.resolve('@playwright/test/cli'), 'test', '--project=setup', '--workers=1', '--retries=0'], env);
    // Never forward Playwright output: a regression could contain credentials.
    fs.writeFileSync(path.join(root, 'test-results', 'leakcheck-output.txt'), (result.stdout || '') + (result.stderr || ''));
    let expected = false;
    try {
      const xml = fs.readFileSync(path.join(root, 'test-results', 'junit.xml'), 'utf8');
      const cases = [...xml.matchAll(/<testcase\b[^>]*>[\s\S]*?<\/testcase>/g)].map(match => match[0]);
      const html = fs.readFileSync(path.join(root, 'playwright-report', 'index.html'), 'utf8');
      const embedded = html.match(/data:application\/zip;base64,([A-Za-z0-9+/=\r\n]+)/);
      const entries = zipEntries(Buffer.from(embedded[1], 'base64'));
      const reports = entries.filter(entry => entry.name.endsWith('.json') && entry.name !== 'report.json')
        .map(entry => JSON.parse(entry.body.toString('utf8')));
      const tests = reports.flatMap(report => report.tests || []);
      function titles(steps) { return (steps || []).flatMap(step => [step.title, ...titles(step.steps)]); }
      expected = result.status === 1 && cases.length === 2 && cases.every(item => /<failure\b/.test(item) && !/<skipped\b/.test(item))
        && tests.length === 2 && tests.every(test => {
          const signIn = test.results?.[0]?.steps.find(step => step.title.startsWith('Sign in as '));
          const steps = titles(signIn?.steps);
          return steps.filter(title => /^Fill "/.test(title)).length === 2
            && steps.some(title => /^Click .*name: '(Login|Sign In)'/.test(title)) && test.results[0].status === 'failed';
        });
    } catch { /* Missing or malformed artifacts fail the gate below. */ }
    console.log(expected ? 'Setup: 2 failed as expected; both marker credential pairs typed and submitted.'
      : 'Leak regression failed: expected exactly 2 setup failures with credentials typed and submitted (no skips).');
    const scanned = run([scanner, '--marker-only'], env);
    console.log(scanned.stdout.trim());
    if (scanned.status !== 0) console.log('Leak regression failed: marker leak or unreadable artifacts.');
    if (expected && scanned.status === 0) console.log('Leak regression passed: 0 marker hits.');
    return expected && scanned.status === 0 ? 0 : 1;
  } finally {
    const current = fs.existsSync(auth) ? fs.readdirSync(auth) : [];
    const original = hadAuth ? fs.readdirSync(backup) : [];
    for (const name of current) {
      if (!original.includes(name)) fs.rmSync(path.join(auth, name), { recursive: true, force: true });
    }
    if (hadAuth) fs.cpSync(backup, auth, { recursive: true });
    else if (fs.existsSync(auth)) fs.rmdirSync(auth);
    fs.rmSync(backup, { recursive: true, force: true });
    // Keep failure evidence; this directory never retains the session backup.
  }
}

try { process.exitCode = main(); }
catch { console.log('Leak regression failed: environment or artifact operation could not complete.'); process.exitCode = 1; }
