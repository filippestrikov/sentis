const { test, expect } = require('@playwright/test');
const { asRole } = require('./support/roles');
const { knownOrganization } = require('./fixtures/super-admin.json');

const exactText = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

test.describe('Super Admin SAM AI', () => {
  asRole(test, 'super-admin');

  test('SNTS-265: switching organizations keeps SAM AI stable', async ({ page }, testInfo) => {
    test.setTimeout(60000);
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

      const comboboxes = page.getByRole('combobox');
      // The custom controls initially render empty while their selected labels load.
      await expect.poll(async () => (await comboboxes.allTextContents())
        .every(text => text.trim().length > 0), {
        message: 'SAM AI combobox selected labels must finish loading',
        timeout: 20000,
      }).toBe(true);

      let organizationSelector;
      let organizations;
      const discoveries = [];
      for (const selectedName of await comboboxes.allTextContents()) {
        // Organization combobox has no accessible name (a11y gap), so it is located by its option content
        const control = page.getByRole('combobox').filter({ hasText: exactText(selectedName) });
        await expect(control).toHaveCount(1);
        await control.click();
        const listbox = page.getByRole('listbox');
        await expect(listbox).toBeVisible();
        await expect(listbox.getByRole('option')).not.toHaveCount(0);
        const options = await listbox.getByRole('option').allTextContents();
        discoveries.push({ selectedName, options });
        if (await listbox.getByRole('option', { name: knownOrganization, exact: true }).count()) {
          expect(organizationSelector, 'Known organization must identify only one combobox').toBeUndefined();
          organizationSelector = control;
          organizations = options;
        }
        await page.keyboard.press('Escape');
        await expect(listbox).toBeHidden();
      }
      await testInfo.attach('Organization selector discovery', {
        body: JSON.stringify(discoveries, null, 2), contentType: 'application/json',
      });
      expect(organizationSelector,
        `Known organization "${knownOrganization}" is not present in any SAM AI combobox`).toBeDefined();
      const distinctOrganizations = [...new Set(organizations)];
      expect(distinctOrganizations.length, 'Blocked: fewer than 2 organizations').toBeGreaterThanOrEqual(2);

      const initialOrganization = await organizationSelector.textContent();
      const targets = distinctOrganizations.filter(name => name !== initialOrganization).slice(0, 3);
      const switchedOrganizations = [];
      for (const organization of targets) {
        await organizationSelector.click();
        const listbox = page.getByRole('listbox');
        await expect(listbox).toBeVisible();
        await listbox.getByRole('option', { name: organization, exact: true }).click();
        await expect(listbox).toBeHidden();
        // Options exist only in a portal while open; re-resolve the same control by its new selection.
        organizationSelector = page.getByRole('combobox').filter({ hasText: exactText(organization) });
        await expect(organizationSelector).toHaveCount(1);
        await expect(organizationSelector).toHaveText(organization);
        await expect(page.getByRole('status').filter({ hasText: 'Updating dashboard data...' }))
          .toBeHidden({ timeout: 20000 });
        await expect(page.getByRole('heading', { name: 'Usage Trend', exact: true })).toBeVisible();
        await expect(page.getByRole('alert').filter({ visible: true })).toHaveCount(0);
        await expect(page.getByText(/application error|something went wrong|failed to load|unexpected error|unable to load/i)
          .filter({ visible: true })).toHaveCount(0);
        switchedOrganizations.push(organization);
      }
      await testInfo.attach('Organization switches', {
        body: JSON.stringify({ initialOrganization, switchedOrganizations, pageErrors }, null, 2),
        contentType: 'application/json',
      });
      await testInfo.attach('SAM AI after organization switches', {
        body: await page.screenshot(), contentType: 'image/png',
      });
    } finally {
      expect.soft(pageErrors, `SAM AI page errors: ${pageErrors.join('\n') || 'none'}`).toEqual([]);
    }
  });
});
