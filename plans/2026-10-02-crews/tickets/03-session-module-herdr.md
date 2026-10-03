# 03: Session module: start and stop agents in herdr

**What to build:** Spec decision 2; the only code that calls herdr.
`hk3 session start [--team <team>] --name <name> [--role <role>]` requires a
project prefix, starts the herdr server for `HK3_HERDR_SESSION` (default
`hk3`) detached with the scrub list removed (`CLAUDECODE`, all
`CLAUDE_CODE_*`, `CLAUDE_PID`, `CLAUDE_EFFORT`, all `HK3_*`, all `KEEPER_*`,
`HARMONIK_AGENT`) if it is not running, and waits for it. It finds or
creates the workspace labelled with the team label (the first agent uses
and renames the root tab; later ones get new tabs), then types a launch
command that removes the same variables, sets the resolved project
directory, prefix and other non-per-agent settings explicitly (shell-quoted),
runs the hk3 script by absolute path, and ends with `&& exit`. It then
checks the tab still exists. Start refuses a label that already has a tab.
`hk3 session stop <label>` sends `ctrl+c`, then `/exit` and Enter; if the tab
still exists after about 2 s it sends one more Enter (Claude's "Background
work is running" dialog); then it waits a grace period and closes the tab if
still open. herdr closes an emptied workspace itself; "workspace already
gone" is success. A missing label exits 0 with a notice. herdr ids are never
reused: use ids from create responses or look tabs up by label. Make
`compose-role` build atomically (into a temp folder beside
`build/roles/<role>/`, then replace it with `mv`; an unchanged build is not
swapped in, so running agents keep their plugin folder) so launches of one
role do not race. Concurrent starts in one team must not create duplicate
workspaces (a short start lock per herdr session; the crew module needs no
second lock for this). Start detects a failed launch by waiting for the
launcher's `hk3: claude` line or the wrapper's `hk3: launch failed` line. `hk3 session tabs` prints the live
agent labels for the crew module. Follow spec decision 0: every herdr call
lives in one adapter file inside the module, and nothing herdr-specific
leaves it. Apply the spike's findings.

**Blocked by:** 01 (spike), 02 (router and team names)

**Status:** done

- [x] All herdr calls are in the module's adapter file; no other file in the repo invokes `herdr`
- [x] `session tabs` lists live agent labels, one per line
- [x] Test setup per docs/testing.md: herdr session `hk3test` started with the fake `claude` first on PATH; `command -v claude` in a pane shows the fake
- [x] `session start --team alpha --name builder` creates workspace `oc-alpha` with one tab `oc-alpha--builder` (no stray tab), running the fake in the project root
- [x] A second start in the team adds a tab to the same workspace; solo `--name bravo` gets workspace `oc-bravo`; a duplicate label is refused
- [x] Environment: with the server started from a shell that had `CLAUDECODE`, `CLAUDE_CODE_*`, `HK3_AGENT_ID`, `HK3_TEAM` and `HK3_PROJECT_DIR` set, the fake prints none of them except the values hk3 set; a shell-only `KEEPER_RESTART_TOKEN_COUNT` reaches the member
- [x] A failing launch (unknown role) leaves the tab open with the error and `session start` exits non-zero
- [x] Without a project prefix, `session start` is refused
- [x] Environment: a typed launch from a pane whose shell has the scrub-list variables exported (e.g. `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_PID`, `HK3_TEAM`) reaches the fake with none of them except the values hk3 set
- [x] `session stop` ends the fake through `ctrl+c`, `/exit`, Enter (and the extra Enter when the tab stays), falls back to closing the tab after the grace period, and the emptied workspace is gone; an unknown label exits 0 with a notice
- [x] `session stop` on a tab with no agent (e.g. restored after a herdr server restart) closes it, and a later `session start` of that label succeeds
- [x] Two `session start`s of the same role at the same moment both launch (atomic `compose-role`)
- [x] Run from inside a herdr pane, `session start` creates a sibling tab in the same session
- [x] Live: one real hk3 agent started with `session start` shows its badge and stops cleanly
- [x] README.md (herdr prerequisite, session commands, viewing with `herdr session attach hk3`; trust the project once with a plain `hk3 new agent claude` or by attaching, since hk3 never answers Claude's folder-trust prompt; after a herdr server restart, clear a restored agentless tab with `hk3 session stop <label>`), docs/configuration.md (`HK3_HERDR_SESSION`, prefix required), docs/architecture.md (team = workspace, member = tab, clean environment, why stop sends `/exit`), docs/testing.md (herdr + fake claude recipe, environment check) updated
