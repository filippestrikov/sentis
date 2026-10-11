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
      await testInfo.attach('reviewed: Development guide title failure', {
        body: await page.screenshot(), contentType: 'image/png',
      });
      throw error;
    } finally {
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  });
});

// launchOptions is a worker fixture: extend only this test instead of changing the existing tests.
const attachmentTest = test.extend({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

attachmentTest.describe('Pre-start Observation attachments on mobile', () => {
  const { defaultBrowserType, ...iPhone } = devices['iPhone 15 Pro Max'];
  attachmentTest.use({
    ...iPhone,
    permissions: ['camera'],
  });
  asRole(attachmentTest, 'client-admin');

  attachmentTest('SNTS-171: a photo added to a pre-start observation can be removed before submitting', async ({ page }, testInfo) => {
    attachmentTest.setTimeout(60000);
    const blockedMethods = [];
    const states = [];
    let expectedAttachment = false;
    // Guard against accidental persistence; use the real app without faking its data.
    await page.route('**/*', async route => {
      const method = route.request().method();
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.continue();
      blockedMethods.push(method);
      await route.abort();
    });
    const dialog = page.getByRole('dialog');
    const photo = page.getByRole('button', { name: 'Photo', exact: true });
    const addedPhoto = page.getByRole('button', { name: /^Photo\s*\(1\/5\)$/ });
    const photos = page.getByText('Photos (1)', { exact: true });
    try {
      await gotoApp(page, '/?view=prestart-observation');
      await expect(page.getByRole('heading', { name: 'Meeting Details', exact: true })).toBeVisible();
      await expect(page.getByText('Media Attachments', { exact: true })).toBeVisible();
      await photo.click();
      await expect(dialog).toBeVisible();
      // Selector exception: camera controls have no accessible names, only their Lucide SVGs.
      const shutter = dialog.getByRole('button', { name: '', exact: true })
        .filter({ has: page.locator('svg.lucide-camera') });
      const close = dialog.getByRole('button', { name: '', exact: true })
        .filter({ has: page.locator('svg.lucide-x') });
      await expect(shutter).toHaveCount(1);
      expectedAttachment = true;
      await shutter.click();
      await close.click();
      await expect(dialog).toBeHidden();
      await expect(addedPhoto).toBeVisible();
      await expect(photos).toBeVisible();
      states.push({ control: 'Photo attachment', label: 'After capture', expected: true, actual: await photos.isVisible() });

      // Selector exception: the attachment remove control is unnamed. Once the camera is closed,
      // the page has exactly one button containing lucide-x, as verified by lead discovery.
      const remove = page.getByRole('button', { name: '', exact: true })
        .filter({ has: page.locator('svg.lucide-x') });
      await expect(remove).toHaveCount(1);
      expectedAttachment = false;
      await remove.click();
      await expect(photos).toBeHidden();
      await expect(photo).toBeVisible();
      states.push({ control: 'Photo attachment', label: 'After removal', expected: false, actual: await photos.isVisible() });
      expect(blockedMethods, 'No attempted network writes before submitting').toEqual([]);
    } catch (error) {
      await testInfo.attach('evidence: attachment state', {
        body: JSON.stringify([
          ...states,
          { control: 'Photos (1)', label: 'At failure', expected: expectedAttachment, actual: await photos.isVisible().catch(() => false) },
          { control: 'Photo', label: 'At failure', expected: !expectedAttachment, actual: await photo.isVisible().catch(() => false) },
          { control: 'Network writes', expected: 0, actual: blockedMethods.length },
        ]),
        contentType: 'application/json',
      });
      throw error;
    } finally {
      await page.goto('about:blank');
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
      if (testInfo.errors.length) await testInfo.attach('reviewed: SNTS-167 open dialog failure', {
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
