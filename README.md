# Sentis (SAM) QA automation

Playwright (JavaScript) regression tests for the SAM staging app, https://sam.sentis.com/,
built from the SNTS Jira backlog. Agent rules: [AGENTS.md](AGENTS.md).

## Setup

```sh
npm ci
npx playwright install chromium
cp .env.example .env   # fill in role credentials; .env is gitignored
```

## Run

```sh
npx playwright test                         # all tests; the setup project signs roles in first
npx playwright test --project=public        # public tests only; no login setup
npx playwright test tests/<area>.spec.js --workers=1
npx playwright test --list                  # discovery only
npx playwright show-report
```

Roles without credentials are skipped, and so are the tests that need them.

Failure screenshots and masked summaries are preserved under `E:\Codex\Sentis-evidence`
in this checkout layout (`<YYYY-MM-DD>/<case id>/<HHMMSS>-<project>/`, UTC). The default
is beside the main repo, including when running from an agent worktree; set
`SENTIS_EVIDENCE_DIR` to override it (relative paths resolve from the repo root).
Only the `public` project's traces and videos are preserved. The `setup` project
and `.auth/` are never copied. A command-line `--reporter` replaces the configured
reporters and turns evidence preservation off; omit it, or pass
`--reporter=list,./tests/support/evidence-reporter.js`.

## Tracking

- `docs/automation/FRAMEWORK_AUDIT.md`: framework decisions
- `docs/automation/backlog-inventory.json`, `coverage-matrix.csv`, `requirements-gaps.md`: SNTS backlog analysis and coverage
