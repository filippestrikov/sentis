const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./support/navigation');
const { asRole } = require('./support/roles');
const { knownOrganization } = require('./fixtures/super-admin.json');

const exactText = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

test.describe('Super Admin SAM AI', () => {
  asRole(test, 'super-admin');

  test('SNTS-265: switching organizations keeps SAM AI stable', async ({ page }, testInfo) => {
    test.setTimeout(240000); // visits every organization; each switch reloads dashboard data
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let organizationSelector;
    let initialOrganization;

    try {
      await gotoApp(page, '/?admin=super');
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

      initialOrganization = await organizationSelector.textContent();
      // Every organization is checked: on 2026-10-10 only some (not the first few) crashed SAM AI.
      const targets = distinctOrganizations.filter(name => name !== initialOrganization);
      const crashHeading = page.getByRole('heading', { name: 'Oops! Something went wrong', exact: true });
      const switchedOrganizations = [];
      const crashedOrganizations = [];
      const recordCrashAndRecover = async organization => {
        crashedOrganizations.push(organization);
        await testInfo.attach(`SAM AI crash: ${organization}`, { body: await page.screenshot(), contentType: 'image/png' });
        // Recover so the remaining organizations are still checked; selection resets to the default on reload.
        await gotoApp(page, '/?admin=super&tab=cortex');
        await expect(page.getByRole('heading', { name: 'Usage Trend', exact: true })).toBeVisible({ timeout: 20000 });
        organizationSelector = page.getByRole('combobox').filter({ hasText: exactText(initialOrganization) });
        await expect(organizationSelector).toHaveCount(1, { timeout: 20000 });
      };
      for (const organization of targets) {
        await organizationSelector.click();
        const listbox = page.getByRole('listbox');
        await expect(listbox).toBeVisible();
        // The previous view stays visible while the new organization's data loads, and the crash renders only
        // after that data arrives. Observe (never mock) the organization's report responses, then let React render.
        const reports = ['ai-report', 'prestart-report', 'risk-assessment-report'].map(report => page.waitForResponse(
          response => new RegExp(`/v1/reporting/organizations/[^/]+/${report}`).test(response.url()), { timeout: 30000 }));
        await listbox.getByRole('option', { name: organization, exact: true }).click();
        await expect(listbox).toBeHidden();
        await Promise.all(reports);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (await crashHeading.isVisible()) {
          await recordCrashAndRecover(organization);
          continue;
        }
        // Options exist only in a portal while open; re-resolve the same control by its new selection.
        organizationSelector = page.getByRole('combobox').filter({ hasText: exactText(organization) });
        await expect(organizationSelector.or(crashHeading).first()).toBeVisible();
        if (!(await crashHeading.isVisible())) {
          await expect(organizationSelector).toHaveText(organization);
          await expect(page.getByRole('status').filter({ hasText: 'Updating dashboard data...' }))
            .toBeHidden({ timeout: 20000 });
          await expect.soft(page.getByRole('alert').filter({ visible: true }), `No alert for ${organization}`).toHaveCount(0);
        }
        // Some organizations render the error screen a little later; check again before moving on.
        if (await crashHeading.isVisible()) {
          await recordCrashAndRecover(organization);
          continue;
        }
        switchedOrganizations.push(organization);
      }
      await testInfo.attach('Organization switches', {
        body: JSON.stringify({ initialOrganization, switchedOrganizations, crashedOrganizations, pageErrors }, null, 2),
        contentType: 'application/json',
      });
      expect(crashedOrganizations, 'Organizations whose SAM AI view crashed after switching').toEqual([]);
    } finally {
      // The super-admin account is shared, so leave its selected organization as we found it.
      // Selection is not persisted (verified 2026-10-10), so a reload restores the default when the app crashed.
      if (initialOrganization) {
        const crashed = await page.getByRole('heading', { name: 'Oops! Something went wrong', exact: true }).isVisible();
        const current = crashed ? null : await page.getByRole('combobox').first().textContent();
        if (crashed || current !== initialOrganization) {
          if (crashed) {
            await gotoApp(page, '/?admin=super&tab=cortex');
          } else {
            await page.getByRole('combobox').filter({ hasText: exactText(current) }).click();
            await page.getByRole('listbox').getByRole('option', { name: initialOrganization, exact: true }).click();
          }
        }
        await expect.soft(page.getByRole('combobox').filter({ hasText: exactText(initialOrganization) }),
          'Initial organization is restored').toHaveCount(1, { timeout: 20000 });
      }
      expect.soft(pageErrors, `SAM AI page errors: ${pageErrors.join('\n') || 'none'}`).toEqual([]);
    }
  });
});
