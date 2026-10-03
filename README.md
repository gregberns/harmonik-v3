# harmonik-v3

Run long-lived Claude Code agents in your projects without babysitting them.

`hk3` starts Claude Code in a project as a named agent (`oc-alpha`,
`oc-bravo`, ...) with a role that decides its skills and settings. When the
agent's context fills up, **keeper** has it write a handoff note, compacts
the session, and tells it to resume from that note, so it carries on without
you. Each agent's name shows as a coloured badge in Claude's status bar, so
you can tell several terminals apart at a glance.

Nothing is installed into your project's `.claude/` or your global Claude
config. Everything loads per launch, and each project's settings live in its
own `.harmonik-v3/` folder.

## Getting started

**1. Install the prerequisites:** Claude Code 2.1.280 or later, plus `yq`
(mikefarah v4) and `jq`. To run agents in herdr (`hk3 session`), also
[herdr](https://herdr.dev) 0.9.3 or later.

```sh
brew install yq jq
```

**2. Put `hk3` on your PATH:**

```sh
git clone git@github.com:gregberns/harmonik-v3.git ~/dev/harmonik-v3
ln -s ~/dev/harmonik-v3/harmonik-v3 ~/.local/bin/hk3   # any directory on your PATH
```

**3. Set up your project.** From anywhere inside the project:

```sh
cd ~/dev/my-project
hk3 init
```

This opens a Claude session that reads your project, works out how it
handles handoffs and status lines, asks you for a short project prefix (such
as `oc`), and writes `.harmonik-v3/`. It finishes with the exact command to
start your first agent.

**4. Start an agent:**

```sh
hk3 new agent claude --name alpha
```

The status bar shows `▶ oc-alpha  general`. Start a second agent in another
terminal with `--name bravo`, and so on. By convention, names are NATO
words.

## Everyday use

```sh
hk3 new agent claude --name alpha --role builder   # new agent with a role
hk3 resume agent claude --name alpha               # pick a past session to resume
hk3 resume agent claude <session-id> --name alpha  # resume a specific one
hk3 new agent claude --team alpha --name builder   # team member oc-alpha--builder
hk3 config                                         # what settings apply here, and from where
hk3 list roles
hk3 --help
```

Put extra Claude flags after `--`, e.g. `hk3 new agent claude --name alpha -- --model opus`.

To try keeper's handoff and restart without filling a real context window,
lower the threshold for one launch:

```sh
KEEPER_RESTART_TOKEN_COUNT=500 hk3 new agent claude --name alpha
```

## Agents in herdr

`hk3 session` starts agents in [herdr](https://herdr.dev), so you see every
agent in one place instead of one terminal each. It needs a project prefix
(`HK3_PROJECT_PREFIX`, which `hk3 init` sets).

```sh
hk3 session start --name alpha                      # oc-alpha, in its own workspace
hk3 session start --team alpha --name builder --role builder   # oc-alpha--builder joins workspace oc-alpha
hk3 session tabs                                    # this project's open tabs (a tab may have no agent)
hk3 session stop oc-alpha--builder                  # Claude exits via /exit, then the tab closes
```

A team is a herdr workspace (`oc-alpha`) and each agent a tab in it. All
agents share one herdr session, `hk3` (set `HK3_HERDR_SESSION` to change
it). Watch and step in with:

```sh
herdr session attach hk3
```

Two things to know:

- **Trust the project once first.** The first Claude launch in a folder asks
  whether you trust it, with "No, exit" selected. hk3 never answers that
  prompt. Run a plain `hk3 new agent claude` in the project once, or attach
  and answer it.
- **After a herdr server restart** herdr restores the tabs, with plain shells
  and no agent in them, and `hk3 session start` refuses those labels. Clear
  one with `hk3 session stop <label>`.

## Teams

`hk3 crew` starts and grows a team of agents in herdr and keeps a roster of
it.

### Start a team from a crew definition

```sh
hk3 crew start feature --team alpha                  # from your terminal: the crew definition "feature" as team alpha
hk3 crew start ./crews/bugfix.yaml --team bravo      # a one-off definition, by path
hk3 crew start feature                               # from inside agent oc-alpha: you take the lead slot
```

A crew definition is a YAML file listing the members; the first is the lead.
hk3 ships one, `feature`:

```yaml
description: Plan, build, review and test a feature.
workflow: plan-build-review        # optional: a workflow name
members:
  - role: captain                  # the lead: oc-alpha
  - role: planner                  # oc-alpha--planner
  - role: reviewer
    name: plan-reviewer            # oc-alpha--plan-reviewer
    responsibility: Reviews plans before building starts.
  - role: builder                  # add count: 2 for builder and builder-2
  - role: reviewer
  - role: tester
```

`crew start feature --team alpha` starts the lead as `oc-alpha` (its own
agent, named after the team) and the rest as `oc-alpha--<member>`, all in
herdr workspace `oc-alpha`, and writes the roster first so every member
sees the whole team. Run from inside the team's lead agent (`oc-alpha` itself, not a
member such as `oc-alpha--planner`), that agent takes the lead slot under
its own role. hk3 looks a name up in your project's
`.harmonik-v3/crews/`, then in its own `crews/`, so a project file overrides
one of the same name.

hk3 checks the definition (known roles, names, counts, its workflow) and
starts nothing if it is wrong. It refuses a team that already has a roster
(grow it with `crew add`, or clear a stale one with
`crew stop --all --team <team>`) and any label that is already a live tab.
If a member fails to start, hk3 stops there and says which members started;
clean up with `crew stop --all`.

**Workflows** are YAML files the agents read and follow, found in your
project's `.harmonik-v3/workflows/`, then hk3's `workflows/`. hk3 checks only
that one has a `description`; every other key is up to you and your agents.
The roster records the workflow's name and path. hk3 ships
`plan-build-review`.

### Grow and shrink a team

From inside an agent (it runs these in its own Bash tool), the team is always the
agent's own:

```sh
hk3 crew add tester                                  # solo oc-alpha becomes team alpha; starts oc-alpha--tester
hk3 crew add builder                                 # oc-alpha--builder
hk3 crew add builder --responsibility "Builds the parser."   # oc-alpha--builder-2
hk3 crew roster                                      # who is on the team, who has a live tab, and who you are
hk3 crew stop tester                                 # stop one member (or several)
hk3 crew stop --all                                  # stop everyone but yourself
```

From your own terminal, name the team with `--team`:

```sh
hk3 crew add builder --team alpha
hk3 crew roster --team alpha
hk3 crew stop --all --team alpha                     # stop every member and delete the roster
```

A member's name defaults to its role, with the next free number when taken
(`builder`, `builder-2`); a `--name` that is already taken is refused. Its responsibility, one line, defaults to the
role's description. The first add from a solo agent puts that agent on the
roster as the first member, under its actual role. Each new member's first
prompt tells it its label, role and team, and to run `hk3 crew roster`.
`crew stop` with no member and no `--all` is refused. A member without a
herdr tab (say, a captain in a plain terminal) is taken off the roster with
a note; close its terminal yourself. `hk3 crew stop --all --team <team>` also
clears a stale roster after a crash.

### How team members talk

Members message each other with Claude Code's cross-session messaging
(`SendMessage`), addressed by label, such as `oc-alpha--tester`. A message
reaches an idle member at once and wakes it; a busy one gets it between
tool calls. The receiver sees the sender as `Message from @<label>`. hk3
never sends messages itself.

Every agent has the `crew` skill. It tells the agent to run
`hk3 crew roster` to see its team, to message only labels on the roster
(Claude's `ListAgents` lists every Claude session on the machine, including
other projects'), and to treat a message from another team with suspicion:
not act on it, and tell you. A sender is on another team when its team
label (the part of its label before `--`, such as `oc-alpha`) is not the
agent's own.

**All members must run in one permission mode.** Claude holds a message
for approval, and may let it expire, when the receiver runs in a different
permission mode from the sender. hk3 launches every agent with
`--dangerously-skip-permissions` by default (`HK3_CLAUDE_SKIP_PERMISSIONS=1`);
do not change that setting for some members of a team and not others, or
pass a different `--permission-mode` to one of them.

**A crashed member** is not restarted by hk3. Resume it by hand, under the
same name, in a terminal or a herdr tab:

```sh
hk3 resume agent claude --team alpha --name builder --role builder
```

**One handoff file per member.** With keeper's default prompts every agent
writes `HANDOFF.md`, so team members overwrite each other's. A project that
runs teams should give each agent its own file through `{name}`, as omatic
does (see [docs/configuration.md](docs/configuration.md#keeper-settings-keeper_)):

```sh
KEEPER_HANDOFF_PROMPT="Your context is nearly full. Run the session-handoff skill for lane {name} and write HANDOFF-{name}.md at the repository root."
KEEPER_STARTUP_KIND=command
KEEPER_STARTUP_PROMPT="/session-resume HANDOFF-{name}"
```

## Roles

A role picks the agent's skills and Claude settings. Without `--role` an
agent is `general`.

| Role | Skills (plus `handoff` and `crew`) |
|---|---|
| general (default) | none |
| captain | none (leads a team; the lead of the `feature` crew) |
| planner | task-breakdown, risk-assessment |
| reviewer | review-checklist, review-report |
| builder | incremental-build, commit-hygiene |
| tester | test-plan, bug-report |

A project can adjust any role in `.harmonik-v3/config.yaml`.

To give every agent your own project-management skill (hk3 ships none), put
it in the project at `.harmonik-v3/skills/<name>/SKILL.md` and list it in
`.harmonik-v3/config.yaml` with `skills: [<name>]`: the overlay applies to
every role, so every agent loads it. hk3 looks for a listed skill in the
project's `.harmonik-v3/skills/` first, then in its own `skills/`, so a
project skill can also replace an hk3 skill of the same name. See
[docs/configuration.md](docs/configuration.md#project-skills).

## Learn more

- [docs/configuration.md](docs/configuration.md): every setting, project config files, how roles are built
- [docs/architecture.md](docs/architecture.md): what a launch does, the repo layout, design decisions
- [docs/testing.md](docs/testing.md): how to verify changes
- [modules/keeper/plugin/README.md](modules/keeper/plugin/README.md): how keeper's handoff and restart work

Working on harmonik-v3 with an agent? It starts at [AGENTS.md](AGENTS.md).
