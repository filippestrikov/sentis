const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const { measureContrast } = require('../tests/support/contrast');

async function main() {
  const browser = await chromium.launch();
  let passed = 0;
  let failed = 0;
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort());
    const text = (attributes, shapes = '') => `<div style="background:#1a1f2e"><svg width="500" height="120" style="color:#e5e7eb">${shapes}<text data-testid="ink" x="20" y="80" font-family="Arial" font-size="48" ${attributes}>Chart date</text></svg></div>`;
    const check = async (name, html, verify, kind = 'text-normal') => {
      await page.setContent(`<style>body{margin:0}</style>${html}`);
      const result = await measureContrast(page.getByTestId('ink'), { kind });
      try {
        verify(result);
        passed++;
        console.log(`PASS: ${name} ${JSON.stringify(result)}`);
      } catch (error) {
        failed++;
        console.error(`FAIL: ${name} ${JSON.stringify(result)}\n${error.message}`);
      }
    };
    await check('a: SVG fill overrides inherited CSS color', text('fill="#666666"'), result => {
      assert.notEqual(result.foreground, 'rgb(229, 231, 235)', 'must not use the old CSS color foreground');
      assert.equal(result.foreground, 'rgb(102, 102, 102)');
      assert(Math.abs(result.ratioMin - 2.87) < 0.05);
      assert(Math.abs(result.pixelRatio - result.ratioMin) < 0.05);
      assert.equal(result.verdict, 'fail');
    });
    await check('b: currentColor fill', text('fill="currentColor" style="color:#ffffff"'), result => {
      assert.equal(result.foreground, 'rgb(255, 255, 255)');
      assert.equal(result.verdict, 'pass');
    });
    await check('c: fill opacity composites foreground', text('fill="#ffffff" fill-opacity="0.2"'), result => {
      assert.equal(result.foreground, 'rgb(72, 76, 88)');
      assert(result.ratioMin < 4.5);
      assert.equal(result.verdict, 'fail');
    });
    await check('d: stroke-painted text', text('fill="none" stroke="#ffffff" stroke-width="3"'), result => {
      assert.equal(result.foreground, 'rgb(255, 255, 255)');
      assert(result.reasons.includes('stroke-painted text'));
      assert.equal(result.verdict, 'pass');
    });
    await check('e: SVG paint server', text('fill="url(#grad)"', '<defs><linearGradient id="grad"><stop stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient></defs>'), result => {
      assert.equal(result.verdict, 'inconclusive');
      assert(result.reasons.includes('SVG paint server'));
    });
    await check('f: overlapping SVG background shape', text('fill="#666666"', '<rect width="500" height="120" fill="#ffffff"/>'), result => {
      assert.equal(result.verdict, 'inconclusive');
      assert(result.reasons.includes('SVG shapes may paint behind text'));
    });
    for (const [name, shape] of [
      ['non-overlapping', '<rect x="400" width="50" height="120" fill="white"/>'],
      ['transparent', '<rect width="500" height="120" fill="transparent"/>'],
      ['unfilled', '<rect width="500" height="120" fill="none"/>'],
      ['hidden ancestor', '<g opacity="0"><rect width="500" height="120" fill="white"/></g>'],
    ]) {
      await check(`${name} shape does not block text measurement`, text('fill="#666666"', shape), result => {
        assert.equal(result.verdict, 'fail');
        assert(!result.reasons.includes('SVG shapes may paint behind text'));
      });
    }
    await check('tspan inherits fill and combines ancestor and paint opacity', '<div style="background:#1a1f2e"><svg width="500" height="120"><g opacity="0.5"><text x="20" y="80" fill="white" fill-opacity="0.4" font-family="Arial" font-size="48"><tspan data-testid="ink">Chart date</tspan></text></g></svg></div>', result => {
      assert.equal(result.foreground, 'rgb(72, 76, 88)');
      assert.equal(result.verdict, 'fail');
    });
    await check('stroke opacity composites stroke-painted text', text('fill="none" stroke="white" stroke-opacity="0.2" stroke-width="3"'), result => {
      assert.equal(result.foreground, 'rgb(72, 76, 88)');
      assert(result.reasons.includes('stroke-painted text'));
      assert.equal(result.verdict, 'fail');
    });
    await check('textPath uses inherited SVG fill', '<div style="background:#1a1f2e"><svg width="500" height="120" style="color:#e5e7eb"><defs><path id="baseline" d="M20 80 H480"/></defs><text fill="#666666" font-family="Arial" font-size="48"><textPath data-testid="ink" href="#baseline">Chart date</textPath></text></svg></div>', result => {
      assert.equal(result.foreground, 'rgb(102, 102, 102)');
      assert.equal(result.verdict, 'fail');
      assert(!result.reasons.includes('SVG shapes may paint behind text'));
    });
    await check('g: HTML tooltip uses CSS color', '<div data-testid="ink" style="background:#ffffff;color:#e5e7eb;font:48px Arial;padding:20px">Tooltip text</div>', result => {
      assert.equal(result.foreground, 'rgb(229, 231, 235)');
      assert(Math.abs(result.ratioMin - 1.24) < 0.05);
      assert.equal(result.verdict, 'fail');
    });
    await check('h: SNTS-161 icon unchanged', '<div style="background:linear-gradient(rgb(40,40,60),rgb(20,40,60));height:100px"><button data-testid="ink" style="opacity:.7;color:#111827;background:transparent;border:0;padding:10px"><svg width="32" height="32" stroke="currentColor" fill="none" stroke-width="3"><path d="M8 8 L24 24 M24 8 L8 24"/></svg></button></div>', result => {
      assert.equal(result.verdict, 'fail');
      assert(result.ratioMin >= 1.1 && result.ratioMax <= 1.2);
      assert(result.pixelRatio >= 1.1 && result.pixelRatio <= 1.2);
    }, 'non-text');
    console.log(`${passed} DOM cases passed; ${failed} failed.`);
    if (failed) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
