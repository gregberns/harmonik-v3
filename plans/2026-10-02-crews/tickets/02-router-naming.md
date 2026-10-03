# 02: Router, shared library, keeper module and team names

**What to build:** Spec decisions 1 and 3. `hk3 <word> ...` forwards to a
module when the word is not a core command: hk3 resolves the project, loads
settings, exports the resolved project directory and hk3 repo root, and
execs the module's entrypoint. Core commands behave as before. Shared
helpers (die, settings loading, project resolution, label building) move to
one library. The keeper plugin and its `KEEPER_*` defaults move into a
keeper module folder (no commands). Help lists modules by hand.

Team names: `hk3 new|resume agent claude --team alpha --name builder` sets
`HK3_AGENT_NAME=alpha--builder`, `HK3_TEAM=alpha`, label `oc-alpha--builder`.
`HARMONIK_AGENT` becomes the full label (`hk3-` in front with no prefix).
Parts may not contain `--`; `--name alpha--builder` is refused, pointing to
`--team`. The library also gets: the caller's team (`HK3_TEAM`, else
`HK3_AGENT_NAME`), team label (part of `HK3_AGENT_ID` before `--`), and the
next free same-role name (`builder`, `builder-2`, ...).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] With a fake `claude` in a scratch repo, every existing command gives the same arguments, working directory and environment as before, except the keeper plugin path
- [ ] An unknown word prints usage and exits non-zero; a module folder with an executable entrypoint receives its remaining arguments, with the project directory and repo root exported
- [ ] `--team alpha --name builder` passes `--name oc-alpha--builder` and exports `HK3_AGENT_NAME=alpha--builder`, `HK3_TEAM=alpha`, `HK3_AGENT_ID=oc-alpha--builder`, `HARMONIK_AGENT=oc-alpha--builder`
- [ ] With `KEEPER_STARTUP_PROMPT='/session-resume HANDOFF-{name}'`, a member resolves `HANDOFF-alpha--builder`; solo `oc-alpha` is unchanged (`HANDOFF-alpha`, `HARMONIK_AGENT=oc-alpha`)
- [ ] `--team` without `--name`, and any part containing `--` or other characters, is refused before launch
- [ ] Live: a member's badge shows `oc-alpha--builder`; keeper still runs its cycle (`KEEPER_RESTART_TOKEN_COUNT=500`)
- [ ] docs/architecture.md (router, modules, layout, label), docs/configuration.md (`HK3_TEAM`, naming grammar, `{name}` for members, `HARMONIK_AGENT`), keeper README paths, README.md (one `--team` line), AGENTS.md links updated
