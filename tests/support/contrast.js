const thresholds = Object.freeze({ 'text-normal': 4.5, 'text-large': 3, 'non-text': 3 });

function relativeLuminance(rgb) {
  const channels = rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function composite(fgRGBA, bgRGB) {
  const alpha = fgRGBA[3];
  return bgRGB.map((channel, i) => fgRGBA[i] * alpha + channel * (1 - alpha));
}

function contrastVerdict({ threshold, ratioMin, ratioMax, pixelRatio, reliable = true, disabled = false, reasons = [] }) {
  const notes = [...new Set(reasons)];
  const result = verdict => ({ verdict, reasons: notes });
  if (disabled) {
    notes.push('disabled control: WCAG exempt');
    return result('inconclusive');
  }
  if (![ratioMin, ratioMax, pixelRatio].every(value => Number.isFinite(value) && value >= 1 && value <= 21)
      || !Number.isFinite(threshold) || threshold < 1 || threshold > 21 || ratioMin > ratioMax) {
    notes.push('measurement unavailable');
    return result('inconclusive');
  }
  if (!reliable) {
    if (!notes.length) notes.push('unsupported rendering');
    return result('inconclusive');
  }
  if (ratioMin >= threshold && pixelRatio >= threshold) return result('pass');
  if (ratioMax < threshold && pixelRatio < threshold) return result('fail');
  notes.push(ratioMin < threshold && ratioMax >= threshold ? 'gradient spans threshold' : 'methods disagree');
  return result('inconclusive');
}

async function measureContrast(locator, { kind } = {}) {
  if (!Object.prototype.hasOwnProperty.call(thresholds, kind)) throw new TypeError('Unsupported contrast kind');
  const threshold = thresholds[kind];
  const computed = await locator.evaluate(element => {
    const reasons = [];
    let reliable = true;
    const unsupported = reason => {
      reliable = false;
      if (!reasons.includes(reason)) reasons.push(reason);
    };
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const colour = value => {
      if (!context || !CSS.supports('color', value)) {
        unsupported('unsupported CSS colour');
        return [0, 0, 0, 0];
      }
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      return [pixel[0], pixel[1], pixel[2], pixel[3] / 255];
    };
    const parent = node => node.parentElement || node.getRootNode().host || null;
    const split = value => {
      const pieces = [];
      let depth = 0;
      let start = 0;
      for (let i = 0; i < value.length; i++) {
        if (value[i] === '(') depth++;
        if (value[i] === ')') depth--;
        if (value[i] === ',' && depth === 0) {
          pieces.push(value.slice(start, i).trim());
          start = i + 1;
        }
      }
      pieces.push(value.slice(start).trim());
      return pieces;
    };
    const gradientColours = image => {
      const stops = [];
      const images = split(image);
      if (images.length > 1) unsupported('multiple background images');
      for (const layer of images) {
        if (!/^(linear|radial)-gradient\(/i.test(layer)) {
          unsupported('unsupported background image');
          continue;
        }
        const parts = split(layer.slice(layer.indexOf('(') + 1, -1));
        for (const part of parts) {
          // A direction, shape or interpolation prefix is not a colour stop.
          if (/^(?:in\s|to\s|circle\b|ellipse\b|closest-|farthest-|at\s)/i.test(part)) continue;
          const match = part.match(/^(#[\da-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|[a-z]+\b)/i);
          if (match && CSS.supports('color', match[1])) {
            const stop = colour(match[1] === 'currentcolor' ? getComputedStyle(element).color : match[1]);
            if (stop[3] < 1) unsupported('translucent gradient stop');
            stops.push(stop);
          } else if (!/^(?:[-+\d.]|in\s)/i.test(part)) unsupported('unparsed gradient stop');
        }
      }
      if (stops.length < 2) unsupported('gradient stops unavailable');
      return stops;
    };
    const svg = element.matches('svg') ? element : element.querySelector('svg');
    let paint = element;
    let foreground;
    if (svg) {
      const candidates = [svg, ...svg.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse, text, use')];
      const stroke = candidates.find(node => {
        const style = getComputedStyle(node);
        return style.stroke !== 'none' && style.display !== 'none' && style.visibility === 'visible';
      });
      paint = stroke || candidates.find(node => getComputedStyle(node).fill !== 'none') || svg;
      const style = getComputedStyle(paint);
      foreground = colour(stroke ? style.stroke : style.fill !== 'none' ? style.fill : style.color);
      const paints = candidates.slice(1).flatMap(node => {
        const css = getComputedStyle(node);
        return [css.stroke, css.fill].filter(value => value !== 'none').map(value => colour(value).join(','));
      });
      if (new Set(paints).size > 1) unsupported('multiple SVG paint colours');
      if (style.strokeOpacity !== '1' || style.fillOpacity !== '1') unsupported('SVG paint opacity');
    } else foreground = colour(getComputedStyle(element).color);
    if (foreground[3] === 0) unsupported('transparent foreground');
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) unsupported('zero size');
    let disabled = false;
    let opacity = 1;
    let supplier = null;
    const layers = [];
    for (let node = paint; node; node = parent(node)) {
      const style = getComputedStyle(node);
      if (node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true') disabled = true;
      if (style.display === 'none' || style.visibility !== 'visible' || style.contentVisibility === 'hidden') unsupported('element not visible');
      if (style.filter !== 'none') unsupported('filter');
      if (style.backdropFilter && style.backdropFilter !== 'none') unsupported('backdrop-filter');
      if (style.mixBlendMode !== 'normal') unsupported('mix-blend-mode');
      if (/url\(/i.test(style.backgroundImage)) unsupported('background-image url');
      const nodeOpacity = Number(style.opacity);
      if (nodeOpacity === 0) unsupported('element not visible');
      if (supplier) {
        if (nodeOpacity < 1) unsupported('opacity above background layer');
        continue;
      }
      opacity *= nodeOpacity;
      const background = colour(style.backgroundColor);
      if (style.backgroundImage !== 'none') {
        const stops = gradientColours(style.backgroundImage);
        // The image paints above this layer's background colour.
        layers.push({ stops, base: background });
        supplier = node;
      } else {
        layers.push({ stops: [background], base: null });
        if (background[3] === 1) supplier = node;
      }
      if (supplier && nodeOpacity < 1) {
        reasons.push('background layer opacity multiplies foreground alpha');
        // Group opacity also affects its background; the backdrop is not sampled here.
        unsupported('background layer opacity needs external backdrop');
      } else if (nodeOpacity < 1 && background[3] > 0) unsupported('translucent group background');
    }
    if (!supplier) reasons.push('document canvas fallback: html/body backgrounds or white');
    foreground[3] *= opacity;
    if (foreground[3] === 0) unsupported('transparent foreground');
    return { foreground, layers, reliable, reasons, disabled };
  });

  let backgrounds = [[255, 255, 255]];
  for (const layer of [...computed.layers].reverse()) {
    backgrounds = backgrounds.flatMap(background => layer.stops.map(stop =>
      composite(stop, layer.base ? composite(layer.base, background) : background)));
  }
  const pairs = backgrounds.map(background => {
    const foreground = composite(computed.foreground, background);
    return { background, foreground, ratio: contrastRatio(foreground, background) };
  }).sort((a, b) => a.ratio - b.ratio);
  const worst = pairs[0];
  const ratioMin = worst ? worst.ratio : null;
  const ratioMax = pairs.length ? pairs[pairs.length - 1].ratio : null;
  if (backgrounds.length > 1) {
    const luminances = backgrounds.map(relativeLuminance);
    const ink = relativeLuminance(computed.foreground.slice(0, 3));
    if (ink > Math.min(...luminances) && ink < Math.max(...luminances)) {
      computed.reliable = false;
      computed.reasons.push('gradient interior may reduce contrast below stop ratios');
    }
  }

  let pixelRatio = null;
  let buffer;
  let dataURL;
  try {
    if (computed.reasons.includes('zero size') || computed.reasons.includes('element not visible')) {
      computed.reasons.push('pixel measurement unavailable');
    } else {
      buffer = await locator.screenshot({ scale: 'device', animations: 'disabled' });
      dataURL = `data:image/png;base64,${buffer.toString('base64')}`;
      pixelRatio = await locator.evaluate(async (_element, source) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        if (canvas.width < 3 || canvas.height < 3) return null;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const border = [[], [], []];
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const index = (y * canvas.width + x) * 4;
            if (pixels[index + 3] !== 255) return null;
            if (x === 0 || y === 0 || x === canvas.width - 1 || y === canvas.height - 1) {
              for (let channel = 0; channel < 3; channel++) border[channel].push(pixels[index + channel]);
            }
          }
        }
        const background = border.map(channels => {
          channels.sort((a, b) => a - b);
          const mid = Math.floor(channels.length / 2);
          return channels.length % 2 ? channels[mid] : (channels[mid - 1] + channels[mid]) / 2;
        });
        const luminance = rgb => {
          const linear = rgb.map(channel => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
        };
        const base = luminance(background);
        let greatest = 1;
        for (let index = 0; index < pixels.length; index += 4) {
          const ink = luminance([pixels[index], pixels[index + 1], pixels[index + 2]]);
          greatest = Math.max(greatest, (Math.max(ink, base) + 0.05) / (Math.min(ink, base) + 0.05));
        }
        return greatest;
      }, dataURL);
    }
  } catch {
    // Playwright errors may contain page text; retain only a fixed diagnostic.
    computed.reliable = false;
    computed.reasons.push('pixel measurement unavailable');
  } finally {
    if (buffer) buffer.fill(0);
    buffer = null;
    dataURL = null;
  }
  const rgb = channels => channels ? `rgb(${channels.map(Math.round).join(', ')})` : null;
  return {
    method: 'computed+pixel', threshold,
    foreground: rgb(worst && worst.foreground), background: rgb(worst && worst.background),
    ratioMin, ratioMax, pixelRatio,
    ...contrastVerdict({ threshold, ratioMin, ratioMax, pixelRatio, reliable: computed.reliable,
      disabled: computed.disabled, reasons: computed.reasons }),
  };
}

module.exports = { measureContrast, relativeLuminance, contrastRatio, composite, contrastVerdict };
