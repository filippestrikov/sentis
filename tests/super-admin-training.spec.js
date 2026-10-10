const { test, expect, devices } = require('@playwright/test');
const { gotoApp } = require('./support/navigation');
const { asRole } = require('./support/roles');
const { expectDialogLayout } = require('./support/layout');

const { defaultBrowserType, ...iPhone } = devices['iPhone 15 Pro Max'];

test.describe('Super Admin training dialog on mobile', () => {
  test.use(iPhone);
  asRole(test, 'super-admin');

  test('SNTS-205: new training module dialog fits on mobile without overlapping controls', async ({ page }, testInfo) => {
    await gotoApp(page, '/?admin=super');
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
      if (testInfo.errors.length) await testInfo.attach('reviewed: SNTS-205 open dialog failure', {
        body: await page.screenshot(), contentType: 'image/png',
      });
    } finally {
      try {
        if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dialog).toBeHidden();
      } finally {
        await gotoApp(page, initialUrl);
        await expect(page).toHaveURL(initialUrl);
        await expect(navigation).toBeVisible();
      }
    }
  });

  test('SNTS-209: edit training module dialog fits on mobile without overlapping controls', async ({ page }, testInfo) => {
    await gotoApp(page, '/?admin=super');
    const navigation = page.getByRole('navigation', { name: 'Admin sections', exact: true });
    await expect(navigation).toBeVisible();
    const initialUrl = page.url();
    const dialog = page.getByRole('dialog', { name: 'Edit Training Module', exact: true });
    try {
      await navigation.getByRole('button', { name: 'Training', exact: true }).click();
      await expect(page).toHaveURL(/[?&]tab=modules(?:&|$)/);
      await expect(page.getByRole('button', { name: 'New Module', exact: true })).toBeVisible();
      const edit = page.getByRole('button', { name: 'Edit', exact: true }).first();
      const hasModule = await edit.waitFor({ state: 'visible', timeout: 20000 }).then(() => true, error => {
        if (error.name !== 'TimeoutError') throw error;
        return false;
      });
      test.skip(!hasModule, 'Missing existing training module fixture for SNTS-209');
      await expect(edit).toBeVisible();
      await edit.click();
      await expect(dialog).toBeVisible();
      await expectDialogLayout(page, dialog, {
        heading: dialog.getByRole('heading', { name: 'Edit Training Module', exact: true }),
        label: 'SNTS-209 mobile training dialog',
      });
      if (testInfo.errors.length) await testInfo.attach('reviewed: SNTS-209 open dialog failure', {
        body: await page.screenshot({ mask: [page.getByRole('table', { includeHidden: true })] }), contentType: 'image/png',
      });
    } catch (error) {
      if (!testInfo.annotations.some(annotation => annotation.type === 'skip')) await testInfo.attach('reviewed: Edit Training Module failure', {
        body: await page.screenshot({ mask: [page.getByRole('table', { includeHidden: true })] }), contentType: 'image/png',
      });
      throw error;
    } finally {
      try {
        if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dialog).toBeHidden();
      } finally {
        await gotoApp(page, initialUrl);
        await expect(page).toHaveURL(initialUrl);
        await expect(navigation).toBeVisible();
      }
    }
  });
});
