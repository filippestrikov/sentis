# Evidence strategy per test

The policy is in `AGENTS.md`, section "Evidence and screenshot privacy". This file records, for every test, what
evidence is kept when it fails. "Reviewed" means Claude opened a real capture on 2026-10-10 and found no personal data.

Every failure always keeps `summary.json`: masked title, status, duration and error message, plus withheld and dropped
counts. Failures are written to `Sentis-evidence/<UTC date>/<Jira ID>/<time>-<project>/`, a new folder per failure.

| Test | Project | Page sensitivity | Evidence kept | Images |
|---|---|---|---|---|
| setup (sign in as super-admin / client-admin) | setup | Credentials | Nothing; setup is never copied | None; screenshots off; inputs cleared before the failure snapshot |
| SNTS-156 Super Admin login popup on mobile | public | Public sign-in page | Screenshot, trace, video | Allowed (public, no session) |
| SNTS-139 role access (both scenarios) | chromium | Dashboards | Summary only | None |
| SNTS-138 Custom date range picker | chromium | Manage tab lists accounts | Reviewed screenshot | Reviewed: Manage account card and org form masked, page blanked afterwards |
| SNTS-221 Observation legend icon | shared-account | PST Reports can list observations | `observation-icon.json`: section, company checked, control, visibility and icon dimensions; summary | Withheld: the tab panel capture is not reviewed |
| SNTS-265 SAM AI organization switch | shared-account | Crash screen; SAM AI dashboard | Reviewed crash screenshots; the switch log is not retained (not an `evidence:` attachment) | Reviewed: error screen has no data |
| SNTS-204 sections fit mobile without overflow | shared-account (iPhone) | Manage, User Details, Audit Logs and Prompt History list people | `geometry.json` (tab, section heading, widths, cut in px) | None, by design |
| SNTS-205 New Training Module dialog | chromium (iPhone) | Training content | Reviewed screenshot | Reviewed: dialog over the training list; no people |
| SNTS-209 Edit Training Module dialog | chromium (iPhone) | Training content | Reviewed screenshot | Reviewed: the table mask also covers the lower half of the dialog; the defect (Close over the title) stays visible |
| SNTS-140 invite dialog, desktop and mobile | chromium | Users table behind the dialog | Reviewed screenshot | Reviewed: users table masked (mask verified on a real capture) |
| SNTS-183 invite dialog on mobile | chromium (iPhone) | Users table behind the dialog | Reviewed open-dialog screenshot | Reviewed: users table masked (verified). The catch-path "Inspect Users failure" capture is withheld (not reviewed) |
| SNTS-176 custom range calendar on mobile | chromium (iPhone) | Client admin dashboard counts | Reviewed screenshot | Reviewed: calendar over dashboard counts |
| SNTS-197 Log Out in mobile sidebar | chromium (iPhone) | Sidebar (not reviewed) | `log-out-bounds.json`: control bounds, viewport, outside edges and sidebar scrolling, or not found; summary | Withheld |
| SNTS-161 sidebar Close contrast in dark theme | chromium (iPhone 15 Pro Max emulation) | Signed-in homepage and sidebar (not reviewed) | `contrast.json`: Close control, kind, threshold, colours, computed/pixel ratios, verdict and method; first inconclusive reason in `actual` | None retained; helper measures only the Close icon in memory |
| SNTS-182 tab switch scroll position | chromium (iPhone) | Client admin content (not reviewed) | `scroll-position.json`: Training/Guides scroll positions, expected positions, scroll/client heights and connected/replaced state when known; summary | Withheld |
| SNTS-242 development guide title | chromium | Pre-start observation form, guide dialog | Reviewed screenshot | Reviewed: form and guide, no people |
| SNTS-167 guide header on mobile | chromium (iPhone) | Same page as SNTS-242 | Reviewed screenshot | Reviewed with SNTS-242 |
| SNTS-94 Terms Close clear of content, mobile and tablet | public (four Chromium devices) | Public Terms dialog | `close-overlap.json`: clipped text and control geometry; summary | No explicit captures; public failure screenshots/trace allowed |
| SNTS-117 public popup borders, both desktop sizes | public | Public Terms and Super Admin sign-in dialogs | `border-crossings.json`: visible border segment geometry; summary | Public automatic failure screenshots/trace allowed |
| SNTS-117 Invite Tenant User popup borders | chromium | Users table behind the dialog | `border-crossings.json`: control containment and border geometry; summary | None; no screenshots or traces |
| SNTS-117 New Training Module popup borders | chromium | Training list and empty module dialog | `border-crossings.json`: control containment and border geometry; summary | None; no screenshots or traces |
| SNTS-117 Observation Details Close in dark theme, both desktop sizes | chromium | Observation detail contains people, locations and comments | Failure only: `observation-close.json`, size and mouse/keyboard label, Close geometry, boundary, expected/actual containment, border count and focus booleans; summary | None; no screenshots or traces; no row or dialog text |
| SNTS-251 SAM AI Coach close and draft input on mobile | chromium (iPhone) | Coach may show conversation history | `coach-controls.json`: viewport/control geometry and non-GET request count; summary | None; no screenshots or traces |

Avatar initials in the header (for example "SA", "AM") are visible in reviewed captures. They were judged
non-identifying.

## Adding or changing a test

1. Choose structured evidence first: measurements and boundaries, selector descriptions, heading names.
2. Add a signed-in screenshot only if a structured value cannot show the failure. Then capture once, open the image,
   confirm that no person is visible, add the Jira ID to `reviewedScreenshotCases` with a one-line reason, and prefix the
   attachment name with `reviewed:`.
3. Update this table in the same commit.
