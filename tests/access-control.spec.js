const { test, expect } = require('@playwright/test');
const { asRole } = require('./support/roles');

test.describe('Super Admin access', () => {
  asRole(test, 'super-admin');

  test('SNTS-139: super admin reaches the Super Admin dashboard', async ({ page }) => {
    await page.goto('/?admin=super');
    await expect(page.getByRole('heading', {
      name: 'Sentis Super Admin Dashboard', exact: true,
    })).toBeVisible();
    await expect(page.getByRole('navigation', {
      name: 'Admin sections', exact: true,
    })).toBeVisible();
  });
});

test.describe('Client Admin access', () => {
  asRole(test, 'client-admin');

  test('SNTS-139: client admin has no Super Admin navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Log Out', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Super Admin', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Super Admin', exact: true })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Admin sections', exact: true })).toHaveCount(0);

    await page.goto('/?admin=super');
    await expect(page.getByRole('button', { name: 'Log Out', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', {
      name: 'Sentis Super Admin Dashboard', exact: true,
    }), 'Client Admin must not bypass the Super Admin role check through the URL').not.toBeVisible();
  });
});
