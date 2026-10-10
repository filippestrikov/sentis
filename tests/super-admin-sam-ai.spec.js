const { test, expect, devices } = require('@playwright/test');
const { gotoApp } = require('./support/navigation');
const { asRole } = require('./support/roles');
const { knownOrganization, aiDataOrganization } = require('./fixtures/super-admin.json');

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
    for (const element of document.body.querySelectorAll('*')) {
      if (element === excluded || excluded.contains(element)) continue;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!box.width || !box.height || style.visibility === 'hidden' || style.display === 'none') continue;
      let overflow = box.left < -1 || box.right > innerWidth + 1;
      for (let parent = element.parentElement; parent && !overflow; parent = parent.parentElement) {
        if (['hidden', 'clip'].includes(getComputedStyle(parent).overflowX)) {
          const clip = parent.getBoundingClientRect();
          overflow = box.right > clip.right + 1 || box.left < clip.left - 1;
        }
      }
      if (overflow) candidates.push(element);
    }
    const outermost = candidates.filter(element => !candidates.some(other => other !== element && other.contains(element)));
    return {
      sections: [...new Set(outermost.map(label))],
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
}

test.describe('Super Admin sections on mobile Chromium', () => {
  test.use(iPhone);
  asRole(test, 'super-admin');

  test('SNTS-204: SAM AI sections fit the mobile screen without horizontal overflow', async ({ page }, testInfo) => {
    // Include tables hidden by dialogs in both explicit attachments and Playwright's automatic failure capture.
    const capture = page.screenshot.bind(page);
    page.screenshot = (options = {}) => capture({ ...options, mask: [
      page.getByRole('table', { includeHidden: true }),
      // Super-admin account cards list users outside a table on Manage.
      page.getByRole('generic').filter({
        has: page.getByRole('heading', { name: 'Super Admin Accounts', exact: true }),
      }).filter({ has: page.getByRole('button', { name: 'Add Super Admin', exact: true }) }).last(),
    ] });
    test.setTimeout(180000); // Eight sections load shared staging dashboard data sequentially.
    let initialOrganization;
    const screenshot = async section => testInfo.attach(section + ' mobile overflow failure', {
      body: await page.screenshot({ mask: [page.getByRole('table', { includeHidden: true })] }),
      contentType: 'image/png',
    });
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
          const heading = page.getByRole('heading', { name: overflow.sections[0], exact: true });
          if (overflow.sections.length && await heading.count() === 1) {
            // Native scrollIntoView can scroll overflow-x:hidden ancestors horizontally and alter the next tab.
            const horizontalPositionPreserved = await heading.evaluate(element => {
              const parents = [];
              for (let parent = element.parentElement; parent; parent = parent.parentElement) parents.push(parent);
              const positions = parents.map(parent => parent.scrollLeft);
              const owner = parents.find(parent => ['auto', 'scroll'].includes(getComputedStyle(parent).overflowY)
                && parent.scrollHeight > parent.clientHeight);
              if (owner) owner.scrollTop += element.getBoundingClientRect().top - owner.getBoundingClientRect().top - 16;
              return parents.every((parent, index) => parent.scrollLeft === positions[index]);
            });
            expect(horizontalPositionPreserved, overflow.sections[0] + ': screenshot scrolling preserves horizontal position').toBe(true);
            await expect(heading).toBeVisible();
          }
          await screenshot(section);
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
        await navigation.getByRole('button', { name, exact: true }).click();
        await expect(page).toHaveURL(new RegExp('[?&]tab=' + tab + '(?:&|$)'));
        await expect(page.getByRole('heading', { name: heading })).toBeVisible();
        await expect(page.getByRole('combobox').filter({ hasText: exactText(aiDataOrganization) })).toHaveCount(1);
        await expect(page.getByRole('status').filter({ hasText: 'Updating dashboard data...' })).toBeHidden({ timeout: 20000 });
        await check(name);
      }
    } catch (error) {
      if (!testInfo.annotations.some(annotation => annotation.type === 'skip')) await screenshot('Sentis Super Admin Dashboard');
      throw error;
    } finally {
      try {
        if (initialOrganization) {
          const listbox = page.getByRole('listbox');
          if (await listbox.isVisible()) await page.keyboard.press('Escape');
          await expect(listbox).toBeHidden();
          await gotoApp(page, '/?admin=super');
          await expect(page).toHaveURL(/\?admin=super$/);
          await expect(page.getByRole('combobox').filter({ hasText: exactText(initialOrganization) }),
            'Sentis Super Admin Dashboard: initial organization restored').toHaveCount(1, { timeout: 20000 });
          await expect(page.getByRole('combobox').filter({ hasText: exactText(knownOrganization) }),
            'Sentis Super Admin Dashboard: knownOrganization restored').toHaveCount(1);
        }
      } finally {
        // Restoration is asserted above; clear the page before the automatic snapshot can retain user lists.
        await page.goto('about:blank');
        await expect(page).toHaveURL('about:blank');
      }
    }
  });
});
