const { test, expect } = require('@playwright/test');
const { asRole } = require('./support/roles');
const { developmentGuideTitle } = require('./fixtures/pre-start-observation.json');

test.describe('Pre-start Observation', () => {
  asRole(test, 'client-admin');

  test('SNTS-242: development guide modal is titled Pre-start Development Guide', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New Observation', exact: true }).click();
    await expect(page).toHaveURL(/[?&]view=prestart-observation(?:&|$)/);
    await expect(page.getByRole('heading', {
      name: 'Pre-Start Observation Tool', exact: true,
    })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Meeting Details', exact: true })).toBeVisible();

    await page.getByRole('button', { name: /development guide|competency framework/i }).click();
    const dialog = page.getByRole('dialog', { name: /development guide|competency framework/i });
    await expect(dialog).toBeVisible();
    try {
      await expect(dialog.getByRole('heading', {
        name: /development guide|competency framework/i, level: 2,
      })).toHaveText(developmentGuideTitle);
    } catch (error) {
      // Preserve the open dialog before cleanup closes it on a title failure.
      await testInfo.attach('Development guide title failure', {
        body: await page.screenshot(), contentType: 'image/png',
      });
      throw error;
    } finally {
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  });
});
