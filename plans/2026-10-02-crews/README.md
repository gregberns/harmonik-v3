# Crews

hk3 becomes a small router over modules (keeper first) and gains two new
ones: `session`, which starts, lists and stops hk3 agents in herdr (a team is
a workspace, a member is a tab), and `crew`, which starts a team from a YAML
crew definition, adds and stops members, and keeps a roster file. Members are
named `<prefix>-<team>--<member>` (e.g. `oc-alpha--builder`), so a solo
captain `oc-alpha` becomes team `alpha` by adding `oc-alpha--tester`. Members
message each other with Claude Code cross-session messaging, following a
short `crew` skill. Workflows are YAML that agents read; hk3 only checks
their structure. hk3 makes no judgments and enforces no process.

- [requirements.md](requirements.md): the operator's requirements (source of truth)
- [spec.md](spec.md): the spec, decisions and open questions
- [research-herdr.md](research-herdr.md), [research-messaging.md](research-messaging.md): verified facts

## Tickets

| # | Ticket | Blocked by |
|---|---|---|
| 01 | [Spike: hk3 agents in herdr can message each other](tickets/01-spike-herdr-messaging.md) | none |
| 02 | [hk3 router, with keeper as the first module](tickets/02-router-keeper-module.md) | none |
| 03 | [Team member names with `--team`](tickets/03-team-member-naming.md) | 02 |
| 04 | [Session module: start, list, stop and attach agents in herdr](tickets/04-session-module-herdr.md) | 01, 03 |
| 05 | [Crew module: add and stop members, with a roster](tickets/05-crew-add-roster-stop.md) | 04 |
| 06 | [Crew skill and team messaging](tickets/06-crew-skill-messaging.md) | 05 |
| 07 | [Start a team from a crew definition](tickets/07-crew-definitions-start.md) | 05 |
| 08 | [Workflows as YAML the team reads](tickets/08-workflows.md) | 07 |
| 09 | [Project skills and roles (project-management skill slot)](tickets/09-project-skill-role-slot.md) | none |
