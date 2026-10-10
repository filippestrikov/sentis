const { test, expect } = require('@playwright/test');
const { asRole } = require('./support/roles');

test.describe('Super Admin SAM AI', () => {
  asRole(test, 'super-admin');

  test('SNTS-265: switching organizations keeps SAM AI stable', async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    try {
      await page.goto('/?admin=super');
      await expect(page.getByRole('heading', {
        name: 'Sentis Super Admin Dashboard', exact: true,
      })).toBeVisible();

      const navigation = page.getByRole('navigation', { name: 'Admin sections', exact: true });
      await expect(navigation).toBeVisible();
      await navigation.getByRole('button', { name: 'SAM AI', exact: true }).click();
      await expect(page).toHaveURL(/[?&]tab=cortex(?:&|$)/);
      await expect(page.getByRole('heading', { name: 'Usage Trend', exact: true })).toBeVisible();

      // Discovery on 2026-10-10 found no accessible organization label, even after
      // the empty combobox loaded Example Customer Org. Do not select a control by position.
      await testInfo.attach('SAM AI selector discovery', {
        body: await page.screenshot(), contentType: 'image/png',
      });
      test.skip(true, 'BLOCKED SNTS-265: missing accessible organization-selector fixture; '
        + 'the SAM AI organization selector has no accessible name '
        + 'or associated label (no aria-label, aria-labelledby, id, or associated label). '
        + 'Organization switching cannot be implemented with the required named role selectors. '
        + 'Provide an accessible organization label before completing this scenario.');
    } finally {
      expect.soft(pageErrors, `SAM AI page errors: ${pageErrors.join('\n') || 'none'}`).toEqual([]);
    }
  });
});
