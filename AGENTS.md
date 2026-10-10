# Sentis (SAM) Playwright QA: agent rules

Claude (lead, reviewer) and Codex (implementation) turn the SNTS Jira backlog into
JavaScript Playwright regression tests against staging https://sam.sentis.com/ (there is
no production yet). These rules bind both agents.

## Sources of truth

1. **Jira project SNTS**: the issue, its later comments and linked issues. Later comments override the description.
2. **Confluence QA space**: Requirements (page 133201928), Sentis - Test Suite (131498118),
   Issue list / Test Cases coverage (331644931).
3. Figma, Drive and videos linked from tickets as supporting evidence only. Never invent their contents.

A backlog issue is not proof that the defect still reproduces or has been fixed. Test the
corrected expected behavior; if the defect is present the test fails, and that failure is documented, not hidden.

## Work queue and tracking

- `docs/automation/backlog-inventory.json`: one entry per analyzed SNTS issue (classification A–G, decision, blockers).
- `docs/automation/coverage-matrix.csv`: Jira ID, area, classification, decision, test file,
  test ID, execution status, review status, commit, evidence, notes, owner.
- `docs/automation/requirements-gaps.md`: open questions for the QA owner.
- Work only on rows whose `owner` is you. Edit only your own rows so branches merge cleanly.
- Execution status values: `not-run`, `passed`, `failed-defect`, `failed-test`, `blocked`, `skipped`.
  Never record `passed` without a run.

## Tests

- Tag tests that need no session with `{ tag: '@public' }`; the `public` project runs them without login setup.
- Failed/timed-out test evidence is preserved in `Sentis-evidence` beside the main repo (override with `SENTIS_EVIDENCE_DIR`), one new timestamped folder per failure under its Jira ID. What is kept follows "Evidence and screenshot privacy" below; the per-test strategy is in `docs/automation/evidence-strategy.md`.
- Mobile tests use Chromium device emulation and do not represent iOS Safari. Opt-in `public-webkit` runs only with `SENTIS_WEBKIT=1`. WebKit emulation is closer to Safari's engine but is still not a real iPhone. Authenticated projects do not use WebKit yet.
- One `test()` per Jira issue scenario. The title starts with the key: `'SNTS-123: saving a profile keeps the new name'`.
- One spec per functional area: `tests/<area>.spec.js`. Expected copy lives in `tests/fixtures/<area>.json`.
- Shared helpers live in `tests/support/`. Do not edit them in an issue branch; propose changes in a separate small branch.
- Signed-in tests call `asRole(test, '<role>')` from `tests/support/roles.js`. It skips with
  the missing env var named when the role's session is not available.
- Selectors: `getByRole` / `getByLabel` with an accessible name, `getByText` with `exact: true`,
  existing test IDs. No CSS classes, nth-child or XPath. Scope to a dialog or region when names repeat.
- Assert after every meaningful action. No fixed sleeps (`waitForTimeout`). Comments only for non-obvious behavior.
- A missing prerequisite becomes `test.skip(condition, 'reason naming the env var or fixture')`.
  Never fake data by editing the DOM or mocking the app's own API.
- Assert no more strictly than the issue and requirements state. AI-generated text (class F)
  gets contract and workflow assertions, never exact wording without an approved spec.

### Known staging behavior

- Cold load is ~4.5 s; signed-in shells wait for `/v1/auth/me` after load.
- api-sam slows under parallel load. Use `gotoApp` for app navigation.
- Fresh public `/` sends no bootstrap request; use `{ waitForBootstrap: false }` there.
- `/` shows the sign-in form ("Welcome to Sentis Applied Minds"). Client users sign in there.
- Super-admins sign in through the header's "Super Admin" button, a "Sentis Super Admin"
  dialog whose inputs are named only by placeholder (no labels).

## Accounts and data safety

- Roles: `super-admin`, `client-admin`. More roles are added by the QA owner as tests need them.
- Credentials come only from env vars (`SENTIS_<ROLE>_EMAIL` / `_PASSWORD`, see `.env.example`).
  Never write emails or passwords into source, docs, logs or prompts.
- Staging holds shared data. Tests that create data use a recognizable `QA-auto-<agent>-<timestamp>`
  name and clean up in `finally`. No destructive admin actions, real invitations or
  outbound email to real users without the QA owner's explicit approval for that test.
- Super-admin tests must not change cross-company settings unless approved.
- The super-admin account belongs to a real person and is shared. Tests that change UI-level context (selected organization, filters stored per user, theme) must restore it in `finally` and assert the restore (see `tests/super-admin-sam-ai.spec.js`).
- Tests must not change passwords, profiles or notification preferences on shared accounts.

### Sensitive data

Step titles are masked by `tests/support/mask-reporter.js`, so keep it first in the reporter list.
Run `npm run security:leak-check` before every PR and `node scripts/check-artifact-leaks.js`
after any run with real credentials. The config rejects CLI reporter overrides unless
`./tests/support/mask-reporter.js` is first (for example,
`--reporter=./tests/support/mask-reporter.js,list`).
The configured list, HTML, JUnit and evidence reporters are checked by the synthetic
setup regression and the real-credential artifact scan. JUnit writes failure messages
and stdout/stderr rather than step titles; scanning covers these too. Step masking does
not sanitize arbitrary logs or all possible assertion errors. Blob/JSON reporters and
`--ui` are not covered: do not use them with real credentials.
Failed setup clears and verifies credential inputs before Playwright's failure page
snapshot; if clearing fails it navigates to a blank page. Trace/screenshot settings
alone do not prevent `error-context.md` from retaining typed values.
Never share `playwright-report/` or `test-results/` from signed-in runs without checking them for sensitive data. Traces are retained only for `public`; `setup` disables screenshots as well.

### Evidence and screenshot privacy

Staging pages show real people. A visual mask once matched nothing and an evidence screenshot kept
account names and emails (2026-10-10, SNTS-204). Text scanners cannot read images, so images are
controlled by policy, not by scanning.

- Default: do not capture or retain screenshots of signed-in pages that show user names, email
  addresses, personal information, account details or other sensitive data (Manage, Inspect Users,
  User Details, Audit Logs, Prompt History, observation lists). Automatic failure screenshots are off
  for signed-in projects.
- Do not rely on a visual mask that nobody has verified on an actual capture.
- Prefer non-sensitive assertions and structured evidence: geometry (widths, boundaries, expected and
  actual edges), selector descriptions and minimal diagnostic metadata. Attach it as JSON named
  `evidence: <what>`; the evidence reporter keeps only allowlisted fields
  (`tests/support/evidence-policy.js`) and writes them as `<slug>.json`.
- Screenshots of public pages without sensitive data are allowed.
- A signed-in screenshot is retained only when the capture has been reviewed by eye and proven safe:
  its case ID is in `reviewedScreenshotCases` and the attachment name starts with `reviewed:`.
  Adding a case to that list needs lead review of a real capture. Re-review when the page changes.
- Never save full signed-in traces, storage state, session cookies or request/response bodies.
- Never put secrets or personal data in test names, step titles, assertion messages, console output,
  reports or evidence. Identify regions by section heading or control name, never by row content.
- Open every new evidence image you retain before reporting it.
- `npm run security:evidence-check` (synthetic personal data, offline) must pass after any change to
  reporters, evidence handling, screenshots, traces or authentication.

## Git

- Each agent works in its own worktree: `../Sentis-worktrees/<agent>` on `<agent>/<slug>`, e.g. `codex/snts-123-profile-save`.
- Commit to your branch only. Never commit to `main`, push, or force-push. The QA owner merges.
- Never commit `.env`, `.auth/`, `test-results/`, `playwright-report/`.

## Jira and Confluence

Read-only for agents. Any write (comment, transition, new issue, edit, page change) needs the
QA owner's explicit "yes" for that exact content. Earlier approvals do not carry over.

## Definition of done for an issue

1. The issue and its requirements were read; existing coverage checked.
2. The test asserts the corrected expected behavior with stable selectors.
3. `npx playwright test tests/<area>.spec.js --workers=1` was run and the result is recorded in the coverage matrix with evidence.
4. Claude reviewed the diff and set review status `approved`.
