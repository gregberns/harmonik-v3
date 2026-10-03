# 07: Start a team from a crew definition

**What to build:** "Spin up a team with this shape" (spec decision 4). Crew
definitions are YAML files (`description`, optional `workflow`, `members`
with `role`, optional `name`, `count`, `responsibility`; first member is the
lead) found in the project's `.harmonik-v3/crews/`, then the hk3 repo, or
given as a path. `hk3 crew start <crew> --team <team>` checks the definition
structurally (YAML, known roles, valid and unique resulting names), refuses
if the team already has a roster or any label is live, then writes the
roster and starts every member through `hk3 session start`. From inside an
hk3 session it uses the caller's team and records the caller in the lead
slot instead of starting it. `hk3 crew defs` lists definitions with
descriptions and where they were found, flagging invalid ones. Add a
`captain` role and one example definition matching the operator's example
(captain, planner, plan reviewer, builder, reviewer, tester).

**Blocked by:** 05 (crew add, roster, stop)

**Status:** ready-for-agent

- [ ] With fake `claude` and herdr session `hk3test`: `crew start <example> --team alpha` starts `oc-alpha--captain`, `oc-alpha--planner`, `oc-alpha--plan-reviewer`, `oc-alpha--builder`, `oc-alpha--reviewer`, `oc-alpha--tester` in workspace `oc-alpha`, and the roster lists them with responsibilities
- [ ] `count: 2` gives `builder-1` and `builder-2`
- [ ] Each invalid fixture (unknown role, duplicate resulting names, `--` in a name, bad count, not YAML) is refused with a clear message and starts nothing
- [ ] Starting a team that already has a roster, or whose labels are live, is refused
- [ ] A project definition overrides a repo definition of the same name; a path argument works
- [ ] From an environment that looks like `oc-alpha`, `crew start <example>` records `oc-alpha` as the lead and starts the other five
- [ ] `crew defs` lists the example and flags an invalid project definition
- [ ] README.md (crew start, defs, the captain role), docs/configuration.md (definition format, lookup order), docs/testing.md updated
