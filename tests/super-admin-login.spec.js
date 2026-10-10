const { test, expect, devices } = require('@playwright/test');
const { gotoApp } = require('./support/navigation');

const { defaultBrowserType, ...iPhone } = devices['iPhone 15 Pro Max'];
test.use(iPhone);

test('SNTS-156: Super Admin login popup fits and is aligned on mobile', { tag: '@public' }, async ({ page }) => {
  await gotoApp(page, '/', { waitForBootstrap: false });
  await expect(page.getByRole('heading', {
    name: 'Welcome to Sentis Applied Minds', exact: true,
  }), 'The public sign-in heading is visible').toBeVisible();

  await page.getByRole('button', { name: 'Super Admin', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sentis Super Admin', exact: true });
  await expect(dialog, 'The Super Admin login dialog opens').toBeVisible();

  const dialogBox = await dialog.boundingBox();
  expect(dialogBox, 'The dialog has a measurable box').not.toBeNull();
  const viewport = page.viewportSize();
  expect(dialogBox.x, 'The dialog left edge is inside the viewport').toBeGreaterThanOrEqual(0);
  expect(dialogBox.y, 'The dialog top edge is inside the viewport').toBeGreaterThanOrEqual(0);
  expect(dialogBox.x + dialogBox.width, 'The dialog right edge is inside the viewport')
    .toBeLessThanOrEqual(viewport.width);
  expect(dialogBox.y + dialogBox.height, 'The dialog bottom edge is inside the viewport')
    .toBeLessThanOrEqual(viewport.height);

  const controls = [
    ['Heading', dialog.getByRole('heading', { name: 'Sentis Super Admin', exact: true })],
    ['Email input', dialog.getByRole('textbox', { name: 'admin@sentis.com', exact: true })],
    ['Password input', dialog.getByRole('textbox', { name: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022', exact: true })],
    ['Cancel button', dialog.getByRole('button', { name: 'Cancel', exact: true })],
    ['Login button', dialog.getByRole('button', { name: 'Login', exact: true })],
    ['Close button', dialog.getByRole('button', { name: 'Close', exact: true })],
  ];
  const boxes = new Map();
  for (const [name, control] of controls) {
    await expect.soft(control, `${name} is visible`).toBeVisible();
    const box = await control.boundingBox();
    expect.soft(box, `${name} has a measurable box`).not.toBeNull();
    if (!box) continue;
    boxes.set(name, box);
    expect.soft(box.x, `${name} left edge is inside the dialog`).toBeGreaterThanOrEqual(dialogBox.x);
    expect.soft(box.y, `${name} top edge is inside the dialog`).toBeGreaterThanOrEqual(dialogBox.y);
    expect.soft(box.x + box.width, `${name} right edge is inside the dialog`)
      .toBeLessThanOrEqual(dialogBox.x + dialogBox.width);
    expect.soft(box.y + box.height, `${name} bottom edge is inside the dialog`)
      .toBeLessThanOrEqual(dialogBox.y + dialogBox.height);
  }

  const headingBox = boxes.get('Heading');
  const closeBox = boxes.get('Close button');
  if (headingBox && closeBox) {
    const intersects = closeBox.x < headingBox.x + headingBox.width
      && closeBox.x + closeBox.width > headingBox.x
      && closeBox.y < headingBox.y + headingBox.height
      && closeBox.y + closeBox.height > headingBox.y;
    expect.soft(intersects, 'The Close button must not overlap the Super Admin heading').toBe(false);
  }
});
