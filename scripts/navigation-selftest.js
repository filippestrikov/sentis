const assert = require('node:assert/strict');
const { chromium, test, expect } = require('@playwright/test');
const { clickAndAwaitApi } = require('../tests/support/navigation');

async function main() {
  assert.equal(typeof clickAndAwaitApi, 'function', 'clickAndAwaitApi must be exported');
  const browser = await chromium.launch();
  const originalInfo = test.info;
  let passed = 0;
  const unhandled = [];
  const onUnhandled = error => { unhandled.push(error); };
  process.on('unhandledRejection', onUnhandled);
  try {
    async function run(name, options, verify) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      const testInfo = { annotations: [] };
      test.info = () => testInfo;
      let requests = 0;
      try {
        await page.route('**/*', async route => {
          const url = new URL(route.request().url());
          assert.equal(url.origin, 'http://sync.test');
          if (url.pathname === '/v1/users') {
            requests++;
            await route.fulfill({ status: options.status || 200, contentType: 'application/json', body: '{}' });
          } else {
            assert.equal(url.pathname, '/');
            await route.fulfill({ contentType: 'text/html', body: `
              <button id="inspect">Inspect Users</button>
              <button id="invite" ${options.already ? '' : 'hidden'}>Invite Team Leader</button>
              <script>
                const show = () => { document.getElementById('invite').hidden = false; };
                document.getElementById('inspect').onclick = () => {
                  window.clicked = true;
                  ${options.cache ? 'show();' : options.noRequest ? '' : `
                    fetch('/v1/users${options.query ? '?x=secret' : ''}')
                      .then(response => { if (response.ok && ${!options.noButton}) show(); })
                      .catch(() => {});
                  `}
                };
              </script>` });
          }
        });
        await page.goto('http://sync.test/');
        const ready = page.getByRole('button', { name: 'Invite Team Leader', exact: true });
        const result = clickAndAwaitApi(page, {
          action: options.synchronous
            ? () => page.evaluate(() => document.getElementById('inspect').click())
            : () => page.getByRole('button', { name: 'Inspect Users', exact: true }).click(),
          path: '/v1/users', ready, label: 'Inspect Users', timeout: options.timeout || 2000,
        });
        await verify({ result, ready, testInfo, page, requestCount: () => requests });
        assert.equal(await page.evaluate(() => window.clicked), true);
        passed++;
        console.log(`PASS ${name}`);
      } finally {
        await context.close();
      }
    }

    const responseReady = async ({ result, ready, testInfo, requestCount }) => {
      assert.deepEqual(await result, { source: 'response', status: 200 });
      await expect(ready).toBeVisible();
      assert.equal(requestCount(), 1);
      assert.deepEqual(testInfo.annotations, []);
    };
    await run('200 response waits for the ready button', {}, responseReady);
    await run('503 response is an environment failure', { status: 503 }, async ({ result }) => {
      await assert.rejects(result, { message: 'Staging API: GET /v1/users returned HTTP 503 after Inspect Users (environment)' });
    });
    await run('cached state adds a sync annotation', { cache: true }, async ({ result, ready, testInfo, requestCount }) => {
      assert.deepEqual(await result, { source: 'cached' });
      await expect(ready).toBeVisible();
      assert.equal(requestCount(), 0);
      assert.deepEqual(testInfo.annotations, [{ type: 'sync', description: 'Inspect Users: ready without a /v1/users response (cached data)' }]);
    });
    await run('missing response and ready state times out', { noRequest: true, timeout: 500 }, async ({ result }) => {
      await assert.rejects(result, { message: 'Staging API: /v1/users did not respond within 0.5 s after Inspect Users, and the page did not become ready (environment)' });
    });
    await run('200 without UI readiness fails the UI assertion', { noButton: true }, async ({ result }) => {
      await assert.rejects(result, error => {
        assert.match(error.message, /toBeVisible/);
        assert.doesNotMatch(error.message, /Staging API:|\(environment\)/);
        return true;
      });
    });
    await run('synchronous click-handler request is caught', { synchronous: true }, responseReady);
    await run('already-ready state still runs the action', { already: true, noRequest: true }, async ({ result, testInfo, requestCount }) => {
      assert.deepEqual(await result, { source: 'already-ready' });
      assert.equal(requestCount(), 0);
      assert.deepEqual(testInfo.annotations, []);
    });
    await run('query strings are absent from environment errors', { status: 503, query: true }, async ({ result }) => {
      await assert.rejects(result, error => {
        assert.equal(error.message, 'Staging API: GET /v1/users returned HTTP 503 after Inspect Users (environment)');
        assert.doesNotMatch(error.message, /secret|\?/);
        return true;
      });
    });
  } finally {
    test.info = originalInfo;
    await browser.close();
    process.removeListener('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, [], 'losing waits must not cause unhandled rejections');
  console.log(`${passed} cases passed`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
