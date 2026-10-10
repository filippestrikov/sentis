const { test, expect, devices } = require('@playwright/test');
const { gotoApp } = require('./support/navigation');
const { asRole } = require('./support/roles');
const { expectDialogLayout } = require('./support/layout');

const { defaultBrowserType, ...iPhone } = devices['iPhone 15 Pro Max'];

async function viewportBounds(page, locator) {
  const box = await locator.boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  return {
    box,
    viewport,
    withinViewport: Boolean(box && box.x >= 0 && box.y >= 0
      && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height),
  };
}

async function preserveFailure(page, testInfo) {
  await testInfo.attach('Mobile failure before context restoration', {
    body: await page.screenshot(), contentType: 'image/png',
  });
}

test.describe('Client Admin on mobile Chromium', () => {
  test.use(iPhone);
  asRole(test, 'client-admin');

  test('SNTS-197: Log Out is accessible inside the mobile homepage sidebar', async ({ page }, testInfo) => {
    await gotoApp(page, '/');
    // Mobile menu button has no accessible name (a11y gap), so it is located by its icon
    const menu = page.getByRole('button').filter({ has: page.locator('svg.lucide-menu') });
    const sidebar = page.getByRole('dialog', { name: 'Navigation', exact: true });
    const logout = sidebar.getByRole('button', { name: 'Log Out', exact: true });
    await expect(menu).toHaveCount(1);
    await expect(sidebar).toBeHidden();
    try {
      await menu.click();
      await expect(sidebar).toBeVisible();
      await expect(sidebar).toBeInViewport();
      await expect(logout).toBeVisible();
      const sidebarScrolls = await logout.evaluate(element => {
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowY)
            && parent.scrollHeight > parent.clientHeight) return true;
          if (parent.getAttribute('role') === 'dialog') break;
        }
        return false;
      });
      // The sidebar has its own scroll container; do not scroll the homepage to reveal Log Out.
      if (sidebarScrolls) await logout.scrollIntoViewIfNeeded();
      await expect(logout).toBeVisible();
      await expect(logout).toBeEnabled();
      await expect.poll(() => viewportBounds(page, logout), {
        message: 'Log Out lies fully inside the mobile viewport',
      }).toMatchObject({ withinViewport: true });
    } catch (error) {
      await preserveFailure(page, testInfo);
      throw error;
    } finally {
      if (await sidebar.isVisible()) await sidebar.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(sidebar).toBeHidden();
      await expect(menu).toBeVisible();
    }
  });

  test('SNTS-176: the custom date range calendar fits inside the mobile viewport', async ({ page }, testInfo) => {
    await gotoApp(page, '/?admin=client&tab=modules');
    await expect(page.getByRole('heading', { name: /Admin Dashboard$/, level: 1 })).toBeVisible();
    const range = page.getByRole('combobox');
    const calendar = page.getByRole('dialog', { name: '', exact: true });
    await expect(range).toHaveCount(1);
    await expect(range).toHaveText('Last 7 Days');
    try {
      await range.click();
      await expect(page.getByRole('listbox')).toBeVisible();
      await page.getByRole('option', { name: 'Custom', exact: true }).click();
      await expect(range).toHaveText('Custom');
      const pickDates = page.getByRole('button', { name: 'Pick dates', exact: true });
      await expect(pickDates).toBeVisible();
      await pickDates.click();
      await expect(calendar).toBeVisible();
      for (const name of ['Go to previous month', 'Go to next month']) {
        const controls = calendar.getByRole('button', { name, exact: true });
        expect(await controls.count(), `${name} controls exist`).toBeGreaterThan(0);
        for (const control of await controls.all()) await expect(control).toBeVisible();
      }
      await expect.poll(() => viewportBounds(page, calendar), {
        message: 'The complete custom date range calendar lies inside the mobile viewport',
      }).toMatchObject({ withinViewport: true });
    } catch (error) {
      await preserveFailure(page, testInfo);
      throw error;
    } finally {
      if (await calendar.isVisible()) await page.keyboard.press('Escape');
      await expect(calendar).toBeHidden();
      if ((await range.textContent()) !== 'Last 7 Days') {
        await range.click();
        await expect(page.getByRole('listbox')).toBeVisible();
        await page.getByRole('option', { name: 'Last 7 Days', exact: true }).click();
      }
      await expect(range).toHaveText('Last 7 Days');
    }
  });

  test('SNTS-182: switching from Training to Guides scrolls the content to the top', async ({ page }, testInfo) => {
    await gotoApp(page, '/?admin=client&tab=modules');
    await expect(page.getByRole('heading', { name: /Admin Dashboard$/, level: 1 })).toBeVisible();
    const sections = page.getByRole('navigation', { name: 'Admin sections', exact: true });
    const training = sections.getByRole('button', { name: 'Training', exact: true });
    const guides = sections.getByRole('button', { name: 'Guides', exact: true });
    const panel = page.getByRole('tabpanel');
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/[?&]tab=modules(?:&|$)/);
    // Discover the actual scroll owner from the content, without depending on layout classes.
    const scrollOwner = await panel.evaluateHandle(element => {
      for (let parent = element; parent; parent = parent.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowY)
          && parent.scrollHeight > parent.clientHeight) return parent;
      }
      return document.scrollingElement;
    });
    try {
      const availableScroll = await scrollOwner.evaluate(element => element.scrollHeight - element.clientHeight);
      test.skip(availableScroll < 300, 'Missing scrollable Training content fixture (at least 300px of overflow)');
      await scrollOwner.evaluate(element => { element.scrollTop = Math.min(600, element.scrollHeight - element.clientHeight); });
      await expect.poll(() => scrollOwner.evaluate(element => element.scrollTop), {
        message: 'Training content is scrolled well down before switching sections',
      }).toBeGreaterThanOrEqual(300);
      await guides.click();
      await expect(page).toHaveURL(/[?&]tab=toolkits(?:&|$)/);
      await expect(panel).toBeVisible();
      // Keep observing the same scroll owner so a detached, replaced element cannot give a false zero.
      await expect.poll(() => scrollOwner.evaluate(element => ({
        connected: element.isConnected, scrollTop: element.scrollTop,
      })), { message: 'Guides content automatically scrolls to the top' })
        .toEqual({ connected: true, scrollTop: 0 });
    } catch (error) {
      if (!testInfo.annotations.some(annotation => annotation.type === 'skip')) await preserveFailure(page, testInfo);
      throw error;
    } finally {
      await training.click();
      await expect(page).toHaveURL(/[?&]tab=modules(?:&|$)/);
      await expect(panel).toBeVisible();
      await expect(training).toBeVisible();
      await scrollOwner.dispose();
    }
  });

  test('SNTS-183: user invitation dialog fits on mobile with every control reachable', async ({ page }, testInfo) => {
    await gotoApp(page, '/?admin=client&tab=modules');
    const navigation = page.getByRole('navigation', { name: 'Admin sections', exact: true });
    await expect(navigation).toBeVisible();
    const initialUrl = page.url();
    const dialog = page.getByRole('dialog', { name: 'Invite Tenant User', exact: true });
    const screenshot = async label => testInfo.attach(label, {
      body: await page.screenshot({ mask: [page.getByRole('table', { includeHidden: true })] }),
      contentType: 'image/png',
    });
    try {
      await navigation.getByRole('button', { name: 'Inspect Users', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Invite Team Leader', exact: true })).toBeVisible();
      // Read-only discovery found only Invite Team Leader; discover again to include future invite entry points.
      const invitations = page.getByRole('button', { name: /^Invite\b/ });
      const names = [];
      for (const button of await invitations.all()) {
        if (await button.isVisible()) {
          const snapshot = await button.ariaSnapshot();
          names.push(snapshot.match(/^- button "([^"]+)"/)[1]);
        }
      }
      await testInfo.attach('Invitation entry points', {
        body: JSON.stringify(names), contentType: 'application/json',
      });
      for (const name of names) {
        await page.getByRole('button', { name, exact: true }).click();
        await expect(dialog).toBeVisible();
        try {
          const errorsBefore = testInfo.errors.length;
          await expectDialogLayout(page, dialog, {
            heading: dialog.getByRole('heading', { name: 'Invite Tenant User', exact: true }),
            label: 'Invite Tenant User',
          });
          for (const role of ['textbox', 'combobox', 'button']) {
            for (const control of await dialog.getByRole(role).all()) {
              if (!(await control.isVisible())) continue;
              // Only the accessible name is extracted; textbox values and selected option values are never labels.
              const snapshot = await control.ariaSnapshot();
              const accessibleName = snapshot.match(/^- \w+ "([^"]*)"/)?.[1] || 'unnamed ' + role;
              await control.scrollIntoViewIfNeeded();
              await expect.soft(control, 'Invite Tenant User: ' + accessibleName + ' is reachable').toBeInViewport();
              const box = await control.boundingBox();
              const container = await dialog.boundingBox();
              expect.soft(Boolean(box && container && box.x >= container.x
                && box.x + box.width <= container.x + container.width
                && box.x >= 0 && box.x + box.width <= page.viewportSize().width),
              'Invite Tenant User: ' + accessibleName + ' horizontal bounds').toBe(true);
            }
          }
          if (testInfo.errors.length > errorsBefore) await screenshot('Invite Tenant User layout failure');
        } finally {
          if (await dialog.isVisible()) await page.keyboard.press('Escape');
          await expect(dialog).toBeHidden();
        }
      }
    } catch (error) {
      if (!testInfo.annotations.some(annotation => annotation.type === 'skip')) await screenshot('Inspect Users failure');
      throw error;
    } finally {
      try {
        if (await dialog.isVisible()) await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      } finally {
        await gotoApp(page, initialUrl);
        await expect(page).toHaveURL(initialUrl);
        await expect(navigation).toBeVisible();
      }
    }
  });

});
