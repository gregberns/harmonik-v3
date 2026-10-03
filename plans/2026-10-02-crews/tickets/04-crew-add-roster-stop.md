# 04: Crew module: add and stop members, with a roster

**What to build:** The captain-becomes-team tracer bullet (spec decisions 4
and 6). `hk3 crew add <role> [--name <member>] [--responsibility <text>] [--team <team>]`
adds one member through `hk3 session start`. Inside an hk3 session
(`HK3_AGENT_ID` set) the team is the caller's; the first add from solo
`oc-alpha` creates team `alpha` with `oc-alpha` (its actual role) as first
member. Outside a session `--team` is required. The name defaults to the
role, with the next free number when taken. Under a simple lock in the
teams folder, hk3 picks the name, writes the roster, then starts the member
with the one-line first prompt (label, role, team, run `hk3 crew roster`).
The teams folder gets a `.gitignore` of `*` when created. `hk3 crew roster
[--team]` prints the roster, live herdr tabs, and the caller's label.
`hk3 crew stop <member>... | --all [--team]` stops members through
`hk3 session stop` and removes them from the roster, also when they have no
tab (with a note); `--all` from inside a session keeps the caller, from
outside stops all and deletes the roster. Bare `crew stop` is refused.

Depends on open question 1 (naming, numbering): check the operator's answer
first; the proposed default is written here.

**Blocked by:** 03 (session module)

**Status:** ready-for-agent

- [ ] With the fake `claude` and herdr session `hk3test`: from an environment set up like solo `oc-alpha` (role general), `crew add tester` starts `oc-alpha--tester` and writes a roster listing `oc-alpha` (general) and `oc-alpha--tester` (tester), responsibilities from role descriptions or `--responsibility`
- [ ] Two more `crew add builder` give `builder` and `builder-2`
- [ ] Unknown role, no `--team` outside a session, or a newline in `--responsibility` is refused and changes nothing
- [ ] The member's first prompt has its label, role, team and the roster command; the roster already lists it when it starts
- [ ] The teams folder holds a `.gitignore` of `*` in a project initialized before this change
- [ ] `crew roster` inside a session shows the caller's label and live tabs; a captain without a tab shows as not live
- [ ] `crew stop tester` stops it and removes it from the roster; bare `crew stop` is refused; `crew stop --all` from the captain keeps the captain; `crew stop --all --team alpha` from outside stops all and deletes the roster, even with no live tabs
- [ ] README.md (crew add, roster, stop; resuming a crashed member by hand), docs/configuration.md (teams folder), docs/architecture.md (roster, identity rules), docs/testing.md updated
