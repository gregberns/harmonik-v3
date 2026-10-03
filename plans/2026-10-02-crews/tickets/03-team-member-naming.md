# 03: Team member names with `--team`

**What to build:** `hk3 new|resume agent claude --team alpha --name builder`
starts an agent labelled `oc-alpha--builder` (prefix `oc`), exports
`HK3_TEAM=alpha`, and uses the label as the Claude session name and status
line badge. Names follow spec decision 3: parts use `[A-Za-z0-9_-]` and may
not contain `--`; `--name alpha--builder` is refused with a message pointing
to `--team`. The shared library gains the mechanical helpers later tickets
use: build a label, read the team from a label, next free numbered name
(`builder` → `builder-2`). Solo agents are unchanged.

**Blocked by:** 02 (hk3 router, with keeper as the first module)

**Status:** ready-for-agent

- [ ] With the fake `claude`, `--team alpha --name builder` passes `--name oc-alpha--builder` and exports `HK3_TEAM=alpha`, `HK3_AGENT_ID=oc-alpha--builder`
- [ ] Without a prefix the label is `alpha--builder`; without `--team` labels are unchanged (`oc-alpha`)
- [ ] `--team` or `--name` containing `--` or other characters is refused before launch; `HK3_TEAM` in the environment works like the flag
- [ ] `--team` without `--name` is refused
- [ ] Live: the status line badge shows `oc-alpha--builder`
- [ ] docs/configuration.md (`HK3_TEAM`, the naming grammar), docs/architecture.md (label), README.md (one usage line) updated
