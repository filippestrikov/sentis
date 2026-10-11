// Explicit authenticated captures reviewed by Claude on 2026-10-10.
const reviewedScreenshotCases = new Set([
  'SNTS-138', // Date picker over dashboard; user-bearing panels masked.
  'SNTS-140', // Empty invitation dialog; background table masked.
  'SNTS-167', // Development guide dialog; no people in the capture.
  'SNTS-176', // Date calendar over training dashboard; no people in the capture.
  'SNTS-183', // Empty invitation dialog; background table masked.
  'SNTS-205', // New module dialog over training list; no people.
  'SNTS-209', // Edit module dialog; background table masked.
  'SNTS-242', // Development guide title; no people in the capture.
  'SNTS-265', // SAM AI error screen; no people in the capture.
]);

if (process.env.SENTIS_EVIDENCE_POLICY_TEST === '1') {
  for (const id of (process.env.SENTIS_EVIDENCE_POLICY_TEST_CASES || '').split(',')) {
    if (/^SNTS-9\d{3}$/.test(id)) reviewedScreenshotCases.add(id);
  }
}

// String values are bounded and filtered for "@" and secrets, but heading text could still be a person's name; tests must label by section heading only.
const structuredFields = new Set([
  'tab', 'section', 'label', 'control', 'selector', 'expected', 'actual', 'boundary',
  'withinViewport', 'elementWidth', 'elementHeight', 'clipContainerWidth', 'cutPx',
  'viewportWidth', 'viewportHeight', 'x', 'y', 'width', 'height', 'right', 'bottom',
  'ratio', 'ratioMin', 'ratioMax', 'pixelRatio', 'threshold', 'foreground', 'background', 'method', 'verdict', 'kind',
]);

// Secrets are an explicit input: the sanitizer never reads or mutates environment/state.
function sanitizeStructured(value, maskedSecrets = []) {
  let dropped = 0;
  let items = 0;
  const reject = () => { dropped++; return undefined; };
  const scalar = item => {
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item === 'string' && item.length <= 80 && !/[@\r\n\u2028\u2029]/.test(item)
      && !item.includes('<masked>') && !maskedSecrets.some(secret => secret && item.includes(secret))) return item;
    return reject();
  };
  const object = (item, depth) => {
    if (depth > 3 || !item || typeof item !== 'object' || Array.isArray(item)) return reject();
    const data = {};
    for (const [key, field] of Object.entries(item)) {
      if (!structuredFields.has(key)) { reject(); continue; }
      const clean = Array.isArray(field) ? array(field, depth + 1) : scalar(field);
      if (clean !== undefined) data[key] = clean;
    }
    return data;
  };
  const array = (list, depth) => {
    if (depth > 3) return reject();
    const data = [];
    for (const item of list) {
      if (items >= 200) { reject(); continue; }
      items++;
      const clean = object(item, depth);
      if (clean !== undefined) data.push(clean);
    }
    return data;
  };
  const data = Array.isArray(value) ? array(value, 1) : object(value, 1);
  return { data: data === undefined ? null : data, dropped };
}

module.exports = { reviewedScreenshotCases, structuredFields, sanitizeStructured };
