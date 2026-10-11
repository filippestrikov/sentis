const path = require('path');
const { assertSharedAccountUsable } = require('./organization');

// Credentials come only from the environment; see .env.example.
const roles = {
  'super-admin': { envPrefix: 'SENTIS_SUPER_ADMIN', superAdminPortal: true },
  'client-admin': { envPrefix: 'SENTIS_CLIENT_ADMIN', superAdminPortal: false },
};

function credentials(role) {
  const { envPrefix } = roles[role];
  return {
    email: process.env[`${envPrefix}_EMAIL`],
    password: process.env[`${envPrefix}_PASSWORD`],
    missing: `${envPrefix}_EMAIL / ${envPrefix}_PASSWORD`,
  };
}

const storageStatePath = (role) => path.join(__dirname, '..', '..', '.auth', `${role}.json`);

// Use inside a spec or describe: asRole(test, 'client-admin').
// The session file is written by the setup project during the same run, so check for it
// when each test starts, not when the file is loaded.
function asRole(test, role) {
  const fs = require('fs');
  const state = storageStatePath(role);
  test.use({ storageState: async ({}, use) => use(fs.existsSync(state) ? state : undefined) });
  test.beforeEach(() => {
    assertSharedAccountUsable(role);
    test.skip(!fs.existsSync(state), `No ${role} session; set ${credentials(role).missing} and run the setup project`);
  });
}

module.exports = { roles, credentials, storageStatePath, asRole };
