const { expect } = require('@playwright/test');

async function expectDialogLayout(page, dialog, { heading, label }) {
  await dialog.evaluate(element => Promise.all(element.getAnimations({ subtree: true })
    .map(animation => animation.finished.catch(() => {}))));
  const inside = (box, container, name) => {
    expect.soft(box.x, `${label}: ${name} left edge`).toBeGreaterThanOrEqual(container.x);
    expect.soft(box.y, `${label}: ${name} top edge`).toBeGreaterThanOrEqual(container.y);
    expect.soft(box.x + box.width, `${label}: ${name} right edge`)
      .toBeLessThanOrEqual(container.x + container.width);
    expect.soft(box.y + box.height, `${label}: ${name} bottom edge`)
      .toBeLessThanOrEqual(container.y + container.height);
  };
  const dialogBox = await dialog.boundingBox();
  expect.soft(dialogBox, `${label}: dialog has a measurable box`).not.toBeNull();
  const viewport = page.viewportSize();
  if (dialogBox) inside(dialogBox, { x: 0, y: 0, ...viewport }, 'dialog in viewport');

  await expect.soft(heading, `${label}: heading is visible`).toBeVisible();
  const headingBox = await heading.boundingBox();
  expect.soft(headingBox, `${label}: heading has a measurable box`).not.toBeNull();
  if (headingBox && dialogBox) inside(headingBox, dialogBox, 'heading in dialog');

  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await expect.soft(close, `${label}: Close button is visible`).toBeVisible();
  const closeBox = await close.boundingBox();
  expect.soft(closeBox, `${label}: Close button has a measurable box`).not.toBeNull();
  if (headingBox && closeBox) {
    const intersects = closeBox.x < headingBox.x + headingBox.width
      && closeBox.x + closeBox.width > headingBox.x
      && closeBox.y < headingBox.y + headingBox.height
      && closeBox.y + closeBox.height > headingBox.y;
    expect.soft(intersects, `${label}: Close button does not overlap heading`).toBe(false);
  }

  for (const button of await dialog.getByRole('button').all()) {
    if (!(await button.isVisible())) continue;
    const name = await button.innerText();
    const box = await button.boundingBox();
    expect.soft(box, `${label}: ${name} button has a measurable box`).not.toBeNull();
    if (box && dialogBox) inside(box, dialogBox, `${name} button in dialog`);
  }
}

module.exports = { expectDialogLayout };
