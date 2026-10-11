const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./support/navigation');
const { asRole } = require('./support/roles');

const exactText = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

async function selectContext(page, current, next, identifyingOption) {
  // Both dashboard comboboxes lack accessible names; identify the open control by its options.
  const control = page.getByRole('combobox').filter({ hasText: exactText(current) });
  await expect(control).toHaveCount(1);
  await control.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('option', { name: identifyingOption, exact: true })).toBeVisible();
  await listbox.getByRole('option', { name: next, exact: true }).click();
  await expect(listbox).toBeHidden();
  await expect(page.getByRole('combobox').filter({ hasText: exactText(next) })).toBeVisible();
}

async function restoreDashboard(page) {
  try {
    await page.keyboard.press('Escape');
    // Dashboard selections are not persisted across reloads (lead verified 2026-10-10).
    // Reload also restores the original Manage tab if a report or picker has crashed.
    await gotoApp(page, '/?admin=super');
    await expect(page).toHaveURL(/\?admin=super$/);
    await expect(page.getByRole('heading', { name: 'New Organisation', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox').filter({ hasText: /^Example Customer Org$/ })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('combobox').filter({ hasText: /^Month$/ })).toBeVisible();
  } finally {
    // Manage contains account emails; prevent Playwright's automatic failure snapshot retaining them.
    await page.goto('about:blank');
  }
}

const maskedScreenshot = page => page.screenshot({
  mask: [page.getByRole('textbox'), ...Object.entries(process.env)
    .filter(([name, value]) => /EMAIL|PASSWORD|TOKEN/i.test(name) && value)
    .map(([, value]) => page.getByText(value, { exact: true }))],
});

test.describe('Super Admin dashboard', () => {
  asRole(test, 'super-admin');
  test.setTimeout(120000);

  test('SNTS-138: selecting Custom opens a date picker', async ({ page }, testInfo) => {
    await gotoApp(page, '/?admin=super');
    await expect(page.getByRole('heading', {
      name: 'Sentis Super Admin Dashboard', exact: true,
    })).toBeVisible();
    await expect(page.getByRole('combobox').filter({ hasText: /^Example Customer Org$/ })).toBeVisible({ timeout: 30000 });

    const picker = page.getByRole('dialog').or(page.getByRole('grid'))
      .or(page.getByRole('button', { name: /choose date/i })).filter({ visible: true });
    try {
      await expect(picker).toHaveCount(0);
      await selectContext(page, 'Month', 'Custom', 'Custom');
      // No picker semantics exist on staging yet; accept the ticket's calendar/dialog alternatives.
      await expect.poll(() => picker.count(), {
        message: 'Selecting Custom must display a calendar/date picker', timeout: 10000,
      }).toBeGreaterThan(0);
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
    } catch (error) {
      await testInfo.attach('reviewed: Custom range before context restoration', {
        body: await maskedScreenshot(page), contentType: 'image/png',
      });
      throw error;
    } finally {
      await restoreDashboard(page);
    }
  });

  test('SNTS-221: the Overall Rating Observation icon renders correctly', async ({ page }, testInfo) => {
    let evidenceIcons;
    let evidenceOrganization = 'Example Customer Org';
    await gotoApp(page, '/?admin=super');
    await expect(page.getByRole('heading', {
      name: 'Sentis Super Admin Dashboard', exact: true,
    })).toBeVisible();
    await expect(page.getByRole('combobox').filter({ hasText: /^Example Customer Org$/ })).toBeVisible({ timeout: 30000 });

    try {
      await page.getByRole('navigation', { name: 'Admin sections', exact: true })
        .getByRole('button', { name: 'PST Reports', exact: true }).click();
      await expect(page).toHaveURL(/[?&]tab=observations(?:&|$)/);
      await expect(page.getByRole('heading', {
        name: 'Overall Rating for Effectiveness', exact: true,
      })).toBeVisible();
      await selectContext(page, 'Month', 'Year', 'Custom');

      const legends = page.getByRole('tabpanel').getByRole('listitem')
        .filter({ has: page.getByText('Observations', { exact: true }) });
      const overallIcons = () => legends.evaluateAll(items => items.flatMap(item => {
        // The chart cards have no region names/test IDs. Scope by their heading without CSS/XPath.
        let card = item.parentElement;
        while (card && !card.getElementsByTagName('h4').length) card = card.parentElement;
        const headings = card ? Array.from(card.getElementsByTagName('h4')) : [];
        if (headings.length !== 1 || headings[0].textContent !== 'Overall Rating for Effectiveness') return [];
        return Array.from(item.getElementsByTagName('svg')).map(icon => {
          const rect = icon.getBoundingClientRect();
          let visible = rect.width > 0 && rect.height > 0;
          for (let node = icon; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            visible = visible && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          }
          return { visible, width: rect.width, height: rect.height };
        });
      }));
      evidenceIcons = overallIcons;

      let currentOrganization = 'Example Customer Org';
      let hasObservations = false;
      for (const organization of ['Sentis', 'Downer']) {
        const report = page.waitForResponse(response => /\/v1\/reporting\/organizations\/[^/]+\/prestart-report/.test(response.url()));
        await selectContext(page, currentOrganization, organization, 'Example Customer Org');
        await report;
        await expect(page.getByRole('status').filter({ hasText: 'Updating dashboard data...' }))
          .toBeHidden({ timeout: 30000 });
        await expect(page.getByRole('heading', {
          name: 'Overall Rating for Effectiveness', exact: true,
        })).toBeVisible();
        currentOrganization = organization;
        evidenceOrganization = organization;
        if (await legends.count()) {
          hasObservations = true;
          break;
        }
      }
      test.skip(!hasObservations,
        'Missing fixture: neither Sentis nor Downer has a rendered observation diagram within the Year range');
      await expect.poll(overallIcons, {
        message: 'Overall Rating Observation SVG must be visible with a non-zero size',
      }).toEqual([{ visible: true, width: expect.any(Number), height: expect.any(Number) }]);
      const [icon] = await overallIcons();
      expect(icon.width).toBeGreaterThan(0);
      expect(icon.height).toBeGreaterThan(0);
      await testInfo.attach('Overall Rating Observation icon', {
        body: await page.getByRole('tabpanel').screenshot(), contentType: 'image/png',
      });
    } catch (error) {
      try {
        const icons = evidenceIcons ? await evidenceIcons() : [];
        const icon = icons[0];
        await testInfo.attach('evidence: observation icon', {
          body: JSON.stringify({
            section: 'Overall Rating for Effectiveness', label: evidenceOrganization,
            control: 'Observation legend icon', expected: 'visible, non-zero size',
            actual: icon ? (icon.visible ? 'visible' : 'hidden') : 'missing',
            ...(icon ? { width: icon.width, height: icon.height } : {}),
          }), contentType: 'application/json',
        });
      } catch { /* Evidence must not mask the original failure. */ }
      await testInfo.attach('Observation diagram before context restoration', {
        body: await maskedScreenshot(page), contentType: 'image/png',
      });
      throw error;
    } finally {
      await restoreDashboard(page);
    }
  });
});
