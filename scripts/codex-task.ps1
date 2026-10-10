# Dispatches one SNTS task packet to Codex in its own worktree.
# Usage: powershell -NoProfile -File scripts/codex-task.ps1 -Slug snts-123-profile-save -Task "<task packet>" [-Base main]
param(
    [Parameter(Mandatory)] [string] $Slug,
    [Parameter(Mandatory)] [string] $Task,
    [string] $Base = 'main'
)
$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$worktree = Join-Path (Split-Path $repo) 'Sentis-worktrees\codex'
$branch = "codex/$Slug"
$runs = Join-Path $repo '.codex-runs'
New-Item -ItemType Directory -Path $runs -Force | Out-Null

$codex = Get-ChildItem "$env:USERPROFILE\.vscode\extensions\openai.chatgpt-*\bin\windows-x86_64\codex.exe" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $codex) { throw 'codex.exe not found; install or update the ChatGPT/Codex VS Code extension.' }

if (-not (Test-Path $worktree)) {
    git -C $repo worktree add -b $branch $worktree $Base
} else {
    if (git -C $worktree status --porcelain) { throw "Codex worktree has uncommitted changes: $worktree" }
    git -C $worktree show-ref --verify --quiet "refs/heads/$branch"
    if ($LASTEXITCODE -eq 0) { git -C $worktree switch $branch } else { git -C $worktree switch -c $branch $Base }
}
if ($LASTEXITCODE -ne 0) { throw "Could not prepare $branch in $worktree" }

# Share installed dependencies instead of a second npm ci.
$modules = Join-Path $worktree 'node_modules'
if (-not (Test-Path $modules)) { New-Item -ItemType Junction -Path $modules -Target (Join-Path $repo 'node_modules') | Out-Null }

# Role credentials stay in the main checkout's gitignored .env; the worktree gets a copy so tests can sign in.
$envFile = Join-Path $repo '.env'
if (Test-Path $envFile) { Copy-Item $envFile (Join-Path $worktree '.env') -Force }

$prompt = @"
You are the Codex agent on the Sentis (SAM) Playwright project. Read AGENTS.md first and follow it exactly.

$Task

Rules for this run:
- Edit only the files the task permits and your own rows in docs/automation/coverage-matrix.csv.
- Run the spec named in the task with --workers=1 and report real results only.
- Do not run git add or git commit: the sandbox cannot write Git metadata. Write the commit
  message to .codex-commit-msg in the worktree root; the launcher commits every non-ignored
  change on $branch after you finish. Do not push or touch main.
- Jira and Confluence are read-only: never create, edit, comment on or transition anything.
  If something should be added there, describe it in your final message.
- Never print or write credentials.

Finish with a short report: files changed, implementation summary, commands run with result
counts, each failure classified (product defect, test failure, data, auth, environment, flaky,
unclear), skipped tests with the missing prerequisite, and open questions.
"@

$env:SENTIS_AGENT = 'codex'
$output = Join-Path $runs "$Slug.md"
# Windows PowerShell mangles quoted multi-line native arguments, so the prompt goes via stdin.
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
$prompt | & $codex.FullName exec -C $worktree -s workspace-write `
    -c sandbox_workspace_write.network_access=true `
    --add-dir (Join-Path $repo '.git') `
    -o $output -
if ($LASTEXITCODE -ne 0) { throw "codex exec failed with exit code $LASTEXITCODE" }

# Codex's sandbox cannot write .git, so commit on its behalf with its own message.
$message = Join-Path $worktree '.codex-commit-msg'
if (Test-Path $message) {
    git -C $worktree add -A
    git -C $worktree commit -q -F $message
    if ($LASTEXITCODE -ne 0) { throw "Commit on $branch failed" }
    Remove-Item $message
    git -C $worktree show --stat --oneline HEAD
} else {
    Write-Output 'Codex left no .codex-commit-msg; nothing was committed.'
}
Write-Output "Codex finished $branch. Summary: $output"
