# Spec: crews

Source: [requirements.md](requirements.md). Research: [research-herdr.md](research-herdr.md),
[research-messaging.md](research-messaging.md). Principle:
[zero framework cognition](../../docs/concepts/zero-framework-cognition.md).

## Problem Statement

hk3 starts one Claude Code agent at a time, each in a terminal the operator
opens by hand. There is no way to start a team: several agents with set roles
that know about each other and can message each other. A captain (the
primary agent on a project) cannot add crew when the work grows, and cannot
clean them up at the end. The operator has no single place to see which
agents are running. Nothing in a name says that two agents belong together,
so an agent could message another team's member and start work that should
not happen.

## Solution

hk3 becomes a small router over submodules. Keeper becomes the first
submodule. Two new submodules are added:

- **session**: starts, lists and stops hk3 agents inside herdr. A team is a
  herdr workspace; each member is a tab. The operator attaches to herdr to
  see every agent and its state.
- **crew**: starts a team from a YAML crew definition, adds and removes
  members, and keeps a roster file listing who is on the team, their roles
  and their responsibilities.

A naming rule makes membership obvious: team members are
`<prefix>-<team>--<member>`, e.g. `oc-alpha--builder`. A captain `oc-alpha`
that adds a tester gets `oc-alpha--tester`; its team is `alpha`.

Members talk with Claude Code's cross-session messaging, addressing each
other by label. A `crew` skill, loaded into every agent, says how to read the
roster, how to address teammates, and to act only on messages from its own
roster. Workflows are YAML files that agents read and follow; hk3 only
stores, lists and checks their structure. The operator's own
project-management skill plugs in through a project-local skill folder.

hk3 decides nothing about the work: who does what, when a member is done,
or whether to grow or shrink the team. Those are the agents' judgment.

## User Stories

Operator, teams:

1. As an operator, I want to start a team from a named crew definition with one command, so that I can spin up a team with a known shape.
2. As an operator, I want to give the team a name (e.g. `alpha`), so that several teams can run in one project without clashing.
3. As an operator, I want every member's label to contain the project prefix and team name, so that I can tell at a glance which team an agent belongs to.
4. As an operator, I want a crew definition to allow several members with the same role, so that I can run two builders.
5. As an operator, I want same-role members numbered predictably (`builder-1`, `builder-2`), so that names are stable and guessable.
6. As an operator, I want crew definitions in the hk3 repo shared across projects and in the project for project-specific shapes, so that I can reuse shapes and still tailor them.
7. As an operator, I want a project definition to win over a shared one with the same name, so that a project can override a shared shape.
8. As an operator, I want to start a team from a one-off definition file, so that a team can be put together for a particular problem.
9. As an operator, I want hk3 to refuse an invalid definition (unknown role, duplicate names, bad names, missing workflow) before anything starts, so that I never get half a team.
10. As an operator, I want hk3 to refuse to start a member whose label is already running, so that two sessions never share a name.
11. As an operator, I want to list the available crew definitions and workflows with their descriptions, so that I can pick one.
12. As an operator, I want to see a team's roster with which members are live, so that I know the team's current state.
13. As an operator, I want to attach to one herdr view showing every hk3 agent grouped by team, so that I can see where things are and step in.
14. As an operator, I want to stop one member or a whole team with one command, so that I can clean up.
15. As an operator, I want stopping to ask Claude to exit cleanly before closing its pane, so that session-end hooks and keeper state are not cut off.
16. As an operator, I want to start a single agent inside herdr, so that solo agents also show in the herdr view.
17. As an operator, I want `hk3 new agent claude`, `hk3 resume agent claude`, `hk3 init`, `hk3 config`, `hk3 build` and `hk3 list` to work as before, so that nothing I use today breaks.
18. As an operator, I want to start a team member in a plain terminal with a team name, so that I can use the naming without herdr.

Captain:

19. As a captain, I want to tell hk3 to add a member with a given role to my team, so that I can grow my team when the work grows.
20. As a captain running solo as `oc-alpha`, I want adding a tester to create team `alpha` with me in it and the tester as `oc-alpha--tester`, so that I become a team without being renamed or restarted.
21. As a captain, I want hk3 to take my team from my own label when I add members, so that I cannot add crew to another team by accident.
22. As a captain, I want to start a whole crew definition from inside my session, with me filling its lead slot, so that I am added to the crew rather than a second captain being started.
23. As a captain, I want to give a member a one-line responsibility when I add it, so that the team knows what it is for.
24. As a captain, I want to find an existing workflow or write a new one and attach it to my team, so that the team has a shared process to follow.
25. As a captain, I want to stop members, and the rest of my team at the end, so that I clean up when the project is done.
26. As a captain, I want my own session left running when I stop my team, so that I can report back to the operator.

Every member:

27. As a member, I want to know at startup who I am, my role, and my team, so that I can start working without asking.
28. As a member, I want to read my team's roster (labels, roles, responsibilities, workflow) with one command, so that I know whom to message for what.
29. As a member, I want the roster to change when members are added or removed, so that I never message someone who left.
30. As a member, I want to be told when the roster changes, so that I re-read it. (The agent who changed it sends the message, by convention.)
31. As a member, I want to message a teammate by its label and have it delivered even if the teammate is idle, so that work can be handed over.
32. As a member, I want every message to name its sender and team on the first line, so that the receiver can check it against its roster.
33. As a member, I want a convention not to start work from a sender that is not on my roster, so that a wrong-team message does not start work.
34. As a member, I want the team's workflow file to be plain YAML I can read, so that I follow it with my own judgment.
35. As a member, I want my own handoff and keeper restart to keep working as a team member, so that long tasks survive context limits.

Project setup:

36. As an operator, I want to drop my own project-management skill into the project and have chosen roles load it, so that teams manage work my way, not hk3's.
37. As an operator, I want to define a project-only role, so that a crew definition can use it.
38. As an operator, I want team state files kept out of git, so that runtime state does not pollute the project.

## Implementation Decisions

### 1. hk3 as a router

- The CLI keeps its core commands (`init`, `new|resume agent claude`,
  `config`, `build`, `list`) unchanged. Any other first word that names a
  folder in the repo's modules directory is forwarded: hk3 resolves the
  project, loads settings, then execs that module's single executable
  entrypoint with the remaining arguments. Unknown words print usage.
  *Rationale: one rule, no registry, existing commands untouched.*
- Shared bash helpers (die, settings loading, project resolution, label
  building and parsing) move into one library that the CLI and every module
  source. *Rationale: one implementation of naming and settings.*
- `hk3 --help` lists core commands, then each module with the one-line
  summary from its entrypoint. *Rationale: discovery without a registry.*
- Modules call each other only through the `hk3 <module>` command line.
  *Rationale: the CLI is the one seam to test.*
- Keeper becomes the first module: its folder holds the plugin and the
  `KEEPER_*` defaults, and its entrypoint offers `hk3 keeper check` (the
  plugin's validate and test runs). The core launch still loads the plugin,
  now from the module folder. Keeper behavior does not change.
  *Rationale: keeper's code stays in one focused place.*
  **Needs operator confirmation** (moves the plugin's path).

### 2. Session module (herdr)

- Operations, and nothing else:
  - `hk3 session start [--team <team>] --name <name> [--role <role>] [-- <claude args>]`
  - `hk3 session list [--team <team>]`
  - `hk3 session stop <label>`
  - `hk3 session attach`
  *Rationale: the minimum to start, see and clean up agents.*
- All agents live in one herdr session, named by `HK3_HERDR_SESSION`
  (default `hk3`). hk3 starts its server in the background when it is not
  running. *Rationale: one place for the operator to attach.*
- A team maps to a herdr workspace labelled with the team label
  (`oc-alpha`); each member is a tab labelled with its own label. A solo
  agent's workspace is labelled with its own label, which is also the team
  label it would have if it grew a team. *Rationale: workspaces roll up
  status per team in herdr's sidebar; captain-becomes-team needs no move.*
- Start: find or create the workspace (project root as cwd, no focus),
  create a tab, and type the normal hk3 launch command into it, followed by
  an exit of the pane's shell so the tab closes when Claude exits. The
  command uses the absolute path of the hk3 script. *Rationale: one launch
  path; hk3 still composes roles, keeper and the name.* Using herdr's
  `agent start` instead is left to the spike's result.
- Start refuses when a tab with that label already exists.
- Every herdr call names the session explicitly, so the same command works
  from the operator's terminal or from an agent inside herdr. That is how an
  agent starts siblings. *Rationale: verified in research; no special case.*
- Stop: send `/exit` to the member's pane, wait a fixed grace period for the
  tab to close, then close it. Close the workspace when its last tab goes.
  *Rationale: herdr #4851 kills Claude before SessionEnd hooks.*
- List reads herdr's workspace and tab lists and prints team label, member
  label and pane id. It never reads agent state (herdr's state detection is
  screen-scraped and unreliable).
- `hk3 new agent claude` keeps working without herdr.

### 3. Naming

- Grammar (recommended form, `oc-alpha--builder`):

  ```
  solo agent   <prefix>-<name>               oc-alpha
  team label   <prefix>-<team>               oc-alpha
  member       <prefix>-<team>--<member>     oc-alpha--builder
  same role    <member>-<n>, n from 1        oc-alpha--builder-1, oc-alpha--builder-2
  ```

  *Rationale: it is the only candidate where a solo captain's label is
  already the team label, so `oc-alpha` growing `oc-alpha--tester` needs no
  rename; `--` appears once and marks membership.*
- Prefix, team and member parts use the current character set
  (`[A-Za-z0-9_-]`) and must not contain `--`. The team is the part of the
  name before `--`; a solo agent's team is its whole name.
- `hk3 new|resume agent claude` gains `--team <team>`. It sets the label as
  above and exports `HK3_TEAM`. `--name alpha--builder` (a `--` inside a
  name) is refused; `--team` is the one way to form a member name.
- With count 1 a member is just its name (`builder`). With count > 1 they
  are numbered from 1. Adding another `builder` to a team that has
  `builder` gives `builder-2` (lowest free number from 2).
- In a team started from a definition, the lead is a normal member
  (`oc-alpha--captain`). In a team grown by a solo captain, the founder keeps
  `oc-alpha`. Both are members of team `alpha`.
  **Needs operator confirmation** (form and numbering).

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
  `count` defaults to 1; `responsibility` defaults to the role's
  description. Structural checks only. *Rationale: the smallest shape that
  covers the operator's example.*
- Lookup by name: the project's `.harmonik-v3/crews/`, then the hk3 repo's
  crews folder. An argument that is a path is used as a file.
  *Rationale: same project-wins rule as role overlays.*
- `hk3 crew start <crew> --team <team> [--workflow <name>]` (operator):
  validate, write the roster, start every member through
  `hk3 session start`.
- From inside an hk3 session, `hk3 crew start <crew>` uses the caller's own
  team, records the caller in the lead (first) slot, and starts the rest.
  *Rationale: the captain already exists and is added, not started.*
- `hk3 crew add <role> [--name <member>] [--responsibility <text>] [--team <team>]`
  adds one member. Inside a session the team defaults to the caller's; the
  first add from a solo agent creates the roster with the caller as its
  first member. Outside a session `--team` is required.
- Each started member gets a first prompt from a fixed template: its label,
  role and team, and to run `hk3 crew roster`. Mechanical text, no
  judgment.
- hk3 ships one example definition and adds a `captain` role.

### 5. Workflows

- A workflow is a YAML file the agents read and follow. hk3 checks only
  that it parses and has a `description`; every other key is free-form for
  agents. *Rationale: hk3 never interprets or enforces process.*
- Lookup: the project's `.harmonik-v3/workflows/`, then the hk3 repo's.
  hk3 ships one example.
- `hk3 crew defs` lists crew definitions and workflows (name, description,
  where found) and flags any that fail the structural check.
- A team's workflow (from the definition or `--workflow`) is recorded in
  the roster by name and path. A captain creates a new one by writing a file
  in the project's workflows folder; the `crew` skill says where.

### 6. Roster

- hk3 writes one roster file per team in the project's `.harmonik-v3/teams/`
  (gitignored). It holds team, team label, crew, workflow (name and path),
  and members (label, role, responsibility). hk3 rewrites it whole on start,
  add and stop. *Rationale: a file is the plainest shared state.*
- `hk3 crew roster [--team <team>]` prints the roster plus which members
  have a live herdr tab, and inside a session the caller's own label.
- Agents learn of the roster through the first prompt and the `crew`
  skill. Changes reach them by convention: whoever adds or stops a member
  messages the team. hk3 never messages agents.
- `hk3 crew stop [<member>...] [--team <team>]` stops the named members, or
  the whole team, through `hk3 session stop` and removes them from the
  roster. Inside a session, stopping the whole team leaves the caller
  running.

### 7. Messaging

- Transport is Claude Code cross-session messaging (`ListAgents`,
  `SendMessage`) addressed by label, which hk3 already passes as `--name`.
  *Rationale: built in; no agent-teams feature needed.*
- A `crew` skill in the base config (every agent) states the protocol:
  find yourself and your team with `hk3 crew roster`; address teammates by
  exact roster label; start each message with
  `[<team>] <your label>:`; do not start work for a sender not on your
  roster (reply or tell the operator instead); after adding or stopping a
  member, message the team to re-read the roster. Conventions only.
- Wrong-team protection is the naming plus that convention. `crew add` and
  `crew start` default to the caller's own team.
- `crossSessionInbound` behavior under `--dangerously-skip-permissions` is
  unverified. If the spike shows messages are held or refused, the base
  config sets it to `accept`.

### 8. Project-management skill slot

- Projects may hold their own skills in `.harmonik-v3/skills/` and their own
  roles in `.harmonik-v3/roles/`. Role composition looks in the project
  first, then the hk3 repo. The operator's project-management skill goes in
  the project folder and is listed by the roles that need it (or by the
  project overlay for all roles). hk3 ships no project-management content.
  **Needs operator confirmation** (project-local roles).

### 9. Spike first

- Ticket 01 verifies the risky assumptions end to end before anything else
  is built: hk3 agents launched in herdr tabs; `--name` with a `--` label;
  two agents see and message each other by label; an idle agent wakes on a
  message; `crossSessionInbound` default under skip-permissions; `/exit`
  through herdr runs SessionEnd and closes the tab; a first prompt passed
  after `--` is submitted; an agent inside herdr can start a sibling tab.
  Results are added to the research notes and may change decisions 2 and 7.

## Testing Decisions

- Test external behavior through the `hk3` command line, the one seam. No
  tests of internal helpers.
- Prior art: [docs/testing.md](../../docs/testing.md). A fake `claude` on
  PATH that prints its arguments, working directory and `HK3_*` variables;
  a scratch git repo with `.harmonik-v3/`, never a real project.
- For the session and crew modules: real herdr in a throwaway herdr session
  (`HK3_HERDR_SESSION=hk3test`) with the fake `claude`. The fake also waits
  on stdin and exits on `/exit`, so start, list and clean stop are checked
  without spending tokens. Inspect tab labels, the typed command line and
  the environment in each pane. Stop the test herdr session afterwards.
- Definitions and workflows: valid and invalid fixture files run through
  `hk3 crew defs` and `hk3 crew start`; invalid ones must start nothing.
- Router: every existing command gives the same output as before with the
  fake `claude`; `hk3 keeper check` runs the plugin's validate and tests.
- Live Claude only where behavior cannot be faked: the spike, and the
  messaging check (two members exchange messages; an idle member wakes).
- Each ticket that adds a check adds it to docs/testing.md.

## Out of Scope

- A work board, task list or any hk3-owned tracking of work.
- Enforcing process: validating transitions, gates, or workflow steps.
- Interpreting workflows; workflow semantics beyond "parses and has a description".
- Detecting completion, idleness or blocked state (including herdr `agent wait`).
- hk3 sending messages or notifications to agents.
- A hook or filter that blocks cross-team messages; protection beyond naming and the protocol convention.
- Agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`).
- Resuming a whole team after a restart; restarting dead members.
- A tmux backend or fallback for teams.
- `herdr integration install`, or any change to the operator's global Claude or herdr config.
- Resource limits, scheduling, or model selection per member.
- Project-management content; the operator supplies that skill.
- Multi-machine or remote teams.

## Further Notes

- herdr is pre-1.0 and changes fast. The session module is the only code
  that calls herdr, so a version change touches one place.
- `hk3` is assumed to be on PATH inside agent sessions (README step 2);
  agents run `hk3 crew ...` themselves.
- Concurrent roster writes (two agents adding at once) are not guarded in
  the first version; the last write wins.
- A label is the Claude session name, the herdr tab label, and the keeper
  `{name}` source, so handoff files become e.g. `HANDOFF-alpha--builder.md`.

## Open questions for the operator

1. Naming: `oc-alpha--builder`, with same-role members `builder-1`,
   `builder-2`? And should a team started from a definition name its lead
   `oc-alpha--captain` (proposed) or plain `oc-alpha`?
2. Keeper module: OK to move the keeper plugin into a modules folder (its
   path in docs changes)?
3. Project-management slot: project-local skills only, or also
   project-local roles (proposed: both)?
4. One herdr session (`hk3`) for all projects (proposed), or one per
   project?
5. When a captain starts a definition from inside its session, it takes the
   first (lead) slot. OK, or should the definition name the lead slot?
