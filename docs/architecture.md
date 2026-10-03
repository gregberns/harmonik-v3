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

Modules today: `keeper` (no commands; the core launch loads its plugin) and
`session` (agents in herdr, below).

## Session module (herdr)

`hk3 session start [--team <team>] --name <name> [--role <role>]` runs an
hk3 agent in [herdr](https://herdr.dev); `hk3 session stop <label>` ends it;
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
