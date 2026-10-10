const { errors } = require('@playwright/test');

async function gotoApp(page, url, { waitForBootstrap = true } = {}) {
  let navigationSettled = false;
  // Register bootstrap before navigation so a fast auth response cannot be missed.
  const bootstrap = waitForBootstrap
    ? page.waitForResponse(response => new URL(response.url()).pathname === '/v1/auth/me', {
      timeout: 20000,
    }).catch(error => {
      if (!(error instanceof errors.TimeoutError)) throw error;
      throw new Error(navigationSettled
        ? `App bootstrap: /v1/auth/me did not respond within 20 s after ${url} (staging API latency, environment)`
        : `App navigation: ${url} did not finish loading within 20 s (page load stall, environment)`, {
        cause: error,
      });
    })
    : Promise.resolve();
  const [response] = await Promise.all([
    page.goto(url).finally(() => { navigationSettled = true; }), bootstrap,
  ]);
  return response;
}

module.exports = { gotoApp };
