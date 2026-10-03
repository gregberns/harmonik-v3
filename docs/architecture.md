# Architecture

harmonik-v3 launches Claude Code agent sessions inside other projects. The
command is `harmonik-v3`, normally called `hk3` through a symlink on PATH.

## Repo layout

| Path | Role |
|---|---|
| `harmonik-v3` | The CLI: core commands (`init`, `new`/`resume agent claude`, `config`, `build`, `list`), and the router to modules. |
| `lib/hk3.sh` | Shared library for the CLI and modules: settings loading, project resolution, naming. Nothing else. |
| `modules/<name>/` | One module per concern. `main`, when present and executable, is its command entrypoint. |
| `modules/keeper/` | Keeper: `plugin/` hands off and restarts a session at a token threshold; `defaults.sh` holds the `KEEPER_*` defaults. No commands. |
| `modules/session/` | `hk3 session start/stop/tabs`: agents in herdr. `herdr.sh` is the only file in hk3 that calls herdr. |
| `modules/crew/` | `hk3 crew start/add/roster/stop`: teams, crew definitions and rosters, through `hk3 session`. |
| `crews/`, `workflows/` | Example crew definition (`feature`) and workflow (`plan-build-review`); a project's `.harmonik-v3/crews/` and `workflows/` override them by name. |
| `scripts/compose-role` | Merges YAML config into a role's `settings.json` and skills plugin. |
| `scripts/statusline` | Claude status line: agent badge and role, then the project's own status line. |
| `config/base.yaml`, `config/roles/*.yaml` | Role definitions. |
| `skills/` | Skill library. Roles pick skills from it by name. |
| `setup/init-prompt.md` | Instructions given to Claude by `hk3 init`. |
| `docs/` | Documentation; index in `docs/README.md`. |
| `AGENTS.md` | Context for agents working on this repo (`CLAUDE.md` links to it). |
| `.env` | Machine-local settings, not committed. |

## Router and modules

`hk3 <word> ...` runs a core command when `<word>` is one. Any other word
that names a folder `modules/<word>/` with an executable `main` is forwarded:
hk3 resolves the project, loads settings, exports `HK3_PROJECT_DIR` (the
resolved project) and `HK3_ROOT` (the harmonik-v3 repo), and execs `main`
with the remaining arguments. Anything else prints usage and exits 1. There
is no registry; `hk3 --help` lists modules by hand.

A module does one thing, sources `$HK3_ROOT/lib/hk3.sh` for settings and
naming helpers, and calls the launcher or other modules only through
`$HK3_ROOT/harmonik-v3`, never `hk3` on PATH. Dependencies point one way:
router, then modules, then the library. No module reads another module's
files.

Modules today: `keeper` (no commands; the core launch loads its plugin),
`session` (agents in herdr) and `crew` (teams and rosters), below.

## Session module (herdr)

`hk3 session start [--team <team>] --name <name> [--role <role>] [--prompt <text>]`
runs an hk3 agent in [herdr](https://herdr.dev), with `--prompt` as its
one-line first prompt (passed to claude after `--`); `hk3 session stop <label>` ends it;
`hk3 session tabs` prints the labels of the open tabs with the project
prefix, for other modules to check which labels are taken. A listed label is
a tab, not proof of a running agent. Stop refuses a label without the
prefix, so it never touches the operator's own tabs.

- **Team = workspace, member = tab.** Every agent lives in one herdr session
  (`HK3_HERDR_SESSION`, default `hk3`). A team is a workspace labelled with
  the team label (`oc-alpha`); each agent is a tab labelled with its own
  label (`oc-alpha--builder`). A solo agent's workspace has its own label,
  which is also the team label if it grows a team. The first agent in a new
  workspace takes its root tab, so there is no stray empty tab. The project
  prefix is required so labels from different projects never collide.
- **One adapter.** `modules/session/herdr.sh` holds every herdr call behind
  a few label-based operations (ensure server, open tab, type a line, send
  keys, wait for output, list and close tabs). herdr ids, JSON and flags stay
  inside it. ids are looked up by label on every call, since herdr never
  reuses them. Every call names the session explicitly, so the same command
  works from a terminal or from an agent inside herdr (that is how an agent
  starts a sibling).
- **Clean environment.** A captain runs `hk3 session start` from Claude's
  Bash tool, whose environment carries Claude's own variables and the
  captain's identity. None of it may reach a member: a leaked
  `CLAUDE_CODE_CHILD_SESSION` makes a child session that cannot be messaged
  or resumed, and a leaked `HK3_TEAM` or `HK3_PROJECT_DIR` puts the member
  in the wrong team or project. The scrub list is `CLAUDECODE`, every
  `CLAUDE_CODE_*`, `CLAUDE_PID`, `CLAUDE_EFFORT`, every `HK3_*` and
  `KEEPER_*`, and `HARMONIK_AGENT`. It is applied twice: the herdr server is
  started (detached) without them, and the command typed into the tab
  removes them again in the tab's shell (which may set its own), then sets
  the caller's resolved settings explicitly (project dir, prefix, herdr
  session, any shell-only `HK3_*`/`KEEPER_*`), except the per-agent ones
  (name, id, team, role, `KEEPER_ENABLED`). herdr's own stripping covers
  only four names and is not relied on.
- **Start** refuses a label that already has a tab, opens the tab, types the
  launch (the hk3 script by absolute path, ending in `&& exit`, so the tab
  closes when Claude exits normally and stays open with the error if the
  launch fails), then waits for the launcher's `hk3: claude` line or the
  failure line `hk3: launch failed (exit N)`, then 2 s more for the failure
  line, which catches claude failing right after it started. A start fails
  if the tab closed. A lock in `/tmp` (one per herdr session) keeps
  simultaneous starts from creating a team's workspace twice; if a stop
  removes the team's workspace while a start joins it, the start creates it
  again.
- **Stop sends `/exit`.** Killing the tab would kill Claude before its
  SessionEnd hooks run (herdr #4851). Stop sends `ctrl+c` (clears a draft of
  any length and interrupts a running turn; `ctrl+u` clears one line, and
  Esc Esc on an empty input opens Rewind), then `/exit` and Enter. If the
  tab is still open after 2 s it sends one more Enter, which confirms
  Claude's "Background work is running" dialog. After a 5 s grace period it
  closes the tab. herdr closes a workspace when its last tab goes.
- **Not handled by hk3:** Claude's folder-trust prompt (the operator trusts
  the project once), and tabs herdr restores with no agent after a server
  restart (start refuses them; `hk3 session stop <label>` clears them).
- **Role builds are atomic.** `compose-role` builds into a temp folder beside
  `build/roles/<role>/` and swaps it in with `mv`, or drops it if nothing
  changed, so launches of one role at the same moment do not break each
  other or the plugin folder of running agents.

## Crew module (teams and rosters)

`hk3 crew start <crew> [--team <team>]` starts a team from a crew definition,
`hk3 crew add <role> [--name <member>] [--responsibility <text>] [--team <team>]`
adds one member to a team, `hk3 crew roster [--team <team>]` prints the
team, and `hk3 crew stop <member>... | --all [--team <team>]` removes
members. Crew starts and stops agents only through `hk3 session` (by the hk3
script's absolute path) and learns which labels have a tab from
`hk3 session tabs`; it never calls herdr. It decides nothing about the work.

- **Identity rules.** Read mechanically from the environment the launcher
  sets (see [configuration.md](configuration.md#agent-names-and-labels)):
  inside an hk3 session (`HK3_AGENT_ID` set) the team is the caller's
  (`HK3_TEAM`, else `HK3_AGENT_NAME`), and `--team` may only repeat it, so an
  agent cannot change another team. Inside a session the team label is the
  part of `HK3_AGENT_ID` before `--`; a command refuses to run when that
  differs from what the current prefix gives. Outside a session `--team` is
  required and the team label is `<prefix>-<team>`.
  An agent cannot stop itself (it ends with `/exit`). The session module's
  clean environment keeps a member from inheriting its captain's identity.
- **Roster.** One file per team, `<project>/.harmonik-v3/teams/<team>.yaml`:
  `team`, `label` (the team label), from `crew start` also `crew` and
  `workflow` (`name`, `path`), and `members`, each with `label`, `role`
  and `responsibility`. hk3 rewrites it whole (temp file, then `mv`) on every
  change. The teams folder gets a `.gitignore` of `*` when hk3 creates it.
- **Add.** The member name defaults to the role, with the next free number
  when taken (`builder`, `builder-2`); a taken `--name` is refused. Taken
  means on the roster or a tab of the team, stale or not. The first add from a solo agent writes the
  roster with the caller first, under its actual role (`HK3_ROLE`). Name
  choice, roster write and start run under a lock (`teams/<team>.lock`, a
  `mkdir`), so two adds never pick one name and no write drops another's
  member. The roster is written before the start, so the member's first look
  finds itself. Its first prompt, from one fixed template, gives its label,
  role and team and says to run `hk3 crew roster`. A failed start leaves the
  member on the roster with a pointer to `crew stop`; there is no rollback.
- **Start.** A crew definition (format and lookup in
  [configuration.md](configuration.md#crew-definitions-and-workflows)) and
  its workflow are checked structurally first: YAML, known roles, valid and
  unique resulting names, whole counts, one-line responsibilities, a
  workflow that exists and has a `description`. hk3 reads nothing else from
  a workflow. Then start refuses a team with a roster, a team label that is
  a live tab (outside a session), and any member label that is a live tab.
  Under the team's lock it writes the whole roster (with `crew` and the
  workflow's name and absolute path), then starts the members in order.
  The lead (first) slot is the team label: outside a session hk3 starts it
  as a solo agent named after the team (`session start --name alpha`, so
  workspace `oc-alpha`) with the slot's role; inside a session only the
  team-label agent may run it (a member caller is refused); it fills it and is recorded under its actual role, with the slot's
  responsibility only if the definition gives one. A failed start stops
  there and prints who started and who did not; every member stays on the
  roster and `crew stop --all` cleans up. No rollback.
- **Roster command.** Prints the crew and workflow (if any), the members
  with which have a live tab (from `hk3 session tabs`) and, inside a session, the caller's own label. Live
  means a herdr tab only: a captain in a plain terminal shows as not live.
- **Stop.** Each named member (member name or full label, which must be on
  the roster) is stopped with `hk3 session stop` and then taken off the
  roster under the lock. A member with no tab is taken off with a note.
  `--all` stops every member but the caller; from outside a session it stops
  all and deletes the roster, which also clears a stale one; the delete
  re-reads the roster under the lock, and if a member was added meanwhile it
  keeps the roster and names that member. Bare
  `crew stop` is refused, so an agent cannot stop its whole team by
  accident.

## Team messaging

hk3 adds no messaging code. Members use Claude Code's cross-session
messaging (`ListAgents`, `SendMessage`), addressed by the label hk3 passes
as `--name`.

- **Transport.** Delivery is immediate whether the receiver is idle (it
  starts a turn) or busy (it gets the message between tool calls). The
  receiver sees `Message from @<label>`, so there is no sender header in
  the text. The name and endpoint survive keeper's compaction and `/clear`.
  The clean environment of the session module is what makes this work: a
  leaked `CLAUDE_CODE_CHILD_SESSION` gives a session that `ListAgents` does
  not list.
- **One permission mode.** Claude holds a cross-session message for the
  user's approval (and may let it expire) when the receiver runs in a
  different permission mode from the sender. Every hk3 agent launches with
  the same mode (`--dangerously-skip-permissions` by default), so
  `crossSessionInbound` is not set. Mixing modes within a team breaks
  delivery.
- **Wrong-team protection is naming and convention**, not a filter. A
  member's team label is the part of its label before `--` (team `alpha`,
  team label `oc-alpha`); `crew` commands take the team from the caller's identity, so an agent cannot change another
  team; and the `crew` skill (in `config/base.yaml`, so every role has it)
  says to message only labels on the roster, because `ListAgents` lists
  every Claude session on the machine (including other projects' agents
  with look-alike labels), and to treat a message from another team with
  suspicion and tell the operator. Nothing blocks a cross-team message.

## What a launch does

`hk3 new agent claude --name alpha --role builder`:

1. Finds the project: `$HK3_PROJECT_DIR`, else the git root of the current
   directory, else the current directory.
2. Loads settings (see [configuration.md](configuration.md)), then keeper's
   defaults from `modules/keeper/defaults.sh`. The router, not the library,
   loads them, since the core launch is what loads keeper.
3. Composes the role into `<project>/.harmonik-v3/build/roles/<role>/`:
   `config/base.yaml`, then `config/roles/<role>.yaml`, then the project's
   `.harmonik-v3/config.yaml`.
4. Runs `claude` from the project root with:
   - `--plugin-dir modules/keeper/plugin` (keeper, loaded for this launch only)
   - `--settings <build>/settings.json` (the role's Claude settings)
   - `--plugin-dir <build>/plugin` (the role's skills, as plugin `keeper-role`)
   - `--name <label>`, the agent's label: `<prefix>-<name>` (`oc-alpha`), or
     `<prefix>-<team>--<member>` (`oc-alpha--builder`) with `--team`; see
     [configuration.md](configuration.md#agent-names-and-labels)
   - `--dangerously-skip-permissions` / `--remote-control` if enabled

   It also exports `KEEPER_ENABLED=1`, `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`,
   `HK3_ROLE`, `HK3_AGENT_NAME`, `HK3_AGENT_ID` (the label), `HK3_TEAM` (team
   members only) and `HK3_STATUSLINE_INNER` for keeper and the status line,
   and `HARMONIK_AGENT` (see below).

`hk3 init` runs `claude` in the project with `setup/init-prompt.md` appended
to the system prompt and without keeper or a role. That session writes
`.harmonik-v3/` and ends by printing the `hk3 new agent claude ...` command.

## Design decisions

- **Claude runs from the project root.** Claude stores sessions per
  directory, so `resume` only finds a session if every launch uses the same
  directory.
- **Nothing is installed.** Keeper and role skills load via `--plugin-dir`
  and settings via `--settings`, so the project's own `.claude/` config and
  the user's global config are never edited.
- **Every launch has a role.** The default role is `general`, which is the
  base config with no extra skills. One code path, and the status line always
  has a role to show. What `general` should contain is still open.
- **The status line chains.** `--settings` replaces whatever status line the
  project or user had, so `scripts/statusline` prints the agent badge on the
  first line and the replaced command's output (found at launch, given the
  same input) on the second.
- **Two setting prefixes.** `HK3_*` settings belong to the launcher, `KEEPER_*`
  settings to the keeper plugin. Keeper reads its settings through `$.env.get`,
  which needs literal names, so the names are part of the plugin's validated
  manifest.
- **hk3 sessions stay separate from the older harmonik.** Its global
  `SessionStart` and `Stop` hooks in `~/.claude/settings.json` name the agent
  from `HARMONIK_AGENT`, else the tmux session name, and write per-agent
  markers (`.harmonik/keeper/<agent>.sid`, `.idle`) that its watcher reads.
  hk3 exports `HARMONIK_AGENT` as the full label (`oc-alpha`,
  `oc-alpha--builder`; `hk3-` in front when the project has no prefix), so an
  hk3 `alpha` never overwrites an older `alpha`'s markers and team members
  never share them. Its `PreCompact` hook, which blocked compaction for managed agents,
  was removed from the global settings on 2026-10-02. Remove this export once
  the older harmonik is retired.
- **Keeper is inert unless hk3 launched it** (`KEEPER_ENABLED=1`), so loading
  the plugin any other way does nothing.
