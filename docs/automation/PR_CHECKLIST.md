# PR review and merge checklist, and CI and security requirements

Status 2026-10-11:

- The four branch heads match `origin`:
  - integration 28663a1
  - batch2 168b6ad
  - batch3 b180127
  - batch4 0aa1b9f
- `main` is 48574b6.
- No PRs exist (`git ls-remote origin 'refs/pull/*'` is empty).
- No CI workflow exists: there is no `.github/`. `playwright.config.js` already reacts to `CI=1` (forbid `.only`,
  2 retries, 1 worker, JUnit).

PRs are created by the QA owner from the compare links in `PR_DESCRIPTIONS.md`. Agents never merge.

## Order

| # | Base ← Head | Merge only after |
|---|---|---|
| 1 | `main` ← `claude/sentis-pilot-integration` | Checklist passes on head 28663a1 |
| 2 | `claude/sentis-pilot-integration` ← `claude/sentis-batch2` | PR 1 merged. Then retarget PR 2 to `main` |
| 3 | `claude/sentis-batch2` ← `claude/sentis-batch3` | PR 2 merged. Retarget to `main` |
| 4 | `claude/sentis-batch3` ← `claude/sentis-batch4` | PR 3 merged. Retarget to `main` |

After each retarget, confirm that the PR diff shows only that batch's commits. If earlier commits reappear, stop:
the base was not merged as expected.

Use a merge commit or a rebase merge, not squash. Squashing PR 1 rewrites history that PRs 2–4 are built on.

## Per-PR review checklist

**Scope**

- [ ] The diff touches only the files listed in the PR description.
- [ ] Nothing in `tests/support/*` changed except through a reviewed framework commit named in the description.
- [ ] No approved test lost or weakened an assertion. Compare the `expect` lines in the diff.
- [ ] No known product failure is marked or treated as passing. Matrix `execution_status` values are `passed`,
      `failed-defect`, `failed-unclear`, `failed-test`, `blocked`, `skipped` or `not-run`.
- [ ] Coverage matrix: one row per Jira key, 16 columns, and every automated row has a `coverage_scope`.
      `emulation-only` is never presented as real-device coverage.

**Tests**

- [ ] Each `test()` title starts with its SNTS key, with one test per scenario.
- [ ] Selectors follow AGENTS.md. Documented exceptions only (for example, the unnamed mobile menu button).
- [ ] No `waitForTimeout`, no `.only`, and no DOM edits or API mocking of the app.
- [ ] Shared-account tests restore state in `finally` and assert the restore (organization, theme, viewport).

**Security and privacy, all required**

- [ ] `npm run security:leak-check` passes, with 0 marker hits.
- [ ] `npm run security:evidence-check` passes, 7/7.
- [ ] `npm run test:contrast-math` passes, 15/15 (PR 4 onward).
- [ ] `node scripts/check-artifact-leaks.js` reports 0 hits after any run with real credentials.
- [ ] No tracked `.env`, `.auth/`, `test-results/`, `playwright-report/`, `.codex-runs/`, images, traces or archives.
      Check with `git ls-files | grep -iE "\.env$|\.auth/|test-results|playwright-report|\.codex-runs|\.(png|jpe?g|zip|webm|har)$"`.
- [ ] No credential values in tracked files: compare `.env` values against `git ls-files` content.
- [ ] `mask-reporter.js` is still first in the reporter list, and the reporter-override guard is unchanged.
- [ ] Signed-in screenshots only for cases in `reviewedScreenshotCases`, with `reviewed:` names. New evidence keys
      are added to the allowlist only with lead review.
- [ ] Every image retained by the verification run was opened by eye. Text scans cannot see pixels.

**Execution**

- [ ] `node --check` passes on all tracked JS, and `npx playwright test --list` shows the expected count.
- [ ] The full suite was run from a clean auth state (`.auth/` deleted) with 4 workers or fewer and the configured
      reporters. The counts match the PR description, and each failure is classified as product defect, automation
      defect, blocked, or requirement unclear.

**Merge**

- [ ] The base is the previous batch, or `main` after retargeting. The PR is not a draft. No unresolved review
      comments.
- [ ] After merge, delete the merged head branch only after the next PR has been retargeted.

## CI requirements (workflow exists; staging is manual-only)

The workflow exists in `.github/workflows/qa.yml`, and its staging job is manual-only. It must:

1. **Secrets:** read `SENTIS_*` credentials from repository secrets only, never from files. Use separate
   least-privilege QA accounts where possible. Never echo the environment.
2. **Run order:** `npm ci`, then `node --check` on all JS, then `npm run test:list`, then
   `npm run security:leak-check`, then `npm run security:evidence-check`, then `npm run test:contrast-math`, then
   the suite with `CI=1`.
   - `CI=1` gives 1 worker, which also keeps shared-account tests (SNTS-203 and 265) serial.
3. **Classify, don't hide:** known product defects fail the suite. CI must report the failures against the
   coverage-matrix status rather than mark the job green by skipping. Option: a separate required job for `@public`
   plus the security checks, and an informational job for the signed-in suite.
4. **Artifacts:**
   - Never upload `playwright-report/`, `test-results/`, traces or screenshots from signed-in runs.
   - Upload only the evidence reporter's sanitized `summary.json` and allowlisted `evidence:` JSON, after
     `check-artifact-leaks.js` passes on them.
   - Public-project artifacts may be uploaded.
5. **Retries:** CI retries (2) can hide flakiness. Report flaky results as `flaky`, never as passed.
6. **No writes:** CI must not create data, send invitations or change shared-account settings beyond the asserted
   restores in the tests.
