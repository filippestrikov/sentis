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
npx playwright install webkit
SENTIS_WEBKIT=1 npx playwright test --project=public-webkit --workers=1 # opt-in public WebKit (PowerShell: set $env:SENTIS_WEBKIT='1' first)
```

Roles without credentials are skipped, and so are the tests that need them.

Failure evidence and masked summaries are preserved under `E:\Codex\Sentis-evidence`
in this checkout layout (`<YYYY-MM-DD>/<case id>/<HHMMSS>-<project>/`, UTC). The default
is beside the main repo, including when running from an agent worktree; set
`SENTIS_EVIDENCE_DIR` to override it (relative paths resolve from the repo root).
Each failure reserves a distinct timestamp folder, including retries in the same second.
The authenticated `chromium` project disables automatic screenshots. Authenticated images
are retained only for case IDs in `tests/support/evidence-policy.js` reviewed by Claude
on 2026-10-10, and only with attachment names beginning `reviewed:`. Automatic
`screenshot` attachments are withheld. Summaries count withheld images without their content.
Public images are retained as before. JSON attachments beginning `evidence:` retain only
allowlisted geometry/control fields, bounded arrays of objects and safe scalar values;
summaries record dropped counts. Other JSON attachments are discarded. Names containing
`geometry` produce `geometry.json`; collisions receive numeric suffixes.
Run `npm run security:evidence-check` for the offline synthetic privacy gate, including
pure sanitizer checks, image gating, JSON filtering, ZIP-aware marker scanning and folder
collisions. Its fixtures live outside the main test directory and use no real credentials
or auth files. The test-only screenshot allowlist is enabled only by
`SENTIS_EVIDENCE_POLICY_TEST=1`; never set it for staging runs.
Text scanning cannot detect personal data rendered as pixels; images are controlled by
the reviewed-screenshot allowlist, not by scanning.
Only the `public` project's traces and videos are preserved. The `setup` project
and `.auth/` are never copied. A command-line `--reporter` replaces the configured
reporters; the config rejects overrides unless the mask reporter is first. For example,
`--reporter=./tests/support/mask-reporter.js,list` (add the evidence reporter to preserve evidence).

## Credential leak checks

```sh
npm run security:leak-check                 # run before every PR
node scripts/check-artifact-leaks.js        # scan after any run with real credentials
node scripts/check-artifact-leaks.js --self-test
```

The regression gate sends two failed sign-in attempts to staging using random,
nonexistent `example.invalid` addresses. It uses the real setup project and configured
mask, list, HTML, evidence and JUnit reporters, disables retries, and verifies both
credential pairs were typed and submitted. Shell marker credentials override `.env`;
other credential variables are blanked. Existing `.auth/` sessions are backed up and
restored in `finally`. The runner captures and scans console output rather than printing it.
Evidence goes to a temporary directory, whose path appears in the scan output.
Reports in `playwright-report/` and `test-results/` are replaced by this run.

Failed setup clears credential inputs and verifies they are empty before Playwright
1.55.1 creates `error-context.md`. If clearing fails, cleanup navigates to a blank page.
Tracing and screenshots being off does not disable the page snapshot. Login assertions
are unchanged; cleanup runs only after failure.

On Playwright 1.55.1, putting HTML before mask still yielded no leaks: HTML serializes
the shared, already-masked step objects at the end of the run. Omitting mask instead
produced four marker hits in the HTML embedded ZIP and made the gate exit 1. Keep mask
first for reporters that consume step titles immediately and for future versions.

The scanner uses Node built-ins, scans every artifact file (including binary files),
decompresses ZIP central-directory entries and the HTML report's embedded ZIP, and
checks raw, URL-encoded and JSON-escaped secret values. It reads `.env` with the same
parser as the config without overriding shell values. Normal scans use nonempty env
variables containing EMAIL, PASSWORD or TOKEN; `--marker-only` uses only
`SENTIS_LEAKCHECK_*`. Hits print variable names and paths only. Exit codes are 0 for
no hits, 1 for leaks, and 2 for unreadable inputs (including unsupported/corrupt ZIPs).
Missing directories are reported as skipped. The self-test is a positive control for
plain, JSON-escaped and deflated ZIP-entry leaks.

These checks cover the configured list, HTML, JUnit and evidence reporters on the
verified workflows. JUnit serializes failure messages and stdout/stderr, not step
titles; those artifacts are scanned too. The mask reporter redacts step titles, not
arbitrary logging or every possible error message. Blob/JSON reporters and `--ui`
are not covered; do not use them with real credentials. The scanner cannot detect
text rendered as pixels in screenshots or prove safety for secret values it was not
given. Scan artifacts before sharing them.

## Tracking

- `docs/automation/FRAMEWORK_AUDIT.md`: framework decisions
- `docs/automation/backlog-inventory.json`, `coverage-matrix.csv`, `requirements-gaps.md`: SNTS backlog analysis and coverage
