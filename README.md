# harmonik-v3

Tooling for launching and managing Claude agent sessions.

Its command is `harmonik-v3`, aliased `hk3`. Keeper (`plugins/claude-keeper`)
is the part that hands off and restarts a session at a token threshold.

## Layout

```
harmonik-v3             CLI (hk3): launch/resume agents, build role config
.env                    local settings (not committed)
config/
  base.yaml             config shared by every role
  roles/<role>.yaml     per-role config, merged over base.yaml
skills/<name>/SKILL.md  skill library; roles pick from it
scripts/compose-role    YAML config -> <project>/.harmonik-v3/build/roles/<role>/
scripts/statusline      status line: "<name> · <role>" + the existing one
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
  bravo, charlie, ...). It becomes the Claude session name (`claude --name`),
  shows in the status line, and fills `{name}` in keeper's prompts.
- **Role**: `--role` or `HK3_ROLE`, default `general` (`HK3_DEFAULT_ROLE`).
  `general` is the base config with no extra skills.
- **Status line**: `<name> · <role>`, then the output of the status line the
  project or user already had (project `.claude/settings.local.json`, then
  `.claude/settings.json`, then `~/.claude/settings.json`), given the same
  input. Override the inner command with `HK3_STATUSLINE_INNER`, or replace
  the whole thing by setting `settings.statusLine` in `config.yaml`.

## Project config

Each project keeps its config in `<project>/.harmonik-v3/`. `hk3 init`
writes it for you.

- `config.env`: `HK3_*` (launcher) and `KEEPER_*` (keeper) settings. The
  precedence is shell env, then this file, then this repo's `.env`, then the
  defaults in `harmonik-v3`. Besides the restart settings it can set
  `KEEPER_HANDOFF_PROMPT`, `KEEPER_STARTUP_KIND` (`prompt` or `command`), and
  `KEEPER_STARTUP_PROMPT`, so the restart cycle uses the project's own handoff
  convention. `{name}` and `{role}` are substituted.
- `config.yaml`: overlay merged last over base + role. A `null` deletes a key;
  `skills_remove: [...]` drops skills.
- `build/`: generated role output (gitignore it).

## Roles

A role is `config/base.yaml` merged with `config/roles/<role>.yaml`, then the
project's `.harmonik-v3/config.yaml`: maps merge deeply (later wins), lists
concatenate with duplicates removed. Keys:

- `skills` — names from `skills/`, loaded as a per-role plugin
  (`--plugin-dir`); Claude shows them as `keeper-role:<name>`.
- `settings` — any Claude settings keys, passed as JSON via `--settings`.
  The base hides built-in and user-level skills, so a role sees only its own.
- `description` — used in the generated plugin manifest.

| Role | Skills (plus `handoff`) |
|---|---|
| general (default) | none |
| planner | task-breakdown, risk-assessment |
| reviewer | review-checklist, review-report |
| builder | incremental-build, commit-hygiene |
| tester | test-plan, bug-report |
