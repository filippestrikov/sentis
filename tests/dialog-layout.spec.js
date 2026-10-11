const { test, expect, devices } = require('@playwright/test');
const { gotoApp, clickAndAwaitApi } = require('./support/navigation');
const { asRole } = require('./support/roles');

const sizes = [{ width: 1366, height: 786 }, { width: 1920, height: 1024 }];
const termsName = 'Sentis Applied Minds (SAM) - Terms & Conditions';

async function settle(dialog) {
  await dialog.evaluate(element => Promise.all(element.getAnimations({ subtree: true })
    .map(animation => animation.finished.catch(() => {}))));
}

function inside(box, container) {
  return Boolean(box && container && box.x >= container.x && box.y >= container.y
    && box.x + box.width <= container.x + container.width
    && box.y + box.height <= container.y + container.height);
}

async function attach(testInfo, name, data) {
  await testInfo.attach(`evidence: ${name}`, {
    body: JSON.stringify(data), contentType: 'application/json',
  });
}

// Inspect painted geometry only; never return dialog text, input values or row contents.
async function intersections(dialog, close, mode) {
  const closeHandle = await close.elementHandle();
  try {
    return await dialog.evaluate((root, { button, mode }) => {
      const box = rect => ({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
      const target = box(button.getBoundingClientRect());
      const intersects = rect => rect.width > 0 && rect.height > 0
        && rect.x < target.x + target.width && rect.x + rect.width > target.x
        && rect.y < target.y + target.height && rect.y + rect.height > target.y;
      const visible = element => {
        for (let parent = element; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
        }
        return true;
      };
      const clip = (rect, ancestor) => {
        let { x, y, width, height } = rect;
        let right = x + width;
        let bottom = y + height;
        for (let parent = ancestor; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          const bounds = parent.getBoundingClientRect();
          if (style.overflowX !== 'visible') {
            x = Math.max(x, bounds.left + parent.clientLeft);
            right = Math.min(right, bounds.left + parent.clientLeft + parent.clientWidth);
          }
          if (style.overflowY !== 'visible') {
            y = Math.max(y, bounds.top + parent.clientTop);
            bottom = Math.min(bottom, bounds.top + parent.clientTop + parent.clientHeight);
          }
          if (parent === root) break;
        }
        return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
      };
      const hits = [];
      if (mode === 'text') {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent.trim() || button.contains(node) || !visible(node.parentElement)) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            // Scrolled Terms text can have an overlapping raw rect while being fully clipped.
            const painted = clip(box(rect), node.parentElement);
            if (intersects(painted)) hits.push(painted);
          }
        }
      } else {
        for (const element of [root, ...root.getElementsByTagName('*')]) {
          if (button === element || button.contains(element) || !visible(element)) continue;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
            const width = parseFloat(style[`border${side}Width`]);
            const colour = style[`border${side}Color`];
            const transparent = colour === 'transparent'
              || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(colour)
              || /\/\s*0(?:\.0+)?%?\s*\)$/.test(colour);
            if (!(width > 0) || ['none', 'hidden'].includes(style[`border${side}Style`]) || transparent) continue;
            const segment = side === 'Top' ? { x: rect.left, y: rect.top, width: rect.width, height: width }
              : side === 'Bottom' ? { x: rect.left, y: rect.bottom - width, width: rect.width, height: width }
                : side === 'Left' ? { x: rect.left, y: rect.top, width, height: rect.height }
                  : { x: rect.right - width, y: rect.top, width, height: rect.height };
            const painted = element === root ? segment : clip(segment, element.parentElement);
            if (intersects(painted)) hits.push({ boundary: side.toLowerCase(), ...painted });
          }
        }
      }
      return hits;
    }, { button: closeHandle, mode });
  } finally {
    await closeHandle.dispose();
  }
}

async function checkBorders(dialog, label, testInfo) {
  await settle(dialog);
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  const errorsBefore = testInfo.errors.length;
  await expect.soft(close, `${label}: Close visible`).toBeVisible();
  const box = await close.boundingBox();
  const contained = inside(box, await dialog.boundingBox());
  const crossings = await intersections(dialog, close, 'border');
  expect.soft(contained, `${label}: Close fully inside dialog`).toBe(true);
  expect.soft(crossings.length, `${label}: no visible border crosses Close`).toBe(0);
  if (testInfo.errors.length > errorsBefore) await attach(testInfo, 'border crossings', [
    { label, control: 'Close', boundary: 'dialog', ...box, expected: true, actual: contained },
    ...crossings.map(rect => ({ label, control: 'Close', ...rect, expected: 0, actual: crossings.length })),
  ]);
}

async function openTerms(page) {
  await gotoApp(page, '/', { waitForBootstrap: false });
  await expect(page.getByRole('heading', { name: 'Welcome to Sentis Applied Minds', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Terms and Conditions', exact: true }).click();
  await expect(page).toHaveURL(/\/terms-and-conditions(?:[?#]|$)/);
  const dialog = page.getByRole('dialog', { name: termsName, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('SNTS-94: Terms and Conditions Close button stays clear of the content on mobile and tablet',
  { tag: '@public' }, async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    for (const name of ['Galaxy S24', 'iPhone 13', 'iPhone 15 Pro Max', 'iPad Mini']) {
      const { defaultBrowserType, ...device } = devices[name];
      const context = await browser.newContext({ ...device, baseURL: 'https://sam.sentis.com/' });
      try {
        const page = await context.newPage();
        const dialog = await openTerms(page);
        await settle(dialog);
        const close = dialog.getByRole('button', { name: 'Close', exact: true });
        const scrollOwner = await dialog.evaluateHandle(root => {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim()) continue;
            for (let parent = walker.currentNode.parentElement; parent; parent = parent.parentElement) {
              if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowY)
                && parent.scrollHeight > parent.clientHeight) return parent;
              if (parent === root) break;
            }
          }
          return null;
        });
        try {
          const max = await scrollOwner.evaluate(element => element ? element.scrollHeight - element.clientHeight : 0);
          if (!max) testInfo.annotations.push({ type: 'scroll', description: `${name}: dialog content does not scroll; checked once` });
          for (const [position, fraction] of max ? [['top', 0], ['middle', 0.5], ['bottom', 1]] : [['top', 0]]) {
            if (max) {
              await scrollOwner.evaluate((element, fraction) => { element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction; }, fraction);
              await expect.poll(() => scrollOwner.evaluate((element, fraction) =>
                Math.abs(element.scrollTop - (element.scrollHeight - element.clientHeight) * fraction), fraction),
              { message: `${name}: ${position} scroll applied` }).toBeLessThanOrEqual(1);
            }
            const label = `${name} ${position}`;
            const errorsBefore = testInfo.errors.length;
            const viewport = await page.evaluate(() => ({ x: 0, y: 0, width: innerWidth, height: innerHeight }));
            const dialogBox = await dialog.boundingBox();
            const closeBox = await close.boundingBox();
            await expect.soft(close, `${label}: Close visible`).toBeVisible();
            const dialogInside = inside(dialogBox, viewport);
            const closeInside = inside(closeBox, dialogBox);
            const hits = await intersections(dialog, close, 'text');
            expect.soft(dialogInside, `${label}: dialog inside viewport`).toBe(true);
            expect.soft(closeInside, `${label}: Close inside dialog`).toBe(true);
            expect.soft(hits.length, `${label}: no visible clipped text overlaps Close`).toBe(0);
            if (testInfo.errors.length > errorsBefore) await attach(testInfo, 'close overlap', [
              { label, control: 'dialog', ...dialogBox, viewportWidth: viewport.width, viewportHeight: viewport.height, expected: true, actual: dialogInside },
              { label, control: 'Close', ...closeBox, expected: true, actual: closeInside },
              ...hits.map(rect => ({ label, control: 'clipped text', ...rect, expected: 0, actual: hits.length })),
            ]);
          }
        } finally {
          await scrollOwner.dispose();
          if (await dialog.isVisible()) await close.click();
          await expect(dialog).toBeHidden();
        }
      } finally {
        await context.close();
      }
    }
  });

test('SNTS-117: public popups have no border crossing the Close button', { tag: '@public' }, async ({ page }, testInfo) => {
  test.setTimeout(120000);
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    expect(page.viewportSize()).toEqual(viewport);
    const terms = await openTerms(page);
    try {
      await checkBorders(terms, `Terms ${viewport.width}x${viewport.height}`, testInfo);
    } finally {
      if (await terms.isVisible()) await terms.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(terms).toBeHidden();
    }
    await gotoApp(page, '/', { waitForBootstrap: false });
    await expect(page.getByRole('heading', { name: 'Welcome to Sentis Applied Minds', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Super Admin', exact: true }).click();
    const admin = page.getByRole('dialog', { name: 'Sentis Super Admin', exact: true });
    await expect(admin).toBeVisible();
    try {
      await checkBorders(admin, `Super Admin ${viewport.width}x${viewport.height}`, testInfo);
    } finally {
      if (await admin.isVisible()) await admin.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(admin).toBeHidden();
    }
  }
});

test.describe('Client admin dialog borders', () => {
  asRole(test, 'client-admin');
  test('SNTS-117: Observation Details Close is not crossed by popup borders in dark theme', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    const initialViewport = page.viewportSize();
    const nonGetRequests = [];
    const recordRequest = request => {
      if (request.method() !== 'GET') nonGetRequests.push(request.method());
    };
    page.on('request', recordRequest);
    const themeState = () => page.evaluate(() => {
      const stored = localStorage.getItem('theme-storage');
      return stored === null ? null : JSON.parse(stored).state;
    });
    const toggleTheme = page.getByRole('button', { name: 'Toggle theme', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Observation Details', exact: true });
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    const evidence = [];
    const errorsBefore = testInfo.errors.length;
    let failed = false;
    let label = '';
    const checkObservationBorders = async () => {
      await settle(dialog);
      await expect.soft(close, `${label}: Close visible`).toBeVisible();
      const box = await close.boundingBox();
      const contained = inside(box, await dialog.boundingBox());
      // intersections excludes Close itself, including its required keyboard focus ring.
      const crossings = await intersections(dialog, close, 'border');
      evidence.push(
        { label, control: 'Close', boundary: 'dialog', ...box, expected: true, actual: contained },
        { label, control: 'Close', boundary: 'border', ...box, expected: 0, actual: crossings.length },
        ...crossings.map(rect => ({ label, control: 'Close', ...rect, expected: 0, actual: crossings.length })),
      );
      expect.soft(contained, `${label}: Close fully inside dialog`).toBe(true);
      expect.soft(crossings.length, `${label}: no visible border crosses Close`).toBe(0);
    };
    try {
      await gotoApp(page, '/');
      await expect(toggleTheme).toBeVisible();
      for (const viewport of sizes) {
        await page.setViewportSize(viewport);
        expect(page.viewportSize()).toEqual(viewport);
        if ((await themeState())?.theme !== 'dark') await toggleTheme.click();
        await expect.poll(themeState).toMatchObject({ theme: 'dark' });
        await page.getByRole('button', { name: 'My Observations', exact: true }).click();
        await expect(page).toHaveURL(/[?&]view=/);
        await expect(page.getByRole('table')).toBeVisible();
        // Approved selector exception: each observation row's View icon button is unnamed.
        const row = page.getByRole('row').filter({ has: page.getByRole('button') }).first();
        test.skip(await row.count() === 0,
          'Missing fixture: no My Observations row for the client admin (see QA_ORG_FIXTURE_SPEC.md)');
        label = `${viewport.width}x${viewport.height} mouse`;
        await row.getByRole('button').click();
        await expect(dialog).toBeVisible();
        await checkObservationBorders();
        const unfocused = await close.evaluate(element => {
          const style = getComputedStyle(element);
          return { shadow: style.boxShadow, outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}` };
        });
        label = `${viewport.width}x${viewport.height} keyboard`;
        for (let tabs = 0; tabs < 20; tabs++) {
          await page.keyboard.press('Tab');
          if (await close.evaluate(element => document.activeElement === element)) break;
        }
        const focus = await close.evaluate((element, before) => {
          const style = getComputedStyle(element);
          const outline = `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`;
          return {
            focused: document.activeElement === element,
            visible: element.matches(':focus-visible'),
            indicator: (style.boxShadow !== 'none' && style.boxShadow !== before.shadow)
              || (!['none', 'hidden'].includes(style.outlineStyle) && parseFloat(style.outlineWidth) > 0
                && outline !== before.outline),
          };
        }, unfocused);
        const box = await close.boundingBox();
        for (const [boundary, actual] of Object.entries(focus)) {
          evidence.push({ label, control: 'Close', boundary, ...box, expected: true, actual });
          expect.soft(actual, `${label}: ${boundary}`).toBe(true);
        }
        await checkObservationBorders();
        await close.click();
        await expect(dialog).toBeHidden();
      }
    } catch (error) {
      failed = testInfo.expectedStatus !== 'skipped';
      throw error;
    } finally {
      try {
        try {
          if (await dialog.isVisible()) await close.click();
          await expect(dialog).toBeHidden();
        } finally {
          try {
            if ((await themeState())?.theme === 'dark') await toggleTheme.click();
            await expect.poll(themeState).toMatchObject({ theme: 'light' });
          } finally {
            await page.setViewportSize(initialViewport);
            expect(page.viewportSize()).toEqual(initialViewport);
            page.off('request', recordRequest);
            expect(nonGetRequests, 'Non-GET request methods').toEqual([]);
          }
        }
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        if (failed || testInfo.errors.length > errorsBefore) await attach(testInfo, 'observation close',
          evidence.length ? evidence : [{ label, control: 'Close', boundary: 'workflow', expected: true, actual: false }]);
      }
    }
  });
  test('SNTS-117: Invite Tenant User popup has no border crossing the Close button', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await gotoApp(page, '/?admin=client&tab=modules');
    const navigation = page.getByRole('navigation', { name: 'Admin sections', exact: true });
    await expect(navigation).toBeVisible();
    const initialUrl = page.url();
    const initialViewport = page.viewportSize();
    const dialog = page.getByRole('dialog', { name: 'Invite Tenant User', exact: true });
    try {
      await clickAndAwaitApi(page, {
        action: () => navigation.getByRole('button', { name: 'Inspect Users', exact: true }).click(),
        path: '/v1/users', ready: page.getByRole('button', { name: 'Invite Team Leader', exact: true }),
        label: 'Inspect Users',
      });
      await expect(page).toHaveURL(/[?&]tab=user-details(?:&|$)/);
      for (const viewport of sizes) {
        await page.setViewportSize(viewport);
        expect(page.viewportSize()).toEqual(viewport);
        await page.getByRole('button', { name: 'Invite Team Leader', exact: true }).click();
        await expect(dialog).toBeVisible();
        try {
          await checkBorders(dialog, `Invite ${viewport.width}x${viewport.height}`, testInfo);
        } finally {
          if (await dialog.isVisible()) await page.keyboard.press('Escape');
          await expect(dialog).toBeHidden();
        }
      }
    } finally {
      try {
        if (await dialog.isVisible()) await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      } finally {
        await page.setViewportSize(initialViewport);
        expect(page.viewportSize()).toEqual(initialViewport);
        await gotoApp(page, initialUrl);
        await expect(page).toHaveURL(initialUrl);
        await expect(navigation.getByRole('button', { name: 'Training', exact: true })).toBeVisible();
      }
    }
  });
});

test.describe('Super admin dialog borders', () => {
  asRole(test, 'super-admin');
  test('SNTS-117: New Training Module popup has no border crossing the Close button', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await gotoApp(page, '/?admin=super');
    const navigation = page.getByRole('navigation', { name: 'Admin sections', exact: true });
    await expect(navigation).toBeVisible();
    const initialUrl = page.url();
    const initialViewport = page.viewportSize();
    const dialog = page.getByRole('dialog', { name: 'New Training Module', exact: true });
    try {
      await navigation.getByRole('button', { name: 'Training', exact: true }).click();
      await expect(page).toHaveURL(/[?&]tab=modules(?:&|$)/);
      await expect(page.getByRole('button', { name: 'New Module', exact: true })).toBeVisible();
      for (const viewport of sizes) {
        await page.setViewportSize(viewport);
        expect(page.viewportSize()).toEqual(viewport);
        await page.getByRole('button', { name: 'New Module', exact: true }).click();
        await expect(dialog).toBeVisible();
        try {
          await checkBorders(dialog, `Training ${viewport.width}x${viewport.height}`, testInfo);
        } finally {
          if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
          await expect(dialog).toBeHidden();
        }
      }
    } finally {
      try {
        if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dialog).toBeHidden();
      } finally {
        await page.setViewportSize(initialViewport);
        expect(page.viewportSize()).toEqual(initialViewport);
        await gotoApp(page, initialUrl);
        await expect(page).toHaveURL(initialUrl);
        await expect(navigation).toBeVisible();
      }
    }
  });
});
