# 04: Session module: start, list, stop and attach agents in herdr

**What to build:** The `session` module (spec decision 2), the only code that
calls herdr. `hk3 session start [--team <team>] --name <name> [--role <role>] [-- <claude args>]`
starts the herdr server for `HK3_HERDR_SESSION` (default `hk3`) if needed,
finds or creates the workspace labelled with the team label, adds a tab
labelled with the agent's label, and types the normal hk3 launch (absolute
script path, then exit of the shell) into it. `hk3 session list [--team]`
prints team label, member label and pane id. `hk3 session stop <label>`
sends `/exit`, waits a fixed grace period for the tab to close, closes it if
still open, and closes an emptied workspace. `hk3 session attach` opens the
herdr view. Herdr calls always name the session, so the commands work from
inside an agent's pane. Adjust to the spike's findings.

**Blocked by:** 01 (spike), 03 (team member names)

**Status:** ready-for-agent

- [ ] With real herdr in session `hk3test` and a fake `claude` that waits on stdin and exits on `/exit`: `session start --team alpha --name builder` creates workspace `oc-alpha` and tab `oc-alpha--builder` whose pane runs the expected hk3 command in the project root
- [ ] A second start in the same team adds a tab to the same workspace; a solo start (`--name bravo`) gets workspace `oc-bravo`
- [ ] Starting a label that already has a tab is refused and starts nothing
- [ ] `session list` shows every hk3 tab; `--team alpha` filters to that workspace; it never reports agent state
- [ ] `session stop` closes the fake agent through `/exit` (tab closes by itself), falls back to closing the tab after the grace period, and removes an empty workspace
- [ ] The server is started when not running and left alone when running
- [ ] Run from inside a herdr pane, `session start` creates a sibling tab in the same session
- [ ] Live: one real hk3 agent started with `session start` shows its badge and is stopped cleanly with `session stop`
- [ ] README.md (herdr prerequisite, session commands), docs/configuration.md (`HK3_HERDR_SESSION`), docs/architecture.md (team = workspace, member = tab, why stop sends `/exit`), docs/testing.md (herdr + fake claude check) updated
