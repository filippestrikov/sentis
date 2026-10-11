# Contrast testing method (proposal, Batch 4)

Status: proposal plus one proof of concept (SNTS-161). Contrast assertions are **not** applied across the app.
Each new contrast test needs its own ticket, a named element and lead review.

## Reference

WCAG 2.2 AA, unless a ticket or approved design says otherwise:

| Kind | Criterion | Minimum |
|---|---|---|
| `text-normal` | 1.4.3 Contrast (Minimum) | 4.5:1 |
| `text-large` (≥ 24 px, or ≥ 18.66 px bold) | 1.4.3 | 3:1 |
| `non-text`: icons that are the only label of a control, focus indicators, input borders | 1.4.11 Non-text Contrast | 3:1 against adjacent colours |

Exempt (WCAG): disabled/inactive controls, decorative graphics, logos, text in images. A test reports these as
`inconclusive: exempt`, never as pass or fail.

A ticket that says "unreadable" or "almost invisible" without a number is mapped to the criterion above for the
element's kind. That mapping is an assumption, and every test states it in the coverage matrix notes.

## Why plain computed styles are not enough

`getComputedStyle` gives an element's own colours. The colour a person sees depends on more than that:

- **Transparency.** `rgba()` alpha and `opacity` on the element and its ancestors blend the foreground into what is
  behind it. SNTS-161: the icon is `rgb(17, 24, 39)`, but its button has `opacity: 0.7`, so it renders as about
  `rgb(24, 29, 45)`.
- **Inherited backgrounds.** Most elements are transparent. The real background belongs to an ancestor, or to the
  canvas.
- **Gradients.** `background-image: linear-gradient(...)` has no single colour. The sidebar in SNTS-161 is a gradient
  in both themes.
- **Things the ancestor walk cannot see:** absolutely positioned siblings or overlays behind the element, background
  images, `filter`, `backdrop-filter`, `mix-blend-mode`, and anti-aliasing of thin strokes and small text.
- **Colour spaces.** Computed gradients can stay in `oklch()`/`oklab()`. They are converted by the browser (via a
  1×1 canvas), not by hand-written maths.

## Method: two independent measurements

`tests/support/contrast.js` (`measureContrast(locator, { kind })`):

1. **Computed method.** The foreground is the element's colour (an SVG's stroke or fill for icons). Alpha and every
   `opacity` up to the background layer are composited. The ancestors are walked to the first opaque layer, solid or
   gradient. For a gradient, the ratio is computed against every colour stop, which gives `ratioMin` and `ratioMax`.
2. **Pixel method (cross-check).** An in-memory screenshot of **only that element** is decoded in the page. The
   background is the median of the border ring. The foreground is the pixel that contrasts most with it. The image is
   never attached, written or logged.
3. **Verdict.**
   - `pass`: `ratioMin` and the pixel ratio both meet the threshold.
   - `fail`: `ratioMax` and the pixel ratio are both below the threshold.
   - Anything else is `inconclusive`, with a reason: a gradient spans the threshold, the methods disagree, there is
     an unsupported layer (background image, filter, blend, backdrop), or the element is exempt.

   A test asserts `verdict === 'pass'`. An inconclusive result fails the test with the reason. It is classified as
   needing visual review, not as a product defect, until a person has looked at it.

Pixel limitations: anti-aliasing pulls thin strokes towards the background, so the pixel ratio slightly
under-reads. That is why it confirms the computed result rather than replacing it. Device emulation is not iOS
Safari: colour management and font rendering differ.

## Privacy

The pixel method captures only the target element's own box, for example a 16×16 icon, in memory. Nothing is
retained. Evidence is JSON with allowlisted keys: `kind`, `threshold`, `foreground`, `background`, `ratioMin`,
`ratioMax`, `pixelRatio`, `verdict`, `method`. Do not point the pixel method at an element that contains user
content. Use it on controls, icons, labels and headings only.

## Theme switching

The theme is client-side. "Toggle theme" writes `theme-storage` in `localStorage` and makes no server request
(verified 2026-10-11). It is isolated per browser context, so no restore is needed on the shared accounts. The test
still asserts that no non-GET request was made.

## Calibration (2026-10-11, client admin, iPhone 15 Pro Max emulation, sidebar Close icon)

| Theme | Computed foreground | Background stops | Computed ratio | Pixel ratio | Verdict |
|---|---|---|---|---|---|
| Light | `rgb(17,24,39)` at 0.7 | `oklch(0.984 …)` → `oklch(0.929 …)` | ≈ 6.6 | 6.57 | pass |
| Dark | `rgb(17,24,39)` at 0.7 | `rgb(40,40,60)` → `rgb(20,40,60)` | ≈ 1.2 | 1.17 | fail (SNTS-161) |

The two methods agree within 0.1 in both themes.

## Candidates after the proof of concept (not started)

- **SNTS-203.** SAM AI Usage Trends date labels in dark theme. These are SVG chart text, so `text-normal` applies.
  The chart may draw over grid lines, so expect `inconclusive` more often.
- **SNTS-217.** Edit Guide popup text in dark theme. It needs a list of the text elements to check (headings, labels,
  input text), and the comment "check other popups on the Guide tab" widens the scope. Agree the element list first.
- Do not add an app-wide contrast sweep. Automated sweeps (axe-core `color-contrast`) also report
  "needs review" for gradients and overlays. One could run as an advisory report, outside the pass/fail suite, if
  the QA owner wants one.
