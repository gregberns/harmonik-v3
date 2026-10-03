# 03: Session module: start and stop agents in herdr

**What to build:** Spec decision 2; the only code that calls herdr.
`hk3 session start [--team <team>] --name <name> [--role <role>]` requires a
project prefix, starts the herdr server for `HK3_HERDR_SESSION` (default
`hk3`) detached with `CLAUDECODE`, `CLAUDE_CODE_*`, `HK3_*`, `KEEPER_*` and
`HARMONIK_AGENT` removed if it is not running, and waits for it. It finds or
creates the workspace labelled with the team label (the first agent uses
and renames the root tab; later ones get new tabs), then types a launch
command that removes the same variables, sets the resolved project
directory, prefix and other non-per-agent settings explicitly (shell-quoted),
runs the hk3 script by absolute path, and ends with `&& exit`. It then
checks the tab still exists. Start refuses a label that already has a tab.
`hk3 session stop <label>` clears the input, sends `/exit`, waits a grace
period, closes the tab if still open, and closes an emptied workspace; a
missing label exits 0 with a notice. An internal tab listing is provided for
the crew module. Apply the spike's findings.

**Blocked by:** 01 (spike), 02 (router and team names)

**Status:** ready-for-agent

- [ ] Test setup per docs/testing.md: herdr session `hk3test` started with the fake `claude` first on PATH; `command -v claude` in a pane shows the fake
- [ ] `session start --team alpha --name builder` creates workspace `oc-alpha` with one tab `oc-alpha--builder` (no stray tab), running the fake in the project root
- [ ] A second start in the team adds a tab to the same workspace; solo `--name bravo` gets workspace `oc-bravo`; a duplicate label is refused
- [ ] Environment: with the server started from a shell that had `CLAUDECODE`, `CLAUDE_CODE_*`, `HK3_AGENT_ID`, `HK3_TEAM` and `HK3_PROJECT_DIR` set, the fake prints none of them except the values hk3 set; a shell-only `KEEPER_RESTART_TOKEN_COUNT` reaches the member
- [ ] A failing launch (unknown role) leaves the tab open with the error and `session start` exits non-zero
- [ ] Without a project prefix, `session start` is refused
- [ ] `session stop` ends the fake through `/exit`, falls back to closing the tab after the grace period, and removes an empty workspace; an unknown label exits 0 with a notice
- [ ] Run from inside a herdr pane, `session start` creates a sibling tab in the same session
- [ ] Live: one real hk3 agent started with `session start` shows its badge and stops cleanly
- [ ] README.md (herdr prerequisite, session commands, viewing with `herdr session attach hk3`), docs/configuration.md (`HK3_HERDR_SESSION`, prefix required), docs/architecture.md (team = workspace, member = tab, clean environment, why stop sends `/exit`), docs/testing.md (herdr + fake claude recipe, environment check) updated
