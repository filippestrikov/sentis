const assert = require('assert');
const { relativeLuminance, contrastRatio, composite, contrastVerdict } = require('../tests/support/contrast');

let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log(`PASS: ${name}`);
}

check('black and white luminance', () => {
  assert.strictEqual(relativeLuminance([0, 0, 0]), 0);
  assert.strictEqual(relativeLuminance([255, 255, 255]), 1);
});
check('black/white = 21.00', () => assert.strictEqual(contrastRatio([0, 0, 0], [255, 255, 255]).toFixed(2), '21.00'));
check('white/white = 1.00', () => assert.strictEqual(contrastRatio([255, 255, 255], [255, 255, 255]).toFixed(2), '1.00'));
check('#777777/white = 4.48', () => assert.strictEqual(contrastRatio([119, 119, 119], [255, 255, 255]).toFixed(2), '4.48'));
check('contrast symmetry', () => assert.strictEqual(contrastRatio([17, 24, 39], [40, 40, 60]), contrastRatio([40, 40, 60], [17, 24, 39])));
check('alpha compositing', () => {
  composite([17, 24, 39, 0.7], [40, 40, 60]).forEach((channel, i) => assert(Math.abs(channel - [24, 29, 45][i]) <= 1));
  assert.deepStrictEqual(composite([17, 24, 39, 0], [40, 40, 60]), [40, 40, 60]);
  assert.deepStrictEqual(composite([17, 24, 39, 1], [40, 40, 60]), [17, 24, 39]);
});
const verdict = values => contrastVerdict({ threshold: 4.5, ratioMin: 7, ratioMax: 7, pixelRatio: 7, ...values });
check('solid pass and inclusive boundary', () => {
  assert.strictEqual(verdict({}).verdict, 'pass');
  assert.strictEqual(verdict({ ratioMin: 4.5, ratioMax: 4.5, pixelRatio: 4.5 }).verdict, 'pass');
});
check('solid fail', () => assert.strictEqual(verdict({ ratioMin: 2, ratioMax: 2, pixelRatio: 2 }).verdict, 'fail'));
check('gradient spans threshold', () => assert.deepStrictEqual(verdict({ ratioMin: 2, ratioMax: 7 }), { verdict: 'inconclusive', reasons: ['gradient spans threshold'] }));
check('methods disagree in both directions', () => {
  assert.deepStrictEqual(verdict({ pixelRatio: 2 }), { verdict: 'inconclusive', reasons: ['methods disagree'] });
  assert.deepStrictEqual(verdict({ ratioMin: 2, ratioMax: 2 }), { verdict: 'inconclusive', reasons: ['methods disagree'] });
});
check('unreliable measurement cannot pass or fail', () => {
  for (const ratio of [2, 7]) {
    assert.deepStrictEqual(verdict({ ratioMin: ratio, ratioMax: ratio, pixelRatio: ratio,
      reliable: false, reasons: ['unsupported rendering'] }),
    { verdict: 'inconclusive', reasons: ['unsupported rendering'] });
  }
});
check('disabled control is exempt', () => assert.deepStrictEqual(verdict({ disabled: true }), { verdict: 'inconclusive', reasons: ['disabled control: WCAG exempt'] }));
check('missing or invalid measurements are inconclusive', () => {
  for (const value of [null, undefined, NaN, Infinity, 0, 22]) {
    assert.strictEqual(verdict({ pixelRatio: value }).verdict, 'inconclusive');
  }
  assert.strictEqual(verdict({ ratioMin: 8, ratioMax: 7 }).verdict, 'inconclusive');
});
check('three-to-one boundary for large text and non-text', () => {
  assert.strictEqual(verdict({ threshold: 3, ratioMin: 3, ratioMax: 3, pixelRatio: 3 }).verdict, 'pass');
  assert.strictEqual(verdict({ threshold: 3, ratioMin: 2.99, ratioMax: 2.99, pixelRatio: 2.99 }).verdict, 'fail');
});
check('reason inputs are preserved without mutation', () => {
  const reasons = ['document canvas fallback'];
  assert.deepStrictEqual(verdict({ reasons }).reasons, reasons);
  verdict({ disabled: true, reasons });
  assert.deepStrictEqual(reasons, ['document canvas fallback']);
});
console.log(`${checks} checks passed; 0 failed.`);
