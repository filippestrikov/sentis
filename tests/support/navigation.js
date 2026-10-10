const { errors } = require('@playwright/test');

/** Wait for app navigation and auth bootstrap; fresh public pages have no bootstrap request. */
async function gotoApp(page, url, { waitForBootstrap = true } = {}) {
  const bootstrap = waitForBootstrap
    ? page.waitForResponse(response => new URL(response.url()).pathname === '/v1/auth/me', {
      timeout: 20000,
    }).catch(error => {
      if (!(error instanceof errors.TimeoutError)) throw error;
      throw new Error(`App bootstrap: /v1/auth/me did not respond within 20 s after ${url} (staging API latency, environment)`, {
        cause: error,
      });
    })
    : Promise.resolve();
  const [response] = await Promise.all([page.goto(url), bootstrap]);
  return response;
}

module.exports = { gotoApp };
