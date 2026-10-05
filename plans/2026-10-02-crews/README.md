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
- [spec.md](spec.md): the spec and decisions, including the operator's answers
- [research-herdr.md](research-herdr.md), [research-messaging.md](research-messaging.md): verified facts
- [review-scope.md](review-scope.md), [review-technical.md](review-technical.md): reviews applied to this version

## Tickets

All built, reviewed (two reviewers each), fixed and committed on 2026-10-02.

| # | Ticket | Blocked by | Commit |
|---|---|---|---|
| 01 | [Spike: hk3 agents in herdr can message each other](tickets/01-spike-herdr-messaging.md) ([results](spike-results.md): go) | none | 62a2bfd |
| 02 | [Router, shared library, keeper module and team names](tickets/02-router-naming.md) | none | 020eedd |
| 03 | [Session module: start and stop agents in herdr](tickets/03-session-module-herdr.md) | 01, 02 | 8eed538 |
| 04 | [Crew module: add and stop members, with a roster](tickets/04-crew-add-roster-stop.md) | 03 | 8374142 |
| 05 | [Crew skill and team messaging](tickets/05-crew-skill-messaging.md) | 04 (and spike messaging go) | cae2179 |
| 06 | [Start a team from a crew definition, with its workflow](tickets/06-crew-start-definitions.md) | 04 | e41345f |
| 07 | [Project skills (project-management skill slot)](tickets/07-project-skills-slot.md) | 02 | d3240f4 |

Live end-to-end check (scratch project, real Claude, 2026-10-02): passed.
A 6-member team started from `feature` in one herdr workspace; members read
the roster and messaged each other by label; a solo agent grew a team with
`crew add`; `crew stop` cleaned up everything; no Claude session variables
leaked into members; only `modules/session/herdr.sh` invokes herdr.

## Pending operator decisions

Agents added these beyond the tickets. Keep or cut each; the
recommendation is in brackets.

1. Start lock in the session module (prevents duplicate workspaces when
   several starts race). [keep]
2. compose-role keeps an unchanged role build in place, so running agents
   keep their plugin folder. [keep]
3. `hk3 session start --prompt <text>` for a new member's first message.
   [keep]
4. `crew stop` refuses to stop the caller and refuses names not on the
   roster. [cut: rules the operator did not ask for]
5. A taken explicit `--name` is refused rather than numbered. [keep]
6. Crew definition: the lead may not have `name`/`count`, and the file must
   be exactly one YAML document. [cut: a parse check is enough]
7. `session tabs` lists only the project's own labels (prefix filter).
   [keep]

After these, run a simplification pass over `modules/crew/main` (526
lines; the largest file) with the same review and fix steps.
