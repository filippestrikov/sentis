const { test, expect, devices } = require('@playwright/test');
const { gotoApp } = require('./support/navigation');
const { asRole } = require('./support/roles');
const { expectDialogLayout } = require('./support/layout');
const { developmentGuideTitle } = require('./fixtures/pre-start-observation.json');

test.describe('Pre-start Observation', () => {
  asRole(test, 'client-admin');

  test('SNTS-242: development guide modal is titled Pre-start Development Guide', async ({ page }, testInfo) => {
    await gotoApp(page, '/');
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

const { defaultBrowserType, ...iPhone } = devices['iPhone 15 Pro Max'];

test.describe('Pre-start Observation guide layout on mobile', () => {
  test.use(iPhone);
  asRole(test, 'client-admin');

  test('SNTS-167: development guide header fits on mobile without Close overlap', async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await gotoApp(page, '/');
    // The mobile menu has no accessible name; it is the homepage's only unnamed button.
    const menu = page.getByRole('button', { name: '', exact: true });
    await expect(menu).toHaveCount(1);
    await expect(menu).toBeVisible();
    const initialUrl = page.url();
    const sidebar = page.getByRole('dialog', { name: 'Navigation', exact: true });
    const dialog = page.getByRole('dialog', { name: /development guide|competency framework/i });
    try {
      await menu.click();
      await expect(sidebar).toBeVisible();
      await sidebar.getByRole('button', { name: 'New Observation', exact: true }).click();
      await expect(page).toHaveURL(/[?&]view=prestart-observation(?:&|$)/);
      // Navigation remains open after selecting a destination on mobile.
      await page.keyboard.press('Escape');
      await expect(sidebar).toBeHidden();
      await expect(page.getByRole('heading', { name: 'Meeting Details', exact: true })).toBeVisible();
      await page.getByRole('button', { name: /development guide|competency framework/i }).click();
      await expect(dialog).toBeVisible();
      await expectDialogLayout(page, dialog, {
        heading: dialog.getByRole('heading', { name: /development guide|competency framework/i, level: 2 }),
        label: 'SNTS-167 mobile guide dialog',
      });
      if (testInfo.errors.length) await testInfo.attach('SNTS-167 open dialog failure', {
        body: await page.screenshot(), contentType: 'image/png',
      });
    } finally {
      try {
        if (await dialog.isVisible()) await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      } finally {
        await gotoApp(page, initialUrl);
        await expect(page).toHaveURL(initialUrl);
        await expect(sidebar).toBeHidden();
        await expect(menu).toHaveCount(1);
        await expect(menu).toBeVisible();
      }
    }
  });
});
