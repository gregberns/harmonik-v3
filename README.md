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
(mikefarah v4) and `jq`.

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

## Roles

A role picks the agent's skills and Claude settings. Without `--role` an
agent is `general`.

| Role | Skills (plus `handoff`) |
|---|---|
| general (default) | none |
| planner | task-breakdown, risk-assessment |
| reviewer | review-checklist, review-report |
| builder | incremental-build, commit-hygiene |
| tester | test-plan, bug-report |

A project can adjust any role in `.harmonik-v3/config.yaml`.

## Learn more

- [docs/configuration.md](docs/configuration.md): every setting, project config files, how roles are built
- [docs/architecture.md](docs/architecture.md): what a launch does, the repo layout, design decisions
- [docs/testing.md](docs/testing.md): how to verify changes
- [plugins/claude-keeper/README.md](plugins/claude-keeper/README.md): how keeper's handoff and restart work

Working on harmonik-v3 with an agent? It starts at [AGENTS.md](AGENTS.md).
