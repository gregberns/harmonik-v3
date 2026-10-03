# 06: Start a team from a crew definition, with its workflow

**What to build:** "Spin up a team with this shape" (spec decisions 4 and 5).
Crew definitions are YAML (`description`, optional `workflow`, `members`
with `role`, optional `name`, `count`, one-line `responsibility`; first
member is the lead), found in the project's `.harmonik-v3/crews/`, then the
hk3 repo, or given as a path. Workflows are YAML with a `description`,
found in the project's `.harmonik-v3/workflows/`, then the hk3 repo; hk3
reads no other key. `hk3 crew start <crew> --team <team>` checks the
definition and its workflow structurally; refuses if the team has a roster
(point to `crew add`, or `crew stop --all` for a stale one), if the team
label is a live tab (point to starting from inside that agent, or another
name), or if any member label is live; then, under the lock, writes the
roster (with the workflow name and path) and starts each member: the lead
(first) slot as plain `oc-alpha` (a solo launch named after the team, with
the slot's role), the others as `oc-alpha--<member>`. On a
failed start it stops and prints which members started. From inside a
session it uses the caller's team; the caller fills the lead slot,
recorded with its actual role, and the slot's responsibility only if the
definition gives one. Add a `captain` role, one example definition
(captain, planner, plan reviewer, builder, reviewer, tester) and one
example workflow it references.

**Blocked by:** 04 (crew add, roster, stop)

**Status:** ready-for-agent

- [ ] With the fake `claude` and `hk3test`: `crew start <example> --team alpha` starts `oc-alpha` (role captain), `oc-alpha--planner`, `--plan-reviewer`, `--builder`, `--reviewer`, `--tester` in workspace `oc-alpha`; the roster lists them with responsibilities and the workflow path
- [ ] `count: 2` gives `builder` and `builder-2`
- [ ] Each invalid fixture (unknown role, duplicate resulting names, `--` in a name, bad count, not YAML, missing workflow, workflow without a description) is refused and starts nothing
- [ ] Refused with a pointer: team already has a roster; team label `oc-alpha` is a live tab; a member label is live
- [ ] A project definition overrides a repo definition of the same name; a path argument works
- [ ] From an environment set up like `oc-alpha` (role general), `crew start <example>` records `oc-alpha` as general in the lead slot and starts the other five
- [ ] A start that fails at the third member leaves two started and says so
- [ ] README.md (crew start, definitions, workflows, captain role), docs/configuration.md (definition and workflow format, lookup order), docs/testing.md updated
