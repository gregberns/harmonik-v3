# Research: herdr (session management backend)

Gathered 2026-10-02 by a research agent; herdr 0.9.3 installed via `brew install herdr` and smoke-tested.

## What it is
- https://github.com/herdrdev/herdr (Rust, Apache-2.0, Herdr, Inc.). Docs: https://herdr.dev/docs/
- Pre-1.0 (v0.9.3, 2026-09-29), very active, ~316 open issues. Install: `brew install herdr`.
- tmux-like: a server owns PTYs, clients attach. Detects agents in panes (Claude Code among them) and shows working/blocked/done/idle.
- Model: **session** (separate server, `--session NAME`) > **workspace** > **tab** > **pane** (ids like `w1:p2`).

## API (CLI, JSON output; also a Unix-socket JSON API, `herdr api schema --json`)
- Create: `herdr workspace create --cwd PATH --label TEXT --env K=V --no-focus`; `herdr tab create --workspace W --cwd --label --env`; `herdr pane split <pane> --direction right|down --cwd --env`. IDs in JSON (`.result.root_pane.pane_id`).
- Run: create, then `herdr pane run <pane> "<cmd>"` (text + Enter). Agent-aware: `herdr agent start <name> --kind claude --pane <pane> -- <claude args>` (name `[a-z][a-z0-9_-]{0,31}`; waits until Claude ready, default 30s timeout; needs an idle shell pane).
- Name: `herdr pane|tab|workspace|agent rename`.
- List: `herdr workspace|tab|pane|agent list`, `herdr api snapshot`.
- Stop: `herdr pane close`, `tab close`, `workspace close`, `session stop <name>`, `server stop`.
- Input: `pane send-text`, `pane send-keys <pane> enter ctrl+c`, `pane run`; `agent prompt <target> <text> [--wait --until idle]`.
- Output: `pane read <pane> --source visible|recent --lines N`, `agent read`, `agent wait --until done`.
- Grouping: a workspace maps naturally to a team (sidebar rolls up status per workspace); tab or pane per agent.
- Operator view: `herdr` / `herdr session attach <name>` (TUI with agent-state sidebar).

## Smoke test (passed)
- Server must be running first (`server_not_running` otherwise); scripts must start it (`herdr --session X server` in background).
- workspace create with `--env` → env, cwd and `HERDR_*` vars visible in the pane.
- From inside a herdr pane, plain `herdr tab create` (no `--session`) creates in the same session: **agents can start siblings**.
- `pane close` → `{"type":"ok"}`; session stop/delete cleaned up.

## Rough edges
- Agent-state detection is screen-scraped; many open bugs on wrong states (#4819, #4626, #3414, #3090, #2868, #4573). Do not build on `agent wait`/blocked detection.
- #4851: closing a pane kills Claude before SessionEnd hooks; ask Claude to exit first.
- #4785: stale session id when a new Claude starts in the same pane.
- herdr refuses to launch its TUI inside its own pane (CLI fine).
- `herdr integration install claude` writes to Claude config; needs operator approval.

## Unverified
- `agent start --kind claude -- --name <label>` passthrough with hk3's launch; vs. `pane run "hk3 new agent claude ..."`.
- Resource use with ~10 Claude panes; socket API stability across pre-1.0 versions.
