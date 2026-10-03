# Crews

hk3 becomes a small router over modules (keeper first) and gains two new
ones: `session`, which starts and stops hk3 agents in herdr with a clean
environment (a team is a workspace, a member is a tab), and `crew`, which
starts a team from a YAML crew definition, adds and stops members, and keeps
a roster file. Members are named `<prefix>-<team>--<member>` (e.g.
`oc-alpha--builder`), so a solo captain `oc-alpha` becomes team `alpha` by
adding `oc-alpha--tester`. Members message each other with Claude Code
cross-session messaging, guided by a short `crew` skill. Workflows are YAML
that agents read; hk3 only checks their structure. hk3 makes no judgments
and enforces no process. Public commands: `session start|stop`,
`crew start|add|stop|roster`.

- [requirements.md](requirements.md): the operator's requirements (source of truth)
- [spec.md](spec.md): the spec, decisions and open questions
- [research-herdr.md](research-herdr.md), [research-messaging.md](research-messaging.md): verified facts
- [review-scope.md](review-scope.md), [review-technical.md](review-technical.md): reviews applied to this version

## Tickets

| # | Ticket | Blocked by | Open questions to check first |
|---|---|---|---|
| 01 | [Spike: hk3 agents in herdr can message each other](tickets/01-spike-herdr-messaging.md) | none | none |
| 02 | [Router, shared library, keeper module and team names](tickets/02-router-naming.md) | none | Q1, Q2 |
| 03 | [Session module: start and stop agents in herdr](tickets/03-session-module-herdr.md) | 01, 02 | Q4 |
| 04 | [Crew module: add and stop members, with a roster](tickets/04-crew-add-roster-stop.md) | 03 | Q1 |
| 05 | [Crew skill and team messaging](tickets/05-crew-skill-messaging.md) | 04 (and spike messaging go) | none |
| 06 | [Start a team from a crew definition, with its workflow](tickets/06-crew-start-definitions.md) | 04 | Q1, Q3 |
| 07 | [Project skills (project-management skill slot)](tickets/07-project-skills-slot.md) | 02 | none |
