const fs = require('fs');
const path = require('path');

const unsafeFlag = role => path.join(process.env.SENTIS_ORG_GUARD_DIR
  || path.join(__dirname, '..', '..', '.shared-account-unsafe'), `${role}.json`);

function assertSharedAccountUsable(role) {
  const flag = unsafeFlag(role);
  if (!fs.existsSync(flag)) return;
  let title = 'unknown test';
  try {
    const { test } = JSON.parse(fs.readFileSync(flag, 'utf8'));
    title = test || title;
  } catch { /* An unreadable flag must still block the shared account. */ }
  throw new Error(`Shared account "${role}" is marked unsafe: a previous test could not restore its organization (${title}). Restore it manually, then delete .shared-account-unsafe/${role}.json`);
}

async function restoreOrganization({ role, testInfo, expected, restore, current }) {
  let actual;
  try {
    await restore();
    actual = String((await current()) ?? '').trim();
    if (typeof expected === 'string' && expected.trim() !== ''
      && actual === String(expected ?? '').trim()) return actual;
  } catch { /* Persist only minimal metadata, never the underlying page error. */ }
  const flag = unsafeFlag(role);
  fs.mkdirSync(path.dirname(flag), { recursive: true });
  fs.writeFileSync(flag, JSON.stringify({
    test: testInfo.title, expected, actual: actual ?? null, at: new Date().toISOString(),
  }, null, 2));
  throw new Error(`ENVIRONMENT SAFETY INCIDENT: organization not restored for "${role}" (expected ${expected}, got ${actual}). Further ${role} tests are blocked.`);
}

module.exports = { assertSharedAccountUsable, restoreOrganization };
