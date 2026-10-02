# harmonik-v3

Tooling for launching and managing Claude agent sessions.

Its command is `harmonik-v3`, aliased `hk3`. Keeper (`plugins/claude-keeper`)
is the part that hands off and restarts a session at a token threshold.

## Layout

```
harmonik-v3             CLI (hk3): launch/resume agents, build role config
AGENTS.md               agent context (CLAUDE.md is a symlink to it)
docs/                   documentation; index in docs/README.md
.env                    local settings (not committed)
config/
  base.yaml             config shared by every role
  roles/<role>.yaml     per-role config, merged over base.yaml
skills/<name>/SKILL.md  skill library; roles pick from it
scripts/compose-role    YAML config -> <project>/.harmonik-v3/build/roles/<role>/
scripts/statusline      status line: agent badge + role, then the existing one
setup/init-prompt.md    instructions for the `hk3 init` setup session
plugins/claude-keeper/  keeper: handoff + restart at a token threshold
```

Requires `claude`, `yq` (mikefarah v4) and `jq`. Scripts are bash only.

## Usage

Put it on your PATH once, then run it from inside any project:

```sh
ln -s "$PWD/harmonik-v3" ~/.local/bin/hk3

cd ~/dev/some-project
hk3 init                        # Claude sets up .harmonik-v3/, then prints the launch command
hk3 new agent claude --name alpha [--role planner]
hk3 resume agent claude <session-id> --name alpha --role builder
hk3 config                      # show resolved settings for this project
hk3 list roles
hk3 build roles                 # compose every role (launch does this too)
```

The project is the git root of the current directory (override with
`HK3_PROJECT_DIR`). Claude runs from there. Pass extra claude flags after
`--`. See `hk3 --help`.

### Agents

- **Name**: `--name` or `HK3_AGENT_NAME`. By convention a NATO word (alpha,
  bravo, charlie, ...).
- **Label**: the project prefix plus the name, e.g. `oc-alpha` when the
  project sets `HK3_PROJECT_PREFIX=oc`. It is the Claude session name and
  shows in the status line.
- **Role**: `--role` or `HK3_ROLE`, default `general` (the base config, no
  extra skills).
- **Status line**: line 1 is the label as a coloured badge (one colour per
  agent) and the role; line 2 is the status line the project or user already
  had. Project scripts that need the bare name should read `HK3_AGENT_NAME`;
  `HARMONIK_AGENT` carries the prefix.

## Project config

Each project keeps its config in `<project>/.harmonik-v3/` (`config.env`,
`config.yaml`, `build/`). `hk3 init` writes it for you. Every setting and the
merge rules are in [docs/configuration.md](docs/configuration.md).

## Roles

A role is `config/base.yaml` + `config/roles/<role>.yaml` + the project's
`.harmonik-v3/config.yaml`; see [docs/configuration.md](docs/configuration.md#roles).

| Role | Skills (plus `handoff`) |
|---|---|
| general (default) | none |
| planner | task-breakdown, risk-assessment |
| reviewer | review-checklist, review-report |
| builder | incremental-build, commit-hygiene |
| tester | test-plan, bug-report |

## Docs

See [docs/README.md](docs/README.md). Agents start at [AGENTS.md](AGENTS.md).
