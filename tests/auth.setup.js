const { test: setup, expect } = require('@playwright/test');
const { roles, credentials, storageStatePath } = require('./support/roles');

for (const [role, { superAdminPortal }] of Object.entries(roles)) {
  setup(`sign in as ${role}`, async ({ page }) => {
    const { email, password, missing } = credentials(role);
    setup.skip(!email || !password, `Set ${missing} to sign in as ${role}`);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Sentis Applied Minds' })).toBeVisible();

    if (superAdminPortal) {
      await page.getByRole('button', { name: 'Super Admin' }).click();
      const dialog = page.getByRole('dialog', { name: 'Sentis Super Admin' });
      await expect(dialog).toBeVisible();
      // The dialog's inputs have no labels, so their placeholders are their accessible names.
      await dialog.getByRole('textbox', { name: 'admin@sentis.com' }).fill(email);
      await dialog.getByRole('textbox', { name: '••••••••' }).fill(password);
      await dialog.getByRole('button', { name: 'Login' }).click();
      await expect(dialog).toBeHidden();
    } else {
      await page.getByRole('textbox', { name: 'Email' }).fill(email);
      await page.getByRole('textbox', { name: 'Password' }).fill(password);
      await page.getByRole('button', { name: 'Sign In' }).click();
    }

    if (superAdminPortal) {
      await expect(page).toHaveURL(/[?&]admin=super/);
      await expect(page.getByRole('heading', {
        name: 'Sentis Super Admin Dashboard', exact: true, level: 1,
      })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Log Out', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', {
        name: 'Welcome to Sentis Applied Minds', exact: true,
      })).toBeHidden();
    }
    await page.context().storageState({ path: storageStatePath(role) });
  });
}
