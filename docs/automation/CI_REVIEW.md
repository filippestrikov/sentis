# CI workflow security review and `staging-qa` environment status (2026-10-11)

> **Decision (QA owner, Batch 6): Option D.** GitHub Actions is credential-free. Authenticated staging regression runs
> locally only. On `codex/ci-workflow` (476f693, local), the staging job, the `run_staging` input, every `secrets.*`
> reference, the `environment:` and the artifact upload are **removed**, so the staging job cannot run even
> manually.
>
> - Actions are pinned to full commit SHAs, verified against the upstream repositories with `git ls-remote`. Each
>   pinned `action.yml` declares `runs.using: node24`:
>   - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`, v7.0.1, July 2026.
>   - `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020`, v7.0.0, July 2026. v7.1.0 was skipped because
>     it was only 3 days old.
> - Validated in a clean clone (no `.env`, no `.auth`, all `SENTIS_*` empty, `CI=1`):
>   - `npm ci` and `node --check` on 27 files;
>   - `test:list` (24 tests) and `test:contrast-math` 15/15;
>   - `security:evidence-check` 7/7 and `security:leak-check` (0 hits).
> - YAML parsed: one job (`validate`), `permissions: contents: read`, a per-ref concurrency group with cancel, and a
>   20-minute timeout.
> - The sections below describe the earlier two-job design and are kept for the record.

Workflow: `.github/workflows/qa.yml` on `codex/ci-workflow` (7be449c, pushed). Reviewer: Claude. The workflow has not
run on GitHub yet: no PR exists, and pushing a non-`main` branch does not trigger it.

## 1. Environment configuration: stopped (plan limitation)

The QA owner approved configuring `staging-qa` with required reviewers. **It was not configured.**

| Fact | Evidence |
|---|---|
| The repository is **private** | `GET https://api.github.com/repos/filippestrikov/sentis` without auth returns 404 |
| It is owned by a **personal account** (`filippestrikov`), so the plan is Free or Pro | Personal accounts cannot hold Team or Enterprise plans |
| Required reviewers need Enterprise for private repositories | GitHub docs, "Deployments and environments": *"If you are on a GitHub Free, GitHub Pro, or GitHub Team plan, required reviewers are only available for public repositories."* |
| Environment secrets need Pro or higher for private repositories | Same page: *"If you are using GitHub Free, environment secrets are only available in public repositories … For access to environment secrets in private or internal repositories you must use GitHub Pro, GitHub Team, or GitHub Enterprise."* |
| Deployment-branch restriction is available on Pro and Team | Same page: *"For users on GitHub Pro or GitHub Team plans, deployment branches and tags are also available for private repositories."* |
| The agents have no admin channel | No `gh` CLI and no `GH_TOKEN`. The stored Git Credential Manager login was deliberately **not** extracted to call admin APIs, and no secret values were read or handled by the agents |

As instructed, the agents stopped here. **No secrets were added at any level.** The staging job must not be run.

**Hazard to avoid until this is decided:** if someone dispatches the workflow with `run_staging=true` before
`staging-qa` exists, GitHub creates the environment automatically, **without protection**. With no secrets set, the
credentials are empty and setup fails, so nothing leaks. **Do not add `SENTIS_*` as repository-level secrets**:
repository secrets are visible to any workflow in the repository, on any branch.

### Options (decision for the QA owner)

| Option | Approval gate | Secret exposure control | Cost / effort |
|---|---|---|---|
| **A. Move the repository into an organization on GitHub Enterprise Cloud** | Required reviewers on `staging-qa` | Environment secrets plus a deployment branch rule (`main`) | Paid; meets the brief fully |
| B. Make the repository public | Required reviewers (free on public) | As in A | **Not recommended:** exposes QA docs, staging structure and organization names |
| C. Stay private on **GitHub Pro** | **No reviewer approval.** Only users with write access can dispatch | Environment secrets restricted to deployments from `main`, plus branch protection on `main` (PR required) | Does **not** meet the "explicit reviewer approval" requirement; needs an explicit QA-owner waiver |
| **D. Status quo (recommended until A or C is decided)** | n/a | No secrets in GitHub at all | `validate` runs on PRs; authenticated regressions keep running locally under the existing controls |

## 2. Workflow review (approved as written)

| Requirement | Finding |
|---|---|
| Permissions | Top-level `permissions: contents: read`. No `pull_request_target`. Checkout uses `persist-credentials: false` |
| Unauthenticated checks on PRs | `validate` runs on `pull_request`, push to `main` and dispatch. It sets the credential variables empty and references no `secrets.*`. It runs `node --check`, `test:list`, `test:contrast-math`, `security:evidence-check` and `security:leak-check` (synthetic `example.invalid` credentials against the public sign-in page) |
| Untrusted PRs and forks | `staging` has `if: github.event_name == 'workflow_dispatch' && inputs.run_staging == true`. PR events, including forks, can never reach it, and forks get no secrets and a read-only token anyway |
| Manual and protected | Manual only. Protection depends on the environment (section 1), **which is not in place yet** |
| One worker, no retries, masking | `CI=1` plus `--workers=1 --retries=0`. No `--reporter` argument, so the configured reporters apply and `mask-reporter.js` stays first. The config also rejects CLI overrides that drop it |
| Known defects stay failures | The test step has no `continue-on-error` and no `\|\| true`. Its exit code fails the job, and later steps run only through `if: always()` |
| Security before evidence upload | `check-artifact-leaks.js` runs with the secrets in the environment and scans `ci-evidence/` (it honours `SENTIS_EVIDENCE_DIR`). Upload is conditioned on `steps.leak_scan.outcome == 'success'` |
| No sensitive artifacts | The only upload is `ci-evidence/**/*.json`, kept for 7 days. HTML report, `test-results/` (JUnit, error context), `.auth/` storage state, traces, screenshots and videos are never uploaded, and are deleted at the end |
| Alternative reporter configurations | A CLI override without the masking reporter is rejected by `playwright.config.js`. Changing the config or workflow on a branch and dispatching from it is the remaining route, and it is closed by the **deployment-branch rule `main`** on `staging-qa` (options A and C) together with branch protection on `main` |
| Secret printing | No `env`/`printenv`/`set -x`. GitHub masks secret values in logs. The step summary contains counts only |
| Concurrency | `sentis-shared-staging-accounts`, `cancel-in-progress: false`: no two staging runs share the accounts |

Residual risks:

- Actions are pinned by major version. Pin them to commit SHAs before any unattended use.
- `validate` makes network calls to the public staging sign-in page on every PR. These use synthetic credentials
  only.
- The first real staging run must be supervised: check the job log, the step summary and the uploaded JSON.

## 3. Setup checklist once option A (or C, with a waiver) is chosen

1. Settings → Environments → **New environment** `staging-qa`.
2. **Required reviewers:** the QA owner (option A only). Enable "Prevent self-review" if available.
3. **Deployment branches and tags:** "Selected branches and tags", with the rule `main` only.
4. **Environment secrets:** exactly the four from `.env.example`:
   - `SENTIS_SUPER_ADMIN_EMAIL`
   - `SENTIS_SUPER_ADMIN_PASSWORD`
   - `SENTIS_CLIENT_ADMIN_EMAIL`
   - `SENTIS_CLIENT_ADMIN_PASSWORD`

   The QA owner enters these in the GitHub UI; they never pass through an agent. Add **no** repository-level
   secrets.
5. Protect `main`: require a PR before merging.
6. Merge the CI PR to `main`. Then Actions → Sentis QA → Run workflow on `main`, with `run_staging` = true, and
   approve it. Check the summary counts against the latest local full run (25 tests: 14 passed, 11 failed) and open
   the uploaded JSON.
