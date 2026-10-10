const { test, expect } = require('@playwright/test');
const { asRole } = require('./support/roles');
const { expectDialogLayout, textBox } = require('./support/layout');

test.describe('Client Admin invite dialog layout', () => {
  asRole(test, 'client-admin');
  test.use({ viewport: { width: 1366, height: 768 } });

  test('SNTS-140: invite dialog Close avoids the subheading on desktop and mobile', async ({ page }, testInfo) => {
    await page.goto('/?admin=client&tab=modules');
    const navigation = page.getByRole('navigation', { name: 'Admin sections', exact: true });
    await expect(navigation).toBeVisible();
    const initialUrl = page.url();
    const initialViewport = page.viewportSize();
    const dialog = page.getByRole('dialog', { name: 'Invite Tenant User', exact: true });
    try {
      await navigation.getByRole('button', { name: 'Inspect Users', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Invite Team Leader', exact: true })).toBeVisible();
      for (const [label, viewport] of [
        ['SNTS-140 desktop 1366x768', initialViewport],
        ['SNTS-140 mobile 430x932', { width: 430, height: 932 }],
      ]) {
        await page.setViewportSize(viewport);
        expect(page.viewportSize(), `${label}: viewport is applied`).toEqual(viewport);
        await page.getByRole('button', { name: 'Invite Team Leader', exact: true }).click();
        await expect(dialog).toBeVisible();
        try {
          const errorsBefore = testInfo.errors.length;
          await expectDialogLayout(page, dialog, {
            heading: dialog.getByRole('heading', { name: 'Invite Tenant User', exact: true }), label,
          });
          // The introductory subheading includes the selected organization's name.
          const subheading = dialog.getByRole('paragraph').filter({ hasText: /^Invite a user into / });
          await expect.soft(subheading, `${label}: invite subheading is visible`).toBeVisible();
          const subheadingBox = await textBox(subheading);
          const closeBox = await dialog.getByRole('button', { name: 'Close', exact: true }).boundingBox();
          expect.soft(subheadingBox, `${label}: subheading has a measurable box`).not.toBeNull();
          expect.soft(closeBox, `${label}: Close has a measurable box`).not.toBeNull();
          if (subheadingBox && closeBox) {
            const intersects = closeBox.x < subheadingBox.x + subheadingBox.width
              && closeBox.x + closeBox.width > subheadingBox.x
              && closeBox.y < subheadingBox.y + subheadingBox.height
              && closeBox.y + closeBox.height > subheadingBox.y;
            expect.soft(intersects, `${label}: Close button does not overlap subheading`).toBe(false);
          }
          if (testInfo.errors.length > errorsBefore) await testInfo.attach(`${label} open dialog failure`, {
            body: await page.screenshot(), contentType: 'image/png',
          });
        } finally {
          if (await dialog.isVisible()) await page.keyboard.press('Escape');
          await expect(dialog).toBeHidden();
        }
      }
    } finally {
      try {
        if (await dialog.isVisible()) await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      } finally {
        await page.setViewportSize(initialViewport);
        expect(page.viewportSize(), 'Initial viewport is restored').toEqual(initialViewport);
        await page.goto(initialUrl);
        await expect(page).toHaveURL(initialUrl);
        await expect(navigation.getByRole('button', { name: 'Training', exact: true })).toBeVisible();
      }
    }
  });
});
