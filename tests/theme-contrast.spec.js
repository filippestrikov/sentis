const { test, expect, devices } = require('@playwright/test');
const { gotoApp } = require('./support/navigation');
const { asRole } = require('./support/roles');
const { measureContrast } = require('./support/contrast');

const { defaultBrowserType, ...iPhone } = devices['iPhone 15 Pro Max'];

async function themeState(page) {
  return page.evaluate(() => {
    const stored = localStorage.getItem('theme-storage');
    return stored === null ? null : JSON.parse(stored).state;
  });
}

test.describe('Theme contrast on mobile Chromium', () => {
  test.use(iPhone);
  asRole(test, 'client-admin');

  test('SNTS-161: sidebar Close button has enough contrast in dark theme', async ({ page }, testInfo) => {
    const nonGetRequests = [];
    const recordRequest = request => {
      if (request.method() !== 'GET') nonGetRequests.push(request.method());
    };
    page.on('request', recordRequest);
    const toggleTheme = page.getByRole('button', { name: 'Toggle theme', exact: true });
    // Approved SNTS-197 exception: the mobile menu button has no accessible name.
    const menu = page.getByRole('button').filter({ has: page.locator('svg.lucide-menu') });
    const sidebar = page.getByRole('dialog', { name: 'Navigation', exact: true });
    const close = sidebar.getByRole('button', { name: 'Close', exact: true });

    try {
      await gotoApp(page, '/');
      expect((await themeState(page))?.isDark).not.toBe(true);
      await expect(toggleTheme).toBeVisible();
      await toggleTheme.click();
      await expect.poll(() => themeState(page)).toMatchObject({ theme: 'dark' });
      await expect(menu).toHaveCount(1);
      await expect(sidebar).toBeHidden();
      await menu.click();
      await expect(sidebar).toBeVisible();
      await sidebar.evaluate(element => Promise.all(element.getAnimations({ subtree: true })
        .map(animation => animation.finished.catch(() => {}))));
      await expect(close).toBeVisible();

      const kind = 'non-text';
      const result = await measureContrast(close, { kind });
      const { threshold, foreground, background, ratioMin, ratioMax, pixelRatio, verdict, method } = result;
      const evidence = { control: 'Close', kind, threshold, foreground, background,
        ratioMin, ratioMax, pixelRatio, verdict, method };
      const reason = verdict === 'inconclusive' ? result.reasons[0] : undefined;
      if (reason) evidence.actual = reason;
      await testInfo.attach('evidence: contrast', {
        body: JSON.stringify(evidence), contentType: 'application/json',
      });
      const message = `ratioMin=${ratioMin}; ratioMax=${ratioMax}; pixelRatio=${pixelRatio}; threshold=${threshold}`
        + (verdict === 'inconclusive' ? `; needs-visual-review: ${reason}` : '');
      expect(verdict, message).toBe('pass');
    } finally {
      try {
        if (await sidebar.isVisible()) await close.click();
        await expect(sidebar).toBeHidden();
      } finally {
        try {
          if ((await themeState(page))?.theme === 'dark') await toggleTheme.click();
          await expect.poll(() => themeState(page)).toMatchObject({ theme: 'light' });
        } finally {
          page.off('request', recordRequest);
          expect(nonGetRequests, 'Non-GET request methods').toEqual([]);
        }
      }
    }
  });
});
