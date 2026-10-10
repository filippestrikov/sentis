# Framework audit

Date: 2026-10-10. Scope: Phase 1 of the SNTS backlog automation initiative.

## Starting point

`github.com/filippestrikov/sentis` held only an initial README. No test framework, CI or
page objects existed, so this audit records the framework set up for the project rather than an
inherited one.

## References used

| Reference | Taken | Not taken |
|---|---|---|
| `confluence_template` (QA documentation standard) | Test-case fields, bug-report structure, automation summary shape for later Confluence pages | Confluence page tree (documentation work, not in this repo's scope) |
| Local Flexed Playwright repo | JS + Playwright Test 1.55.1, `list`/`html`/CI `junit` reporters, trace and screenshot on failure, agent rules layout, per-agent worktrees, Codex dispatcher, one test per case titled by ID | All URLs, selectors, accounts, CMS lock, mailbox helper, workbook queue |

## Structure

```
playwright.config.js     baseURL https://sam.sentis.com/, projects: setup -> chromium
tests/auth.setup.js      signs in each role with credentials, saves .auth/<role>.json
tests/support/roles.js   role registry, credentials(), asRole(test, role)
tests/<area>.spec.js     one spec per functional area (none yet)
tests/fixtures/          expected copy per area (none yet)
scripts/codex-task.ps1   dispatches one task packet to Codex in ../Sentis-worktrees/codex
docs/automation/         audit, backlog inventory, coverage matrix, requirements gaps
```

## Conventions

These are binding and are listed in AGENTS.md: selectors by role or label, one test per Jira scenario
titled `SNTS-<n>: ...`, no fixed sleeps, skip with the missing env var named, tests that create data
use the `QA-auto-` prefix and clean up after themselves, and Jira and Confluence stay read-only.

## Commands

```sh
npm ci && npx playwright install chromium
npx playwright test --list
npx playwright test tests/<area>.spec.js --workers=1
```

Environment: Node 18.15 locally. Node 18 lacks `process.loadEnvFile`, so the config reads `.env` itself.

## Authentication (observed on staging, 2026-10-10)

- Client users: sign-in form on `/` (labelled "Email" and "Password" fields, "Sign In" button).
- Super-admin: header button "Super Admin" opens dialog "Sentis Super Admin". Its inputs are
  unlabelled, so their accessible names are their placeholders (`admin@sentis.com`, `••••••••`).
  This is an accessibility gap, and the selectors break if the placeholders change.
- The post-login landing page is not yet verified, so the setup only asserts that the sign-in form is gone.
  Tighten this assertion once a real sign-in has been observed.

## Missing prerequisites

- Passwords for `super-admin` and `client-admin` in `.env` (`SENTIS_*_PASSWORD`).
- Other roles (company user, etc.): to be added by the QA owner as tests need them.
- CI: none configured. Decide later between Jenkins (used on Flexed) and GitHub Actions.
