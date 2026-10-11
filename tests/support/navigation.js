const { errors, expect, test } = require('@playwright/test');

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

async function clickAndAwaitApi(page, { action, path, ready, label, timeout = 20000 }) {
  if (await ready.isVisible()) {
    await action();
    return { source: 'already-ready' };
  }
  const onWaitError = error => {
    if (!(error instanceof errors.TimeoutError)) throw error;
    throw new Error(`Staging API: ${path} did not respond within ${timeout / 1000} s after ${label}, and the page did not become ready (environment)`);
  };
  const response = page.waitForResponse(r => r.request().method() === 'GET'
    && new URL(r.url()).pathname === path, { timeout })
    .then(value => ({ source: 'response', value })).catch(onWaitError);
  const visible = ready.waitFor({ state: 'visible', timeout })
    .then(() => ({ source: 'cached' })).catch(onWaitError);
  response.catch(() => {});
  visible.catch(() => {});
  const outcome = Promise.race([response, visible]);
  outcome.catch(() => {});
  await action();
  const winner = await outcome;
  if (winner.source === 'cached') {
    test.info().annotations.push({
      type: 'sync', description: `${label}: ready without a ${path} response (cached data)`,
    });
    return { source: 'cached' };
  }
  const status = winner.value.status();
  if (!((status >= 200 && status < 300) || status === 304)) {
    throw new Error(`Staging API: GET ${path} returned HTTP ${status} after ${label} (environment)`);
  }
  await expect(ready).toBeVisible();
  return { source: 'response', status };
}

module.exports = { gotoApp, clickAndAwaitApi };
