# Spec: crews

Source: [requirements.md](requirements.md). Research: [research-herdr.md](research-herdr.md),
[research-messaging.md](research-messaging.md). Principle:
[zero framework cognition](../../docs/concepts/zero-framework-cognition.md).
Reviews: [review-scope.md](review-scope.md), [review-technical.md](review-technical.md).
Spike: [spike-results.md](spike-results.md) (GO; decisions 2 and 7 updated from it).

## Problem Statement

hk3 starts one Claude Code agent at a time, each in a terminal the operator
opens by hand. There is no way to start a team: several agents with set roles
that know about each other and can message each other. A captain (the
primary agent on a project) cannot add crew when the work grows, and cannot
clean them up at the end. Nothing in a name says that two agents belong
together, so an agent could message another team's member and start work
that should not happen.

## Solution

hk3 becomes a small router over modules. Keeper becomes the first module.
Two new modules are added:

- **session**: starts and stops hk3 agents inside herdr. A team is a herdr
  workspace; each member is a tab. The operator attaches to herdr directly
  to see every agent and its state.
- **crew**: starts a team from a YAML crew definition, adds and stops
  members, and keeps a roster file listing who is on the team, their roles
  and their responsibilities.

A naming rule makes membership obvious: team members are
`<prefix>-<team>--<member>`, e.g. `oc-alpha--builder`. A captain `oc-alpha`
that adds a tester gets `oc-alpha--tester`; its team is `alpha`.

Members talk with Claude Code's cross-session messaging, addressing each
other by label. A short `crew` skill, loaded into every agent, says how to
find the roster and the commands to grow or shrink the team. Workflows are
YAML files that agents read and follow; hk3 only checks that they parse and
have a description. The operator's own project-management skill plugs in
through a project-local skills folder.

hk3 decides nothing about the work: who does what, when a member is done,
or whether to grow or shrink the team. Those are the agents' judgment.

## User Stories

Operator:

1. As an operator, I want to start a named team (e.g. `alpha`) from a crew definition with one command, with its lead named `oc-alpha` and the others `oc-alpha--<member>`, so that I can spin up a team with a known shape.
2. As an operator, I want a crew definition to allow several members with the same role, named predictably (`builder`, `builder-2`), so that I can run two builders.
3. As an operator, I want crew definitions both in the hk3 repo and in the project, so that I can reuse shapes and still tailor them.
4. As an operator, I want to start a team from a one-off definition file, so that a team can be put together for a particular problem.
5. As an operator, I want hk3 to refuse an invalid definition (unknown role, duplicate or bad names, bad workflow) before anything starts, so that a bad file starts nothing.
6. As an operator, I want hk3 to refuse to start a member whose label is already running, so that two sessions never share a name.
7. As an operator, I want to see a team's roster with which members have a live herdr tab, so that I know the team's current state.
8. As an operator, I want every hk3 agent grouped by team in one herdr view, so that I can see where things are and step in.
9. As an operator, I want to stop one member or a whole team with one command, and have Claude exit cleanly first, so that I can clean up without cutting off session-end hooks.
10. As an operator, I want a stopped team's roster removed, so that I can start a team with that name again.
11. As an operator, I want `hk3 new agent claude`, `hk3 resume agent claude`, `hk3 init`, `hk3 config`, `hk3 build` and `hk3 list` to work as before, so that nothing I use today breaks.
12. As an operator, I want a member started by a captain to run in my project with my settings, and nothing from the captain's own session, so that it is a clean, independent agent.

Captain:

13. As a captain, I want to add a member with a given role to my team, so that I can grow my team when the work grows.
14. As a captain running solo as `oc-alpha`, I want adding a tester to create team `alpha` with me in it and the tester as `oc-alpha--tester`, so that I become a team without being renamed or restarted.
15. As a captain, I want hk3 to take my team from my own identity when I add or stop members, so that I cannot change another team by accident.
16. As a captain, I want to start a whole crew definition from inside my session, with me filling its lead slot under my actual role, so that I am added to the crew rather than a second captain being started.
17. As a captain, I want to give a member a one-line responsibility when I add it, so that the team knows what it is for.
18. As a captain, I want to find a workflow file (or write one) and tell my team its path, so that the team has a shared process to follow.
19. As a captain, I want to stop named members, or the rest of my team at the end with an explicit `--all`, while my own session keeps running, so that I clean up and can still report back.

Every member:

20. As a member, I want to know at startup who I am, my role, and my team, so that I can start working without asking.
21. As a member, I want to read my team's roster (labels, roles, responsibilities, workflow) with one command, so that I know whom to message for what.
22. As a member, I want the roster to reflect members added or removed, so that I never message someone who left.
23. As a member, I want to message a teammate by its label and have it delivered even if the teammate is idle, so that work can be handed over.
24. As a member, I want to recognise a message from outside my team by its sender's label, so that a wrong-team message does not start work.
25. As a member, I want the team's workflow file to be plain YAML I can read, so that I follow it with my own judgment.
26. As a member, I want my own handoff and keeper restart to keep working, with a handoff file that no other agent shares, so that long tasks survive a context limit. (Keeper still runs one cycle per launch.)

Project setup:

27. As an operator, I want to drop my own project-management skill into the project and have roles load it, so that teams manage work my way, not hk3's.
28. As an operator, I want team state files kept out of git without re-running `hk3 init`, so that runtime state does not pollute the project.

## Implementation Decisions

### 0. Structure and size (operator: "don't over build"; "no big bundle of interlinked code")

These rules bind every ticket.

- **One concern per module.** keeper: handoff and restart. session: running
  agents in herdr. crew: team definitions and rosters. Shared library:
  settings, project resolution and naming only.
- **herdr lives in one place.** Only the session module calls herdr. Inside
  it, every herdr call sits in one adapter file with a handful of
  operations (ensure server, find or create workspace, open tab, type
  command, list tabs, close tab). herdr ids, JSON shapes and flags never
  leave that file. Replacing herdr means rewriting that file and nothing
  else.
- **Dependencies point one way:** router → modules → shared library. The
  crew module starts and stops agents only through `hk3 session`, never
  through herdr, and the session module knows nothing about crews or
  rosters. No module reads another module's files.
- **Build only what a ticket asks.** No speculative options, flags or
  extension points. If a ticket seems to need more than its acceptance
  criteria, stop and ask the operator.
- **Bash for now.** The operator plans to rewrite this as real code later,
  so module seams matter more than clever bash.

### 1. hk3 as a router

- The CLI keeps its core commands (`init`, `new|resume agent claude`,
  `config`, `build`, `list`) unchanged. Any other first word that names a
  module folder with an executable entrypoint is forwarded: hk3 resolves the
  project, loads settings, exports the resolved project directory and the hk3
  repo root, then execs the entrypoint with the remaining arguments. Unknown
  words print usage. *Rationale: one rule, no registry.*
- Shared bash helpers (die, settings loading, project resolution, label
  building) move into one library that the CLI and every module source.
  *Rationale: one implementation of naming and settings.*
- The help text lists modules by hand. *Rationale: no discovery code.*
- Modules call each other and the launcher through the absolute path of the
  hk3 script, never through `hk3` on PATH. *Rationale: the CLI is the one
  seam, and it works without PATH setup.*
- Keeper becomes the first module: its folder holds the plugin and the
  `KEEPER_*` defaults. It has no commands yet; the core launch loads the
  plugin from the module folder. Keeper behavior does not change.
  *Rationale: requirements name keeper as the first module and ask that its
  code stay focused.* Confirmed by the operator.

### 2. Session module (herdr)

- Two commands: `hk3 session start [--team <team>] --name <name> [--role <role>]`
  and `hk3 session stop <label>`, plus `hk3 session tabs` (the plain list of
  live agent labels) that the crew module uses instead of asking herdr. The operator views agents with `herdr session attach hk3`
  (README). *Rationale: the minimum to start and clean up agents.*
- All agents live in one herdr session, named by `HK3_HERDR_SESSION`
  (default `hk3`). `session` and `crew` commands require
  `HK3_PROJECT_PREFIX`, so workspace labels from different projects do not
  collide. *Rationale: the simplest option for now (operator: mainly one
  project, several teams at once); one place to attach, and the prefix keeps
  projects apart. Can change later.*
- **Clean environment.** A captain runs these commands from Claude's Bash
  tool, whose environment carries Claude's own variables (`CLAUDECODE`,
  `CLAUDE_CODE_*`, `CLAUDE_PID`, `CLAUDE_EFFORT`) and the captain's identity
  (`HK3_*`, `KEEPER_*`, `HARMONIK_AGENT`). None of it may reach a member.
  The scrub list is exactly: `CLAUDECODE`, every `CLAUDE_CODE_*`,
  `CLAUDE_PID`, `CLAUDE_EFFORT`, every `HK3_*`, every `KEEPER_*`,
  `HARMONIK_AGENT`. herdr's own stripping covers only four names and is not
  relied on (spike: a leaked `CLAUDE_CODE_CHILD_SESSION` gives a session that
  cannot be messaged or resumed).
  - hk3 starts the herdr server detached with those variables removed, and
    waits until the server reports ready.
  - The command typed into a pane removes the same variables, then sets
    explicitly the resolved project directory, project prefix and other
    resolved `HK3_*`/`KEEPER_*` settings, except per-agent ones (agent name,
    agent id, team, role, `KEEPER_ENABLED`). Every value is shell-quoted.
    Both places use the same scrub list.
  *Rationale: otherwise members start as child Claude sessions, possibly on
  the captain's messaging socket, and inherit the captain's team or project.*
- A team maps to a herdr workspace labelled with the team label
  (`oc-alpha`); each member is a tab labelled with its own label. A solo
  agent's workspace is labelled with its own label, which is also the team
  label it would have if it grew a team. The first agent in a new workspace
  uses the workspace's root tab (renamed); later members get new tabs.
  *Rationale: workspaces roll up status per team; no stray empty tab.*
- Start: find or create the workspace (project root as cwd, no focus), get
  a tab, and type the hk3 launch command followed by `&& exit`, so the tab
  closes when Claude exits normally and stays open, showing the error, if
  the launch fails. After typing, wait for the launcher's `hk3: claude` line
  or the wrapper's `hk3: launch failed (exit N)` line (that is how a failed
  launch is detected; the launcher marks its line as relied on), then about
  2 s more for the failure line, and check the tab still exists; fail if
  not. Start refuses when a tab with that label already exists. A short
  lock per herdr session covers the label check and the tab creation, so
  concurrent starts in one team never create the team's workspace twice
  (the crew module does not need its own lock for this). If the workspace
  disappears between lookup and tab creation (a stop closed its last tab),
  start creates it again.
- `session tabs` lists the labels of open tabs with the project prefix; a
  listed label is a tab, not proof of a running agent. `session stop`
  refuses a label without the prefix.
- herdr ids are never reused. Use the ids from each create response, or look
  a tab up by its label; never cache ids across commands.
- herdr restores workspaces and tab labels, with fresh shells, after a server
  restart or `session stop`. A label can therefore have a tab with no agent,
  and start refuses it. The operator clears it with `hk3 session stop <label>`
  (on an agentless tab that just closes the tab).
- The first launch in a project waits on Claude's folder-trust prompt, whose
  default is "No, exit". hk3 never answers it. The operator trusts the
  project once, with a plain `hk3 new agent claude` or by attaching.
- `compose-role` builds atomically: it builds into a temp folder beside
  `build/roles/<role>/` and replaces it with `mv`. An unchanged build is not
  swapped in, so running agents keep their plugin folder. *Rationale: the
  spike saw two launches of one role race, and a rebuild pulled the plugin
  folder out from under running agents.*
- Every herdr call names the session explicitly, so the same command works
  from the operator's terminal or from an agent inside herdr. That is how an
  agent starts siblings.
- Stop: send `ctrl+c` (clears a draft of any length and interrupts a
  running turn; not `ctrl+u`, one line only; not Escape, Esc Esc on an empty
  input opens Rewind), then `/exit` and Enter. If the tab still exists after
  about 2 s, send one more Enter (it confirms Claude's "Background work is
  running" dialog). Then wait a fixed grace period for the tab to close, and
  close it if still open. herdr closes a workspace when its last tab goes,
  so stop does not close workspaces and treats "workspace already gone" as
  success. Stopping a label with no tab exits 0 with a notice. *Rationale:
  herdr #4851 kills Claude before SessionEnd hooks.*
- Launch is always `herdr pane run` of the hk3 command; herdr's
  `agent start` is not used (it bypasses hk3 and rejects some labels). hk3
  never reads herdr's agent state.
- `hk3 new agent claude` keeps working without herdr.

### 3. Naming

- Grammar (confirmed by the operator, "acceptable for now"):

  ```
  solo agent   <prefix>-<name>               oc-alpha
  team label   <prefix>-<team>               oc-alpha
  member       <prefix>-<team>--<member>     oc-alpha--builder
  same role    first bare, then -2, -3 ...   oc-alpha--builder, oc-alpha--builder-2
  ```

  *Rationale: the only candidate form where a solo captain's label is
  already the team label, so `oc-alpha` growing `oc-alpha--tester` needs no
  rename; one numbering rule for definitions and adds.*
- Prefix, team and member parts use the current character set
  (`[A-Za-z0-9_-]`), must not contain `--`, and must not start or end with `-` (so a label splits at `--` unambiguously; added during ticket 02).
- `hk3 new|resume agent claude` gains `--team <team>`. With it, hk3
  validates `--name`, then sets `HK3_AGENT_NAME=<team>--<name>` and
  `HK3_TEAM=<team>`. The label is `<prefix>-<team>--<name>`. A `--` typed
  inside `--name` is refused; `--team` is the one way to form a member name.
  Solo agents are unchanged.
- `HARMONIK_AGENT` is the full label (`hk3-` in front when there is no
  prefix). *Rationale: keeper's `{name}` and the older harmonik's markers
  must be unique per member; `HANDOFF-{name}` becomes
  `HANDOFF-alpha--builder`.*
- Identity, read mechanically:
  - **Inside an hk3 session** means `HK3_AGENT_ID` is set (only the
    launcher sets it, and the clean environment above keeps it from leaking).
  - The caller's team is `HK3_TEAM` if set, else `HK3_AGENT_NAME`.
  - The team label is the part of `HK3_AGENT_ID` before `--`.
- Same-role names: the lowest free name among `builder`, `builder-2`,
  `builder-3`, ...
- The lead of a team is always plain `<prefix>-<team>` (`oc-alpha`), the
  team label itself: whether a solo captain grows the team, a captain joins
  a definition, or the operator starts a definition (hk3 then launches the
  lead slot as a solo agent named after the team). Every other member is
  `oc-alpha--<member>`.

### 4. Crew definitions

- A crew definition is a YAML file:

  ```yaml
  description: Plan, build, review and test a feature.
  workflow: plan-build-review        # optional, a workflow name
  members:                           # first member is the lead
    - role: captain
    - role: planner
    - role: reviewer
      name: plan-reviewer
      responsibility: Reviews plans before building starts.
    - role: builder
      count: 2
    - role: reviewer
    - role: tester
  ```

  `role` is required and must be a known role; `name` defaults to the role;
  `count` defaults to 1; `responsibility` (one line) defaults to the role's
  description. Structural checks only.
- Lookup by name: the project's `.harmonik-v3/crews/`, then the hk3 repo's
  crews folder. An argument that is a path is used as a file.
- `hk3 crew start <crew> --team <team>` (operator, outside a session):
  validate, refuse if the team has a roster (point to `crew add`, or
  `crew stop --all` for a stale one), refuse if the team label itself is a
  live tab (point to running the start from inside that agent, or another
  team name), refuse if any member label is live; then write the roster and
  start every member. The lead (first) slot starts as `oc-alpha`, with the
  slot's role; the others as `oc-alpha--<member>`.
- From inside an hk3 session, `hk3 crew start <crew>` uses the caller's
  team. The caller fills the lead (first) slot and is recorded with its
  actual role; the slot's `responsibility` is used only if the definition
  gives one. The rest are started.
- `hk3 crew add <role> [--name <member>] [--responsibility <text>] [--team <team>]`
  adds one member. Inside a session the team is the caller's; the first add
  from a solo agent creates the roster with the caller (its actual role) as
  first member. Outside a session `--team` is required. Newlines in
  `--responsibility` are refused.
- Order and failure: name choice, roster write and tab start happen under a
  simple lock in the teams folder. The roster is written before a member
  starts, so its first look sees itself. If a start fails partway through
  `crew start`, hk3 stops, prints which members started, and leaves cleanup
  to `crew stop`. No rollback.
- Each started member gets a one-line first prompt from a fixed template:
  its label, role, team, and to run `hk3 crew roster`.
- hk3 ships one example definition and adds a `captain` role.

### 5. Workflows

- A workflow is a YAML file the agents read and follow. hk3 checks only
  that it parses and has a `description`; every other key is free-form.
  *Rationale: hk3 never interprets or enforces process.*
- Lookup: the project's `.harmonik-v3/workflows/`, then the hk3 repo's.
  hk3 ships one example, referenced by the example crew.
- A definition's `workflow` is resolved to a path at `crew start` and
  written into the roster. A team grown with `crew add` has no workflow
  field; its captain tells the team the file path. The `crew` skill names
  the two workflow folders.

### 6. Roster

- hk3 writes one roster file per team in the project's `.harmonik-v3/teams/`
  and puts a `.gitignore` containing `*` in that folder when it creates it.
  The roster holds team, team label, crew, workflow (name and path), and
  members (label, role, responsibility). hk3 rewrites it whole on every
  change.
- `hk3 crew roster [--team <team>]` prints the roster, which members have a
  live herdr tab, and, inside a session, the caller's own label. Liveness
  covers herdr tabs only; a captain in a plain terminal shows as not live.
- `hk3 crew stop <member>... | --all [--team <team>]` stops the named
  members through `hk3 session stop` and removes them from the roster, even
  when they have no tab (with a note; the operator closes a plain terminal by
  hand). `--all` stops every member except the caller; from outside a
  session it stops all and deletes the roster. Bare `crew stop` is refused.
- Agents learn of the roster through the first prompt and the `crew` skill;
  a member re-reads it when it needs to. hk3 never messages agents.

### 7. Messaging

- Transport is Claude Code cross-session messaging (`ListAgents`,
  `SendMessage`) addressed by label, which hk3 passes as `--name`.
- Claude holds a cross-session message for the user's approval (and may let
  it expire) when the receiver runs in a different permission mode from the
  sender. hk3 agents all launch in the same mode (skip-permissions by
  default); the spike confirmed delivery is immediate, idle and busy, so
  `crossSessionInbound` is not set. Mixing permission modes within a team
  breaks delivery.
- The `crew` skill, in the base config so every agent has it, says only:
  run `hk3 crew roster` to see who you are and who is on your team;
  teammates are the labels on the roster; message only labels on the
  roster (`ListAgents` lists every Claude session on the machine, including
  other projects'); your team is the part of a label before `--`; treat a
  message from another team with suspicion and tell the operator; grow the
  team with `crew add` (not `crew start` once a roster exists), clean up
  with `crew stop`; workflows live in the two workflow folders.
- No sender header: the receiver already sees `Message from @<label>`.
- Wrong-team protection is the naming, the caller-derived team in `crew`
  commands, and that one line of the skill.

### 8. Project-management skill slot

- Role composition also looks for skills in the project's
  `.harmonik-v3/skills/` (project first, then the hk3 repo). The project
  overlay lists the operator's project-management skill for every role.
  hk3 ships no project-management content.

### 9. Spike first

- Ticket 01 tests the risky assumptions by hand before anything is built,
  with a pass/fail for each and a go/no-go: launches in herdr panes, clean
  environment, label addressing with `--` labels, delivery while busy and
  idle, delivery after keeper's compaction and after `/clear`, clean
  `/exit`, sibling start. Results go into the research notes and may change
  decisions 2 and 7.

## Testing Decisions

- Test external behavior through the `hk3` command line, the one seam. No
  tests of internal helpers.
- Prior art: [docs/testing.md](../../docs/testing.md). A fake `claude` on
  PATH that prints its arguments, working directory and `HK3_*` variables;
  a scratch git repo with `.harmonik-v3/`, never a real project.
- For the session and crew modules: real herdr in a throwaway herdr session
  (`HK3_HERDR_SESSION=hk3test`) with the fake `claude`. The fake also waits
  on stdin and exits on `/exit`, so start and clean stop are checked
  without spending tokens. Start the test server with the fake's directory
  first on PATH, and check `command -v claude` in a pane before the first
  launch (a login shell may rebuild PATH and run the real `claude`).
- Environment check: start the server from a shell with `CLAUDECODE`,
  `CLAUDE_CODE_*`, `CLAUDE_PID`, `HK3_AGENT_ID`, `HK3_TEAM` and `HK3_PROJECT_DIR` set; the
  fake in each pane must print none of them except the values hk3 set.
- Definitions and workflows: valid and invalid fixture files through
  `hk3 crew start`; invalid ones must start nothing.
- Router: every existing command gives the same output as before with the
  fake `claude`, except the keeper plugin path.
- Live Claude only where behavior cannot be faked: the spike, and one
  messaging check (two members exchange messages; an idle member wakes).
  The first launch in a directory may show trust or bypass dialogs.
- Each ticket that adds a check adds it to docs/testing.md.

## Out of Scope

- A work board, task list or any hk3-owned tracking of work.
- Enforcing process: validating transitions, gates, or workflow steps.
- Interpreting workflows beyond "parses and has a description".
- Detecting completion, idleness or blocked state (including herdr `agent wait`).
- hk3 sending messages or notifications to agents, including roster-change broadcasts.
- A hook or filter that blocks cross-team messages; a required message header.
- Agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`); herdr `agent start`.
- `hk3 keeper check` or any keeper command (deferred).
- Module discovery for `hk3 --help` (modules listed by hand).
- `hk3 session list` and `hk3 session attach` as commands (use `crew roster` and `herdr session attach hk3`).
- `hk3 crew defs` listing (agents and operators `ls` the folders; bad files are refused at start).
- A `--workflow` flag on `crew start` or `crew add`.
- Project-local roles (deferred; project-local skills cover the slot).
- Resuming a whole team or restarting dead members (a member is resumed by hand with `hk3 resume agent claude --team ... --name ...`).
- A tmux backend or fallback for teams.
- `herdr integration install`, or any change to the operator's global Claude or herdr config.
- Resource limits, scheduling, or model selection per member.
- Project-management content; the operator supplies that skill.
- Multi-machine or remote teams.

## Further Notes

- herdr is pre-1.0 and changes fast. The session module is the only code
  that calls herdr.
- Agents run `hk3 crew ...` themselves, so `hk3` must be on PATH inside
  sessions (README step 2). hk3's own code uses the absolute path.
- Keeper runs one handoff cycle per launch; a long-lived member gets one
  automatic handoff. That limit predates this plan.
- Herdr keeps a tab's label separate from the terminal title, so Claude
  setting its title should not change the label; the spike confirms.

## Decisions from the operator (2026-10-02)

1. Naming: `oc-alpha--builder`; same-role members `builder`, `builder-2`,
   `builder-3`. A team's lead is plain `oc-alpha`, also when the team is
   started from a definition. "Acceptable for now."
2. Keeper module: move the keeper plugin into the modules folder.
3. A captain that starts a definition from inside its session takes the
   lead slot and keeps its own role.
4. herdr: one session (`hk3`, overridable with `HK3_HERDR_SESSION`), teams
   as workspaces. The simplest option for now; can change later.
