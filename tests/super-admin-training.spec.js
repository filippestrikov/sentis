const { test, expect, devices } = require('@playwright/test');
const { asRole } = require('./support/roles');
const { expectDialogLayout } = require('./support/layout');

const { defaultBrowserType, ...iPhone } = devices['iPhone 15 Pro Max'];

test.describe('Super Admin training dialog on mobile', () => {
  test.use(iPhone);
  asRole(test, 'super-admin');

  test('SNTS-205: new training module dialog fits on mobile without overlapping controls', async ({ page }, testInfo) => {
    await page.goto('/?admin=super');
    const navigation = page.getByRole('navigation', { name: 'Admin sections', exact: true });
    await expect(navigation).toBeVisible();
    const initialUrl = page.url();
    const dialog = page.getByRole('dialog', { name: 'New Training Module', exact: true });
    try {
      await navigation.getByRole('button', { name: 'Training', exact: true }).click();
      await expect(page).toHaveURL(/[?&]tab=modules(?:&|$)/);
      await expect(page.getByRole('button', { name: 'New Module', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'New Module', exact: true }).click();
      await expect(dialog).toBeVisible();
      await expectDialogLayout(page, dialog, {
        heading: dialog.getByRole('heading', { name: 'New Training Module', exact: true }),
        label: 'SNTS-205 mobile training dialog',
      });
      if (testInfo.errors.length) await testInfo.attach('SNTS-205 open dialog failure', {
        body: await page.screenshot(), contentType: 'image/png',
      });
    } finally {
      try {
        if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dialog).toBeHidden();
      } finally {
        await page.goto(initialUrl);
        await expect(page).toHaveURL(initialUrl);
        await expect(navigation).toBeVisible();
      }
    }
  });
});
