# webMCP-comparer

Local agentic UI that runs the same Scenario against the same website in two Lanes side by side (Baseline and WebMCP) and compares tokens, time, cost, tool calls and screenshots.

## Git worktrees (parallel sessions)

Several agent sessions often run on this repo at the same time. Never edit in the main checkout.

- Start every task in its own worktree from an up-to-date `main`: `git fetch origin && git worktree add -b <type>/<slug> .claude/worktrees/<slug> origin/main` (`<type>`: `feat`, `fix`, `docs`, `chore`).
- Copy what git does not track into it: `cp -Rc node_modules .env* .claude/worktrees/<slug>/` (APFS clone; skip what this repo lacks).
- Keep the main checkout clean on `main`. If you find uncommitted work there, move it into a worktree first, then tell Sunny.
- After the PR merges: `git worktree remove .claude/worktrees/<slug>` and delete the branch.

## Agent skills

### Issue tracker

Issues, the wayfinder map and its decision tickets live in GitHub Issues on `sredhu37/webMCP-comparer`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
