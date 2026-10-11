const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentis-org-guard-'));
process.env.SENTIS_ORG_GUARD_DIR = root;

async function main() {
  const { assertSharedAccountUsable, restoreOrganization } = require('../tests/support/organization');
  const role = 'super-admin';
  const flag = path.join(root, `${role}.json`);
  const options = { role, testInfo: { title: 'offline organization restore' }, expected: 'Example Customer Org' };
  let restored = false;
  assert.equal(await restoreOrganization({ ...options,
    restore: async () => { restored = true; },
    current: async () => { assert.ok(restored); return 'Example Customer Org'; },
  }), 'Example Customer Org');
  assert.equal(fs.existsSync(flag), false);
  console.log('PASS successful restore returns the organization and writes no flag');

  assert.equal(await restoreOrganization({ ...options,
    restore: async () => {}, current: async () => '  Example Customer Org\n',
  }), 'Example Customer Org');
  assert.equal(fs.existsSync(flag), false);
  console.log('PASS whitespace around the restored organization is trimmed and writes no flag');

  await assert.rejects(restoreOrganization({ ...options, expected: '',
    restore: async () => {}, current: async () => '',
  }), /ENVIRONMENT SAFETY INCIDENT/);
  const emptyExpectedData = JSON.parse(fs.readFileSync(flag, 'utf8'));
  assert.equal(emptyExpectedData.expected, '');
  assert.equal(emptyExpectedData.actual, '');
  console.log('PASS empty expected organization writes a flag and throws INCIDENT');
  fs.unlinkSync(flag);

  await assert.rejects(restoreOrganization({ ...options,
    restore: async () => {}, current: async () => '  Sentis\n',
  }), /ENVIRONMENT SAFETY INCIDENT.*expected Example Customer Org, got Sentis/);
  const data = JSON.parse(fs.readFileSync(flag, 'utf8'));
  assert.deepEqual(Object.keys(data).sort(), ['actual', 'at', 'expected', 'test']);
  assert.equal(data.test, options.testInfo.title);
  assert.equal(data.expected, 'Example Customer Org');
  assert.equal(data.actual, 'Sentis');
  assert.equal(new Date(data.at).toISOString(), data.at);
  console.log('PASS different organization writes only test/expected/actual/at and throws INCIDENT');

  fs.unlinkSync(flag);
  await assert.rejects(restoreOrganization({ ...options,
    restore: async () => { throw new Error('offline restore failure'); },
    current: async () => { assert.fail('current must not run after restore throws'); },
  }), /ENVIRONMENT SAFETY INCIDENT/);
  assert.equal(JSON.parse(fs.readFileSync(flag, 'utf8')).actual, null);
  console.log('PASS throwing restore writes a flag and throws INCIDENT');

  let beforeEach;
  const { asRole } = require('../tests/support/roles');
  asRole({ use: () => {}, beforeEach: hook => { beforeEach = hook; },
    skip: () => { assert.fail('unsafe check must run before missing-session skip'); },
  }, role);
  assert.throws(() => beforeEach(), error => {
    assert.equal(error.message, 'Shared account "super-admin" is marked unsafe: a previous test could not restore its organization (offline organization restore). Restore it manually, then delete .shared-account-unsafe/super-admin.json');
    console.log(error.message);
    return true;
  });
  console.log('PASS later super-admin test is blocked with the clear role and recovery message');
  fs.unlinkSync(flag);
  assert.doesNotThrow(() => assertSharedAccountUsable(role));
  console.log('PASS removing the flag unblocks the role');
  console.log('7 cases passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { fs.rmSync(root, { recursive: true, force: true }); });
