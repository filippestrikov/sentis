const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { zipEntries } = require('./check-artifact-leaks');

const root = path.resolve(__dirname, '..');
let failures = 0;
function check(label, fn) {
  try { fn(); console.log(`PASS: ${label}`); }
  catch { failures++; console.log(`FAIL: ${label}`); }
}
function filesAt(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? filesAt(file) : [file];
  });
}

function main() {
  check('pure structured sanitizer boundaries', () => {
    const { sanitizeStructured } = require('../tests/support/evidence-policy');
    const input = [{ width: 430, label: 'safe', email: 'private', actual: Infinity,
      expected: 'a@b', control: 'line\nbreak', selector: 'x'.repeat(81), tab: 'secret' }];
    const before = JSON.stringify(input);
    assert.deepStrictEqual(sanitizeStructured(input, ['secret']), {
      data: [{ width: 430, label: 'safe' }], dropped: 6,
    });
    assert.strictEqual(JSON.stringify(input), before);
    assert.deepStrictEqual(sanitizeStructured({ actual: { width: 1 } }), { data: {}, dropped: 1 });
    assert.deepStrictEqual(sanitizeStructured({ actual: [1, null, 'text', { x: 1 }] }), {
      data: { actual: [{ x: 1 }] }, dropped: 3,
    });
    const many = sanitizeStructured(Array.from({ length: 201 }, () => ({ x: 1 })));
    assert.strictEqual(many.data.length, 200); assert.strictEqual(many.dropped, 1);
    const deep = sanitizeStructured({ actual: [{ actual: [{ actual: [{ actual: [{ x: 1 }] }] }] }] });
    assert(deep.dropped > 0);
    assert.deepStrictEqual(sanitizeStructured({ actual: null, expected: true, label: 'x'.repeat(80) }).data,
      { actual: null, expected: true, label: 'x'.repeat(80) });
  });

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sentis-evidence-privacy-'));
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/EMAIL|PASSWORD|TOKEN/i.test(name)) env[name] = '';
  const envFile = path.join(root, '.env');
  if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const name = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
    if (name && /EMAIL|PASSWORD|TOKEN/i.test(name)) env[name] = '';
  }
  const suffix = crypto.randomBytes(12).toString('hex');
  Object.assign(env, {
    SENTIS_EVIDENCE_DIR: path.join(temp, 'evidence'), SENTIS_PRIVACY_TEMP: temp,
    SENTIS_EVIDENCE_POLICY_TEST: '1', SENTIS_EVIDENCE_POLICY_TEST_CASES: 'SNTS-9002',
    SENTIS_PROBE_NAME_TOKEN: `Synthia Probe ${suffix}`,
    SENTIS_PROBE_EMAIL: `probe-${suffix}@example.invalid`,
  });
  try {
    const run = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test',
      '--config=scripts/fixtures/evidence-privacy.config.js'], { cwd: root, env, encoding: 'utf8' });
    check('eight deliberate failures completed', () => {
      assert.strictEqual(run.status, 1);
      assert(!/Evidence reporter warning/.test(run.stdout + run.stderr));
      const summaries = filesAt(env.SENTIS_EVIDENCE_DIR).filter(file => path.basename(file) === 'summary.json');
      assert.strictEqual(summaries.length, 8);
      assert(summaries.every(file => JSON.parse(fs.readFileSync(file, 'utf8')).status === 'failed'));
    });
    const files = filesAt(env.SENTIS_EVIDENCE_DIR);
    const summaries = files.filter(file => path.basename(file) === 'summary.json')
      .map(file => ({ file, summary: JSON.parse(fs.readFileSync(file, 'utf8')) }));
    check('authenticated images withheld and reviewed simulation retained; public evidence retained', () => {
      const unreviewed = summaries.find(item => item.summary.project === 'chromium' && item.summary.title.startsWith('SNTS-9001'));
      const reviewed = summaries.find(item => item.summary.project === 'chromium' && item.summary.title.startsWith('SNTS-9002'));
      assert(unreviewed && reviewed);
      assert(!unreviewed.summary.attachments.some(name => /\.(png|zip|webm)$/.test(name)));
      assert.strictEqual(unreviewed.summary.withheldImages.count, 3);
      assert.strictEqual(reviewed.summary.attachments.filter(name => name.endsWith('.png')).length, 1);
      assert.strictEqual(reviewed.summary.withheldImages.count, 2);
      const publicCase = summaries.find(item => item.summary.project === 'public' && item.summary.title.startsWith('SNTS-9001'));
      assert(publicCase.summary.attachments.includes('trace.zip'));
      assert.strictEqual(publicCase.summary.attachments.filter(name => name.endsWith('.png')).length, 3);
    });
    check('geometry has only allowed fields; drops counted; JSON name collisions preserved', () => {
      const { structuredFields } = require('../tests/support/evidence-policy');
      const geometry = files.filter(file => path.basename(file) === 'geometry.json');
      assert.strictEqual(geometry.length, 2);
      for (const file of geometry) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.deepStrictEqual(data, [{ tab: 'SAM AI', width: 430, height: 932, withinViewport: false }]);
        assert(Object.keys(data[0]).every(key => structuredFields.has(key)));
        assert(fs.existsSync(path.join(path.dirname(file), 'geometry-1.json')));
        const summary = JSON.parse(fs.readFileSync(path.join(path.dirname(file), 'summary.json'), 'utf8'));
        assert(summary.structured.every(item => item.dropped > 0));
        assert.strictEqual(summary.attachments.filter(name => name.endsWith('.json')).length, 2);
      }
    });
    check('no marker in any retained file or ZIP entry (raw, URL, JSON, UTF-16LE)', () => {
      const needles = [env.SENTIS_PROBE_NAME_TOKEN, env.SENTIS_PROBE_EMAIL].flatMap(marker =>
        [...new Set([marker, encodeURIComponent(marker), JSON.stringify(marker).slice(1, -1)])]
          .flatMap(form => [Buffer.from(form), Buffer.from(form, 'utf16le')]));
      const scan = (data, name) => {
        assert(needles.every(needle => !data.includes(needle)));
        if (/\.zip$/i.test(name)) for (const entry of zipEntries(data)) {
          scan(Buffer.from(entry.name), 'entry-name'); scan(entry.body, entry.name);
        }
      };
      for (const file of files) { scan(Buffer.from(file), 'file-name'); scan(fs.readFileSync(file), file); }
    });
    check('same-case failures in the same second reserve distinct folders', () => {
      const collisions = summaries.filter(item => item.summary.title.startsWith('SNTS-9003:'));
      assert.strictEqual(collisions.length, 4);
      assert.strictEqual(new Set(collisions.map(item => path.dirname(item.file))).size, 4);
      for (const project of ['chromium', 'public']) {
        const folders = collisions.filter(item => item.summary.project === project)
          .map(item => path.basename(path.dirname(item.file))).sort();
        assert.deepStrictEqual(folders, [`120000-${project}`, `120001-${project}`]);
      }
    });
  } catch { failures++; console.log('FAIL: offline regression environment or retained evidence unavailable'); }
  finally { fs.rmSync(temp, { recursive: true, force: true }); }
  console.log('Limitation: text scanning cannot detect personal data rendered as pixels; images are controlled by the reviewed-screenshot allowlist, not by scanning.');
  return failures ? 1 : 0;
}
process.exitCode = main();
