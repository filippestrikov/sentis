const path = require('path');

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
function asRole(test, role) {
  const fs = require('fs');
  const state = storageStatePath(role);
  test.skip(!fs.existsSync(state), `No ${role} session; set ${credentials(role).missing} and run the setup project`);
  test.use({ storageState: state });
}

module.exports = { roles, credentials, storageStatePath, asRole };
