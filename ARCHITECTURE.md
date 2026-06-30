# XCoder capability map

## Implemented in 0.3

- Safe filesystem: read/list/info/search/write/remove.
- Partial edits: `apply_patch` with expected SHA-256 and atomic write.
- Git: status, diff, branch, commit, worktree list/add/remove.
- Persistent processes: start/list/logs/stop.
- Task validation: sequential project commands with structured results.
- Playwright sessions: open, snapshot, screenshot, click, fill, evaluate, console, network, close.
- Permission classification remains `read`, `write`, `execute`, `destructive`.

## Operational model

Use one Git worktree per task/branch. Start independent dev servers through `process_start`, each on its own port. Browser sessions can inspect each server independently. Filesystem roots must include the parent directory where worktrees are created.

## Recommended follow-up

- Native unified-diff parser with multi-file transactions.
- PTY terminal sessions and stdin streaming.
- File watch events and incremental diagnostics.
- Playwright tracing/HAR/video lifecycle tools.
- Artifact upload/download protocol for large files.
- Per-tool quotas, audit log persistence and signed approvals.
- Task checkpoints/recovery after agent restart.
