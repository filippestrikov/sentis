const { test, expect, devices } = require('@playwright/test');
const { gotoApp } = require('./support/navigation');
const { asRole } = require('./support/roles');

const { defaultBrowserType, ...iPhone } = devices['iPhone 15 Pro Max'];

test.describe('SAM AI Coach on mobile Chromium', () => {
  test.use(iPhone);
  asRole(test, 'client-admin');

  test('SNTS-251: SAM AI Coach can be closed and its input is usable on mobile', async ({ page }, testInfo) => {
    const nonGet = [];
    const record = request => { if (request.method() !== 'GET') nonGet.push(request.method()); };
    page.on('request', record);
    const dialog = page.getByRole('dialog', { name: 'SAM AI Coach', exact: true });
    const open = page.getByRole('button', { name: 'Open SAM AI Coach', exact: true });
    const close = dialog.getByRole('button', { name: 'Close SAM AI Coach', exact: true });
    const input = dialog.getByRole('textbox');
    const measurements = [];
    const withinViewport = async (locator, control) => {
      const box = await locator.boundingBox();
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      const actual = Boolean(box && box.x >= 0 && box.y >= 0
        && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
      measurements.push({ label: 'iPhone 15 Pro Max', control, ...box,
        viewportWidth: viewport.width, viewportHeight: viewport.height, expected: true, actual });
      expect.soft(actual, `${control}: fully inside mobile viewport`).toBe(true);
    };
    let failed = false;
    try {
      await gotoApp(page, '/');
      await expect(open).toBeVisible();
      await open.click();
      await expect(dialog).toBeVisible();
      await dialog.evaluate(element => Promise.all(element.getAnimations({ subtree: true })
        .map(animation => animation.finished.catch(() => {}))));
      await withinViewport(dialog, 'SAM AI Coach');
      await expect(close).toBeVisible();
      await expect(close).toBeEnabled();
      await withinViewport(close, 'Close SAM AI Coach');
      await expect(input).toHaveCount(1);
      await expect(input).toBeVisible();
      await withinViewport(input, 'textbox');
      await expect(input).toBeEditable();
      await input.fill('QA-auto-codex draft');
      await expect(input).toHaveValue('QA-auto-codex draft');
      await input.fill('');
      await expect(input).toHaveValue('');
      expect(nonGet.length, 'No non-GET requests while opening and editing the draft').toBe(0);
      await close.click();
      await expect(dialog).toBeHidden();
      await expect(open).toBeVisible();
      expect(nonGet.length, 'No non-GET requests through closing the coach').toBe(0);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      try {
        if (await dialog.isVisible()) {
          if (await input.count()) {
            await input.fill('');
            await expect(input).toHaveValue('');
          }
          await close.click();
        }
        await expect(dialog).toBeHidden();
        await expect(open).toBeVisible();
        if (failed || testInfo.errors.length) await testInfo.attach('evidence: coach controls', {
          body: JSON.stringify([
            ...measurements, { label: 'iPhone 15 Pro Max', control: 'non-GET requests', expected: 0, actual: nonGet.length },
          ]), contentType: 'application/json',
        });
      } finally {
        page.off('request', record);
      }
    }
  });
});
