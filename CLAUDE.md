@AGENTS.md

## Claude as orchestrator

- Dispatch a Codex task: `powershell -NoProfile -File scripts/codex-task.ps1 -Slug <slug> -Task "<task packet>"`.
  It creates or reuses `../Sentis-worktrees/codex` on `codex/<slug>`, runs `codex exec`, and writes
  Codex's final message to `.codex-runs/<slug>.md`.
- Review each Codex diff against AGENTS.md and re-run its spec before marking it approved.
- Claude's own work happens in `../Sentis-worktrees/claude`.
