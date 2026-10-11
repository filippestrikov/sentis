const { test, expect, devices } = require('@playwright/test');
const { gotoApp } = require('./support/navigation');
const { asRole } = require('./support/roles');
const { restoreOrganization } = require('./support/organization');
const { knownOrganization, aiDataOrganization } = require('./fixtures/super-admin.json');

const exactText = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

test.describe('Super Admin SAM AI', () => {
  asRole(test, 'super-admin');

  test('SNTS-265: switching organizations keeps SAM AI stable', { tag: '@shared-account' }, async ({ page }, testInfo) => {
    test.setTimeout(240000); // visits every organization; each switch reloads dashboard data
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let organizationSelector;
    let initialOrganization;
    let organizationSwitchAttempted = false;

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
        await testInfo.attach(`reviewed: SAM AI crash: ${organization}`, { body: await page.screenshot(), contentType: 'image/png' });
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
        organizationSwitchAttempted = true;
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
      if (organizationSwitchAttempted) {
        await restoreOrganization({
          role: 'super-admin', testInfo, expected: initialOrganization,
          restore: async () => {
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
            await expect(page.getByRole('combobox').filter({ hasText: exactText(initialOrganization) }),
              'Initial organization is restored').toHaveCount(1, { timeout: 20000 });
          },
          current: () => page.getByRole('combobox').first().textContent(),
        });
      }
      expect.soft(pageErrors, `SAM AI page errors: ${pageErrors.join('\n') || 'none'}`).toEqual([]);
    }
  });
});

const { defaultBrowserType, ...iPhone } = devices['iPhone 15 Pro Max'];

async function horizontalOverflow(page) {
  // Selector exception: a DOM geometry walk is needed to detect clipping by anonymous layout ancestors,
  // as in SNTS-221's rendered-element inspection. No selector is used to interact with the app.
  const navigation = page.getByRole('navigation', { name: 'Admin sections', exact: true });
  return navigation.evaluate(excluded => {
    const headingSelector = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
    const label = element => {
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const heading = ancestor.matches(headingSelector) ? ancestor
          : [...ancestor.querySelectorAll(headingSelector)].find(h => !h.closest('table'));
        if (heading) return heading.textContent.trim();
      }
      return 'Sentis Super Admin Dashboard';
    };
    const candidates = [];
    const geometry = new Map();
    for (const element of document.body.querySelectorAll('*')) {
      if (element === excluded || excluded.contains(element) || element.closest('svg')) continue;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!box.width || !box.height || style.visibility === 'hidden' || style.display === 'none') continue;
      let overflow = box.right > innerWidth + 1;
      let clipContainerWidth = innerWidth;
      let cutPx = box.right - innerWidth;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (box.right <= parent.getBoundingClientRect().right + 1) continue;
        const overflowX = getComputedStyle(parent).overflowX;
        if (['auto', 'scroll'].includes(overflowX)) {
          overflow = false;
          break;
        }
        if (['hidden', 'clip'].includes(overflowX)) {
          overflow = true;
          const clipBox = parent.getBoundingClientRect();
          clipContainerWidth = clipBox.width;
          cutPx = box.right - clipBox.right;
          break;
        }
      }
      if (overflow) {
        candidates.push(element);
        geometry.set(element, { elementWidth: box.width, clipContainerWidth, cutPx, viewportWidth: innerWidth });
      }
    }
    const outermost = candidates.filter(element => !candidates.some(other => other !== element && other.contains(element)));
    return {
      sections: [...new Set(outermost.map(label))],
      elements: outermost.map(element => ({ section: label(element), ...geometry.get(element) })),
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
}

test.describe('Super Admin sections on mobile Chromium', () => {
  test.use(iPhone);
  asRole(test, 'super-admin');

  test('SNTS-204: SAM AI sections fit the mobile screen without horizontal overflow', { tag: '@shared-account' }, async ({ page }, testInfo) => {
    test.setTimeout(180000); // Eight sections load shared staging dashboard data sequentially.
    let initialOrganization;
    let organizationSwitchAttempted = false;
    let currentTab = 'SAM AI';
    const attachGeometry = async (tab, overflow) => {
      try {
        await testInfo.attach('evidence: ' + tab + ' mobile overflow geometry', {
          body: JSON.stringify(overflow.elements.map(element => ({ tab, ...element })), null, 2),
          contentType: 'application/json',
        });
      } catch {
        testInfo.annotations.push({ type: 'evidence', description: tab + ': geometry JSON unavailable' });
      }
    };
    try {
      await gotoApp(page, '/?admin=super');
      const navigation = page.getByRole('navigation', { name: 'Admin sections', exact: true });
      await expect(navigation).toBeVisible();
      await navigation.getByRole('button', { name: 'SAM AI', exact: true }).click();
      await expect(page).toHaveURL(/[?&]tab=cortex(?:&|$)/);
      await expect(page.getByRole('heading', { name: 'Usage Trend', exact: true })).toBeVisible();
      const comboboxes = page.getByRole('combobox');
      await expect.poll(async () => (await comboboxes.allTextContents()).every(text => text.trim().length > 0), {
        message: 'SAM AI combobox selected labels must finish loading', timeout: 20000,
      }).toBe(true);
      let organizationSelector;
      for (const selectedName of await comboboxes.allTextContents()) {
        // Organization combobox has no accessible name; identify it by its known organization option (SNTS-265).
        const control = page.getByRole('combobox').filter({ hasText: exactText(selectedName) });
        await expect(control).toHaveCount(1);
        await control.click();
        const listbox = page.getByRole('listbox');
        await expect(listbox).toBeVisible();
        if (await listbox.getByRole('option', { name: knownOrganization, exact: true }).count()) {
          expect(organizationSelector, 'SAM AI: organization selector is unique').toBeUndefined();
          organizationSelector = control;
          initialOrganization = selectedName.trim();
        }
        await page.keyboard.press('Escape');
        await expect(listbox).toBeHidden();
      }
      expect(organizationSelector, 'SAM AI: knownOrganization fixture identifies the selector').toBeDefined();
      await organizationSelector.click();
      const listbox = page.getByRole('listbox');
      await expect(listbox).toBeVisible();
      const target = listbox.getByRole('option', { name: aiDataOrganization, exact: true });
      test.skip(!(await target.count()), 'Missing aiDataOrganization fixture in tests/fixtures/super-admin.json');
      organizationSwitchAttempted = aiDataOrganization !== initialOrganization;
      await target.click();
      await expect(listbox).toBeHidden();
      await expect(page.getByRole('combobox').filter({ hasText: exactText(aiDataOrganization) })).toHaveCount(1);
      await expect(page.getByRole('status').filter({ hasText: 'Updating dashboard data...' })).toBeHidden({ timeout: 20000 });
      await expect(page.getByRole('heading', { name: 'Prompt History', exact: true })).toBeVisible();
      // Each recorded prompt has one Delete prompt action; count only, never invoke or read its user-bearing name.
      const entries = page.getByRole('button', { name: /^Delete prompt from / });
      test.skip((await entries.count()) === 0, 'Missing recorded prompts for aiDataOrganization fixture in tests/fixtures/super-admin.json');
      const check = async section => {
        const overflow = await horizontalOverflow(page);
        expect.soft(overflow.sections, section + ': horizontal overflow in sections: ' + (overflow.sections.join(', ') || 'none')).toEqual([]);
        expect.soft(overflow.documentOverflow, section + ': document horizontal overflow').toBe(false);
        if (overflow.sections.length || overflow.documentOverflow) {
          await attachGeometry(section, overflow);
        }
      };
      await check('SAM AI');
      for (const [name, tab, heading] of [
        ['Manage', 'overview', /^Manage Organisation$/],
        ['Training', 'modules', /^Training Library$/],
        ['Pre-start Efficacy', 'prestart-efficacy', /^Confidence Check Results$/],
        ['Guides', 'toolkits', /^Guide Categories$/],
        ['PST Reports', 'observations', /^Observation Metrics$/],
        ['User Details', 'user-details', /^User Search & Module Details$/],
        ['Audit Logs', 'audit-logs', /^Audit Logs - /],
      ]) {
        currentTab = name;
        await navigation.getByRole('button', { name, exact: true }).click();
        await expect(page).toHaveURL(new RegExp('[?&]tab=' + tab + '(?:&|$)'));
        await expect(page.getByRole('heading', { name: heading })).toBeVisible();
        await expect(page.getByRole('combobox').filter({ hasText: exactText(aiDataOrganization) })).toHaveCount(1);
        await expect(page.getByRole('status').filter({ hasText: 'Updating dashboard data...' })).toBeHidden({ timeout: 20000 });
        await check(name);
      }
    } catch (error) {
      if (!testInfo.annotations.some(annotation => annotation.type === 'skip')) {
        try {
          await attachGeometry(currentTab, await horizontalOverflow(page));
        } catch {
          testInfo.annotations.push({ type: 'evidence', description: currentTab + ': geometry JSON unavailable' });
        }
      }
      throw error;
    } finally {
      try {
        if (organizationSwitchAttempted) {
          await restoreOrganization({
            role: 'super-admin', testInfo, expected: initialOrganization,
            restore: async () => {
              const listbox = page.getByRole('listbox');
              if (await listbox.isVisible()) await page.keyboard.press('Escape');
              await expect(listbox).toBeHidden();
              await gotoApp(page, '/?admin=super');
              await expect(page).toHaveURL(/\?admin=super$/);
              await expect(page.getByRole('combobox').filter({ hasText: exactText(initialOrganization) }),
                'Sentis Super Admin Dashboard: initial organization restored').toHaveCount(1, { timeout: 20000 });
              await expect(page.getByRole('combobox').filter({ hasText: exactText(knownOrganization) }),
                'Sentis Super Admin Dashboard: knownOrganization restored').toHaveCount(1);
            },
            current: () => page.getByRole('combobox').first().textContent(),
          });
        }
      } finally {
        // Restoration is asserted above; clear the page before the automatic snapshot can retain user lists.
        await page.goto('about:blank');
        await expect(page).toHaveURL('about:blank');
      }
    }
  });
});
