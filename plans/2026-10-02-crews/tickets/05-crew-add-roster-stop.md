# 05: Crew module: add and stop members, with a roster

**What to build:** The tracer bullet for teams, from the captain-becomes-team
use case (spec decisions 4 and 6). `hk3 crew add <role> [--name <member>] [--responsibility <text>] [--team <team>]`
adds one member through `hk3 session start`. Inside an hk3 session the team
defaults to the caller's own (read from its label); the first add from solo
`oc-alpha` creates team `alpha` with `oc-alpha` as its first member. Outside
a session `--team` is required. The member's name defaults to its role, with
the next free number when taken. Each new member gets the fixed first prompt
(its label, role, team, and to run `hk3 crew roster`). hk3 writes the
team's roster file (team, label, members with label, role, responsibility)
and rewrites it on every change. `hk3 crew roster [--team]` prints it with
which members have a live tab. `hk3 crew stop [<member>...] [--team]` stops
members through `hk3 session stop` and removes them from the roster; inside
a session, stopping the whole team leaves the caller running.

**Blocked by:** 04 (session module)

**Status:** ready-for-agent

- [ ] With fake `claude` and herdr session `hk3test`: from an environment that looks like solo agent `oc-alpha` (role general), `crew add tester` starts `oc-alpha--tester` and writes a roster listing `oc-alpha` (general) and `oc-alpha--tester` (tester) with responsibilities from the role descriptions or `--responsibility`
- [ ] A second `crew add builder` then `crew add builder` gives `builder` and `builder-2`
- [ ] `crew add` with an unknown role, or from outside a session without `--team`, is refused and changes nothing
- [ ] The new member's first prompt contains its label, role, team and the roster command
- [ ] `crew roster` inside a session shows the caller's label, the members and their live status; outside a session it needs `--team`
- [ ] `crew stop tester` stops that member and removes it from the roster; `crew stop` from the captain stops everyone else and keeps the captain; `crew stop --team alpha` from outside stops all
- [ ] The teams folder is gitignored by projects (`hk3 init` setup prompt updated)
- [ ] README.md (crew add, roster, stop), docs/configuration.md (teams folder), docs/architecture.md (roster, how members learn of it), docs/testing.md updated
