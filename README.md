# harmonik-v3

Tooling for launching and managing Claude agent sessions.

## Layout

```
keeper                  CLI: launch/resume agents, build role config
.env                    local settings for keeper (not committed)
config/
  base.yaml             config shared by every role
  roles/<role>.yaml     per-role config, merged over base.yaml
skills/<name>/SKILL.md  skill library; roles pick from it
scripts/compose-role    YAML config -> build/roles/<role>/
plugins/claude-keeper/  plugin: handoff + restart at a token threshold
build/                  generated (not committed)
```

Requires `claude`, `yq` (mikefarah v4) and `jq`. Scripts are bash only.

## Usage

```sh
./keeper new agent claude --role planner
./keeper resume agent claude <session-id> --role builder
./keeper list roles
./keeper build roles            # compose every role (launch does this too)
```

Pass extra claude flags after `--`. See `./keeper --help`.

## Roles

A role is `config/base.yaml` merged with `config/roles/<role>.yaml`: maps merge
deeply (the role wins), lists concatenate with duplicates removed. Keys:

- `skills` — names from `skills/`, loaded as a per-role plugin
  (`--plugin-dir`); Claude shows them as `keeper-role:<name>`.
- `settings` — any Claude settings keys, passed as JSON via `--settings`.
  The base hides built-in and user-level skills, so a role sees only its own.
- `description` — used in the generated plugin manifest.

| Role | Skills (plus `handoff`) |
|---|---|
| planner | task-breakdown, risk-assessment |
| reviewer | review-checklist, review-report |
| builder | incremental-build, commit-hygiene |
| tester | test-plan, bug-report |
