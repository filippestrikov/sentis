const { test, expect } = require('@playwright/test');

test('SNTS-9001: unreviewed capture is withheld', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'chromium') {
    await page.setContent(`<p>${process.env.SENTIS_PROBE_NAME_TOKEN}</p><p>${process.env.SENTIS_PROBE_EMAIL}</p>`);
  } else {
    await page.setContent('<p>Public geometry probe</p>');
  }
  await testInfo.attach('Unreviewed probe', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('reviewed: unlisted probe', { body: await page.screenshot(), contentType: 'image/png' });
  const body = JSON.stringify([{
    tab: 'SAM AI', width: 430, height: 932, withinViewport: false,
    email: testInfo.project.name === 'chromium' ? process.env.SENTIS_PROBE_EMAIL : 'unsafe@example.invalid',
    name: testInfo.project.name === 'chromium' ? process.env.SENTIS_PROBE_NAME_TOKEN : 'private',
    innerHTML: '<p>private</p>', text: 'private',
    label: testInfo.project.name === 'chromium' ? process.env.SENTIS_PROBE_NAME_TOKEN : 'unsafe@label',
    expected: testInfo.project.name === 'chromium' ? process.env.SENTIS_PROBE_EMAIL : 'unsafe@example.invalid',
  }]);
  await testInfo.attach('evidence: geometry', { body, contentType: 'application/json' });
  await testInfo.attach('evidence: geometry duplicate', { body, contentType: 'application/json' });
  await testInfo.attach('unprefixed JSON', { body, contentType: 'application/json' });
  expect(false, 'Deliberate privacy probe failure').toBe(true);
});

test('SNTS-9002: simulated reviewed capture is retained', async ({ page }, testInfo) => {
  await page.setContent('<p>Reviewed synthetic geometry only</p>');
  await testInfo.attach('reviewed: safe probe', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('unreviewed safe probe', { body: await page.screenshot(), contentType: 'image/png' });
  expect(false, 'Deliberate reviewed probe failure').toBe(true);
});

for (const attempt of [1, 2]) {
  test(`SNTS-9003: same-second failure ${attempt}`, () => {
    expect(false, 'Deliberate collision probe failure').toBe(true);
  });
}
