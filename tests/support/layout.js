const { expect } = require('@playwright/test');

async function textBox(locator) {
  // Measure rendered text, not the element box: block headings span the full width
  return locator.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
    if (!rects.length) return null;
    const x = Math.min(...rects.map(rect => rect.left));
    const y = Math.min(...rects.map(rect => rect.top));
    const right = Math.max(...rects.map(rect => rect.right));
    const bottom = Math.max(...rects.map(rect => rect.bottom));
    return { x, y, width: right - x, height: bottom - y };
  });
}

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
  const headingTextBox = await textBox(heading);
  expect.soft(headingTextBox, `${label}: heading has measurable text`).not.toBeNull();
  if (headingTextBox && closeBox) {
    const intersects = closeBox.x < headingTextBox.x + headingTextBox.width
      && closeBox.x + closeBox.width > headingTextBox.x
      && closeBox.y < headingTextBox.y + headingTextBox.height
      && closeBox.y + closeBox.height > headingTextBox.y;
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

module.exports = { expectDialogLayout, textBox };
